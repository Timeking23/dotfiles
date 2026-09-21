import GLib from "gi://GLib?version=2.0"
import { createMemo } from "ags"
import { createSubprocess } from "ags/process"

// NOTE: we deliberately do NOT use gi://AstalCava here.
// libastal-cava-git on this system links against libcava.so.0, but the
// installed libcava is 1.0.0 (libcava.so.1). Importing AstalCava aborts the
// process outright — it takes the whole shell down, not just this widget.
// Driving the cava CLI over a pipe sidesteps the ABI mismatch entirely.

export const BARS = 26

/** cava's own config format; raw ascii on stdout is the machine-readable mode */
const CONFIG = `[general]
mode = normal
framerate = 60
bars = ${BARS}
autosens = 1
lower_cutoff_freq = 50
higher_cutoff_freq = 10000

[input]
method = pulse
source = auto

[smoothing]
noise_reduction = 30

[output]
method = raw
raw_target = /dev/stdout
data_format = ascii
ascii_max_range = 100
channels = mono
`

const CONFIG_PATH = `${GLib.get_user_runtime_dir()}/ags-cava.conf`

export const cavaAvailable = GLib.find_program_in_path("cava") !== null

if (!cavaAvailable) {
  // otherwise the visualiser is silently absent with nothing to explain why
  console.warn("cava binary not found — music visualiser disabled (install: pacman -S cava)")
}

if (cavaAvailable) {
  GLib.file_set_contents(CONFIG_PATH, CONFIG)
}

const SILENT: number[] = new Array(BARS).fill(0)

/**
 * Normalised 0..1 spectrum, one entry per bar.
 *
 * createSubprocess is lazy — cava is only spawned once a widget subscribes and
 * is killed when the last one goes away, so it costs nothing while the player
 * popup is closed. Falls back to a constant silent spectrum when the cava
 * binary isn't installed, so the visualiser simply renders nothing.
 */
export const levels = cavaAvailable
  ? createSubprocess<number[]>(SILENT, ["cava", "-p", CONFIG_PATH], (line, previous) => {
      const fields = line.trim().replace(/;+$/, "").split(";")
      if (fields.length < BARS) return previous

      return fields.slice(0, BARS).map((field) => {
        const value = Number(field)
        return isNaN(value) ? 0 : Math.min(1, Math.max(0, value / 100))
      })
    })
  : createMemo(() => SILENT)
