import { Gtk } from "ags/gtk4"
import type Cairo from "cairo"

import CairoGi from "gi://cairo?version=1.0"

import Canvas from "./canvas"
import { drawSkyBehind, drawSkyFront, type Sky } from "./weatherfx"
import { paletteIndex } from "./Palette"
import { city, CAMERA_ZOOM, visibleRadius, type Building, type Road } from "../state/city"
import { weather, weatherMood, type Mood } from "../state/weather"

/**
 * ============================================================================
 * Your city, as a wireframe hologram
 * ============================================================================
 *
 * Real OpenStreetMap building footprints, extruded to their real heights and
 * drawn as glowing wireframe on black -- the LiDAR-city look. See state/city.ts
 * for where the geometry comes from and why it is not Google or Apple.
 *
 * HOW IT IS DRAWN
 *
 *   projection   Isometric, rotated about the vertical axis by `yaw`. There is
 *                no perspective divide: a true iso plate keeps far buildings
 *                the same scale as near ones, which is what makes a model read
 *                as a MODEL rather than as a photograph of a city.
 *
 *   occlusion    Painter's algorithm -- buildings sorted back to front by
 *                rotated depth. No z-buffer, no per-face sorting: at this
 *                density the eye cannot catch the errors, and sorting 420
 *                centroids once a frame is nothing.
 *
 *   glow         Every edge drawn twice, wide-and-faint then narrow-and-bright,
 *                under ADDITIVE blending so crossings sum. That summing is what
 *                makes a dense downtown go white-hot at its core while the
 *                outskirts stay as individual lines -- and it is entirely a
 *                property of the data, not something drawn in.
 *
 * The whole thing costs one pass over the buildings. There is no lighting model
 * because a hologram does not have one.
 *
 * WEATHER sits either side of that pass -- cloud and sky objects behind the
 * skyline, falling rain and lightning in front of it -- so the city is inside
 * the weather rather than under a sticker of it. See ./weatherfx.
 */

const DRAW_HZ = 20

/** radians per second of idle rotation; a drag takes over while the pointer is down */
const SPIN = 0.075

/** the plate is √2 wider corner-to-corner than edge-to-edge; size for the worst case */
const DIAGONAL = Math.SQRT2

/**
 * How much taller than life buildings are drawn.
 *
 * Heights MUST be derived from the same metres-per-pixel as the footprints,
 * or the model is not a model. The first version normalised height against the
 * tallest building and width against the radius, which are unrelated scales --
 * over a 5km box that rendered a town of 10m houses as a forest of 70px spikes
 * one pixel wide.
 *
 * A little exaggeration is still wanted: at true scale a two-storey town is
 * almost flat from this angle. Around 4x is the usual cartographic fudge, and
 * it keeps a tower reading as a tower next to a house.
 */
const VERTICAL_EXAGGERATION = 5.5

/**
 * How far in the camera sits, as a multiplier on the fitted scale.
 *
 * 1 fits the whole modelled square inside the plate at any rotation. Above that
 * the corners crop, which is fine and is what zooming means -- the widget's own
 * allocation clips them, so nothing bleeds into the caption.
 */
/**
 * How close the camera sits, as a multiplier on the fitted scale.
 *
 *   1     the whole modelled square, fitted
 *   2     neighbourhood
 *   4     street view -- individual buildings and the road between them
 */
const ZOOM = CAMERA_ZOOM

/**
 * How far the camera can see is derived per model, by visibleRadius(radius) --
 * see state/city.ts. It used to be a flat 340m, which is right for a 900m
 * model and wrong for every other one: the scale is fitted to the radius, so a
 * wider model draws smaller, and culling it at the same absolute distance left
 * a little island of buildings in the middle of an empty grid.
 *
 * This is a real cull, not a nicety: at street zoom most of the model is off
 * the plate anyway, and projecting and stroking a building you cannot see
 * costs exactly as much as one you can.
 */

/**
 * Fraction of the render distance over which things fade out.
 *
 * Without it buildings snap into existence at the cull radius, which is the
 * one artefact that makes a render distance obvious. 0.3 means the furthest
 * third of the view is fading.
 */
const FADE_BAND = 0.3

/** the camera's tilt: lower is more street-level, 1 is straight down */
const SQUASH = 0.3

/**
 * Brightness buckets for the edge pass.
 *
 * Buildings are coloured by height, and stroking each separately is what made
 * this widget expensive. Six steps is past the point the eye can tell a band
 * edge from a gradient, and turns ~1,700 strokes a frame into twelve.
 */
const LIT_BUCKETS = 6

export default function CityMesh({ height }: { height: number }) {
  let buildings: Building[] = []
  let roads: Road[] = []
  let radius = 1000
  let tallest = 100
  let place = ""
  let ready = false

  let yaw = 0.6
  let yawStart = 0
  let dragging = false

  // ---- live weather, copied in by Canvas's onChange -----------------------
  let mood: Mood = "clouds"
  let windSpeed = 0
  let windFrom = 0
  /** seconds since mapped; every motion in weatherfx is a function of it */
  let t = 0

  /** rises 0 -> 1 once the model lands, so the city grows into place */
  let grow = 0

  let R = 0.45
  let G = 0.8
  let B = 1

  /** scratch, reused every frame so a 20fps redraw allocates nothing */
  const sortable: Array<{ b: Building; depth: number; fade: number }> = []

  function draw(cr: Cairo.Context, width: number, h: number, area: Gtk.DrawingArea) {
    const ink = area.get_color()
    R = ink.red
    G = ink.green
    B = ink.blue

    // ground: near-black, tinted a hair toward the accent
    cr.setSourceRGBA(R * 0.04, G * 0.04, B * 0.05, 1)
    cr.rectangle(0, 0, width, h)
    cr.fill()

    const cx = width / 2
    const baseY = h * 0.64
    // metres -> pixels, sized so the modelled square fits the plate at any yaw,
    // then pushed in by ZOOM
    const scale = ((width / 2 - 10) / DIAGONAL / radius) * ZOOM
    // isometric squash: the plate is seen from above at a shallow angle
    const squash = SQUASH
    //  Same metres-per-pixel as the ground, times the exaggeration above.
    const lift = scale * VERTICAL_EXAGGERATION

    //  Declared up here because the STREETS are culled by it too, several
    //  passes before the buildings are. As a `const` further down it is in the
    //  temporal dead zone when the road loop reads it, which throws out of
    //  draw() every frame -- leaving a plate with the grid and the sky on it
    //  and absolutely nothing else, no error visible anywhere near the widget.
    const renderDistance = visibleRadius(radius)

    const cos = Math.cos(yaw)
    const sin = Math.sin(yaw)

    if (!ready) {
      cr.selectFontFace("JetBrainsMono Nerd Font", 0, 0)
      cr.setFontSize(7)
      cr.setSourceRGBA(R, G, B, 0.45)
      const msg = "RESOLVING CITY MODEL…"
      const w = cr.textExtents(msg).width
      cr.moveTo(cx - w / 2, h / 2)
      cr.showText(msg)
      return
    }

    const sky: Sky = { mood, windSpeed, windFrom, t, r: R, g: G, b: B }

    //  Everything from here to the matching restore() is ADDITIVE: overlapping
    //  strokes SUM rather than cover. It is what makes a dense downtown go
    //  white-hot at its core and a downpour brighten where it crosses itself.
    cr.save()
    cr.setOperator(CairoGi.Operator.ADD)

    // ---- sky behind the skyline ----
    drawSkyBehind(cr, width, h, sky)

    // ---- ground grid, under everything ----
    cr.setLineWidth(0.5)
    cr.setSourceRGBA(R, G, B, 0.1)
    const STEPS = 12
    for (let i = 0; i <= STEPS; i++) {
      const f = (i / STEPS - 0.5) * 2 * radius
      // two families of parallel lines, both rotated with the plate
      for (const axis of [0, 1]) {
        for (let j = 0; j <= 1; j++) {
          const a0 = axis ? f : -radius
          const b0 = axis ? -radius : f
          const a1 = axis ? f : radius
          const b1 = axis ? radius : f
          const src = j === 0 ? [a0, b0] : [a1, b1]
          const x = cx + (src[0] * cos - src[1] * sin) * scale
          const y = baseY + (src[0] * sin + src[1] * cos) * scale * squash
          if (j === 0) cr.moveTo(x, y)
          else cr.lineTo(x, y)
        }
      }
    }
    cr.stroke()

    // ---- streets ----
    //  Drawn on the ground plane, after the reference grid and before the
    //  buildings, so the towers stand ON the street layout rather than in front
    //  of a picture of it. Three passes by rank, minor first, so a highway is
    //  never overdrawn by the residential street crossing it.
    for (const rank of [0, 1, 2] as const) {
      let any = false
      cr.newPath()

      for (const road of roads) {
        if (road.rank !== rank) continue

        // same render distance as the buildings, measured on the first point
        if (Math.hypot(road.path[0], road.path[1]) > renderDistance) continue
        any = true

        for (let i = 0; i < road.path.length; i += 2) {
          const a = road.path[i]
          const bb = road.path[i + 1]
          const x = cx + (a * cos - bb * sin) * scale
          const y = baseY + (a * sin + bb * cos) * scale * squash
          if (i) cr.lineTo(x, y)
          else cr.moveTo(x, y)
        }
      }

      if (!any) continue

      // wide and faint under, narrow and bright over: the same two-pass glow
      // every other edge in this widget uses
      const weight = 0.5 + rank * 0.45
      const alpha = 0.3 + rank * 0.28

      cr.setLineWidth(weight * 4)
      cr.setSourceRGBA(R, G, B, alpha * 0.1)
      cr.strokePreserve()

      cr.setLineWidth(weight)
      cr.setSourceRGBA(R, G, B, alpha)
      cr.stroke()
    }

    // ---- sort back to front ----
    sortable.length = 0
    const fadeFrom = renderDistance * (1 - FADE_BAND)

    for (const b of buildings) {
      // centroid, in local metres
      let sx = 0
      let sy = 0
      const n = b.ring.length / 2
      for (let i = 0; i < b.ring.length; i += 2) {
        sx += b.ring[i]
        sy += b.ring[i + 1]
      }
      sx /= n
      sy /= n

      // ---- render distance ----
      //  Straight-line distance from the camera's centre. Culled here rather
      //  than while drawing so the work saved includes the projection.
      const range = Math.hypot(sx, sy)
      if (range > renderDistance) continue

      const fade =
        range <= fadeFrom
          ? 1
          : 1 - (range - fadeFrom) / (renderDistance - fadeFrom)

      sortable.push({ b, depth: sx * sin + sy * cos, fade })
    }
    sortable.sort((p, q) => q.depth - p.depth)

    // ---- the city ----
    //
    //  Pure wireframe. Nothing is filled, so everything is see-through --
    //  which is both what the LiDAR-city look actually is and, as it happens,
    //  the single biggest thing keeping this widget cheap.
    //
    //  There used to be a translucent fill on every roof doing painter's-
    //  algorithm hidden-line removal. It cost more than the entire rest of the
    //  frame put together: 570 polygon fills was 52% of a CPU core on its own,
    //  and removing it took the widget from 96% to 44%. Depth is carried by
    //  brightness instead -- tall buildings glow harder -- which reads better
    //  on a hologram anyway, because a hologram does not occlude.
    //
    //  Edges are bucketed by brightness and each bucket stroked ONCE. Stroking
    //  per building issued ~1,700 stroke() calls a frame; this issues twelve.
    for (let bucket = 0; bucket < LIT_BUCKETS; bucket++) {
      const lo = bucket / LIT_BUCKETS
      const hi = (bucket + 1) / LIT_BUCKETS
      const lit = 0.25 + ((lo + hi) / 2) * 0.75

      let any = false
      cr.newPath()

      //  The top bucket has to include its upper edge. share is clamped to 1
      //  and the tallest building at full brightness scores exactly 1, so a
      //  half-open `< hi` test drops it -- the one building the skyline is
      //  actually named after never gets drawn.
      const last = bucket === LIT_BUCKETS - 1

      for (const { b, fade } of sortable) {
        //  Bucket on height AND distance together, so a far building lands in
        //  a dimmer bucket rather than needing a stroke of its own.
        const share = Math.min(1, (b.height / tallest) * fade)
        if (share < lo || (last ? share > hi : share >= hi)) continue

        const n = b.ring.length / 2
        const top = b.height * lift * grow
        any = true

        // roof ring
        for (let i = 0; i < n; i++) {
          const a = b.ring[i * 2]
          const bb = b.ring[i * 2 + 1]
          const x = cx + (a * cos - bb * sin) * scale
          const yGround = baseY + (a * sin + bb * cos) * scale * squash
          if (i) cr.lineTo(x, yGround - top)
          else cr.moveTo(x, yGround - top)
        }
        cr.closePath()

        // verticals and footprint, only once the building is tall enough for
        // them to be distinguishable from the roof ring
        if (top >= 3) {
          for (let i = 0; i < n; i++) {
            const a = b.ring[i * 2]
            const bb = b.ring[i * 2 + 1]
            const x = cx + (a * cos - bb * sin) * scale
            const yGround = baseY + (a * sin + bb * cos) * scale * squash

            cr.moveTo(x, yGround)
            cr.lineTo(x, yGround - top)
          }
        }
      }

      if (!any) continue

      cr.setLineWidth(2.4)
      cr.setSourceRGBA(R, G, B, lit * 0.13)
      cr.strokePreserve()
      cr.setLineWidth(0.8)
      cr.setSourceRGBA(R, G, B, lit * 0.95)
      cr.stroke()
    }

    // ---- weather in front of the skyline ----
    drawSkyFront(cr, width, h, sky)

    cr.restore()

    // ---- caption ----
    cr.selectFontFace("JetBrainsMono Nerd Font", 0, 0)
    cr.setFontSize(6.5)
    cr.setSourceRGBA(R, G, B, 0.7)
    cr.moveTo(10, h - 10)
    cr.showText(place)

    const note = `${buildings.length} BUILDINGS · ${Math.round(tallest)}m · ${(radius * 2) / 1000}km`
    const nw = cr.textExtents(note).width
    cr.setSourceRGBA(R, G, B, 0.4)
    cr.moveTo(width - 10 - nw, h - 10)
    cr.showText(note)

    // ---- scanlines, so it reads as projected rather than drawn ----
    cr.setSourceRGBA(0, 0, 0, 0.14)
    cr.setLineWidth(1)
    for (let y = 0.5; y < h; y += 3) {
      cr.moveTo(0, y)
      cr.lineTo(width, y)
    }
    cr.stroke()
  }

  return (
    <Canvas
      cssName="wxCity"
      heightRequest={height}
      hexpand
      draw={draw}
      fps={DRAW_HZ}
      watch={[city, weatherMood, weather, paletteIndex]}
      onChange={() => {
        mood = weatherMood.peek()
        const now = weather.peek()
        windSpeed = now?.windSpeed ?? 0
        windFrom = now?.windFrom ?? 0

        const model = city.peek()
        if (!model) return
        buildings = model.buildings
        roads = model.roads ?? []
        radius = model.radius
        tallest = model.tallest
        place = model.label
        ready = true
      }}
      animate={(dt) => {
        t += dt
        if (!dragging) yaw += SPIN * dt
        // the city rises into place once the model lands
        if (grow < 1) grow = Math.min(1, grow + dt * 0.9)
        return true
      }}
      onHide={() => {
        // reset, so a reopened panel does not resume mid-storm
        grow = 0
        t = 0
      }}
      setup={(area) => {
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
