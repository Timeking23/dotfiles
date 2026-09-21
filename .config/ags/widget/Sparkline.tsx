import { type Accessor } from "ags"
import type Cairo from "cairo"

import Canvas from "./canvas"

/**
 * Filled history graph, oldest sample at the left.
 *
 * Fixed 0..1 domain rather than autoscaling -- an autoscaled CPU graph looks
 * identical at 3% and 90%, which is exactly the distinction you want to read at
 * a glance.
 *
 * This is the simplest instrument in the config and a good one to read first:
 * it is a `draw` function plus one line saying what it watches. All of the
 * subscribe/unsubscribe/repaint machinery lives in ./canvas.
 */
export default function Sparkline({
  values,
  height,
}: {
  values: Accessor<number[]>
  height: number
}) {
  /**
   * The samples `draw` paints.
   *
   * A plain local variable, not the Accessor itself: `draw` is called by GTK
   * outside any reactive scope, so it copies the value in via Canvas's
   * `onChange` instead of reading reactively. Every hand-drawn widget here
   * follows this same shape -- reactive in, plain variable out.
   */
  let series: number[] = []

  function draw(cr: Cairo.Context, width: number, h: number) {
    // one point cannot make a line
    if (series.length < 2) return

    const step = width / (series.length - 1)
    // Cairo's y axis points DOWN, so a high value is a small y. The 0.5 keeps
    // a 1px line on a pixel centre instead of straddling two and going blurry.
    const yOf = (v: number) => h - Math.min(1, Math.max(0, v)) * (h - 1) - 0.5

    // baseline grid at 25/50/75% so the amplitude is readable
    cr.setLineWidth(1)
    cr.setSourceRGBA(0.7, 0.64, 0.9, 0.13)
    for (const frac of [0.25, 0.5, 0.75]) {
      const y = Math.round(h - frac * h) + 0.5
      cr.moveTo(0, y)
      cr.lineTo(width, y)
    }
    cr.stroke()

    // filled area: trace the samples, then close the shape along the bottom
    cr.moveTo(0, h)
    series.forEach((v, i) => cr.lineTo(i * step, yOf(v)))
    cr.lineTo(width, h)
    cr.closePath()
    cr.setSourceRGBA(0.55, 0.47, 0.85, 0.28)
    cr.fill()

    // stroke on top, so the leading edge stays crisp against the fill
    series.forEach((v, i) => (i ? cr.lineTo(i * step, yOf(v)) : cr.moveTo(0, yOf(v))))
    cr.setSourceRGBA(0.78, 0.72, 0.96, 0.95)
    cr.setLineWidth(1.4)
    cr.stroke()
  }

  return (
    <Canvas
      heightRequest={height}
      hexpand
      draw={draw}
      watch={[values]}
      onChange={() => {
        series = values.peek()
      }}
    />
  )
}
