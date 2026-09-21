import AstalHyprland from "gi://AstalHyprland"
import GLib from "gi://GLib?version=2.0"
import { createMemo, createState } from "ags"
import { execAsync } from "ags/process"

/**
 * Wallpaper Engine scenes, driven through linux-wallpaperengine.
 *
 * This replaced a Wallhaven still-image browser: only one thing can own the
 * background layer, and an animated scene and hyprpaper both want it. Rather
 * than have them fight, hyprpaper is out of the picture entirely — see the
 * exec-once lines in hyprland.conf.
 *
 * Scenes are read straight out of the Steam workshop directory rather than
 * asked of Steam, which is not running most of the time and has no interface
 * worth using when it is. Each one carries a project.json with its title and a
 * preview image, which is everything the picker needs.
 */

const WORKSHOP = `${GLib.get_home_dir()}/.local/share/Steam/steamapps/workshop/content/431960`

/** the file hyprland.conf reads on login, so a choice survives a reboot */
const LAST = `${GLib.get_user_cache_dir()}/ags/last-wallpaper`

/** matches the flags in the hyprland.conf autostart — keep the two in step */
const FPS = 30
const SCALING = "stretch"

export type Scene = {
  id: string
  title: string
  /** absolute path to preview.jpg/png/gif, or "" if the scene ships none */
  preview: string
  /** scene, video or web — web scenes carry a whole browser and cost more */
  type: string
  /**
   * What to actually hand the renderer. Equal to `id` for a real wallpaper; for
   * a preset it is the workshop id of the wallpaper the preset configures.
   */
  baseId: string
  /** `--set-property key=value` arguments, empty for a real wallpaper */
  props: string[]
  /** title of the wallpaper this preset configures, if it is one */
  presetOf: string
}

const decoder = new TextDecoder()

const [scenes, setScenes] = createState<Scene[]>([])
const [index, setIndex] = createState(0)
const [status, setStatus] = createState("ready")
const [busy, setBusy] = createState(false)

export { scenes, index, status, busy }

export const current = createMemo(() => scenes()[index()] ?? null)
export const previewPath = createMemo(() => current()?.preview ?? "")
export const titleLabel = createMemo(() => current()?.title ?? "no scenes found")

export const positionLabel = createMemo(() => {
  const n = scenes().length
  return n ? `${index() + 1} / ${n}` : "—"
})

/**
 * Flatten a preset's saved properties into --set-property arguments.
 *
 * Two kinds are dropped. Keys beginning with an underscore are Wallpaper
 * Engine's own bookkeeping and mean nothing to the renderer. The customimage*
 * slots are dropped because they cannot be made to work: they are `scene
 * texture` properties, and this build resolves neither an absolute path nor a
 * path relative to the wallpaper's own directory — both were tried, and both
 * come back "Cannot resolve user texture". A preset therefore reproduces its
 * colours, text and toggles but not the images it shipped.
 */
function presetArgs(preset: Record<string, unknown>): string[] {
  const out: string[] = []

  for (const [key, value] of Object.entries(preset)) {
    if (key.startsWith("_")) continue
    if (key.startsWith("customimage")) continue
    if (value === null || value === undefined) continue

    const text =
      typeof value === "boolean" ? (value ? "true" : "false") : String(value)
    if (!text) continue

    out.push(`${key}=${text}`)
  }

  return out
}

function readText(path: string): string | null {
  try {
    const [ok, bytes] = GLib.file_get_contents(path)
    return ok ? decoder.decode(bytes) : null
  } catch {
    return null
  }
}

/** Walk the workshop directory. Cheap enough to redo on demand. */
export function loadScenes() {
  const found: Scene[] = []

  try {
    const dir = GLib.Dir.open(WORKSHOP, 0)
    for (;;) {
      const id = dir.read_name()
      if (!id) break

      const base = `${WORKSHOP}/${id}`
      const raw = readText(`${base}/project.json`)
      if (!raw) continue

      let title = id
      let type = "scene"
      let baseId = id
      let props: string[] = []
      let dependency = ""

      try {
        const project = JSON.parse(raw)
        title = project.title || id
        type = (project.type || "").toLowerCase()

        // A workshop item with a `dependency` and no `type` is a preset: a
        // saved configuration of somebody else's wallpaper, with no scene of
        // its own. Handed to the renderer as-is it dies on "Project type
        // missing", so it is redirected at the wallpaper it configures and the
        // saved properties are replayed on top.
        if (!type && project.dependency) {
          type = "preset"
          dependency = String(project.dependency)
          baseId = dependency
          props = presetArgs(project.preset ?? {})
        } else if (!type) {
          type = "scene"
        }
      } catch {
        // a malformed project.json is not a reason to hide the item
      }

      const preview = ["preview.jpg", "preview.png", "preview.gif"]
        .map((name) => `${base}/${name}`)
        .find((path) => GLib.file_test(path, GLib.FileTest.EXISTS))

      found.push({
        id,
        title,
        preview: preview ?? "",
        type,
        baseId,
        props,
        presetOf: dependency,
      })
    }
    dir.close()
  } catch (error) {
    setStatus(`workshop unreadable: ${error}`)
    return
  }

  // a preset whose wallpaper is not installed has nothing to render
  const installed = new Set(found.map((s) => s.id))
  const usable = found.filter((s) => s.type !== "preset" || installed.has(s.baseId))

  usable.sort((a, b) => a.title.localeCompare(b.title))
  setScenes(usable)

  // land on whatever was showing last, so the panel opens where you left it
  const last = readText(LAST)?.trim()
  const at = last ? usable.findIndex((s) => s.id === last) : -1
  setIndex(at >= 0 ? at : 0)

  const skipped = found.length - usable.length
  setStatus(
    usable.length
      ? `${usable.length} scenes${skipped ? ` · ${skipped} unusable` : ""}`
      : "no scenes installed",
  )
}

/** single-quote for the shell, the only way that survives a title with an apostrophe */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

/** first monitor's name — linux-wallpaperengine wants a screen to attach to */
function screenName(): string {
  try {
    const monitor = AstalHyprland.get_default()?.get_monitors()?.[0]
    return monitor?.name || "eDP-1"
  } catch {
    return "eDP-1"
  }
}

async function apply(scene: Scene) {
  setStatus(`loading ${scene.title}…`)

  GLib.mkdir_with_parents(GLib.path_get_dirname(LAST), 0o755)
  GLib.file_set_contents(LAST, scene.id)

  // A preset renders as the wallpaper it configures, with its saved properties
  // replayed on top; a real wallpaper renders as itself with none.
  const args = scene.props.map((prop) => `--set-property ${shellQuote(prop)}`).join(" ")

  // One instance owns the background; the old one has to go first or the new
  // one draws underneath it and nothing appears to happen. setsid so the
  // daemon outlives whichever ags process started it.
  //
  // `pkill -x` matches against comm, which the kernel truncates to 15
  // characters — so the name to match is "linux-wallpaper", never the full
  // "linux-wallpaperengine", which silently matches nothing and leaves two
  // wallpapers stacked and fighting. Matching the full command line instead is
  // worse: it also matches the shell that is running the pkill.
  await execAsync([
    "bash",
    "-c",
    `pkill -x linux-wallpaper; sleep 1; ` +
      `pkill -9 -x linux-wallpaper 2>/dev/null; sleep 0.5; ` +
      `setsid -f linux-wallpaperengine --screen-root ${screenName()} ` +
      `--scaling ${SCALING} --silent --fps ${FPS} ${args} ${scene.baseId} ` +
      `>/dev/null 2>&1`,
  ])

  setStatus(scene.type === "preset" ? `${scene.title} · preset` : scene.title)
}

async function guard(work: () => Promise<void>) {
  if (busy.peek()) return
  setBusy(true)
  try {
    await work()
  } catch (error) {
    setStatus(String((error as Error)?.message ?? error))
  } finally {
    setBusy(false)
  }
}

/**
 * Move the selection without touching the background.
 *
 * The carousel calls this as it is swiped. Browsing has to be free: `apply`
 * kills and relaunches linux-wallpaperengine, so applying on every page change
 * would restart the renderer once per scene scrolled past.
 */
export function selectAt(at: number) {
  const all = scenes.peek()
  if (!all.length) return

  const clamped = Math.max(0, Math.min(Math.round(at), all.length - 1))
  if (clamped === index.peek()) return

  setIndex(clamped)
  setStatus(all[clamped].title)
}

/** Commit the scene at `at` -- this is the one that actually restarts the renderer. */
export function applyAt(at: number) {
  return guard(async () => {
    const all = scenes.peek()
    if (!all.length) return

    const clamped = Math.max(0, Math.min(Math.round(at), all.length - 1))
    setIndex(clamped)
    await apply(all[clamped])
  })
}

/** Re-apply the highlighted scene — for after a crash, or a fresh ags. */
export function applyCurrent() {
  return guard(async () => {
    const scene = current.peek()
    if (scene) await apply(scene)
  })
}

export function refresh() {
  loadScenes()
}

loadScenes()
