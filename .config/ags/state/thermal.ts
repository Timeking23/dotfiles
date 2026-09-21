import GLib from "gi://GLib?version=2.0"
import { createMemo } from "ags"
import { createPoll } from "ags/time"

/**
 * Temperatures and fan speed, read straight from hwmon.
 *
 * The hwmonN numbers are assigned in probe order and shuffle between boots, so
 * nothing here hardcodes one — the directories are resolved by their `name`
 * file at first use and cached. Hardcoding `/sys/class/hwmon/hwmon5` works
 * until the day it silently reports the wifi card's temperature instead.
 *
 * `acpitz` is deliberately ignored despite being the obvious-looking zone: on
 * this machine it reads a flat 95°C, which is a trip point rather than a
 * measurement.
 */

const decoder = new TextDecoder()

function read(path: string): number | null {
  try {
    const [ok, bytes] = GLib.file_get_contents(path)
    if (!ok) return null
    const value = parseInt(decoder.decode(bytes).trim(), 10)
    return Number.isFinite(value) ? value : null
  } catch {
    return null
  }
}

/** hwmon directory for a driver, by the contents of its `name` file */
const resolved = new Map<string, string | null>()

function hwmon(name: string): string | null {
  if (resolved.has(name)) return resolved.get(name)!

  let found: string | null = null
  try {
    const dir = GLib.Dir.open("/sys/class/hwmon", 0)
    for (;;) {
      const entry = dir.read_name()
      if (!entry) break

      const path = `/sys/class/hwmon/${entry}`
      const [ok, bytes] = GLib.file_get_contents(`${path}/name`)
      if (ok && decoder.decode(bytes).trim() === name) {
        found = path
        break
      }
    }
    dir.close()
  } catch {
    found = null
  }

  resolved.set(name, found)
  return found
}

/** millidegrees to whole degrees */
function temp(driver: string, index = 1): number | null {
  const dir = hwmon(driver)
  if (!dir) return null
  const raw = read(`${dir}/temp${index}_input`)
  return raw === null ? null : Math.round(raw / 1000)
}

function fan(driver: string, index: number): number | null {
  const dir = hwmon(driver)
  return dir ? read(`${dir}/fan${index}_input`) : null
}

export type Thermals = {
  /** package temperature, Tctl */
  cpu: number | null
  /** GPU edge temperature */
  gpu: number | null
  /** the faster of the two chassis fans */
  rpm: number | null
}

export const thermals = createPoll<Thermals>({ cpu: null, gpu: null, rpm: null }, 2000, () => {
  const cpuFan = fan("asus", 1)
  const gpuFan = fan("asus", 2)

  return {
    cpu: temp("k10temp"),
    gpu: temp("amdgpu"),
    // one number for a rig with three fans: whichever is working hardest is
    // the one that tells you something
    rpm:
      cpuFan === null && gpuFan === null ? null : Math.max(cpuFan ?? 0, gpuFan ?? 0),
  }
})

/**
 * Where the hot one sits between idle and the point you would start worrying.
 * Not a percentage of anything physical — a laptop does not run at 0°C — so
 * the floor is a realistic idle rather than absolute zero, or the gauge would
 * sit at two thirds while doing nothing.
 */
const FLOOR = 35
const CEILING = 95

export const thermalLoad = createMemo(() => {
  const { cpu, gpu } = thermals()
  const hottest = Math.max(cpu ?? 0, gpu ?? 0)
  if (!hottest) return 0
  return Math.min(1, Math.max(0, (hottest - FLOOR) / (CEILING - FLOOR)))
})

export const thermalReadout = createMemo(() => {
  const { cpu, gpu } = thermals()
  const hottest = Math.max(cpu ?? 0, gpu ?? 0)
  return hottest ? `${hottest}°` : "--"
})

export const thermalCaption = createMemo(() => {
  const { cpu, gpu, rpm } = thermals()
  const parts: string[] = []
  if (cpu !== null) parts.push(`${cpu}c`)
  if (gpu !== null) parts.push(`${gpu}g`)
  if (rpm) parts.push(`${rpm}rpm`)
  return parts.length ? parts.join(" ") : "no sensors"
})
