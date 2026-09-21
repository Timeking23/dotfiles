import { type Accessor } from "ags"
import type Cairo from "cairo"

import Canvas from "./canvas"
import { ramp } from "./ramp"

/**
 * Neon ring gauge. One live value, drawn as an arc on the shared load ramp:
 * green at idle through to red at full, the same colours the bars use.
 *
 * The pulse is not decoration for its own sake — its rate and its depth both
 * ride the reading. An idle dial breathes slowly and barely glows; a full one
 * throbs fast and hard, so a panel of three can be read from across the room
 * by motion alone, before any of the numbers are legible.
 */

/** the ring's gap at the bottom, so it reads as a gauge rather than a pie */
const SWEEP = Math.PI * 1.5
const START = Math.PI * 0.75

const RING = 5.5
const DRAW_HZ = 20

/** seconds per breath, at idle and at full */
const PULSE_SLOW = 2.6
const PULSE_FAST = 0.85

/**
 * How quickly the needle chases a new reading, as a time constant in seconds:
 * it closes ~63% of the remaining gap per EASE_TAU, so a jump is visibly swept
 * and settled in about half a second.
 *
 * Expressed as a time constant rather than the old "move 14% of the gap each
 * frame" because a per-frame fraction eases at a completely different speed on
 * a 60Hz screen than on this machine's 144Hz one -- the same code produced a
 * different instrument depending on the monitor.
 */
const EASE_TAU = 0.18

export default function Dial({
  icon,
  label,
  value,
  caption,
  readout,
}: {
  icon: string
  label: string
  value: Accessor<number>
  caption: Accessor<string>
  /**
   * Centre figure. Defaults to the ring's own percentage, which is right for a
   * fraction of a known total and wrong for anything measured in real units —
   * a temperature dial showing "62%" tells you nothing you can act on.
   */
  readout?: Accessor<string>
}) {
  let level = 0
  let text = ""
  let figure = ""
  /** eased toward `level`, so a jump in the reading sweeps rather than snaps */
  let shown = 0
  let phase = 0

  function draw(cr: Cairo.Context, width: number, h: number) {
    const cx = width / 2
    const cy = h / 2 - 4
    const radius = Math.min(width, h - 16) / 2 - RING

    if (radius <= 2) return

    const [r, g, b] = ramp(shown)

    // breath: 0 at the trough, 1 at the crest, deeper the higher the reading
    const breath = (Math.sin(phase * Math.PI * 2) + 1) / 2
    const glow = (0.18 + shown * 0.5) * (0.45 + breath * 0.55)

    // ---- track ----
    cr.setLineWidth(RING)
    cr.setSourceRGBA(0.55, 0.62, 0.7, 0.13)
    cr.arc(cx, cy, radius, START, START + SWEEP)
    cr.stroke()

    // ---- tick marks, every 25% ----
    cr.setLineWidth(1)
    cr.setSourceRGBA(0.72, 0.78, 0.86, 0.3)
    for (let i = 0; i <= 4; i++) {
      const a = START + (i / 4) * SWEEP
      const c = Math.cos(a)
      const s = Math.sin(a)
      cr.moveTo(cx + c * (radius + RING * 0.7), cy + s * (radius + RING * 0.7))
      cr.lineTo(cx + c * (radius + RING * 1.5), cy + s * (radius + RING * 1.5))
    }
    cr.stroke()

    if (shown > 0.001) {
      const end = START + SWEEP * Math.min(1, shown)

      // ---- glow, widest first ----
      cr.setLineWidth(RING * 3.4)
      cr.setSourceRGBA(r, g, b, glow * 0.16)
      cr.arc(cx, cy, radius, START, end)
      cr.stroke()

      cr.setLineWidth(RING * 1.9)
      cr.setSourceRGBA(r, g, b, glow * 0.34)
      cr.arc(cx, cy, radius, START, end)
      cr.stroke()

      // ---- core ----
      cr.setLineWidth(RING)
      cr.setSourceRGBA(r, g, b, 0.97)
      cr.arc(cx, cy, radius, START, end)
      cr.stroke()

      // head bead, the brightest thing on the dial
      const hx = cx + Math.cos(end) * radius
      const hy = cy + Math.sin(end) * radius
      cr.arc(hx, hy, RING * 0.62, 0, Math.PI * 2)
      cr.setSourceRGBA(Math.min(1, r + 0.35), Math.min(1, g + 0.35), Math.min(1, b + 0.35), 1)
      cr.fill()
    }

    // ---- centre ----
    cr.selectFontFace("JetBrainsMono Nerd Font", 0, 0)

    const figureText = readout ? figure : `${Math.round(shown * 100)}`
    const suffix = readout ? "" : "%"

    cr.setFontSize(15)
    const pw = figureText.length * 15 * 0.6
    const sw = suffix.length * 8 * 0.6
    cr.setSourceRGBA(r, g, b, 0.95)
    cr.moveTo(cx - (pw + sw) / 2, cy + 4)
    cr.showText(figureText)

    if (suffix) {
      cr.setFontSize(8)
      cr.setSourceRGBA(r, g, b, 0.6)
      cr.showText(suffix)
    }

    // glyph above the figure, label below the ring
    cr.setFontSize(10)
    cr.setSourceRGBA(0.79, 0.83, 0.92, 0.75)
    cr.moveTo(cx - 10 * 0.6, cy - 11)
    cr.showText(icon)

    cr.setFontSize(7)
    cr.setSourceRGBA(0.81, 0.88, 0.86, 0.62)
    cr.moveTo(cx - (label.length * 7 * 0.6) / 2, h - 8)
    cr.showText(label)

    cr.setFontSize(6.5)
    cr.setSourceRGBA(0.7, 0.64, 0.9, 0.72)
    cr.moveTo(cx - (text.length * 6.5 * 0.6) / 2, h - 1)
    cr.showText(text)
  }

  return (
    <Canvas
      hexpand
      draw={draw}
      // Painted at 20Hz rather than the monitor's 144: three of these plus a
      // mesh and a force graph all repainting every frame is real battery for
      // motion the eye cannot resolve anyway. The dt handed to `animate` is
      // always REAL elapsed time, so this slows the drawing, never the breathing.
      fps={DRAW_HZ}
      watch={readout ? [value, caption, readout] : [value, caption]}
      onChange={() => {
        // Copy the reactive values into the plain locals `draw` reads. Note
        // this does NOT set `shown` -- that is the eased value, and letting it
        // jump here is exactly what the easing exists to prevent.
        level = Math.min(1, Math.max(0, value.peek()))
        text = caption.peek()
        if (readout) figure = readout.peek()
      }}
      animate={(dt) => {
        // The phase advances on real elapsed time, so the breath keeps its
        // rhythm no matter what rate we are painting at.
        const period = PULSE_SLOW + (PULSE_FAST - PULSE_SLOW) * shown
        phase = (phase + dt / period) % 1

        // Exponential ease toward the live reading. Deriving the step from dt
        // is what makes it frame-rate independent: half the frame rate means
        // twice the step, and the needle arrives at the same moment either way.
        shown += (level - shown) * (1 - Math.exp(-dt / EASE_TAU))

        return true // the pulse never rests, so every frame is worth painting
      }}
    />
  )
}
