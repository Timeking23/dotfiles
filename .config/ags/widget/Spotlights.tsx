import CairoGi from "gi://cairo?version=1.0"
import type Cairo from "cairo"

import Canvas from "./canvas"
import { BARS, levels } from "../state/cava"

/**
 * Stage spotlights over the album art, driven by the audio spectrum.
 *
 * Each beam owns a slice of the spectrum and answers to it: its brightness is
 * that slice's energy, and it sweeps faster when the track is loud. The sweep
 * periods are deliberately incommensurate, so the beams cross at a different
 * place every time rather than falling into a visible loop.
 *
 * Beams are drawn additively, which is the whole trick — overlapping light
 * sums the way real light does, so magenta over cyan goes white-hot at the
 * crossing instead of one simply covering the other. The cone is a stack of
 * quads with a quadratic falloff rather than a cairo gradient: same result,
 * no pattern objects allocated sixty times a second.
 */

const BEAMS = 5
/** slices down the length of each cone; more is smoother and costs a fill each */
const SEGMENTS = 9

/** how fast a beam brightens on a transient, and how slowly it falls away */
const ATTACK_TAU = 0.012
const RELEASE_TAU = 0.085

/** radians either side of straight down */
const SWEEP = 0.62
/** half-width of the cone */
const SPREAD = 0.115

/**
 * A floor under the energy, so a paused track still shows lights idling over
 * the cover. A rig that goes black the moment the music stops reads as broken
 * rather than as quiet.
 */
const IDLE = 0.14

const DRAW_HZ = 33

type Beam = {
  /** where along the top edge it hangs, 0..1 */
  at: number
  /** radians per second of sweep, at rest */
  rate: number
  phase: number
  colour: [number, number, number]
  /** eased energy for this beam's slice of the spectrum */
  lit: number
}

/** Incommensurate rates — no two beams ever line up for long. */
const BEAM_SPEC: Array<[number, number, number, [number, number, number]]> = [
  [0.1, 0.37, 0.0, [1.0, 0.18, 0.8]], // magenta
  [0.3, 0.29, 1.7, [0.0, 0.94, 1.0]], // cyan
  [0.5, 0.44, 3.1, [0.7, 0.64, 0.9]], // violet
  [0.7, 0.33, 4.6, [1.0, 0.7, 0.25]], // amber
  [0.9, 0.4, 5.9, [0.3, 1.0, 0.65]], // green
]

export default function Spotlights({ size }: { size: number }) {
  const beams: Beam[] = BEAM_SPEC.map(([at, rate, phase, colour]) => ({
    at,
    rate,
    phase,
    colour,
    lit: IDLE,
  }))

  let spectrum: number[] = new Array(BARS).fill(0)
  let clock = 0

  function advance(dt: number) {
    const band = BARS / BEAMS

    beams.forEach((beam, i) => {
      // this beam's slice of the spectrum, averaged
      let sum = 0
      let count = 0
      for (let b = Math.floor(i * band); b < Math.floor((i + 1) * band); b++) {
        sum += spectrum[b] ?? 0
        count++
      }

      const target = Math.max(IDLE, count ? sum / count : 0)
      // Asymmetric easing: snap up on a transient, fall away slowly, which is
      // how a lamp with any inertia behaves and how a beat reads.
      //
      // Both are time constants in seconds rather than a per-frame fraction,
      // so the rig behaves the same whatever rate we are painting at. A bare
      // fraction made the beams sluggish on a 60Hz screen and twitchy here.
      const tau = target > beam.lit ? ATTACK_TAU : RELEASE_TAU
      beam.lit += (target - beam.lit) * (1 - Math.exp(-dt / tau))
    })

    // loud music sweeps the rig faster
    const drive = beams.reduce((sum, b) => sum + b.lit, 0) / beams.length
    clock += dt * (0.55 + drive * 1.15)
  }

  function draw(cr: Cairo.Context, width: number, height: number) {
    // reach past the far corner, so a beam at full tilt still leaves the frame
    const reach = Math.sqrt(width * width + height * height) * 1.15

    cr.setOperator(CairoGi.Operator.ADD)

    for (const beam of beams) {
      const px = width * beam.at
      // hung just above the frame, so the cone apex is off-screen
      const py = -6

      const angle = Math.PI / 2 + Math.sin(clock * beam.rate + beam.phase) * SWEEP
      const [r, g, b] = beam.colour
      const power = beam.lit

      for (let s = 0; s < SEGMENTS; s++) {
        const t0 = s / SEGMENTS
        const t1 = (s + 1) / SEGMENTS

        // quadratic falloff: bright at the lamp, gone by the far end
        const alpha = (1 - t0) * (1 - t0) * 0.42 * power
        if (alpha < 0.004) break

        const l0 = reach * t0
        const l1 = reach * t1

        const a0 = angle - SPREAD
        const a1 = angle + SPREAD

        cr.moveTo(px + Math.cos(a0) * l0, py + Math.sin(a0) * l0)
        cr.lineTo(px + Math.cos(a1) * l0, py + Math.sin(a1) * l0)
        cr.lineTo(px + Math.cos(a1) * l1, py + Math.sin(a1) * l1)
        cr.lineTo(px + Math.cos(a0) * l1, py + Math.sin(a0) * l1)
        cr.closePath()

        cr.setSourceRGBA(r, g, b, alpha)
        cr.fill()
      }

      // a hot core down the middle of the cone, so the beam has an edge to it
      cr.setLineWidth(2.4)
      cr.setSourceRGBA(r, g, b, 0.26 * power)
      cr.moveTo(px, py)
      cr.lineTo(px + Math.cos(angle) * reach * 0.55, py + Math.sin(angle) * reach * 0.55)
      cr.stroke()

      // the lamp itself
      cr.arc(px, py + 4, 2.4 + power * 2.6, 0, Math.PI * 2)
      cr.setSourceRGBA(r, g, b, 0.5 + power * 0.5)
      cr.fill()
    }

    cr.setOperator(CairoGi.Operator.OVER)
  }

  return (
    <Canvas
      widthRequest={size}
      heightRequest={size}
      // purely a readout -- never eat clicks meant for the art underneath
      canTarget={false}
      draw={draw}
      fps={DRAW_HZ}
      // `levels` is a lazy subprocess accessor: cava is only spawned once
      // something subscribes, and killed when the last subscriber goes away.
      // Because Canvas subscribes on map and unsubscribes on unmap, closing the
      // player popup actually stops the cava process rather than just hiding it.
      watch={[levels]}
      onChange={() => {
        spectrum = levels.peek()
      }}
      animate={(dt) => {
        advance(dt)
        return true
      }}
      onHide={() => {
        // Reset, so reopening the player starts dark instead of flashing
        // whatever the spectrum happened to be when it was closed.
        spectrum = new Array(BARS).fill(0)
        for (const beam of beams) beam.lit = IDLE
      }}
    />
  )
}
