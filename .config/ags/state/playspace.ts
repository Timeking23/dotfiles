import GLib from "gi://GLib?version=2.0"
import AstalHyprland from "gi://AstalHyprland"
import { createComputed, createMemo, createState } from "ags"

import { allClients, focusedWorkspace, workspaces } from "./system"
import { suspendCapture } from "./wsshots"
import { execAsync } from "ags/process"

/**
 * ============================================================================
 * The playspace -- master control for every workspace at once
 * ============================================================================
 *
 * Zoomed OUT this is the whole desk: every workspace, every window on it, laid
 * out as one wrapped board you can drive from the keyboard or drag around with
 * the mouse. Zoomed IN is just the normal desktop.
 *
 * ---------------------------------------------------------------------------
 * WHY CARDS AND NOT LIVE THUMBNAILS
 * ---------------------------------------------------------------------------
 * A Wayland client cannot read another client's buffer -- only the compositor
 * can. Live shrunken windows are therefore a compositor plugin (C++, rebuilt
 * against Hyprland's headers on every update) and not something a shell can do
 * at all. So a window is drawn as a card carrying what we CAN know about it:
 * its class, its title, and which workspace it is on. All of that is live.
 *
 * ---------------------------------------------------------------------------
 * WHAT HYPRLAND DOES NOT HAVE
 * ---------------------------------------------------------------------------
 * There is no "workspace order". Workspaces are identified BY their number, so
 * a workspace cannot be reordered, only renumbered -- and renumbering means
 * physically moving every window from one id to another. reorderWorkspace()
 * does exactly that and is honest about the cost: it is a shuffle, not a
 * relabel, and windows really do move.
 * ---------------------------------------------------------------------------
 */

const hyprland = AstalHyprland.get_default()

// ============================
// OPEN / CLOSED
// ============================

const [open, setOpen] = createState(false)

export { open as playspaceOpen }

/**
 * How long the zoom takes, each way. Must match the keyframes in
 * style/_playspace.scss.
 */
export const ZOOM_MS = 220

/**
 * True while the board is zooming back IN, before the window is dropped.
 *
 * The window is bound to `open`, and a CSS animation only plays on the way in
 * -- so flipping `open` to false on Enter would cut the zoom-in off before its
 * first frame and the board would simply vanish. Instead this flag sets a class,
 * the keyframe runs, and only then does the window go.
 */
const [closing, setClosing] = createState(false)

export { closing as playspaceClosing }

/**
 * The pending "now actually hide it" timer, so it can be called off.
 *
 * Without this, toggling during the close animation was swallowed: `open` is
 * still true for those 220ms, so toggle read it as "open" and asked to close
 * something already closing. Worse, anything that forced it open inside that
 * window would then be shut again the moment the orphaned timer fired.
 */
let pendingClose = 0

function cancelPendingClose() {
  if (pendingClose) {
    GLib.source_remove(pendingClose)
    pendingClose = 0
  }
}

/** Which workspace the keyboard cursor is on. Not the focused one. */
const [cursor, setCursor] = createState(1)

export { cursor as playspaceCursor }

export function openPlayspace() {
  //  Call off a close that is still animating, or its timer fires a moment
  //  later and shuts the board we just opened.
  cancelPendingClose()
  setClosing(false)

  //  Stop snapshotting while the board is up. grim photographs the OUTPUT, and
  //  the board is covering it -- leaving capture running would replace every
  //  workspace picture with a picture of the board looking at itself.
  suspendCapture(true)
  setCrt(true)

  //  Start the cursor where the user actually is, so Escape-then-Enter is a
  //  no-op rather than a surprise jump to workspace 1.
  const here = focusedWorkspace.peek()?.id ?? 1
  setCursor(here)

  //  And open the feed on the first window of that workspace, for the same
  //  reason: the board should start where you already are.
  const at = pages().findIndex((p) => p.workspaceId === here)
  setPage(at < 0 ? 0 : at)
  setOpen(true)
}

export function closePlayspace() {
  if (!open.peek() || closing.peek()) return

  setClosing(true)
  pendingClose = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ZOOM_MS, () => {
    pendingClose = 0
    setOpen(false)
    setClosing(false)
    suspendCapture(false)
    setCrt(false)
    return GLib.SOURCE_REMOVE
  })
}

/**
 * Wear the CRT shader, but only while the board is up.
 *
 * A screen shader breaks Hyprland's damage tracking -- every output pixel reads
 * from a different input pixel, so a partial redraw smears behind the cursor.
 * Left on permanently that is the artifacting that made the first attempt
 * unusable. Scoped to the board it is worth it: a few seconds of looking rather
 * than a whole session of mousing.
 *
 * Fire-and-forget, and a failure is logged rather than thrown: not having the
 * curvature is a cosmetic loss, and it must never be able to stop the board
 * from opening or -- much worse -- from closing.
 */
function setCrt(on: boolean) {
  const value = on ? "~/.config/hypr/shaders/crt.glsl" : "[[EMPTY]]"

  execAsync(["hyprctl", "keyword", "decoration:screen_shader", value]).catch((error) =>
    console.warn("playspace: could not set the crt shader:", error),
  )
}

export function togglePlayspace() {
  //  Mid-close counts as CLOSED. Reading `open` alone meant a second swipe
  //  during the animation asked to close an already-closing board and did
  //  nothing at all, so the gesture felt dropped.
  if (open.peek() && !closing.peek()) closePlayspace()
  else openPlayspace()
}

// ============================
// THE BOARD
// ============================

export type Card = {
  address: string
  /** the app, as Hyprland reports it -- "brave-browser", "kitty" */
  appClass: string
  title: string
  floating: boolean
}

export type Column = {
  id: number
  name: string
  cards: Card[]
}

/**
 * Every workspace that exists or has something on it, in id order.
 *
 * Built from BOTH lists rather than from clients alone: an empty workspace has
 * no clients to derive it from, and it still has to be visible or you cannot
 * drop a window onto it.
 */
/**
 * Bumped whenever Hyprland says anything changed.
 *
 * `columns` cannot depend on the client list alone. Moving a window between
 * workspaces adds and removes NOTHING -- the array is the same array, holding
 * the same objects, and only each client's `workspace` property has changed.
 * So the "clients" binding never fires and the board keeps drawing windows on
 * the workspace they were on when it was built.
 *
 * That is not cosmetic: it is exactly what makes drag-and-drop look broken.
 * The window really does move, and the board just never admits it.
 */
const [revision, setRevision] = createState(0)

function bump() {
  setRevision(revision.peek() + 1)
}

hyprland.connect("event", bump)
hyprland.connect("client-added", bump)
hyprland.connect("client-removed", bump)
hyprland.connect("client-moved", bump)

export const columns = createComputed(() => {
  //  Read purely to depend on it -- see the note above.
  revision()

  //  Producer form, not createComputed([deps], fn) -- gnim marks the array
  //  version deprecated in dist/jsx/state.ts and tells you to read the
  //  accessors directly inside the body instead.
  const all = workspaces()
  const clients = allClients()

  const byWorkspace = new Map<number, Card[]>()

  for (const workspace of all ?? []) {
    if (workspace.id > 0) byWorkspace.set(workspace.id, [])
  }

  for (const client of clients ?? []) {
    const id = client.workspace?.id
    //  Special workspaces are negative and are not part of the board.
    if (typeof id !== "number" || id <= 0) continue

    if (!byWorkspace.has(id)) byWorkspace.set(id, [])
    byWorkspace.get(id)!.push({
      address: client.address,
      appClass: client.class || client.initial_class || "?",
      title: client.title || "",
      floating: client.floating,
    })
  }

  return [...byWorkspace.entries()]
    .sort(([a], [b]) => a - b)
    .map(([id, cards]): Column => ({
      id,
      name: (all ?? []).find((w) => w.id === id)?.name ?? String(id),
      cards,
    }))
})

/**
 * Every window on every workspace, as one flat ordered list.
 *
 * The board scrolls through APPLICATIONS one at a time now, not workspaces, so
 * it needs a single sequence to page through. Ordered by workspace and then by
 * the order Hyprland reports them, so paging down walks the desk left to right
 * rather than jumping around.
 */
export type Page = { card: Card; workspaceId: number; index: number; total: number }

export const pages = createComputed(() => {
  const board = columns()
  const flat: Page[] = []

  for (const column of board) {
    for (const card of column.cards) {
      flat.push({ card, workspaceId: column.id, index: 0, total: 0 })
    }
  }

  return flat.map((page, i) => ({ ...page, index: i, total: flat.length }))
})

/** The id one past the last -- where "append to the right" lands. */
export const nextFreeWorkspace = createMemo(() => {
  const board = columns()
  return board.length ? board[board.length - 1].id + 1 : 1
})

// ============================
// NAVIGATION
// ============================

/**
 * Move the cursor along the board.
 *
 * Steps over the ids that actually exist rather than doing cursor +/- 1: the
 * board is frequently 1,2,5 and arrowing through two dead numbers to get from
 * 2 to 5 reads as the key being broken.
 *
 * Walking off the right-hand end lands on the append slot, which is what makes
 * "new workspace" reachable from the keyboard alone.
 */
export function moveCursor(delta: number) {
  const board = columns()
  if (!board.length) return

  const ids = board.map((c) => c.id)
  const at = ids.indexOf(cursor.peek())

  //  Not in the list means the cursor is parked on the append slot past the
  //  right-hand end. It has to be handled separately, because the obvious
  //  `at < 0 ? 0 : at + delta` DISCARDS the direction: pressing Right again
  //  out there sent the cursor all the way back to the first workspace.
  if (at < 0) {
    if (delta < 0) setCursor(ids[ids.length - 1]) // step back onto the board
    return // already at the end; Right keeps it here
  }

  const next = at + delta

  if (next >= ids.length) setCursor(nextFreeWorkspace.peek())
  else if (next < 0) setCursor(ids[0])
  else setCursor(ids[next])
}

/** Zoom back in, on whatever the cursor is sitting on. */
export function enterCursor() {
  //  Switch FIRST, then play the zoom. The board is zooming into this
  //  workspace, so the desktop behind it should already be that workspace by
  //  the time the board thins out -- otherwise you watch it zoom into the old
  //  one and then cut.
  hyprland.dispatch("workspace", String(cursor.peek()))
  closePlayspace()
}

// ============================
// MOVING THINGS
// ============================

/**
 * Send one window to a workspace.
 *
 * `movetoworkspacesilent`, not `movetoworkspace`: the loud one follows the
 * window, which would switch the desktop underneath the board and leave the
 * cursor pointing at somewhere you are no longer looking.
 */
export function moveCardTo(address: string, workspaceId: number) {
  hyprland.dispatch("movetoworkspacesilent", `${workspaceId},address:${hyprAddress(address)}`)
}

/**
 * Hyprland window addresses, as the DISPATCHERS want them.
 *
 * Astal hands back a bare pointer -- "562d1172a6b0" -- while hyprctl and every
 * dispatcher selector expect "0x562d1172a6b0". An `address:` selector that does
 * not match simply does nothing: no error, no warning, the dispatcher returns
 * ok and the window stays where it was. Every move on this board was failing
 * exactly that quietly until the two formats were compared side by side.
 */
function hyprAddress(address: string): string {
  return address.startsWith("0x") ? address : `0x${address}`
}

/**
 * Go to one particular window.
 *
 * `focuswindow` carries the workspace with it -- it switches to whichever
 * workspace the window is on and focuses the window itself -- so this is one
 * dispatch rather than a workspace change followed by a focus.
 */
export function focusCard(address: string) {
  hyprland.dispatch("focuswindow", `address:${hyprAddress(address)}`)
  closePlayspace()
}

// ============================
// PAGING THROUGH APPLICATIONS
// ============================

const [page, setPage] = createState(0)

export { page as pageCursor }

/** Clamped, not wrapped: running off the end of a feed and landing back at the
 *  start is disorienting when you cannot see how long the list is. */
export function movePage(delta: number) {
  const total = pages().length
  if (!total) return
  setPage(Math.max(0, Math.min(total - 1, page.peek() + delta)))
}

export function setPageTo(index: number) {
  setPage(index)
}

/** Open whatever the feed is currently showing. */
export function enterPage() {
  const list = pages()
  const current = list[page.peek()]
  if (current) focusCard(current.card.address)
  else closePlayspace()
}

/** Go to one workspace, by clicking its column rather than arrowing to it. */
export function enterWorkspace(id: number) {
  setCursor(id)
  hyprland.dispatch("workspace", String(id))
  closePlayspace()
}

/** Append: drop a window on the empty slot to the right of the board. */
export function appendCard(address: string) {
  moveCardTo(address, nextFreeWorkspace.peek())
}

// ============================
// APPENDING NEW APPS
// ============================

/**
 * While the board is OPEN, a newly launched app lands on a fresh workspace to
 * the right of the cursor instead of on whatever workspace happens to be
 * current underneath.
 *
 * This is the "append to the end" rule, and it only applies zoomed OUT. Zoomed
 * in, a new window belongs on the workspace you are looking at -- that is what
 * every other desktop does and breaking it would be surprising. Zoomed out
 * there is no workspace you are "looking at", so the sensible reading of
 * "append" is a new one on the end.
 *
 * `client-added` fires with the client already mapped somewhere, so this is a
 * move rather than a placement rule -- there is a frame where the window is on
 * the old workspace. That is invisible while the board is covering the screen,
 * which is the only time this runs.
 */
hyprland.connect("client-added", (_source: unknown, client: AstalHyprland.Client) => {
  if (!open.peek()) return
  if (!client?.address) return

  //  One past the cursor, not one past the whole board: "to the right of the
  //  SELECTED workspace" is what was asked for, and with the cursor on the last
  //  column the two are the same thing anyway.
  const target = Math.max(cursor.peek() + 1, nextFreeWorkspace.peek())

  moveCardTo(client.address, target)
  setCursor(target)
})

/**
 * Swap two workspaces' contents.
 *
 * The only honest form of "reorder" Hyprland allows -- see the note at the top.
 * Done in three legs through a scratch id so the two sets never collide: moving
 * A->B first would merge A into B and there would be nothing left to move back.
 */
export function reorderWorkspace(fromId: number, toId: number) {
  if (fromId === toId) return

  const board = columns()
  const from = board.find((c) => c.id === fromId)
  const to = board.find((c) => c.id === toId)
  if (!from || !to) return

  const scratch = Math.max(...board.map((c) => c.id)) + 1

  for (const card of from.cards) moveCardTo(card.address, scratch)
  for (const card of to.cards) moveCardTo(card.address, fromId)
  for (const card of from.cards) moveCardTo(card.address, toId)
}
