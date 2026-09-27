import GLib from "gi://GLib?version=2.0"
import Gdk from "gi://Gdk?version=4.0"
import GdkPixbuf from "gi://GdkPixbuf?version=2.0"
import AstalHyprland from "gi://AstalHyprland"
import { createState } from "ags"
import { execAsync } from "ags/process"

/**
 * ============================================================================
 * Window snapshots -- real pictures of your windows, for the playspace
 * ============================================================================
 *
 * A Wayland client cannot read another client's buffer, and a window on a
 * workspace you are not looking at is not being rendered at all. What we CAN
 * do: ask the compositor to screenshot the current output (grim), and ask
 * Hyprland where every window is. One capture, then crop the windows out of it.
 *
 * A grim per window costs ~274ms, about the same as the whole screen, so it is
 * one capture and free in-process crops.
 *
 * ---------------------------------------------------------------------------
 * KEYED BY WINDOW, NOT BY WORKSPACE
 * ---------------------------------------------------------------------------
 * This is the whole point. The first version stored one image per workspace and
 * looked thumbnails up by workspace id -- so the moment you dragged a window to
 * a different workspace its picture disappeared, because the workspace it had
 * just arrived on had never been photographed. Windows move between workspaces
 * constantly; that is what the board is FOR.
 *
 * A thumbnail is a picture of a WINDOW. It stays valid wherever that window
 * goes, and is only thrown away when the window itself closes.
 *
 * ---------------------------------------------------------------------------
 * WHY -s 0.5
 * ---------------------------------------------------------------------------
 * This display is 2880x1800 at scale 2, so half size is 1440x900 -- exactly
 * Hyprland's logical coordinate space. A window reported at [7,44] 1426x849 is
 * at [7,44] 1426x849 in the capture, with no conversion anywhere.
 *
 * ---------------------------------------------------------------------------
 * THE CEILING
 * ---------------------------------------------------------------------------
 * A window that has never been on screen while the shell was running has no
 * picture, and a picture shows the window as it last looked. The playspace
 * falls back to a glyph card wherever one is missing.
 * ---------------------------------------------------------------------------
 */

const hyprland = AstalHyprland.get_default()

//  tmpfs (/run/user/$UID), NOT ~/.cache. This file is written by grim and then
//  read straight back to be decoded a millisecond later; nothing ever wants it
//  again. On the nvme that pointless round trip was the single largest source of
//  IO stall on the machine. In RAM it is free.
//
//  .ppm because the only consumer is GdkPixbuf, immediately. PNG spends CPU
//  deflating an image that is about to be thrown away: measured on this machine
//  a frame decodes in 10.9ms as ppm against 31.3ms as png.
const SHOT = `${GLib.get_user_runtime_dir()}/ags-wsshot.ppm`

/**
 * grim's -s is an ABSOLUTE scale -- output pixels per LOGICAL pixel -- and not
 * a multiplier on the monitor's own scale. This display is 2880x1800 at scale 2,
 * so logical space is 1440x900 and `-s 1` produces exactly 1440x900: a window
 * Hyprland reports at [7,44] 1426x849 sits at [7,44] 1426x849 in the capture,
 * with no conversion anywhere.
 *
 * This was "0.5", which yields 720x450 -- half of logical space, not equal to
 * it. Every crop below was then clamped to fit inside an image half the size it
 * was assumed to be, so a full-width window was cropped to the left ~half of
 * the screen and the other windows to slivers. Thumbnails were showing the
 * wrong region, and upscaling a 713px crop to THUMB_W besides.
 */
const SCALE = "1"

/**
 * Stored thumbnail width, in pixels -- and this is ALSO the size they draw at.
 *
 * GTK4 has no max-width. A widget's size request is a MINIMUM, and GtkPicture's
 * natural size is its texture's size, so wherever there was room the picture
 * grew to the full stored width: in a wide bento tile a 320px texture rendered
 * at 320px while the same card in a narrow tile shrank to 108, and the board
 * looked wildly inconsistent. Sizing the SOURCE is the fix; nothing in the
 * widget tree can cap it.
 *
 * 1024 because the board now shows ONE window filling the frame rather than a
 * grid of small cards. At 128 the picture was being upscaled eight times and
 * came out a blur. The natural-size trap that forced 128 does not apply here:
 * that page's Picture has hexpand/vexpand set, so it is told what size to be
 * instead of asking for its natural one.
 */
const THUMB_W = 1024

/** Let windows finish animating before the shutter, or they are caught
 *  mid-slide and cropped against coordinates they have not reached yet. */
const SETTLE_MS = 450

const [shots, setShots] = createState<Record<string, Gdk.Texture>>({})

export { shots as windowShots }

/** Set by the playspace: capturing while the board is up photographs the board. */
let suspended = false

export function suspendCapture(value: boolean) {
  suspended = value
}

let pending = 0

/** A capture is in flight right now. */
let capturing = false

/** Something moved while a capture was in flight; re-shoot once it lands. */
let restage = false

function scheduleCapture() {
  //  Debounce -- but note this only ever cancels a PENDING TIMER. It cannot
  //  stop a capture that has already begun; `capturing` below does that.
  if (pending) GLib.source_remove(pending)
  pending = GLib.timeout_add(GLib.PRIORITY_DEFAULT_IDLE, SETTLE_MS, () => {
    pending = 0
    void capture()
    return GLib.SOURCE_REMOVE
  })
}

async function capture() {
  if (suspended) return

  //  Without this the debounce is not a rate limit at all: the timer fires,
  //  clears `pending`, and starts an async capture -- and the next event arms a
  //  fresh timer immediately, which fires while the first grim is still running.
  //  A capture costs far more than the interval between the events that trigger
  //  it, so they piled up; three concurrent grims, each copying the whole
  //  output, was the steady state. Coalesce instead: one in flight, and at most
  //  one re-shoot queued behind it, however many events arrive meanwhile.
  if (capturing) {
    restage = true
    return
  }

  const id = hyprland.focusedWorkspace?.id
  if (typeof id !== "number" || id <= 0) return

  //  Geometry read BEFORE the shutter: a window that moves between the two
  //  would be cropped from the wrong place.
  const windows = (hyprland.clients ?? []).filter(
    (client) => client.workspace?.id === id && client.width > 40 && client.height > 40,
  )
  if (!windows.length) return

  capturing = true
  try {
    await execAsync(["grim", "-s", SCALE, "-t", "ppm", SHOT])

    const full = GdkPixbuf.Pixbuf.new_from_file(SHOT)
    const fw = full.get_width()
    const fh = full.get_height()

    const next = { ...shots.peek() }

    for (const client of windows) {
      //  Clamped, because new_subpixbuf does not clip -- it fails. A window
      //  hanging off the edge of the screen would otherwise throw.
      const x = Math.max(0, Math.min(client.x, fw - 1))
      const y = Math.max(0, Math.min(client.y, fh - 1))
      const w = Math.max(1, Math.min(client.width, fw - x))
      const h = Math.max(1, Math.min(client.height, fh - y))

      const crop = full.new_subpixbuf(x, y, w, h)

      //  Scaled down before being kept. Holding full-size crops for every
      //  window was tens of megabytes of texture for pictures drawn 150px wide.
      const scaled =
        w > THUMB_W
          ? crop.scale_simple(THUMB_W, Math.max(1, Math.round((h * THUMB_W) / w)), GdkPixbuf.InterpType.BILINEAR)
          : crop

      if (scaled) next[client.address] = Gdk.Texture.new_for_pixbuf(scaled)
    }

    setShots(next)
  } catch (error) {
    console.warn("wsshots: capture failed:", error)
  } finally {
    capturing = false

    //  Events that arrived mid-flight were dropped on the floor; honour the
    //  last of them now, through the debounce so a burst still collapses.
    if (restage) {
      restage = false
      scheduleCapture()
    }
  }
}

//  A closed window's picture is dead weight; drop it. Nothing else evicts,
//  which is the point -- a window keeps its picture wherever it is moved to.
//  The signal is `client-removed(gchararray)` -- it carries the ADDRESS, not a
//  Client. Typed as a Client this read `(<string>)?.address`, which is always
//  undefined, so the guard below returned every single time and nothing was
//  ever evicted: every window ever opened kept its texture for the life of the
//  shell. At THUMB_W that is megabytes per window, never freed.
hyprland.connect("client-removed", (_source: unknown, address: string) => {
  if (!address) return

  const next = { ...shots.peek() }
  if (address in next) {
    delete next[address]
    setShots(next)
  }
})

/**
 * The Hyprland IPC events that change what the screen LOOKS like.
 *
 * The bare "event" signal is a firehose: it carries every event Hyprland emits,
 * and the loudest by far is `windowtitle`, which fires whenever any window
 * relabels itself. A browser does that on every tab switch, page load and
 * progress tick -- so with a browser open, this re-photographed the entire
 * output roughly twice a second, forever, and the machine spent ~43% of its
 * wall time with every task stalled on IO.
 *
 * `activewindow` is excluded for the same reason: its payload carries the
 * focused window's title, so Hyprland re-emits it on title changes too. A focus
 * change moves a border, not a window.
 */
const REPAINTS = new Set([
  "workspace",
  "workspacev2",
  "focusedmon",
  "focusedmonv2",
  "activespecial",
  "closewindow",
  "movewindow",
  "movewindowv2",
  "fullscreen",
  "changefloatingmode",
  "pin",
  "togglegroup",
])

//  Captured on change rather than on a timer: a poll would spend a whole
//  capture every few seconds photographing a screen that has not moved.
//  `openwindow` is absent deliberately -- `client-added` below covers it.
hyprland.connect("event", (_source: unknown, event: string) => {
  if (REPAINTS.has(event)) scheduleCapture()
})
hyprland.connect("client-added", () => scheduleCapture())
hyprland.connect("client-moved", () => scheduleCapture())

scheduleCapture()
