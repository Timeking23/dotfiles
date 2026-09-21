import type Cairo from "cairo"

import type { Mood } from "../state/weather"

/**
 * ============================================================================
 * Weather, drawn over the city model
 * ============================================================================
 *
 * Precipitation, cloud and light for the holographic plate in the weather
 * panel. Kept out of CityMesh.tsx because the two have nothing to do with each
 * other: one projects buildings, this one throws particles at them.
 *
 * Everything here is a function of LIVE data, not of a mood name alone:
 *
 *   the slant of rain      the real wind bearing and speed
 *   how hard it falls      the weather code, through `mood`
 *   how the snow sways     wind speed again, more gently
 *   where lightning goes   a deterministic schedule, not Math.random()
 *
 * So a gale genuinely blows the rain sideways across the skyline, and a still
 * day drops it straight down. That is the config's rule -- every element maps
 * to a live source -- applied to the one layer that would otherwise be pure
 * decoration.
 *
 * ----------------------------------------------------------------------------
 * All drawing here assumes the caller has already set Cairo's operator to ADD.
 * Overlapping strokes then SUM, which is what makes a downpour brighten where
 * it crosses itself instead of just layering. Nothing in this file sets or
 * restores the operator -- that is the caller's frame to manage.
 * ----------------------------------------------------------------------------
 */

/** how many particles a full-intensity downpour uses */
const MAX_DROPS = 170

/** deterministic jitter: the field must not shimmer between frames */
function hash(n: number): number {
  const x = Math.sin(n * 127.1) * 43758.5453
  return x - Math.floor(x)
}

export type Sky = {
  mood: Mood
  /** mph */
  windSpeed: number
  /** degrees clockwise from north, the direction it blows FROM */
  windFrom: number
  /** seconds since the widget was mapped */
  t: number
  /** accent colour, 0..1 */
  r: number
  g: number
  b: number
}

/**
 * One glowing stroke: wide and faint, then a bright core.
 *
 * For a HANDFUL of shapes. Anything that draws hundreds of similar strokes --
 * rain, stars, wind -- must not call this per particle: two stroke() calls each
 * is two hundred Cairo state changes and rasteriser flushes a frame, which was
 * most of this widget's cost. Those batch into one path and call `glowBatch`
 * once instead.
 */
function glow(cr: Cairo.Context, path: () => void, sky: Sky, alpha: number, core: number) {
  cr.setLineWidth(core * 3)
  cr.setSourceRGBA(sky.r, sky.g, sky.b, alpha * 0.11)
  path()
  cr.stroke()

  cr.setLineWidth(core)
  cr.setSourceRGBA(sky.r, sky.g, sky.b, alpha * 0.9)
  path()
  cr.stroke()
}

/**
 * Stroke whatever is already on the context twice -- wide and faint, then a
 * bright core -- for a path built up from many shapes at once.
 *
 * The trade is that every shape in the batch shares one alpha, so per-particle
 * fading has to be approximated by bucketing. At these sizes that is invisible,
 * and it turns hundreds of strokes into two.
 */
function glowBatch(cr: Cairo.Context, sky: Sky, alpha: number, core: number) {
  cr.setLineWidth(core * 3)
  cr.setSourceRGBA(sky.r, sky.g, sky.b, alpha * 0.11)
  cr.strokePreserve()

  cr.setLineWidth(core)
  cr.setSourceRGBA(sky.r, sky.g, sky.b, alpha * 0.9)
  cr.stroke()
}

/** how many alpha buckets a batched particle field is split into */
const BUCKETS = 4

/**
 * Precipitation.
 *
 * The field wraps in both axes, so a hundred and seventy particles read as
 * endless weather. `slant` is the real wind, projected: windFrom is the bearing
 * it blows FROM, so the drift is its opposite.
 */
function precipitation(
  cr: Cairo.Context,
  width: number,
  h: number,
  sky: Sky,
  kind: "rain" | "snow" | "hail",
  count: number,
) {
  const rad = ((sky.windFrom + 180) * Math.PI) / 180
  const slant = Math.sin(rad) * Math.min(1, sky.windSpeed / 26) * 0.9

  // fall rate in pixels per second, by what is falling
  const fall = kind === "snow" ? 34 : kind === "hail" ? 180 : 120

  //  Particles are bucketed by depth-fade and each bucket drawn as ONE path.
  //  Four strokes a frame instead of two per drop.
  for (let bucket = 0; bucket < BUCKETS; bucket++) {
    const lo = bucket / BUCKETS
    const hi = (bucket + 1) / BUCKETS
    let any = false

    cr.newPath()

    for (let i = 0; i < count; i++) {
      const seedX = hash(i * 3.1)
      const speed = 0.65 + hash(i * 5.9) * 0.7
      const len = 5 + hash(i * 1.3) * 13

      const y = (hash(i * 7.7) * h + sky.t * fall * speed) % h

      // fade in at the top, so particles do not pop into existence at y=0
      const fade = Math.min(1, y / 40)
      if (fade < lo || fade >= hi) continue

      let x = seedX * width + y * slant

      // snow sways on the wind; rain does not
      if (kind === "snow") {
        x += Math.sin(sky.t * 0.8 + hash(i * 11.3) * 6.28) * (4 + sky.windSpeed * 0.5)
      }

      x = ((x % width) + width) % width
      any = true

      if (kind === "snow") {
        cr.newSubPath()
        cr.arc(x, y, 1.1 + speed, 0, Math.PI * 2)
      } else {
        const l = kind === "hail" ? len * 0.45 : len
        cr.moveTo(x, y)
        cr.lineTo(x - slant * l, y + l)
      }
    }

    if (!any) continue

    const alpha = ((lo + hi) / 2) * (kind === "snow" ? 0.75 : 0.95)
    glowBatch(cr, sky, alpha, kind === "snow" ? 0.8 : kind === "hail" ? 1.1 : 0.8)
  }
}

/**
 * A cloud bank, as horizontal contour slices through a blob field.
 *
 * Slices rather than an outline: an outlined cloud is a silhouette, and a
 * hologram has no silhouettes. Volumetric displays cut a body into parallel
 * slices, and that is both what reads as cloud and what reads as projected.
 */
function cloud(
  cr: Cairo.Context,
  cx: number,
  cy: number,
  scale: number,
  alpha: number,
  seed: number,
  sky: Sky,
) {
  const LOBES = 5
  const lobes: Array<[number, number, number]> = []
  for (let i = 0; i < LOBES; i++) {
    const f = i / (LOBES - 1)
    const jitter = hash(seed + i * 3.3)
    lobes.push([
      cx + (f - 0.5) * scale * 2.3,
      cy - Math.sin(f * Math.PI) * scale * 0.4,
      scale * (0.32 + Math.sin(f * Math.PI) * 0.44) * (0.85 + jitter * 0.3),
    ])
  }

  const field = (x: number, y: number) => {
    let v = 0
    for (const [lx, ly, lr] of lobes) {
      const dx = x - lx
      const dy = (y - ly) * 1.6
      v += (lr * lr) / (dx * dx + dy * dy + 1)
    }
    return v
  }

  const top = cy - scale * 0.95
  const bottom = cy + scale * 0.5
  const left = cx - scale * 1.8
  const right = cx + scale * 1.8
  const ROWS = 9
  const STEP = Math.max(3, scale / 11)

  for (let r = 0; r < ROWS; r++) {
    const y = top + ((bottom - top) * r) / (ROWS - 1)
    const a = alpha * (0.4 + (r / (ROWS - 1)) * 0.6)

    //  One path per slice, stroked once -- a slice is many spans and stroking
    //  each separately was the cloud's whole cost.
    cr.newPath()
    let start: number | null = null
    for (let x = left; x <= right; x += STEP) {
      const inside = field(x, y) >= 1
      if (inside && start === null) start = x
      else if (!inside && start !== null) {
        cr.moveTo(start, y)
        cr.lineTo(x, y)
        start = null
      }
    }
    if (start !== null) {
      cr.moveTo(start, y)
      cr.lineTo(right, y)
    }

    glowBatch(cr, sky, a, 0.8)
  }
}

/** Horizontal streaks at the reported wind speed. */
function windStreaks(cr: Cairo.Context, width: number, h: number, sky: Sky) {
  const speed = 50 + sky.windSpeed * 11
  cr.newPath()
  for (let i = 0; i < 14; i++) {
    const y = hash(i * 4.3) * h * 0.6
    const len = 40 + hash(i * 8.1) * 120
    const x = ((hash(i * 2.2) * width + sky.t * speed * (0.6 + hash(i) * 0.8)) % (width + 240)) - 120
    cr.moveTo(x, y)
    cr.lineTo(x + len, y)
  }
  glowBatch(cr, sky, 0.45, 0.8)
}

/** Soft bands sliding past each other, low over the rooftops. */
function fogBands(cr: Cairo.Context, width: number, h: number, sky: Sky) {
  for (let i = 0; i < 8; i++) {
    const y = h * (0.3 + i * 0.075)
    const drift = Math.sin(sky.t * 0.22 + i * 1.2) * 30
    glow(
      cr,
      () => { cr.moveTo(-40 + drift, y); cr.lineTo(width + 40 + drift, y) },
      sky,
      0.1 + Math.sin(sky.t * 0.5 + i) * 0.05,
      2.4,
    )
  }
}

/**
 * Lightning, on a fixed schedule rather than at random.
 *
 * A random strike cannot be reasoned about or reproduced; one every ~3.6s
 * reads as a storm without becoming a strobe, and being deterministic means
 * the same second always looks the same.
 */
function lightning(cr: Cairo.Context, width: number, h: number, sky: Sky) {
  const period = 3.6
  const phase = (sky.t % period) / period
  if (phase > 0.13) return

  // two quick flashes per strike, the second weaker
  const flash = phase < 0.05 ? 1 - phase / 0.05 : (0.13 - phase) / 0.08
  const seed = Math.floor(sky.t / period)
  const x0 = 50 + hash(seed * 3.7) * (width - 100)

  glow(
    cr,
    () => {
      let x = x0
      let y = 0
      cr.moveTo(x, y)
      for (let i = 0; i < 6; i++) {
        x += (hash(seed * 5 + i) - 0.5) * 52
        y += (h * 0.62) / 6
        cr.lineTo(x, y)
      }
    },
    sky,
    flash,
    1.5,
  )

  // the whole plate lifts a little on the strike
  cr.setSourceRGBA(sky.r, sky.g, sky.b, flash * 0.06)
  cr.rectangle(0, 0, width, h)
  cr.fill()
}

/** Stars, for a clear night. */
function stars(cr: Cairo.Context, width: number, h: number, sky: Sky) {
  //  Two buckets is enough for a twinkle: the eye reads the POPULATION of
  //  bright and dim stars changing, not each one's exact alpha.
  for (let bucket = 0; bucket < 2; bucket++) {
    let any = false
    cr.newPath()

    for (let i = 0; i < 30; i++) {
      const tw = 0.3 + Math.sin(sky.t * 1.7 + i * 1.7) * 0.35
      if (tw <= 0.05) continue
      if ((tw > 0.45) !== (bucket === 1)) continue

      const x = hash(i * 2.7) * width
      const y = hash(i * 9.1) * h * 0.5
      const s = 1.2 + tw * 1.6
      any = true

      cr.moveTo(x - s, y)
      cr.lineTo(x + s, y)
      cr.moveTo(x, y - s)
      cr.lineTo(x, y + s)
    }

    if (any) glowBatch(cr, sky, bucket ? 0.6 : 0.28, 0.7)
  }
}

/** A slow sweep of light across the plate, for a clear day. */
function sunSweep(cr: Cairo.Context, width: number, h: number, sky: Sky) {
  const cx = width * (0.5 + Math.sin(sky.t * 0.08) * 0.3)
  const cy = h * 0.16
  const radius = Math.min(width, h) * 0.1

  glow(cr, () => { cr.newSubPath(); cr.arc(cx, cy, radius, 0, Math.PI * 2) }, sky, 0.7, 1.2)

  for (let i = 0; i < 20; i++) {
    const a = sky.t * 0.12 + (i / 20) * Math.PI * 2
    const pulse = 0.7 + Math.sin(sky.t * 1.4 + i * 0.7) * 0.3
    glow(
      cr,
      () => {
        cr.moveTo(cx + Math.cos(a) * radius * 1.2, cy + Math.sin(a) * radius * 1.2)
        cr.lineTo(cx + Math.cos(a) * radius * (1.35 + pulse * 0.4), cy + Math.sin(a) * radius * (1.35 + pulse * 0.4))
      },
      sky,
      0.35 * pulse,
      0.8,
    )
  }
}

/**
 * Everything that belongs BEHIND the city: sky objects, cloud, distant light.
 * Called before the buildings, so the skyline stands in front of it.
 */
export function drawSkyBehind(cr: Cairo.Context, width: number, h: number, sky: Sky) {
  const overcast =
    sky.mood === "clouds" || sky.mood === "rain" || sky.mood === "storm" ||
    sky.mood === "hail" || sky.mood === "snow"

  if (sky.mood === "clear-night") stars(cr, width, h, sky)
  if (sky.mood === "clear-day") sunSweep(cr, width, h, sky)
  if (sky.mood === "wind") windStreaks(cr, width, h, sky)

  if (overcast) {
    // three banks at different depths and rates; the parallax is the depth
    const base = Math.min(width, h)
    const speeds = [0.05, 0.028, 0.016]
    const sizes = [0.1, 0.14, 0.075]
    const ys = [0.1, 0.19, 0.06]
    const alphas = sky.mood === "storm" ? [0.4, 0.62, 0.3] : [0.3, 0.48, 0.24]

    for (let i = 2; i >= 0; i--) {
      const span = width + base * 2.4
      const x = ((sky.t * speeds[i] * 90 + i * span * 0.37) % span) - base * 1.2
      cloud(cr, x, h * ys[i], base * sizes[i], alphas[i], i * 17 + 1, sky)
    }
  }
}

/**
 * Everything that belongs IN FRONT of the city: falling weather, and the flash
 * of a strike. Called after the buildings, so rain falls past them.
 */
export function drawSkyFront(cr: Cairo.Context, width: number, h: number, sky: Sky) {
  switch (sky.mood) {
    case "rain":
      precipitation(cr, width, h, sky, "rain", MAX_DROPS)
      break
    case "storm":
      precipitation(cr, width, h, sky, "rain", MAX_DROPS)
      lightning(cr, width, h, sky)
      break
    case "hail":
      precipitation(cr, width, h, sky, "hail", Math.round(MAX_DROPS * 0.7))
      break
    case "snow":
      precipitation(cr, width, h, sky, "snow", Math.round(MAX_DROPS * 0.8))
      break
    case "fog":
      fogBands(cr, width, h, sky)
      break
    default:
      break
  }
}
