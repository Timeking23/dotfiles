import GLib from "gi://GLib?version=2.0"
import { createMemo, createState } from "ags"
import { fetch } from "ags/fetch"
import { interval } from "ags/time"

/**
 * Notes backed by a Notion database.
 *
 * The widget talks to api.notion.com directly with an internal integration
 * token, read from a file this repo never contains — see CONFIG below. There
 * is no other way round it: a desktop widget cannot ride the browser session,
 * and an OAuth dance needs a redirect target a wallpaper widget has no way to
 * serve.
 *
 * The schema is discovered rather than assumed. Notion lets you name your
 * properties anything, and a widget that hard-codes "Name"/"Date"/"Done" breaks
 * the moment it is pointed at a database someone else built, so the property
 * names are looked up once by *type* and cached.
 */

const CONFIG = `${GLib.get_user_config_dir()}/ags/state/notion.json`
const API = "https://api.notion.com/v1"
/**
 * Pinned deliberately. 2025-09-03 moved queries from databases to data sources
 * and would need a second round trip to resolve one; this widget wants a flat
 * list of notes and nothing that version added.
 */
const NOTION_VERSION = "2022-06-28"

const REFRESH = 120_000

export type Note = {
  id: string
  text: string
  /** local ISO date, YYYY-MM-DD */
  date: string
  done: boolean
}

export type NotionState = "unconfigured" | "loading" | "ok" | "error"

type Config = { token: string; databaseId: string }
type Schema = { title: string; date: string | null; done: string | null }

const [notes, setNotes] = createState<Note[]>([])
const [state, setState] = createState<NotionState>("loading")
const [detail, setDetail] = createState("")
const [hasDone, setHasDone] = createState(false)

export { notes, hasDone }
export const notionState = state
export const notionDetail = detail

/**
 * The window of dates currently on screen. Everything is fetched against this
 * rather than pulled wholesale: a calendar database that has been in use for a
 * few years runs to thousands of rows, and the first hundred of those are from
 * 2022 — filtering client-side would show an empty September no matter how
 * many notes were in it.
 */
let from = ""
let to = ""

/**
 * A calendar date, YYYY-MM-DD, assembled from parts rather than sliced off an
 * ISO timestamp: toISOString() is UTC, so for the four hours either side of
 * midnight it hands back tomorrow.
 */
export function ymd(year: number, month1: number, day: number): string {
  return `${year}-${`${month1}`.padStart(2, "0")}-${`${day}`.padStart(2, "0")}`
}

/**
 * Today, in the machine's own timezone. GLib rather than Date because this has
 * to agree with every other date on the widget exactly — two independent
 * `new Date()` calls that disagree about which side of midnight they are on
 * light up two different cells, which is precisely the bug this replaced.
 */
export function todayIso(): string {
  const now = GLib.DateTime.new_now_local()
  return ymd(now.get_year(), now.get_month(), now.get_day_of_month())
}

/**
 * Today's notes, and how many of them are still open.
 *
 * Lifted out of the sidebar's TodayLog so the frame key can show a count
 * without the panel being open. Both derive from the same `notes` state the
 * calendar fills, so the key and the popover can never disagree.
 *
 * `notes` holds whatever date window the calendar last asked for, so this
 * filters to today explicitly rather than trusting the range -- parked on
 * another month, the unfiltered list would be entirely the wrong days.
 */
export const dueToday = createMemo(() => {
  const iso = todayIso()
  return notes()
    .filter((n) => n.date === iso)
    .sort((a, b) => Number(a.done) - Number(b.done) || a.text.localeCompare(b.text))
})

export const dueOpenCount = createMemo(() => dueToday().filter((n) => !n.done).length)

/** Badge text for the key face: the open count, or a tick when today is clear. */
export const dueBadge = createMemo(() => {
  if (state() === "unconfigured") return "--"
  if (state() === "error") return "!"
  const open = dueOpenCount()
  return open ? String(open) : "\u2713"
})

let config: Config | null = null
let schema: Schema | null = null

/**
 * Accepts a bare id, a dashed id, or the URL straight out of the browser.
 *
 * The query string is dropped first and deliberately: a Notion database URL
 * carries the *view* id in `?v=`, which is also 32 hex digits, and taking the
 * last match without stripping it hands the API the wrong object and a
 * mystifying 404.
 */
function databaseIdFrom(raw: string): string {
  const path = raw.trim().split("?")[0].replace(/-/g, "")
  const found = path.match(/[0-9a-f]{32}/gi)
  return found ? found[found.length - 1].toLowerCase() : path
}

function loadConfig(): Config | null {
  if (config) return config

  try {
    const [ok, bytes] = GLib.file_get_contents(CONFIG)
    if (!ok) return null

    const parsed = JSON.parse(new TextDecoder().decode(bytes))
    if (!parsed?.token || !parsed?.databaseId) return null

    config = {
      token: String(parsed.token).trim(),
      databaseId: databaseIdFrom(String(parsed.databaseId)),
    }
    return config
  } catch {
    return null
  }
}

async function call(path: string, method = "GET", body?: unknown) {
  const cfg = loadConfig()
  if (!cfg) throw new Error("unconfigured")

  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  const json = await res.json()
  if (!res.ok) {
    // Notion's own message is far more useful than the status code — it names
    // the property or the permission that is wrong
    throw new Error(json?.message ?? `HTTP ${res.status}`)
  }
  return json
}

/** First property of each type we need. Looked up once, then cached. */
async function ensureSchema(): Promise<Schema> {
  if (schema) return schema

  const cfg = loadConfig()!
  const db = await call(`/databases/${cfg.databaseId}`)
  const props: Record<string, { type: string }> = db.properties ?? {}

  const byType = (type: string) =>
    Object.entries(props).find(([, p]) => p.type === type)?.[0] ?? null

  const title = byType("title")
  if (!title) throw new Error("database has no title property")

  schema = { title, date: byType("date"), done: byType("checkbox") }
  setHasDone(!!schema.done)
  return schema
}

function plainText(prop: any): string {
  const parts = prop?.title ?? prop?.rich_text ?? []
  return parts.map((p: any) => p.plain_text ?? "").join("").trim()
}

export async function refreshNotes() {
  if (!loadConfig()) {
    setState("unconfigured")
    setNotes([])
    return
  }

  try {
    const s = await ensureSchema()
    const cfg = loadConfig()!

    const body: any = { page_size: 100 }
    if (s.date) {
      body.sorts = [{ property: s.date, direction: "ascending" }]

      if (from && to) {
        body.filter = {
          and: [
            { property: s.date, date: { on_or_after: from } },
            { property: s.date, date: { on_or_before: to } },
          ],
        }
      }
    }

    const page = await call(`/databases/${cfg.databaseId}/query`, "POST", body)

    setNotes(
      (page.results ?? []).map((row: any): Note => {
        const props = row.properties ?? {}
        return {
          id: row.id,
          text: plainText(props[s.title]),
          date: s.date ? (props[s.date]?.date?.start ?? "").slice(0, 10) : "",
          done: s.done ? !!props[s.done]?.checkbox : false,
        }
      }),
    )

    setState("ok")
    setDetail("")
  } catch (error) {
    setState((error as Error).message === "unconfigured" ? "unconfigured" : "error")
    setDetail(String((error as Error).message ?? error))
  }
}

/** Point the sync at a month. Refetches unless the window is already right. */
export function setRange(start: string, end: string) {
  if (start === from && end === to) return
  from = start
  to = end
  if (watchers) refreshNotes()
}

export async function addNote(date: string, text: string) {
  const trimmed = text.trim()
  if (!trimmed) return

  try {
    const s = await ensureSchema()
    const cfg = loadConfig()!

    const properties: any = {
      [s.title]: { title: [{ text: { content: trimmed } }] },
    }
    if (s.date) properties[s.date] = { date: { start: date } }
    if (s.done) properties[s.done] = { checkbox: false }

    await call("/pages", "POST", {
      parent: { database_id: cfg.databaseId },
      properties,
    })

    await refreshNotes()
  } catch (error) {
    setState("error")
    setDetail(String((error as Error).message ?? error))
  }
}

export async function setNoteDone(id: string, done: boolean) {
  try {
    const s = await ensureSchema()
    if (!s.done) return

    // optimistic: the round trip is a few hundred ms and a checkbox that lags
    // behind the click feels broken
    setNotes((all) => all.map((n) => (n.id === id ? { ...n, done } : n)))

    await call(`/pages/${id}`, "PATCH", { properties: { [s.done]: { checkbox: done } } })
  } catch (error) {
    setState("error")
    setDetail(String((error as Error).message ?? error))
    await refreshNotes()
  }
}

export async function deleteNote(id: string) {
  try {
    setNotes((all) => all.filter((n) => n.id !== id))
    // archived, not destroyed — it stays recoverable from Notion's trash
    await call(`/pages/${id}`, "PATCH", { archived: true })
  } catch (error) {
    setState("error")
    setDetail(String((error as Error).message ?? error))
    await refreshNotes()
  }
}

// ------------------------------------------------------------------
// polling, reference counted so a closed calendar costs nothing
// ------------------------------------------------------------------

let watchers = 0
let timer: { cancel: () => void } | null = null

export function startNotionSync() {
  watchers++
  if (watchers > 1) return

  refreshNotes()
  timer = interval(REFRESH, () => refreshNotes())
}

export function stopNotionSync() {
  watchers = Math.max(0, watchers - 1)
  if (watchers) return

  timer?.cancel()
  timer = null
}
