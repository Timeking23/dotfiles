import { Gtk } from "ags/gtk4"
import type Cairo from "cairo"

import Canvas from "./canvas"

import { fsGraph, formatSize, type FsGraph, type FsNode } from "../state/filetree"

/**
 * Obsidian-style force-directed graph of the filesystem, simulated and drawn
 * in three dimensions.
 *
 * The layout is a velocity-Verlet simulation with three forces, the same
 * arrangement d3-force uses, lifted to x/y/z: n-body repulsion so nodes spread,
 * springs on the containment edges so children stay near their directory, and a
 * weak pull to the centre so nothing drifts off.
 *
 * Drawing is a plain perspective projection onto the existing Cairo pass — no
 * GL context, no shaders. Depth is carried by four cues at once: perspective
 * scale, the painter's algorithm, aerial haze over distance, and a slow orbit.
 * Any one of them alone reads as a flat graph that happens to wobble; together
 * they read as depth.
 *
 * Positions live in flat Float64Arrays rather than on the node objects. The
 * repulsion pass is O(n^2) and re-runs on every re-walk that changes the tree,
 * which made it the widget's single largest cost by a wide margin; the same
 * loop over typed arrays is several times faster than over object properties.
 */

const ALPHA_MIN = 0.008
const ALPHA_DECAY = 0.022
const VELOCITY_DECAY = 0.45

/** per-node repulsion, scaled by radius so big directories clear more room */
const CHARGE = -110
const LINK_STRENGTH = 0.6
const LINK_SLACK = 22
const GRAVITY = 0.012

/**
 * Floor on the squared distance used for repulsion. Inverse-square with no
 * floor is unstable: two nodes that happen to seed 0.1 apart produce a kick of
 * several hundred units in one tick and one of them is gone for good, taking
 * the auto-fit with it. d3-force calls this distanceMin2.
 */
const MIN_DIST2 = 25
/** and a hard ceiling on per-tick displacement, so nothing can ever run away */
const MAX_SPEED = 24

/** camera distance, in graph units — smaller is a wider, more dramatic lens */
const FOCAL = 620
/**
 * Radians per second of idle orbit. Set this to 0 for a fixed camera, which is
 * the widget's only genuinely free mode: with nothing animating, the tick
 * callback unsubscribes once the layout settles and the graph costs nothing at
 * all until the tree changes. Dragging still orbits it by hand.
 */
const ORBIT = 0.13
/**
 * Redraw ceiling while orbiting. Much of the per-frame cost is not this
 * widget's drawing — the plate behind it is a textured, transparent
 * background, so every frame repaints the chassis underneath and re-uploads a
 * 2x-scaled surface. The orbit advances by real elapsed time, so capping the
 * rate slows the drawing, not the rotation.
 */
const DRAW_HZ = 15
/** how much the far side of the graph fades into the plate */
const HAZE = 0.62

/** JetBrains Mono is monospaced at 0.6em advance — exact enough to centre text */
const ADVANCE = 0.6

/** how many directories carry a standing label; the rest appear on hover */
const LABEL_BUDGET = 10
/** past this zoom, anything big enough to read gets named */
const LABEL_ALL_ZOOM = 2.2

/** share of the plate the node discs are allowed to cover */
const FILL = 0.085

/** logs raw scroll deltas to the ags output; leave off in normal use */
const SCROLL_DEBUG = false

const ZOOM_MIN = 0.4
const ZOOM_MAX = 40
/**
 * Zoom per unit of scroll delta. A mouse wheel reports whole notches while a
 * touchpad reports fractions of one, so this is applied as a power of the
 * delta — the same gesture then covers the same range on either device.
 */
const ZOOM_STEP = 1.35
/**
 * One press of the +/- plate. Coarser than a wheel notch on purpose: a button
 * is pressed a handful of times, not rolled.
 */
const ZOOM_BUTTON_STEP = 1.5

type Particle = {
  node: FsNode
  /** size rank within this graph, 0..1 */
  rn: number
  /** layout radius, in graph units — spacing only, never drawn */
  r: number
  /** extra spring length this node's children need to share its shell */
  fan: number
  // ---- filled in by project(), reused by draw and hit testing ----
  sx: number
  sy: number
  /** perspective factor: >1 in front of the centre, <1 behind it */
  k: number
  /** view-space depth, for sorting and haze */
  depth: number
}

/** Flat physics state, parallel to the particle array. */
type Body = {
  x: Float64Array
  y: Float64Array
  z: Float64Array
  vx: Float64Array
  vy: Float64Array
  vz: Float64Array
  /** layout radius, mirrored out of Particle so the hot loop stays flat */
  r: Float64Array
  fan: Float64Array
}

function emptyBody(n: number): Body {
  return {
    x: new Float64Array(n),
    y: new Float64Array(n),
    z: new Float64Array(n),
    vx: new Float64Array(n),
    vy: new Float64Array(n),
    vz: new Float64Array(n),
    r: new Float64Array(n),
    fan: new Float64Array(n),
  }
}

/**
 * Rank within the graph's own size range rather than an absolute byte curve.
 * The walk keeps only the heaviest few hundred paths, so an absolute log scale
 * saturates — nearly every survivor pins to the top of it and the whole graph
 * comes out one uniform size. Normalising against what actually survived puts
 * the full radius range back to work.
 */
function normalise(nodes: FsNode[]): number[] {
  const logs = nodes.map((n) => Math.log2(1 + n.size))
  let lo = Infinity
  let hi = -Infinity
  for (const v of logs) {
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  const span = hi - lo
  return logs.map((v) => (span > 0 ? (v - lo) / span : 0.5))
}

/**
 * Seeds a new graph, reusing the coordinates of any path that survived the
 * previous walk. Without that carry-over every re-scan would scatter the layout
 * and re-converge somewhere unrecognisable. Reports how many nodes were new, so
 * the caller can decide how hard to re-heat.
 */
function seed(
  graph: FsGraph,
  previous: Map<string, [number, number, number]>,
): { particles: Particle[]; body: Body; fresh: number } {
  const ranks = normalise(graph.nodes)
  const n = graph.nodes.length
  const particles: Particle[] = []
  const body = emptyBody(n)
  let fresh = 0

  // A directory with 90 children cannot fit them on one shell of the default
  // spring length — they arrive stacked and never untangle. Widening the spring
  // by sqrt(children) gives the fan the volume it actually needs.
  const degree = new Int32Array(n)
  for (const [a, b] of graph.links) {
    degree[a]++
    degree[b]++
  }

  graph.nodes.forEach((node, i) => {
    const kept = previous.get(node.path)

    if (kept) {
      body.x[i] = kept[0]
      body.y[i] = kept[1]
      body.z[i] = kept[2]
    } else {
      fresh++
      const parent = node.parent
      if (parent >= 0 && parent < i) {
        // Fibonacci sphere around the parent — the 3D analogue of a golden-angle
        // spiral, and the cheapest way to start children spread evenly over a
        // shell instead of stacked along one axis
        const t = ((i % 97) + 0.5) / 97
        const phi = Math.acos(1 - 2 * t)
        const theta = i * 2.399963
        const spread = 18 + node.depth * 8

        body.x[i] = body.x[parent] + Math.sin(phi) * Math.cos(theta) * spread
        body.y[i] = body.y[parent] + Math.sin(phi) * Math.sin(theta) * spread
        body.z[i] = body.z[parent] + Math.cos(phi) * spread
      }
    }

    const r = 3 + ranks[i] * 7 + (node.dir ? 1.5 : 0)
    body.r[i] = r
    body.fan[i] = Math.sqrt(degree[i]) * 2.4

    particles.push({
      node,
      rn: ranks[i],
      r,
      fan: body.fan[i],
      sx: 0,
      sy: 0,
      k: 1,
      depth: 0,
    })
  })

  return { particles, body, fresh }
}

export default function FileGraph({ height }: { height: number }) {
  let particles: Particle[] = []
  let body: Body = emptyBody(0)
  /** link endpoints, flattened to [s0, t0, s1, t1, ...] for the same reason */
  let edges = new Int32Array(0)
  let neighbours: Set<number>[] = []
  /** indices carrying a standing label — chosen once per walk, not per frame */
  let labelled: number[] = []
  /** draw order, back to front; kept between frames to avoid reallocating */
  let order: number[] = []
  let alpha = 0

  let baseRadius = 4
  /**
   * Radius used for the fit. The fit is built on this rather than on the
   * projected extent, so the graph does not breathe once per revolution.
   */
  let bound = 1

  let hovered = -1
  let zoom = 1
  let yaw = 0.6
  let pitch = -0.35
  let panX = 0
  let panY = 0
  let dragging = false

  // last frame's geometry, so scroll and hover can work in the same space
  let lastScale = 1
  let lastWidth = 1
  let lastHeight = 1

  const screenRadius = (p: Particle) =>
    baseRadius * (0.5 + p.rn * 0.95) * Math.min(Math.max(zoom, 0.7), 3.5) * p.k

  // ------------------------------------------------------------------
  // view controls
  // ------------------------------------------------------------------
  // The buttons are built before the drawing area's `$` callback runs, so they
  // cannot close over `self`. They go through this instead, which the callback
  // fills in on realise and which is a harmless no-op until then.
  let requestFrame: () => void = () => {}

  /**
   * Scale about a point on the plate, keeping whatever sits there pinned in
   * place. The scroll wheel anchors on the pointer; the buttons anchor on the
   * centre, which is the only fixed point a keyboard-less press can mean.
   */
  function zoomAbout(factor: number, ax: number, ay: number) {
    const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom * factor))
    if (next === zoom) return

    const ratio = next / zoom
    panX = ax - lastWidth / 2 - (ax - lastWidth / 2 - panX) * ratio
    panY = ay - lastHeight / 2 - (ay - lastHeight / 2 - panY) * ratio
    zoom = next

    // never let the graph be pushed entirely off its own plate
    panX = Math.min(lastWidth, Math.max(-lastWidth, panX))
    panY = Math.min(lastHeight, Math.max(-lastHeight, panY))

    requestFrame()
  }

  /** back to the fitted view — the way out of being lost at 40x */
  function resetView() {
    zoom = 1
    panX = 0
    panY = 0
    requestFrame()
  }

  // ------------------------------------------------------------------
  // simulation
  // ------------------------------------------------------------------

  function step() {
    alpha += (0 - alpha) * ALPHA_DECAY
    const n = particles.length
    const { x, y, z, vx, vy, vz, r, fan } = body

    // n-body repulsion, plus hard separation in the same pass since the
    // pairwise distance is already in hand
    for (let i = 0; i < n; i++) {
      const xi = x[i]
      const yi = y[i]
      const zi = z[i]
      const ri = r[i]

      for (let j = i + 1; j < n; j++) {
        let dx = x[j] - xi
        let dy = y[j] - yi
        let dz = z[j] - zi
        let d2 = dx * dx + dy * dy + dz * dz

        // exactly coincident nodes have no direction to separate along
        if (d2 < 1e-6) {
          dx = ((i % 7) - 3) * 0.5 + 0.25
          dy = ((j % 7) - 3) * 0.5 + 0.25
          dz = ((i + j) % 5) - 2 + 0.25
          d2 = dx * dx + dy * dy + dz * dz
        }

        const w = (CHARGE * alpha * ((ri + r[j]) / 8)) / (d2 < MIN_DIST2 ? MIN_DIST2 : d2)
        vx[i] += dx * w
        vy[i] += dy * w
        vz[i] += dz * w
        vx[j] -= dx * w
        vy[j] -= dy * w
        vz[j] -= dz * w

        const min = ri + r[j] + 2
        if (d2 < min * min) {
          const d = Math.sqrt(d2)
          const push = ((min - d) / d) * 0.5
          x[i] -= dx * push
          y[i] -= dy * push
          z[i] -= dz * push
          x[j] += dx * push
          y[j] += dy * push
          z[j] += dz * push
        }
      }
    }

    // containment springs
    for (let e = 0; e < edges.length; e += 2) {
      const a = edges[e]
      const b = edges[e + 1]

      const dx = x[b] - x[a]
      const dy = y[b] - y[a]
      const dz = z[b] - z[a]
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.01
      const rest = LINK_SLACK + r[a] + r[b] + Math.max(fan[a], fan[b])
      const f = ((d - rest) / d) * alpha * LINK_STRENGTH

      vx[a] += dx * f
      vy[a] += dy * f
      vz[a] += dz * f
      vx[b] -= dx * f
      vy[b] -= dy * f
      vz[b] -= dz * f
    }

    // gravity toward the centre, then integrate
    const decay = 1 - VELOCITY_DECAY
    for (let i = 0; i < n; i++) {
      let ax = (vx[i] - x[i] * GRAVITY * alpha) * decay
      let ay = (vy[i] - y[i] * GRAVITY * alpha) * decay
      let az = (vz[i] - z[i] * GRAVITY * alpha) * decay

      const speed = Math.sqrt(ax * ax + ay * ay + az * az)
      if (speed > MAX_SPEED) {
        const trim = MAX_SPEED / speed
        ax *= trim
        ay *= trim
        az *= trim
      }

      vx[i] = ax
      vy[i] = ay
      vz[i] = az
      x[i] += ax
      y[i] += ay
      z[i] += az
    }
  }

  // ------------------------------------------------------------------
  // projection
  // ------------------------------------------------------------------

  /** Yaw about the vertical axis, then pitch, then a perspective divide. */
  function project(width: number, h: number) {
    const n = particles.length
    const { x, y, z } = body

    let cx = 0
    let cy = 0
    let cz = 0
    for (let i = 0; i < n; i++) {
      cx += x[i]
      cy += y[i]
      cz += z[i]
    }
    cx /= n
    cy /= n
    cz /= n

    // Fit to the 92nd percentile radius rather than the true bounding sphere:
    // one stray leaf on a long chain would otherwise set the scale for the
    // whole graph and leave the interesting half of it tiny. The few nodes
    // outside are what the padding is for.
    const radii = new Float64Array(n)
    for (let i = 0; i < n; i++) {
      radii[i] = Math.hypot(x[i] - cx, y[i] - cy, z[i] - cz)
    }
    radii.sort()
    bound = Math.max(radii[Math.floor(n * 0.92)] || 1, 1)

    // keep the camera outside the graph however far it sprawls
    const focal = Math.max(FOCAL, bound * 1.6)

    baseRadius = Math.min(Math.max(Math.sqrt((width * h * FILL) / (n * Math.PI)), 1.5), 9)

    // The fit uses the fit sphere's silhouette, which is invariant under
    // rotation — fitting the projected extent instead would make the whole
    // graph pulse as it turns. Note this is focal*tan(asin(bound/focal)) and
    // NOT the near-pole magnification focal/(focal-bound): the nearest point of
    // a sphere projects to the centre of the image, not to its edge, so that
    // figure overstates the silhouette by more than a factor of two.
    const pad = baseRadius * 2 + 10
    const silhouette =
      (bound * focal) / Math.sqrt(Math.max(focal * focal - bound * bound, 1))
    const scale =
      (Math.min(width - pad * 2, h - pad * 2) / 2 / (silhouette * 1.04)) * zoom

    lastScale = scale
    lastWidth = width
    lastHeight = h

    const cyw = Math.cos(yaw)
    const syw = Math.sin(yaw)
    const cpt = Math.cos(pitch)
    const spt = Math.sin(pitch)

    for (let i = 0; i < n; i++) {
      const x0 = x[i] - cx
      const y0 = y[i] - cy
      const z0 = z[i] - cz

      const x1 = x0 * cyw + z0 * syw
      const z1 = z0 * cyw - x0 * syw
      const y1 = y0 * cpt - z1 * spt
      const z2 = y0 * spt + z1 * cpt

      const k = focal / (focal + z2)
      const p = particles[i]
      p.k = k
      p.depth = z2
      p.sx = width / 2 + panX + x1 * k * scale
      p.sy = h / 2 + panY + y1 * k * scale
    }

    // painter's algorithm: farthest first
    if (order.length !== n) order = particles.map((_, i) => i)
    order.sort((a, b) => particles[b].depth - particles[a].depth)
  }

  // ------------------------------------------------------------------
  // drawing
  // ------------------------------------------------------------------

  function draw(cr: Cairo.Context, width: number, h: number) {
    if (!particles.length) return

    project(width, h)

    /** 1 at the front of the graph, 0 at the back */
    const nearness = (p: Particle) =>
      Math.min(1, Math.max(0, 0.5 - p.depth / (2 * bound)))

    const lit = (i: number) =>
      hovered < 0 || i === hovered || neighbours[hovered]?.has(i)

    // ---- edges ----
    cr.setLineWidth(1)
    for (let e = 0; e < edges.length; e += 2) {
      const a = particles[edges[e]]
      const b = particles[edges[e + 1]]

      const on = hovered < 0 || edges[e] === hovered || edges[e + 1] === hovered
      const haze = 1 - HAZE * (1 - (nearness(a) + nearness(b)) / 2)

      cr.setSourceRGBA(0.7, 0.64, 0.9, (on ? 0.34 : 0.09) * haze)
      cr.moveTo(a.sx, a.sy)
      cr.lineTo(b.sx, b.sy)
      cr.stroke()
    }

    // ---- nodes, back to front ----
    for (const i of order) {
      const p = particles[i]
      const r = screenRadius(p)

      // off-plate nodes are common once zoomed in; skipping them is what keeps
      // a 20x zoom as cheap to draw as a 1x one
      if (p.sx < -r || p.sy < -r || p.sx > width + r || p.sy > h + r) continue

      // depth fade keeps the trunk legible through the canopy
      const fade = Math.max(0.4, 1 - p.node.depth * 0.13)
      const haze = 1 - HAZE * (1 - nearness(p))
      const dim = (lit(i) ? 1 : 0.24) * fade * haze

      if (p.node.dir) {
        // a thin halo, so directories read as sources rather than bigger dots
        cr.arc(p.sx, p.sy, r + 2.5, 0, Math.PI * 2)
        cr.setSourceRGBA(0.62, 0.55, 0.86, 0.11 * dim)
        cr.fill()
      }

      cr.arc(p.sx, p.sy, r, 0, Math.PI * 2)
      if (p.node.dir) {
        cr.setSourceRGBA(0.72, 0.66, 0.92, 0.95 * dim)
      } else {
        cr.setSourceRGBA(0.47, 0.4, 0.7, 0.9 * dim)
      }
      cr.fill()

      // a specular bead on the near shoulder turns a flat disc into a sphere.
      // Only worth its cost on discs big enough to show one — below about 5px
      // it is a single grey pixel, and there are two hundred of them.
      if (r > 4.5) {
        cr.arc(p.sx - r * 0.3, p.sy - r * 0.32, r * 0.34, 0, Math.PI * 2)
        cr.setSourceRGBA(0.96, 0.94, 1, 0.38 * dim)
        cr.fill()
      }
    }

    // ---- labels ----
    cr.selectFontFace("JetBrainsMono Nerd Font", 0, 0)

    // greedy overlap rejection: names are offered biggest-first, so one only
    // lands if nothing more important has taken the space
    const taken: [number, number, number, number][] = []

    const label = (i: number, text: string, size: number, alphaText: number) => {
      const p = particles[i]
      if (alphaText < 0.04) return

      const w = text.length * size * ADVANCE
      const x = p.sx - w / 2
      const y = p.sy + screenRadius(p) + size + 2
      if (x > lastWidth || x + w < 0 || y < 0 || y - size > lastHeight) return

      const box: [number, number, number, number] = [x, y - size, x + w, y + 2]
      for (const [l, t, r2, b2] of taken) {
        if (box[0] < r2 && box[2] > l && box[1] < b2 && box[3] > t) return
      }
      taken.push(box)

      cr.setFontSize(size)
      cr.setSourceRGBA(0.03, 0.05, 0.06, 0.85 * alphaText)
      cr.moveTo(x + 1, y + 1)
      cr.showText(text)
      cr.setSourceRGBA(0.87, 0.83, 0.99, alphaText)
      cr.moveTo(x, y)
      cr.showText(text)
    }

    // the trunk is always named; zooming in reveals the rest, which is the only
    // way 200+ names ever fit in 360px
    const wanted =
      zoom >= LABEL_ALL_ZOOM
        ? order
            .filter((i) => screenRadius(particles[i]) > 3.5)
            .sort((a, b) => particles[b].node.size - particles[a].node.size)
        : labelled

    for (const i of wanted) {
      if (i === hovered) continue
      const p = particles[i]
      // a name on the far side is noise laid over the near side
      label(i, p.node.name, 8, (lit(i) ? 0.82 : 0.18) * (0.35 + nearness(p) * 0.65))
    }

    if (hovered >= 0 && particles[hovered]) {
      const p = particles[hovered]
      taken.length = 0 // the pointer always wins the space it needs
      label(hovered, `${p.node.name}  ${formatSize(p.node.size)}`, 9, 1)
    }
  }

  /**
   * Swap in a freshly walked tree.
   *
   * Positions of nodes that survived the walk are carried over, so a re-walk
   * that turned up four new files nudges the picture instead of reshuffling it.
   */
  function load(graph: FsGraph) {
    const previous = new Map<string, [number, number, number]>()
    particles.forEach((p, i) => {
      previous.set(p.node.path, [body.x[i], body.y[i], body.z[i]])
    })

    const seeded = seed(graph, previous)
    particles = seeded.particles
    body = seeded.body
    order = []

    // Flat typed array of index pairs rather than an array of objects: this is
    // walked once per physics step, and the allocation churn showed up.
    edges = new Int32Array(graph.links.length * 2)
    neighbours = graph.nodes.map(() => new Set<number>())
    graph.links.forEach(([a, b], i) => {
      edges[i * 2] = a
      edges[i * 2 + 1] = b
      neighbours[a]?.add(b)
      neighbours[b]?.add(a)
    })

    // the trunk gets standing labels, biggest first
    labelled = graph.nodes
      .map((node, i) => ({ node, i }))
      .filter(({ node }) => node.dir && node.depth <= 1)
      .sort((a, b) => b.node.size - a.node.size)
      .slice(0, LABEL_BUDGET)
      .map(({ i }) => i)

    if (hovered >= particles.length) hovered = -1

    // Re-heat in proportion to how much actually moved. A first layout needs to
    // be fully hot, but a re-walk that turned up four new files in Downloads
    // needs a nudge -- running a full anneal every time the tree twitches was
    // this widget's largest cost, and it also threw the picture around for no
    // reason.
    const churn = particles.length ? seeded.fresh / particles.length : 1
    const heat = previous.size ? Math.min(0.35, 0.04 + churn * 1.2) : 1
    alpha = Math.max(alpha, heat)
  }

  return (
    <overlay hexpand>
      <Canvas
        heightRequest={height}
        hexpand
        draw={draw}
        fps={DRAW_HZ}
        watch={[fsGraph]}
        onChange={() => load(fsGraph.peek())}
        animate={(dt) => {
          // The force pass stops once the layout is cold; the orbit does not.
          // A settled graph therefore costs a projection and a draw rather than
          // the O(n^2) force integration, which is the expensive half.
          if (alpha >= ALPHA_MIN) step()
          if (!dragging) yaw += ORBIT * dt
          return true
        }}
        setup={(area) => {
          // The view controls below are plain buttons outside this callback, so
          // they need a way to ask for a repaint once `area` exists.
          requestFrame = () => area.queue_draw()

          // ---- pointer ----
          // Anchor for zoom-to-pointer. Until a motion event has actually landed
          // these must read as the plate's centre, not 0,0 -- anchoring a zoom on
          // the top-left corner throws the graph off the plate instead of
          // magnifying it, which is indistinguishable from "zoom is broken".
          let pointerX = 0
          let pointerY = 0
          let pointerSeen = false

          const motion = new Gtk.EventControllerMotion()

          // hit testing uses the projected positions from the last frame, which is
          // both the cheapest and the only correct answer under perspective
          motion.connect("motion", (_c, px: number, py: number) => {
            pointerX = px
            pointerY = py
            pointerSeen = true

            let best = -1
            let bestScore = Infinity

            particles.forEach((p, i) => {
              const dx = p.sx - px
              const dy = p.sy - py
              const d = dx * dx + dy * dy
              const reach = (screenRadius(p) + 4) ** 2
              // ties go to whichever node is nearer the camera
              const score = d + p.depth * 0.01
              if (d < reach && score < bestScore) {
                best = i
                bestScore = score
              }
            })

            if (best !== hovered) {
              hovered = best
              area.queue_draw()
            }
          })
          motion.connect("leave", () => {
            if (hovered !== -1) {
              hovered = -1
              area.queue_draw()
            }
          })
          area.add_controller(motion)

          // Vertical scroll zooms, about the pointer rather than the centre -- at
          // 20x, centre-anchored zoom can only ever reach whatever happens to sit
          // in the middle of the plate. Horizontal scroll spins the camera, with
          // the yaw sign inverted from the raw delta so the near face follows the
          // gesture instead of running away from it.
          const scroll = new Gtk.EventControllerScroll({
            flags: Gtk.EventControllerScrollFlags.BOTH_AXES,
          })
          scroll.connect("scroll", (_c, dx: number, dy: number) => {
            if (SCROLL_DEBUG) {
              console.log(
                `[fsgraph] scroll dx=${dx.toFixed(3)} dy=${dy.toFixed(3)} ` +
                  `zoom=${zoom.toFixed(2)} pointer=${pointerSeen ? "yes" : "no"}`,
              )
            }

            if (dx) yaw -= dx * 0.06

            if (dy) {
              // With no pointer yet, anchoring falls back to the centre, which
              // degrades to a plain centred zoom rather than hurling the graph
              // into a corner.
              zoomAbout(
                Math.pow(ZOOM_STEP, -dy),
                pointerSeen ? pointerX : lastWidth / 2,
                pointerSeen ? pointerY : lastHeight / 2,
              )
            }

            area.queue_draw()
            return true
          })

          // double-click restores the default view, for getting un-lost
          const reset = new Gtk.GestureClick()
          reset.connect("pressed", (_g, presses: number) => {
            if (presses < 2) return
            resetView()
          })
          area.add_controller(reset)
          area.add_controller(scroll)

          // left-drag orbits the camera; the idle spin pauses while the pointer is
          // down and resumes from wherever it was left
          const orbit = new Gtk.GestureDrag({ button: 1 })
          let yawStart = 0
          let pitchStart = 0

          orbit.connect("drag-begin", () => {
            dragging = true
            yawStart = yaw
            pitchStart = pitch
          })
          orbit.connect("drag-update", (_g, ox: number, oy: number) => {
            yaw = yawStart + ox * 0.008
            pitch = Math.min(1.3, Math.max(-1.3, pitchStart + oy * 0.008))
            area.queue_draw()
          })
          orbit.connect("drag-end", () => {
            dragging = false
          })
          area.add_controller(orbit)

          // Right- or middle-drag pans, for getting around once zoomed in. Two
          // gestures rather than one on button 0: button 0 would swallow the
          // left button too, and left-drag already orbits.
          let panStartX = 0
          let panStartY = 0

          for (const button of [3, 2]) {
            const pan = new Gtk.GestureDrag({ button })

            pan.connect("drag-begin", () => {
              panStartX = panX
              panStartY = panY
            })
            pan.connect("drag-update", (_g, ox: number, oy: number) => {
              panX = panStartX + ox
              panY = panStartY + oy
              area.queue_draw()
            })

            area.add_controller(pan)
          }
        }}
      />

      {/*
        Scroll and double-click already do all of this, but neither is
        discoverable and neither exists on a trackpad-less machine. The plate
        sits top-right, out of the way of the trunk labels, which the layout
        keeps near the centre.
      */}
      <box
        $type="overlay"
        cssName="graphControls"
        halign={Gtk.Align.END}
        valign={Gtk.Align.START}
        spacing={3}
      >
        <button
          class="zoomKey"
          tooltipText="Zoom out"
          onClicked={() => zoomAbout(1 / ZOOM_BUTTON_STEP, lastWidth / 2, lastHeight / 2)}
        >
          <label label="−" />
        </button>
        <button class="zoomKey" tooltipText="Reset view" onClicked={resetView}>
          <label label="1:1" />
        </button>
        <button
          class="zoomKey"
          tooltipText="Zoom in"
          onClicked={() => zoomAbout(ZOOM_BUTTON_STEP, lastWidth / 2, lastHeight / 2)}
        >
          <label label="+" />
        </button>
      </box>
    </overlay>
  )
}
