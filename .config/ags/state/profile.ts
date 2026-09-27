import GLib from "gi://GLib?version=2.0"
import { createMemo, createState } from "ags"
import { createPoll } from "ags/time"
import { execAsync } from "ags/process"

/**
 * The ASUS platform profile, and the fan curve bound to it.
 *
 * Two sources, deliberately, because they answer at very different speeds:
 *
 *   the ACTIVE profile is read from /sys/firmware/acpi/platform_profile. It is
 *   one short file and costs nothing, so it can be polled fast enough that the
 *   panel confirms a click rather than merely believing it. Going through
 *   `asusctl profile get` instead means spawning a process on every tick to
 *   learn a word that sysfs already has.
 *
 *   everything asusd owns on TOP of the kernel -- which profile is bound to AC
 *   and which to battery, whether the custom fan curves are enabled -- has no
 *   sysfs equivalent and has to come from asusctl. That is a subprocess, so it
 *   runs on a slow tick.
 *
 * Writes always go through asusctl, never by echoing into platform_profile:
 * asusd keeps its own record of the AC/battery binding and re-applies it, so a
 * value written behind its back is reverted the next time the charger moves.
 */

const decoder = new TextDecoder()

function slurp(path: string): string | null {
  try {
    const [ok, bytes] = GLib.file_get_contents(path)
    return ok ? decoder.decode(bytes).trim() : null
  } catch {
    return null
  }
}

export type ProfileKey = "quiet" | "balanced" | "performance"

export type Tier = {
  key: ProfileKey
  /** what asusctl wants on the command line -- it is case-sensitive */
  arg: string
  label: string
  /** Nerd Font glyph, for the same reason every other glyph here is one:
      state/status.ts explains why an icon name is not safe to rely on */
  glyph: string
  /** what picking this actually does, in one line */
  blurb: string
}

/**
 * Ordered coolest-first, which is also the order they are drawn in. The index
 * is what "one tier up" means, so nothing else in this file has to know that
 * performance is the top -- see {@link shift}.
 */
export const TIERS: Array<Tier> = [
  {
    key: "quiet",
    arg: "Quiet",
    label: "QUIET",
    glyph: "\u{f06c}", // nf-fa-leaf
    blurb: "Lowest power, fans held back. Fine for reading and typing.",
  },
  {
    key: "balanced",
    arg: "Balanced",
    label: "BALANCED",
    glyph: "\u{f24e}", // nf-fa-balance_scale
    blurb: "Boosts when asked, settles when idle. The everyday setting.",
  },
  {
    key: "performance",
    arg: "Performance",
    label: "PERFORMANCE",
    glyph: "\u{f135}", // nf-fa-rocket
    blurb: "Full power budget, fans ramp early. Loud, and the coolest silicon.",
  },
]

const BY_KEY = new Map(TIERS.map((tier) => [tier.key, tier]))

/**
 * Optimistic override, cleared as soon as sysfs agrees.
 *
 * asusctl takes about 150ms to round-trip through asusd and the EC, which is
 * long enough to see: without this the card you clicked stays unselected for a
 * beat and the panel reads as having ignored you. So the click paints the new
 * tier immediately and the poll below confirms it.
 */
const [pending, setPending] = createState<ProfileKey | null>(null)

/** Whatever the kernel currently says, normalised to a ProfileKey. */
const reported = createPoll<ProfileKey | null>(null, 700, () => {
  const raw = slurp("/sys/firmware/acpi/platform_profile")
  return raw && BY_KEY.has(raw as ProfileKey) ? (raw as ProfileKey) : null
})

export const activeProfile = createMemo<ProfileKey | null>(() => {
  const wanted = pending()
  const actual = reported()

  //  Once the kernel reports what we asked for, stop overriding. Clearing the
  //  override from inside the memo would be a write during a read, so the
  //  comparison simply stops preferring it and `settle` does the cleanup.
  if (wanted && wanted === actual) return actual
  return wanted ?? actual
})

/** True while a click is in flight and the hardware has not caught up. */
export const profileSettling = createMemo(() => {
  const wanted = pending()
  return wanted !== null && wanted !== reported()
})

export const activeTier = createMemo<Tier | null>(() => {
  const key = activeProfile()
  return key ? BY_KEY.get(key)! : null
})

export const profileLabel = createMemo(() => activeTier()?.label ?? "--")

/** Short form for the sidebar key's readout chip, which is ~9 characters wide. */
export const profileShort = createMemo(() => {
  const key = activeProfile()
  if (!key) return "--"
  return key === "performance" ? "PERF" : key === "balanced" ? "BAL" : "QUIET"
})

//  Falls back to a plain gauge rather than to any one tier's icon: the key
//  is showing "profile unknown", and borrowing the rocket would say the
//  machine is in Performance when we do not actually know that.
export const profileGlyph = createMemo(() => activeTier()?.glyph ?? "\u{f0e4}") // nf-fa-dashboard

// ---- asusd's own state ------------------------------------------------------

export type AsusdState = {
  /** profile asusd re-applies when the charger is plugged in */
  ac: string | null
  /** profile asusd re-applies when it is pulled out */
  battery: string | null
  /** how many of the three fan curves (cpu/gpu/mid) asusd has enabled */
  curvesOn: number
  curvesTotal: number
}

const EMPTY: AsusdState = { ac: null, battery: null, curvesOn: 0, curvesTotal: 0 }

/**
 * Slow tick: two subprocesses, for things that only change when something
 * changes them. Four seconds is short enough that the panel is never stale to
 * the eye and long enough that it is not spawning asusctl at it.
 */
export const asusd = createPoll<AsusdState>(EMPTY, 4000, async () => {
  try {
    //  Sequential, not Promise.all: both talk to the same asusd over dbus and
    //  overlapping them buys nothing on a 4s tick.
    const profiles = await execAsync(["asusctl", "profile", "get"])
    const curves = await execAsync(["asusctl", "fan-curve", "--get-enabled"])

    //  "AC profile Performance" / "Battery profile Quiet"
    const pick = (which: string) => {
      const line = profiles.split("\n").find((row) => row.trim().startsWith(which))
      const word = line?.trim().split(/\s+/).pop()
      return word && word !== "profile" ? word : null
    }

    //  one line per fan: "CPU: enabled: false, 20c:16%,..."
    const rows = curves.split("\n").filter((row) => row.includes("enabled:"))

    return {
      ac: pick("AC profile"),
      battery: pick("Battery profile"),
      curvesOn: rows.filter((row) => /enabled:\s*true/.test(row)).length,
      curvesTotal: rows.length,
    }
  } catch {
    //  asusd not running, or asusctl missing. The panel shows this as "--"
    //  rather than pretending the curves are off.
    return EMPTY
  }
})

export const curvesEnabled = createMemo(() => {
  const { curvesOn, curvesTotal } = asusd()
  return curvesTotal > 0 && curvesOn === curvesTotal
})

export const curvesLabel = createMemo(() => {
  const { curvesOn, curvesTotal } = asusd()
  if (curvesTotal === 0) return "UNAVAILABLE"
  return curvesOn === curvesTotal ? "CUSTOM" : curvesOn === 0 ? "FIRMWARE" : `${curvesOn}/${curvesTotal}`
})

export const powerBinding = createMemo(() => {
  const { ac, battery } = asusd()
  if (!ac && !battery) return "asusd not reporting"
  return `AC ${(ac ?? "--").toLowerCase()} · battery ${(battery ?? "--").toLowerCase()}`
})

// ---- the curve editor -------------------------------------------------------

/**
 * ROG Control Center, if it is installed.
 *
 * Nothing custom is built here on purpose. asusctl ships its own GUI in
 * `extra/rog-control-center`, at the same version as the daemon and from the
 * same source package, and it talks to the asusd already running rather than
 * to a second copy of the logic. A hand-drawn curve editor in this config
 * would be a worse version of it that also has to be kept in step with asusd's
 * dbus API every release.
 *
 * So the panel owns the things worth having one click away -- the tier, the
 * curve on/off, the temperatures -- and hands the eight-point curve itself to
 * the tool built for it.
 */
const EDITOR = "rog-control-center"

/**
 * Polled rather than resolved once at import: this is almost always false the
 * first time someone reads this file, because the package is not installed
 * yet. Looking it up once at startup means the row stays greyed out until AGS
 * is restarted, which is a confusing thing to happen right after an install.
 * It is a PATH stat every five seconds.
 */
export const fanEditor = createPoll<string | null>(null, 5000, () =>
  GLib.find_program_in_path(EDITOR),
)

export const hasFanEditor = createMemo(() => fanEditor() !== null)

export const fanEditorNote = createMemo(() =>
  hasFanEditor()
    ? "Draw the eight-point curve per profile, and watch it against live RPM."
    : `Not installed. sudo pacman -S ${EDITOR}`,
)

// ---- writes -----------------------------------------------------------------

/**
 * Drop the optimistic override once the hardware has agreed, or once it is
 * clear it is not going to. Subscribed rather than folded into the memo above
 * because clearing it IS a write, and writing to state from inside a memo's
 * read is how you get a loop.
 */
reported.subscribe(() => {
  const wanted = pending.peek()
  if (wanted && wanted === reported.peek()) setPending(null)
})

export function setProfile(key: ProfileKey) {
  const tier = BY_KEY.get(key)
  if (!tier) return

  setPending(key)

  execAsync(["asusctl", "profile", "set", tier.arg]).catch((error) => {
    //  Put the card back where it was. A failed write that leaves the panel
    //  showing the profile you asked for is worse than no feedback at all --
    //  you walk away believing the machine is in a state it is not.
    setPending(null)
    console.error(`profile: could not set ${tier.arg}:`, error)
  })
}

/** Move `steps` tiers along the list, clamped at both ends. */
export function shift(steps: number) {
  const current = activeProfile.peek()
  const from = TIERS.findIndex((tier) => tier.key === current)
  if (from < 0) return

  const to = Math.min(TIERS.length - 1, Math.max(0, from + steps))
  if (to !== from) setProfile(TIERS[to].key)
}

/**
 * Turn the custom fan curves on or off for the profile that is active NOW.
 *
 * Curves are per-profile in asusd, so this deliberately does not take a
 * profile argument: the switch in the panel belongs to the tier shown beside
 * it, and enabling curves on a profile you are not running is a setting that
 * appears to do nothing.
 */
export function setCurves(on: boolean) {
  const tier = activeTier.peek()
  if (!tier) return

  execAsync([
    "asusctl",
    "fan-curve",
    "--mod-profile",
    tier.key,
    "--enable-fan-curves",
    on ? "true" : "false",
  ]).catch((error) => console.error("profile: could not toggle fan curves:", error))
}

/**
 * Open the curve editor.
 *
 * Not awaited -- the promise settles when the GUI is CLOSED, which may be an
 * hour from now. The same pattern the launchers in FloatingPanel.tsx use.
 *
 * The caller is expected to shut the panel first: this window is an overlay
 * layer surface with an exclusive keymode, so a normal application window
 * opening underneath it is both invisible and unfocusable.
 */
export function launchFanEditor() {
  if (!hasFanEditor.peek()) return
  //  --windowed, because ROGCC remembers how it was last started and has a
  //  --background mode that opens no window at all. Launched bare, a button
  //  labelled "Open" can put the app in the tray and appear to have done
  //  nothing -- which is exactly what it did the first time this was tested.
  execAsync([EDITOR, "--windowed"]).catch((error) =>
    console.error(`profile: ${EDITOR} exited:`, error),
  )
}
