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

const SHOT = `${GLib.get_user_cache_dir()}/ags/wsshot.png`

/** Half of a 2x display: 1:1 with Hyprland's logical pixels. */
const SCALE = "0.5"

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

function scheduleCapture() {
  if (pending) GLib.source_remove(pending)
  pending = GLib.timeout_add(GLib.PRIORITY_DEFAULT_IDLE, SETTLE_MS, () => {
    pending = 0
    capture()
    return GLib.SOURCE_REMOVE
  })
}

async function capture() {
  if (suspended) return

  const id = hyprland.focusedWorkspace?.id
  if (typeof id !== "number" || id <= 0) return

  //  Geometry read BEFORE the shutter: a window that moves between the two
  //  would be cropped from the wrong place.
  const windows = (hyprland.clients ?? []).filter(
    (client) => client.workspace?.id === id && client.width > 40 && client.height > 40,
  )
  if (!windows.length) return

  try {
    GLib.mkdir_with_parents(GLib.path_get_dirname(SHOT), 0o755)
    await execAsync(["grim", "-s", SCALE, SHOT])

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
  }
}

//  A closed window's picture is dead weight; drop it. Nothing else evicts,
//  which is the point -- a window keeps its picture wherever it is moved to.
hyprland.connect("client-removed", (_source: unknown, client: AstalHyprland.Client) => {
  const address = client?.address
  if (!address) return

  const next = { ...shots.peek() }
  if (address in next) {
    delete next[address]
    setShots(next)
  }
})

//  Captured on change rather than on a timer: a poll would spend 285ms every
//  few seconds photographing a screen that has not moved.
hyprland.connect("event", () => scheduleCapture())
hyprland.connect("client-added", () => scheduleCapture())
hyprland.connect("client-moved", () => scheduleCapture())

scheduleCapture()
