import GLib from "gi://GLib?version=2.0"
import { createMemo } from "ags"
import { createPoll } from "ags/time"
import { execAsync } from "ags/process"

/**
 * The filesystem as a graph: one node per path, one edge per containment.
 *
 * A full home walk is tens of thousands of entries, which no force simulation
 * survives, so the walk is bounded twice — by depth at the `find` level, and by
 * a byte-weighted cull down to MAX_NODES afterwards. What survives is the part
 * of the tree that actually accounts for the disk.
 */

export const ROOT = GLib.get_home_dir()

/** Directories never worth drawing: huge, generated, and all noise. */
const PRUNE = [
  "node_modules",
  ".git",
  ".cache",
  ".venv",
  "__pycache__",
  "target",
  ".npm",
  ".mozilla",
  ".steam",
]

const MAX_DEPTH = 4
const MAX_NODES = 260
// A home directory twitches constantly, and every walk that changes the path
// set re-heats the layout simulation. 20s was often enough to keep the O(n^2)
// force pass running more or less permanently.
const INTERVAL = 45_000

export type FsNode = {
  path: string
  name: string
  dir: boolean
  /** own bytes for a file; aggregate of everything the walk saw beneath, for a directory */
  size: number
  /** hops from the root node */
  depth: number
  /** index into `nodes` of the nearest surviving ancestor, -1 for the root */
  parent: number
}

export type FsGraph = {
  root: string
  nodes: FsNode[]
  links: [number, number][]
  /** aggregate bytes under the root, before the cull */
  total: number
  /** entries the walk saw, before the cull */
  scanned: number
  /** identity of the shape — lets a poll return `prev` when nothing moved */
  sig: string
}

export const EMPTY: FsGraph = {
  root: ROOT,
  nodes: [],
  links: [],
  total: 0,
  scanned: 0,
  sig: "",
}

export function formatSize(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)}G`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)}M`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)}K`
  return `${bytes}B`
}

// `-prune -o -printf` prints everything the prune did not swallow. Records are
// terminated by RS (\036) rather than a newline, since filenames may legally
// contain newlines — and not by NUL, because execAsync decodes stdout as a
// C string and would silently drop everything past the first one. Wrapped in sh
// so unreadable directories can go to /dev/null instead of failing the whole
// subprocess on a non-zero exit.
function walkCommand(root: string): string[] {
  const prune = PRUNE.map((n) => `-name ${GLib.shell_quote(n)}`).join(" -o ")
  return [
    "sh",
    "-c",
    `find ${GLib.shell_quote(root)} -mindepth 1 -maxdepth ${MAX_DEPTH} ` +
      `\\( ${prune} \\) -prune -o -printf '%y\\t%s\\t%p\\036' 2>/dev/null`,
  ]
}

type Entry = { path: string; dir: boolean; size: number }

function parse(stdout: string): Entry[] {
  const out: Entry[] = []

  for (const record of stdout.split("\x1e")) {
    if (!record) continue

    const t1 = record.indexOf("\t")
    const t2 = record.indexOf("\t", t1 + 1)
    if (t1 < 0 || t2 < 0) continue

    const type = record.slice(0, t1)
    const size = Number(record.slice(t1 + 1, t2))

    // a symlink reports the length of its target string; counting that as disk
    // use would inflate the parent directory for nothing
    out.push({
      path: record.slice(t2 + 1),
      dir: type === "d",
      size: type === "f" && Number.isFinite(size) ? size : 0,
    })
  }

  return out
}

const parentOf = (p: string) => {
  const slash = p.lastIndexOf("/")
  return slash <= 0 ? "" : p.slice(0, slash)
}

function build(root: string, entries: Entry[]): FsGraph {
  // ---- aggregate every file's bytes into all of its ancestors ----
  const agg = new Map<string, number>([[root, 0]])

  for (const e of entries) {
    if (e.dir) {
      if (!agg.has(e.path)) agg.set(e.path, 0)
      continue
    }
    for (let p = parentOf(e.path); p.length >= root.length; p = parentOf(p)) {
      agg.set(p, (agg.get(p) ?? 0) + e.size)
      if (p === root) break
    }
  }

  const weightOf = (e: Entry) => (e.dir ? (agg.get(e.path) ?? 0) : e.size)

  // ---- cull to the heaviest MAX_NODES, then repair connectivity ----
  // headroom, because pulling ancestors back in can only grow the set
  const budget = Math.floor(MAX_NODES * 0.85)
  const keep = new Set<string>([root])

  for (const e of [...entries].sort((a, b) => weightOf(b) - weightOf(a))) {
    if (keep.size >= budget) break
    keep.add(e.path)
  }

  for (const path of [...keep]) {
    for (let p = parentOf(path); p.length > root.length; p = parentOf(p)) {
      keep.add(p)
    }
  }

  // ---- order by depth so a node's parent always precedes it ----
  const depthOf = (p: string) =>
    p === root ? 0 : p.slice(root.length + 1).split("/").length

  const paths = [...keep].sort(
    (a, b) => depthOf(a) - depthOf(b) || (a < b ? -1 : a > b ? 1 : 0),
  )
  const index = new Map(paths.map((p, i) => [p, i]))
  const byPath = new Map(entries.map((e) => [e.path, e]))

  const nodes: FsNode[] = paths.map((path) => {
    const entry = byPath.get(path)
    const dir = path === root || !!entry?.dir
    return {
      path,
      name: path.slice(path.lastIndexOf("/") + 1) || path,
      dir,
      size: dir ? (agg.get(path) ?? 0) : (entry?.size ?? 0),
      depth: depthOf(path),
      parent: -1,
    }
  })

  const links: [number, number][] = []

  nodes.forEach((node, i) => {
    if (node.depth === 0) return
    // the direct parent may itself have been culled, so climb until a survivor
    for (let p = parentOf(node.path); p.length >= root.length; p = parentOf(p)) {
      const pi = index.get(p)
      if (pi !== undefined) {
        node.parent = pi
        links.push([pi, i])
        return
      }
    }
  })

  return {
    root,
    nodes,
    links,
    total: agg.get(root) ?? 0,
    scanned: entries.length,
    sig: `${nodes.length}:${paths.join(" ")}`,
  }
}

/**
 * Re-walks on a timer, but returns the previous graph unchanged when the shape
 * is identical — createPoll compares by identity, so this is what stops the
 * simulation from being re-heated every 20s for a tree that never moved.
 */
export const fsGraph = createPoll<FsGraph>(EMPTY, INTERVAL, async (prev) => {
  try {
    const next = build(ROOT, parse(await execAsync(walkCommand(ROOT))))
    return next.sig === prev.sig ? prev : next
  } catch {
    return prev
  }
})

export const fsRootLabel = createMemo(() =>
  fsGraph().root.replace(GLib.get_home_dir(), "~"),
)

export const fsSummary = createMemo(() => {
  const g = fsGraph()
  if (!g.nodes.length) return "SCANNING"
  return `${g.nodes.length}/${g.scanned} NODES  ${formatSize(g.total)}`
})
