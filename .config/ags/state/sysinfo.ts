import GLib from "gi://GLib?version=2.0"
import Gio from "gi://Gio?version=2.0"
import { createMemo } from "ags"
import { createPoll } from "ags/time"

/**
 * ============================================================================
 * CPU, memory, processes and disk -- read straight from the kernel
 * ============================================================================
 *
 * NEW HERE? This file is a good example of the shape every `state/` module
 * takes, so it is worth reading before the others:
 *
 *   1. Small private helpers that talk to the outside world (readFile below).
 *   2. `createPoll(initial, everyMs, fn)` -- the raw reading. A poll is LAZY:
 *      the timer only runs while something is actually subscribed to it, so a
 *      hidden panel costs nothing.
 *   3. `createMemo(() => ...)` -- values derived from the raw reading. These
 *      re-run automatically when what they read changes.
 *
 * Nothing in `state/` imports anything from `widget/`. The rule is one-way:
 * widgets read state, state never knows a widget exists. That is what lets you
 * read any instrument in this config by opening exactly two files.
 *
 * ---------------------------------------------------------------------------
 * WHY createMemo AND NOT createComputed
 * ---------------------------------------------------------------------------
 * Both derive a value from other reactive values. The difference is what they
 * do when a dependency changes but the RESULT does not:
 *
 *   createComputed  notifies subscribers anyway
 *   createMemo      compares against the last value and stays quiet
 *
 * That matters a lot here. `cpuHistory` produces a brand-new array every second,
 * so every label derived from it would be re-set on the GTK widget once a
 * second even when the text is identical -- `cpuLabel` sits at "3%" for minutes
 * at a time. A memo turns that into one property write per actual change.
 */

const decoder = new TextDecoder()

/** Whole file as a string, or "" if unreadable. These are all tiny virtual files. */
function readFile(path: string): string {
  try {
    const [ok, bytes] = GLib.file_get_contents(path)
    return ok ? decoder.decode(bytes) : ""
  } catch {
    return ""
  }
}

/** Kilobytes to the largest unit that still reads as a small number. */
export function formatBytes(kb: number): string {
  if (kb >= 1024 * 1024) return `${(kb / 1024 / 1024).toFixed(1)}G`
  if (kb >= 1024) return `${(kb / 1024).toFixed(0)}M`
  return `${kb}K`
}

// ============================================================================
// CPU
// ============================================================================
// /proc/stat counts cumulative jiffies since boot, so utilisation is only
// meaningful as a delta between two samples -- never as a single reading.

type CpuSample = { idle: number; total: number }

function cpuSample(): CpuSample {
  const line = readFile("/proc/stat").split("\n")[0] ?? ""
  // first field is the literal word "cpu", so drop it
  const parts = line.trim().split(/\s+/).slice(1).map(Number)
  if (parts.length < 4) return { idle: 0, total: 0 }

  const idle = (parts[3] ?? 0) + (parts[4] ?? 0) // idle + iowait
  const total = parts.reduce((a, b) => a + (isNaN(b) ? 0 : b), 0)
  return { idle, total }
}

/** How many seconds of history the sparkline shows. */
const HISTORY = 48

let previous = cpuSample()

/**
 * Rolling window of 0..1 utilisation, oldest first.
 *
 * The poll's callback receives the PREVIOUS value, which is what makes a
 * rolling window possible without a second variable holding the array.
 */
export const cpuHistory = createPoll<number[]>(new Array(HISTORY).fill(0), 1000, (prev) => {
  const now = cpuSample()
  const dTotal = now.total - previous.total
  const dIdle = now.idle - previous.idle
  previous = now

  const usage = dTotal > 0 ? Math.min(1, Math.max(0, 1 - dIdle / dTotal)) : 0
  return [...prev.slice(1), usage]
})

export const cpuUsage = createMemo(() => cpuHistory().at(-1) ?? 0)
export const cpuLabel = createMemo(() => `${Math.round(cpuUsage() * 100)}%`)

// ============================================================================
// MEMORY
// ============================================================================

type MemInfo = {
  /** kilobytes */
  total: number
  used: number
  swapTotal: number
  swapUsed: number
}

export const memory = createPoll<MemInfo>(
  { total: 0, used: 0, swapTotal: 0, swapUsed: 0 },
  2000,
  () => {
    const fields: Record<string, number> = {}
    for (const line of readFile("/proc/meminfo").split("\n")) {
      const [key, value] = line.split(":")
      if (key && value) fields[key] = parseInt(value.trim(), 10) || 0
    }

    // MemAvailable, not MemFree -- free excludes reclaimable cache and so
    // wildly overstates pressure on any machine that has been up a while
    const total = fields["MemTotal"] ?? 0
    const available = fields["MemAvailable"] ?? 0
    const swapTotal = fields["SwapTotal"] ?? 0
    const swapFree = fields["SwapFree"] ?? 0

    return {
      total,
      used: Math.max(0, total - available),
      swapTotal,
      swapUsed: Math.max(0, swapTotal - swapFree),
    }
  },
)

export const memPercent = createMemo(() => {
  const { total, used } = memory()
  return total > 0 ? used / total : 0
})

export const memLabel = createMemo(() => {
  const { total, used } = memory()
  return `${formatBytes(used)} / ${formatBytes(total)}`
})

export const swapPercent = createMemo(() => {
  const { swapTotal, swapUsed } = memory()
  return swapTotal > 0 ? swapUsed / swapTotal : 0
})

export const swapLabel = createMemo(() => {
  const { swapTotal, swapUsed } = memory()
  return swapTotal > 0 ? `${formatBytes(swapUsed)} / ${formatBytes(swapTotal)}` : "none"
})

// ============================================================================
// PROCESSES
// ============================================================================

export type Process = { name: string; rss: number }

/**
 * What the iceberg shows above the waterline. Five is what fits: past that the
 * ridges are too close together to tell apart at this size.
 */
const TOP_N = 5

export type ProcessRoll = {
  /** the heaviest TOP_N, biggest first */
  top: Process[]
  /** everything else, summed -- the mass under the waterline */
  other: number
  /** every process, including the ones in `top` */
  total: number
}

const EMPTY_ROLL: ProcessRoll = { top: [], other: 0, total: 0 }

/**
 * Top consumers by resident set size, plus what they leave out.
 *
 * Walks /proc directly rather than shelling out to ps every couple of seconds.
 * Processes with the same name are merged -- otherwise a browser's forty
 * renderer children swamp the map and say nothing useful.
 */
export const processRoll = createPoll<ProcessRoll>(EMPTY_ROLL, 3000, () => {
  const merged = new Map<string, number>()

  let dir: Gio.FileEnumerator
  try {
    dir = Gio.File.new_for_path("/proc").enumerate_children(
      "standard::name",
      Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
      null,
    )
  } catch {
    // /proc unreadable. This MUST still be a ProcessRoll -- the value goes
    // straight to MemMesh, which reads .top and .other off it. Returning a
    // bare [] here (as this did) left the mesh reading undefined.
    return EMPTY_ROLL
  }

  for (;;) {
    const info = dir.next_file(null)
    if (!info) break

    const pid = info.get_name()
    if (!/^\d+$/.test(pid)) continue // /proc also holds non-pid entries

    // statm field 2 is resident pages; cheaper to parse than status
    const statm = readFile(`/proc/${pid}/statm`)
    if (!statm) continue // process exited between listing and reading

    const pages = parseInt(statm.split(" ")[1] ?? "0", 10)
    if (!pages) continue

    const comm = readFile(`/proc/${pid}/comm`).trim()
    if (!comm) continue

    const kb = (pages * 4096) / 1024
    merged.set(comm, (merged.get(comm) ?? 0) + kb)
  }

  dir.close(null)

  const all = [...merged.entries()]
    .map(([name, rss]) => ({ name, rss }))
    .sort((a, b) => b.rss - a.rss)

  const top = all.slice(0, TOP_N)
  const total = all.reduce((sum, p) => sum + p.rss, 0)
  const shown = top.reduce((sum, p) => sum + p.rss, 0)

  return { top, other: Math.max(0, total - shown), total }
})

/** The named few, for anything that only wants a ranking. */
export const processes = createMemo(() => processRoll().top)

// ============================================================================
// DISK
// ============================================================================

export const disk = createPoll<{ total: number; used: number }>(
  { total: 0, used: 0 },
  30_000, // a root filesystem does not change size in a hurry
  () => {
    try {
      const info = Gio.File.new_for_path("/").query_filesystem_info("filesystem::*", null)
      const total = Number(info.get_attribute_uint64("filesystem::size"))
      const free = Number(info.get_attribute_uint64("filesystem::free"))
      return { total: total / 1024, used: (total - free) / 1024 }
    } catch {
      return { total: 0, used: 0 }
    }
  },
)

export const diskPercent = createMemo(() => {
  const { total, used } = disk()
  return total > 0 ? used / total : 0
})

export const diskLabel = createMemo(() => {
  const { total, used } = disk()
  return total > 0 ? `${formatBytes(used)} / ${formatBytes(total)}` : "----"
})
