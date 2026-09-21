/**
 * The load ramp, shared by every gauge on the panel.
 *
 * Colour is a property of a position on the scale, never of the reading. Two
 * gauges showing 80% must be the same colour whether one is a bar and the other
 * a dial, or the panel stops being readable as a single instrument.
 */

/** stops on the ramp; between them it is a straight lerp in RGB */
const RAMP: [number, [number, number, number]][] = [
  [0.0, [0.14, 0.95, 0.55]], // neon green
  [0.5, [0.72, 0.98, 0.24]], // acid
  [0.75, [1.0, 0.68, 0.12]], // amber
  [0.9, [1.0, 0.34, 0.12]], // ember
  [1.0, [1.0, 0.11, 0.26]], // neon red
]

export function ramp(t: number): [number, number, number] {
  const v = Math.min(1, Math.max(0, t))
  let i = 1
  while (i < RAMP.length - 1 && v > RAMP[i][0]) i++

  const [t0, c0] = RAMP[i - 1]
  const [t1, c1] = RAMP[i]
  const f = t1 > t0 ? Math.min(1, (v - t0) / (t1 - t0)) : 0

  return [
    c0[0] + (c1[0] - c0[0]) * f,
    c0[1] + (c1[1] - c0[1]) * f,
    c0[2] + (c1[2] - c0[2]) * f,
  ]
}
