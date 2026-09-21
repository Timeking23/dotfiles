import GLib from "gi://GLib?version=2.0"
import Gio from "gi://Gio?version=2.0"
import { createExternal } from "ags"
import { monitorFile } from "ags/file"

/**
 * Decorative stickers — transparent PNGs slapped onto the shell.
 *
 * Deliberately the one exception to the "every element maps to a live data
 * source" rule: these are charms, not readouts. Everything else in this config
 * earns its pixels; these are here because a desk with nothing stuck to it
 * looks like a rental.
 *
 * Drop a file named after a slot into DIR and it appears — no restart. The
 * lookup is by basename so the extension is free (png/webp/gif/svg all work,
 * and GdkPixbuf animates a GIF on its own).
 */

export const DIR = `${GLib.get_user_config_dir()}/ags/assets/stickers`

export type Slot = "player" | "top-right" | "bottom-right"

const SLOTS: Slot[] = ["player", "top-right", "bottom-right"]

/** first match wins, so a .png shadows a .gif of the same name */
const EXTS = ["png", "webp", "gif", "svg", "jpg", "jpeg"]

GLib.mkdir_with_parents(DIR, 0o755)

function find(slot: Slot): Gio.File | null {
  for (const ext of EXTS) {
    const path = `${DIR}/${slot}.${ext}`
    if (GLib.file_test(path, GLib.FileTest.EXISTS)) {
      // a fresh Gio.File every scan, on purpose: Gtk.Picture reloads on a
      // `file` notify, and an identical value would be deduped away — so
      // overwriting a sticker in place would otherwise show the stale pixels
      return Gio.File.new_for_path(path)
    }
  }
  return null
}

function scan(): Record<Slot, Gio.File | null> {
  return Object.fromEntries(SLOTS.map((s) => [s, find(s)])) as Record<Slot, Gio.File | null>
}

/**
 * The current contents of the sticker directory, rescanned on any change.
 *
 * `createExternal` keeps the Gio file monitor lazy: it is installed when the
 * first sticker widget subscribes and torn down when the last one goes away,
 * rather than being held open for the whole session as the previous
 * module-scope monitorFile() call was.
 */
const files = createExternal(scan(), (set) => {
  const monitor = monitorFile(DIR, () => set(scan()))
  return () => monitor.cancel()
})

/** the file for one slot, or null while that slot is empty */
export function stickerFile(slot: Slot) {
  return files((f) => f[slot])
}

/** whether that slot currently has anything in it */
export function stickerPresent(slot: Slot) {
  return files((f) => f[slot] !== null)
}
