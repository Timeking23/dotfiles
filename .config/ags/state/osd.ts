import AstalWp from "gi://AstalWp"
import GLib from "gi://GLib?version=2.0"
import { createState } from "ags"
import { interval, timeout } from "ags/time"

/**
 * Drives the on-screen display for volume and backlight.
 *
 * Both sources are watched from module scope rather than from the widget. The
 * OSD window only exists while it is showing, so anything tied to its lifecycle
 * would stop watching the moment it hid itself and never come back.
 *
 * Volume comes from WirePlumber's property notifications, which are immediate.
 * Backlight is polled: the kernel signals brightness changes with sysfs_notify,
 * which surfaces as POLLPRI on the file rather than as an inotify event, so a
 * Gio.FileMonitor never fires for it. A 150ms read of one small integer is
 * cheaper than being clever about it.
 */

const HOLD = 1600
const POLL = 150

export type OsdKind = "volume" | "brightness"

const [kind, setKind] = createState<OsdKind>("volume")
const [level, setLevel] = createState(0)
const [muted, setMuted] = createState(false)
const [visible, setVisible] = createState(false)

export { kind as osdKind, level as osdLevel, muted as osdMuted, visible as osdVisible }

let hideTimer: { cancel: () => void } | null = null

/**
 * Both sources fire once as they are read for the first time. Without this the
 * OSD would flash on every ags restart, which is exactly the moment you are
 * least interested in knowing the volume.
 */
let armed = false
timeout(1200, () => {
  armed = true
})

function show(next: OsdKind, value: number, isMuted = false) {
  setKind(next)
  setLevel(Math.min(1, Math.max(0, value)))
  setMuted(isMuted)

  if (!armed) return

  setVisible(true)
  hideTimer?.cancel()
  hideTimer = timeout(HOLD, () => {
    setVisible(false)
    hideTimer = null
  })
}

// ------------------------------------------------------------------
// volume
// ------------------------------------------------------------------

const speaker = AstalWp.get_default()?.defaultSpeaker ?? null

if (speaker) {
  speaker.connect("notify::volume", () => show("volume", speaker.volume, speaker.mute))
  speaker.connect("notify::mute", () => show("volume", speaker.volume, speaker.mute))
  setLevel(Math.min(1, Math.max(0, speaker.volume)))
  setMuted(speaker.mute)
}

// ------------------------------------------------------------------
// backlight
// ------------------------------------------------------------------

const decoder = new TextDecoder()

/** first device under /sys/class/backlight — there is exactly one here */
const backlight = (() => {
  try {
    const dir = GLib.Dir.open("/sys/class/backlight", 0)
    const entry = dir.read_name()
    dir.close()
    return entry ? `/sys/class/backlight/${entry}` : null
  } catch {
    return null
  }
})()

function readInt(path: string): number | null {
  try {
    const [ok, bytes] = GLib.file_get_contents(path)
    if (!ok) return null
    const value = parseInt(decoder.decode(bytes).trim(), 10)
    return Number.isFinite(value) ? value : null
  } catch {
    return null
  }
}

if (backlight) {
  const max = readInt(`${backlight}/max_brightness`) ?? 0
  let last = readInt(`${backlight}/brightness`) ?? 0

  if (max > 0) {
    interval(POLL, () => {
      const now = readInt(`${backlight}/brightness`)
      if (now === null || now === last) return
      last = now
      show("brightness", now / max)
    })
  }
}
