import { Gtk } from "ags/gtk4"
import type Cairo from "cairo"

import Canvas from "./canvas"

import { formatBytes, processRoll, type Process, type ProcessRoll } from "../state/sysinfo"

/**
 * Memory by process, drawn as an iceberg on a spinning isometric plate.
 *
 * The metaphor is doing real work here rather than decorating. Above the
 * waterline are the five heaviest processes, each a Gaussian ridge: its depth
 * row is its rank, its height is its share of the heaviest one, and its place
 * across the plate is a hash of its name so it keeps its spot between polls
 * instead of skating across the massif every three seconds. Below the waterline
 * is everything else — the sum of every process that did not make the top five
 * — as one broad submerged mass whose depth is that remainder measured against
 * what is showing. A small berg with a huge keel means your memory is going
 * somewhere other than the things you can name.
 *
 * Hidden-line removal above water is the painter's algorithm over quads sorted
 * by rotated depth, each filled translucent before it is stroked: translucent
 * so the mesh behind ghosts through, which is what makes it read as a hologram
 * rather than a solid. Below water is drawn as open wireframe with no fill at
 * all — you are meant to see through water, and it is most of the frame budget
 * saved besides.
 */

const COLS = 24
const ROWS = 22
const CELLS = COLS * ROWS

/** how far across and back one process's mass is spread, in plate units */
const SIGMA_U = 0.17
const SIGMA_V = 0.15
/** the keel is one broad mass, not five — this is its spread */
const SIGMA_KEEL = 0.34

/**
 * How quickly the surface morphs toward the newest poll, as a time constant in
 * seconds, and the height delta below which we call it settled.
 *
 * A time constant rather than a per-frame fraction so the morph takes the same
 * wall-clock time on any refresh rate -- see the same note in Dial.tsx.
 */
const EASE_TAU = 0.09
const SETTLED = 0.0015
const DRAW_HZ = 14
/** radians per second of idle spin; dragging takes over while the button is down */
const SPIN = 0.07

/**
 * The rotated plate is √2 wider corner-to-corner than edge-to-edge, so the
 * footprint has to be sized for its worst case or it clips at 45°.
 */
const DIAGONAL = Math.SQRT2

// ------------------------------------------------------------------
// noise — deterministic, so the terrain does not shimmer between frames
// ------------------------------------------------------------------

function hash2(x: number, y: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}

function strHash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return ((h ^ (h >>> 15)) >>> 0) / 4294967295
}

/** value noise with a smoothstep fade — cheap, and smooth enough for ridges */
function noise(x: number, y: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const sx = (x - xi) * (x - xi) * (3 - 2 * (x - xi))
  const sy = (y - yi) * (y - yi) * (3 - 2 * (y - yi))

  const a = hash2(xi, yi)
  const b = hash2(xi + 1, yi)
  const c = hash2(xi, yi + 1)
  const d = hash2(xi + 1, yi + 1)

  const top = a + (b - a) * sx
  return top + (c + (d - c) * sx - top) * sy
}

/**
 * Ridged noise: folded about its midpoint so the maxima come out as creases
 * rather than as domes. Plain value noise summed over octaves gives rolling
 * hills; ice only reads as ice once it has sharp crest lines.
 */
function ridge(x: number, y: number): number {
  return 1 - Math.abs(noise(x, y) * 2 - 1)
}

// ------------------------------------------------------------------

type Peak = { item: Process; u: number; v: number }

/** how deep the keel runs, as a multiple of the plate's standard depth */
let keelScale = 1

function build(roll: ProcessRoll, above: Float64Array, below: Float64Array): Peak[] {
  above.fill(0)
  below.fill(0)

  const list = roll.top
  if (!list.length) return []

  const heaviest = list[0].rss || 1
  const n = list.length

  const peaks: Peak[] = list.map((item, i) => ({
    item,
    v: n > 1 ? 1 - i / (n - 1) : 0.5,
    u: 0.5 + (strHash(item.name) - 0.5) * 0.46,
  }))

  // Square root rather than the raw ratio. One browser routinely holds five
  // times what anything else does, and on a linear scale that flattens every
  // other process into the floor — the plate then shows one spike and no
  // context. sqrt keeps the ranking exact while leaving the rest legible.
  const amp = list.map((item) => Math.sqrt(item.rss / heaviest))

  // the keel sits under the centre of mass of what is showing, not under the
  // middle of the plate — a lopsided berg leans the way its weight does
  let mass = 0
  let ku = 0
  let kv = 0
  peaks.forEach((p, i) => {
    mass += amp[i]
    ku += p.u * amp[i]
    kv += p.v * amp[i]
  })
  ku = mass ? ku / mass : 0.5
  kv = mass ? kv / mass : 0.5

  const shown = list.reduce((sum, p) => sum + p.rss, 0)
  keelScale = Math.min(2.4, Math.max(0.35, shown > 0 ? roll.other / shown : 0.35))

  let hi = 0
  for (let r = 0; r < ROWS; r++) {
    const v = r / (ROWS - 1)
    for (let c = 0; c < COLS; c++) {
      const u = c / (COLS - 1)
      const i = r * COLS + c

      let z = 0
      for (let k = 0; k < peaks.length; k++) {
        const du = (u - peaks[k].u) / SIGMA_U
        const dv = (v - peaks[k].v) / SIGMA_V
        z += amp[k] * Math.exp(-(du * du + dv * dv))
      }

      // three octaves, ridged on the low two, scaled by the local height so
      // the water stays flat and only the berg comes out ragged
      const rough =
        ridge(u * 5.5, v * 5.5) * 0.5 +
        ridge(u * 12, v * 12) * 0.32 +
        noise(u * 26, v * 26) * 0.18
      z = z * (0.5 + rough * 1.0) + rough * 0.035

      above[i] = z
      if (z > hi) hi = z

      // one broad mass, roughened far more gently — a keel is worn smooth
      const ru = (u - ku) / SIGMA_KEEL
      const rv = (v - kv) / SIGMA_KEEL
      below[i] = Math.exp(-(ru * ru + rv * rv)) * (0.72 + rough * 0.5)
    }
  }

  if (hi > 0) {
    for (let i = 0; i < CELLS; i++) above[i] /= hi
  }

  return peaks
}

export default function MemMesh({ height }: { height: number }) {
  const targetUp = new Float64Array(CELLS)
  const targetDown = new Float64Array(CELLS)
  const shownUp = new Float64Array(CELLS)
  const shownDown = new Float64Array(CELLS)

  const px = new Float64Array(CELLS)
  const py = new Float64Array(CELLS)
  const kx = new Float64Array(CELLS)
  const ky = new Float64Array(CELLS)
  const wx = new Float64Array(CELLS)
  const wy = new Float64Array(CELLS)
  /** rotated depth per vertex, for the painter sort */
  const dz = new Float64Array(CELLS)

  const QUAD_N = (COLS - 1) * (ROWS - 1)
  const quads = new Int32Array(QUAD_N)
  const quadDepth = new Float64Array(QUAD_N)
  const order: number[] = Array.from({ length: QUAD_N }, (_, i) => i)

  for (let r = 0, q = 0; r < ROWS - 1; r++) {
    for (let c = 0; c < COLS - 1; c++, q++) quads[q] = r * COLS + c
  }

  let peaks: Peak[] = []
  let yaw = 0.35
  let dragging = false
  let fresh = true

  function draw(cr: Cairo.Context, width: number, h: number) {
    if (!peaks.length) return

    const cx = width / 2
    const halfW = (width / 2 - 6) / DIAGONAL
    const halfD = (h * 0.15) / DIAGONAL
    const waterY = h * 0.44
    const liftUp = h * 0.32
    // Floored rather than purely proportional. The remainder is often a small
    // fraction of the named five, and a keel scaled straight off it collapses
    // to a dozen pixels — which is not an iceberg, it is a raft. The floor
    // keeps the shape; the exact figure is printed along the bottom instead.
    const liftDown = Math.min(h * 0.42, h * (0.22 + 0.26 * Math.min(1, keelScale)))

    const cos = Math.cos(yaw)
    const sin = Math.sin(yaw)

    for (let r = 0; r < ROWS; r++) {
      const dv = r / (ROWS - 1) - 0.5
      for (let c = 0; c < COLS; c++) {
        const du = c / (COLS - 1) - 0.5
        const i = r * COLS + c

        const a = du * cos - dv * sin
        const b = du * sin + dv * cos

        const x = cx + (a - b) * halfW
        const yFloor = waterY - (a + b) * halfD

        dz[i] = a + b
        wx[i] = x
        wy[i] = yFloor
        px[i] = x
        py[i] = yFloor - shownUp[i] * liftUp
        kx[i] = x
        ky[i] = yFloor + shownDown[i] * liftDown
      }
    }

    // ---- keel: open wireframe, no fill. You see through water. ----
    cr.setLineWidth(0.6)
    for (let r = 0; r < ROWS; r += 2) {
      for (let c = 0; c < COLS; c++) {
        const i = r * COLS + c
        if (c) cr.lineTo(kx[i], ky[i])
        else cr.moveTo(kx[i], ky[i])
      }
    }
    for (let c = 0; c < COLS; c += 2) {
      for (let r = 0; r < ROWS; r++) {
        const i = r * COLS + c
        if (r) cr.lineTo(kx[i], ky[i])
        else cr.moveTo(kx[i], ky[i])
      }
    }
    cr.setSourceRGBA(0.28, 0.55, 0.95, 0.3)
    cr.stroke()

    // a speckle down the keel, thinning with depth, so it has body
    for (let i = 0; i < CELLS; i++) {
      if (hash2(i, 29) > 0.3) continue
      const t = shownDown[i]
      if (t < 0.05) continue
      cr.arc(kx[i] + (hash2(i, 31) - 0.5) * 2, ky[i] + (hash2(i, 37) - 0.5) * 2, 0.5, 0, Math.PI * 2)
      cr.setSourceRGBA(0.4, 0.68, 1, 0.1 + t * 0.22)
      cr.fill()
    }

    // ---- waterline ----
    // The rule runs the full width, past the berg on both sides: it is the
    // datum the whole plate is measured against, not part of the object.
    cr.setLineWidth(0.7)
    cr.setSourceRGBA(0.55, 0.9, 1, 0.26)
    cr.moveTo(0, waterY)
    cr.lineTo(width, waterY)
    cr.stroke()

    // a short tick scale on the right edge, as depth gradations
    cr.setLineWidth(0.7)
    cr.setSourceRGBA(0.55, 0.9, 1, 0.16)
    for (let i = 1; i <= 5; i++) {
      const y = waterY + (i / 5) * liftDown
      cr.moveTo(width - (i % 2 ? 4 : 7), y)
      cr.lineTo(width, y)
    }
    cr.stroke()

    cr.setLineWidth(1.4)
    cr.setSourceRGBA(0.55, 0.9, 1, 0.1)
    for (let c = 0; c < COLS; c++) {
      const i = c
      if (c) cr.lineTo(wx[i], wy[i])
      else cr.moveTo(wx[i], wy[i])
    }
    for (let r = 0; r < ROWS; r++) {
      const i = r * COLS + COLS - 1
      cr.lineTo(wx[i], wy[i])
    }
    for (let c = COLS - 1; c >= 0; c--) {
      const i = (ROWS - 1) * COLS + c
      cr.lineTo(wx[i], wy[i])
    }
    for (let r = ROWS - 1; r >= 0; r--) {
      cr.lineTo(wx[r * COLS], wy[r * COLS])
    }
    cr.closePath()
    cr.strokePreserve()
    cr.setLineWidth(0.7)
    cr.setSourceRGBA(0.7, 0.95, 1, 0.6)
    cr.stroke()

    // ---- berg: painter's algorithm over the rotated depth ----
    for (let q = 0; q < QUAD_N; q++) {
      const i = quads[q]
      quadDepth[q] = dz[i] + dz[i + 1] + dz[i + COLS] + dz[i + COLS + 1]
    }
    order.sort((a, b) => quadDepth[b] - quadDepth[a])

    for (const q of order) {
      const i00 = quads[q]
      const i10 = i00 + 1
      const i01 = i00 + COLS
      const i11 = i01 + 1

      const z = (shownUp[i00] + shownUp[i10] + shownUp[i01] + shownUp[i11]) / 4

      cr.moveTo(px[i00], py[i00])
      cr.lineTo(px[i10], py[i10])
      cr.lineTo(px[i11], py[i11])
      cr.lineTo(px[i01], py[i01])
      cr.closePath()

      cr.setSourceRGBA(0.012, 0.02, 0.035, 0.62)
      cr.fillPreserve()

      const t = Math.min(1, z * 1.2)

      // bloom only on the high ground — it is what carries the glow, and it is
      // a second stroke over every quad if you let it run everywhere
      if (t > 0.5) {
        cr.setLineWidth(2.6)
        cr.setSourceRGBA(0.62, 0.74, 1, (t - 0.5) * 0.26)
        cr.strokePreserve()
      }

      cr.setLineWidth(0.7)
      cr.setSourceRGBA(0.2 + 0.75 * t, 0.29 + 0.68 * t, 0.44 + 0.55 * t, 0.14 + 0.74 * t)
      cr.stroke()
    }

    // ---- crust on the ice ----
    for (let i = 0; i < CELLS; i++) {
      const edge =
        i < COLS || i >= CELLS - COLS || i % COLS === 0 || i % COLS === COLS - 1
      if (!edge && hash2(i, 17) > 0.42) continue

      const t = Math.min(1, shownUp[i] * 1.3)
      cr.arc(
        px[i] + (hash2(i, 3) - 0.5) * 2.4,
        py[i] + (hash2(i, 5) - 0.5) * 2.4,
        0.55 + t * 1.0,
        0,
        Math.PI * 2,
      )
      cr.setSourceRGBA(0.34 + 0.62 * t, 0.6 + 0.38 * t, 1, 0.22 + 0.62 * t)
      cr.fill()
    }

    // ---- annotations: all five, the heaviest called out in red ----
    cr.selectFontFace("JetBrainsMono Nerd Font", 0, 0)

    peaks.forEach((p, idx) => {
      const c = Math.round(p.u * (COLS - 1))
      const r = Math.round(p.v * (ROWS - 1))
      const i = r * COLS + c

      const hot = idx === 0
      const tone: [number, number, number] = hot ? [1, 0.2, 0.26] : [0.86, 0.88, 1]

      const right = idx % 2 === 0
      const slotY = 7 + idx * 10
      const name = p.item.name.length > 11 ? p.item.name.slice(0, 10) + "…" : p.item.name
      const text = `${name} ${formatBytes(p.item.rss)}`
      const w = text.length * 6 * 0.6

      const textX = right ? width - 3 - w : 3
      const bendX = right ? textX - 5 : textX + w + 5

      cr.setLineWidth(0.7)
      cr.setSourceRGBA(tone[0], tone[1], tone[2], 0.4)
      cr.moveTo(px[i], py[i])
      cr.lineTo(bendX, slotY)
      cr.lineTo(right ? textX - 2 : textX + w + 2, slotY)
      cr.stroke()

      cr.arc(px[i], py[i], 1.5, 0, Math.PI * 2)
      cr.setSourceRGBA(tone[0], tone[1], tone[2], 0.95)
      cr.fill()

      cr.setFontSize(6)
      cr.setSourceRGBA(0.02, 0.03, 0.05, 0.9)
      cr.moveTo(textX + 0.6, slotY + 2.6)
      cr.showText(text)
      cr.setSourceRGBA(tone[0], tone[1], tone[2], hot ? 1 : 0.78)
      cr.moveTo(textX, slotY + 2)
      cr.showText(text)
    })

    // what the keel is actually worth, stated rather than implied
    const submerged = `+${formatBytes(latestOther)} unnamed`
    cr.setFontSize(6)
    cr.setSourceRGBA(0.02, 0.03, 0.05, 0.9)
    cr.moveTo(4.6, h - 2.4)
    cr.showText(submerged)
    cr.setSourceRGBA(0.4, 0.72, 1, 0.75)
    cr.moveTo(4, h - 3)
    cr.showText(submerged)
  }

  let latestOther = 0

  /** set while a drag is in progress, so the idle spin yields to the pointer */
  let yawStart = 0

  return (
    <Canvas
      heightRequest={height}
      hexpand
      draw={draw}
      fps={DRAW_HZ}
      // Subscribing only while on screen is what stops a hidden panel from
      // walking all of /proc every three seconds -- `processRoll` is a lazy
      // poll, so no subscriber means no timer at all.
      watch={[processRoll]}
      onChange={() => {
        const roll = processRoll.peek()
        latestOther = roll.other
        peaks = build(roll, targetUp, targetDown)

        // First reading: snap the surface flat rather than morphing up from
        // whatever the arrays happened to hold.
        if (fresh) {
          fresh = false
          shownUp.fill(0)
          shownDown.fill(0)
        }
      }}
      animate={(dt) => {
        if (!dragging) yaw += SPIN * dt

        // Ease every cell toward its target, tracking the worst gap so we know
        // whether the surface has stopped moving.
        const step = 1 - Math.exp(-dt / EASE_TAU)
        let worst = 0
        for (let i = 0; i < CELLS; i++) {
          const du = targetUp[i] - shownUp[i]
          const dd = targetDown[i] - shownDown[i]
          shownUp[i] += du * step
          shownDown[i] += dd * step
          const mag = Math.max(du < 0 ? -du : du, dd < 0 ? -dd : dd)
          if (mag > worst) worst = mag
        }

        // Snap the last hundredth of a pixel away once the morph is done, so
        // the arrays hold exact targets rather than converging forever.
        if (worst < SETTLED) {
          shownUp.set(targetUp)
          shownDown.set(targetDown)
        }

        // Always repaint: SPIN is non-zero, so this surface never actually
        // comes to rest. Set SPIN to 0 and this could return `worst >= SETTLED`
        // to make it a still picture between polls.
        return true
      }}
      setup={(area) => {
        // Drag to spin. The idle rotation resumes from wherever it is let go,
        // which is why this writes `yaw` directly rather than an offset.
        const spin = new Gtk.GestureDrag({ button: 1 })

        spin.connect("drag-begin", () => {
          dragging = true
          yawStart = yaw
        })
        spin.connect("drag-update", (_g, offsetX: number) => {
          yaw = yawStart + offsetX * 0.01
          area.queue_draw()
        })
        spin.connect("drag-end", () => {
          dragging = false
        })

        area.add_controller(spin)
      }}
    />
  )
}
