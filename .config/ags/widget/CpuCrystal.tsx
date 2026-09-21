import GdkPixbuf from "gi://GdkPixbuf?version=2.0"
import Gdk from "gi://Gdk?version=4.0"
import CairoGi from "gi://cairo?version=1.0"
import GLib from "gi://GLib?version=2.0"
import { type Accessor } from "ags"
import type Cairo from "cairo"

import Canvas from "./canvas"
import { ramp } from "./ramp"

/**
 * The CPU load, as a turning crystal.
 *
 * The source gif is a rainbow refraction on black, which is no use as a gauge —
 * its own colours would fight whatever the load is saying. So the frames were
 * flattened at build time into white-on-alpha masks (assets/cpu, generated from
 * Pictures/GUI/cpu.gif): luminance became the alpha channel, so painting is a
 * single cairo mask of a flat colour, and that colour can be anything. Here it
 * is the shared load ramp, green through orange to red, which makes the crystal
 * a gauge rather than an ornament.
 *
 * It turns at the gif's own frame rate. The only thing on it that answers to
 * the load is the colour.
 */

const FRAMES = 36
const ASSETS = `${GLib.get_user_config_dir()}/ags/assets/cpu`

/**
 * The gif's own delay, 4 centiseconds a frame, which over 36 frames is 1.44s a
 * revolution. Not a speed this widget picked — read off the source with
 * `identify -format %T` — so there is no rate to tune here any more.
 */
const FRAME_SECONDS = 0.04

/**
 * How quickly the colour chases the load, as a time constant in seconds.
 * See the same constant in Dial.tsx for why this is a time and not a per-frame
 * fraction.
 */
const EASE_TAU = 0.2

/** shared across monitors — 36 pixbufs is not worth decoding twice */
let cache: Array<GdkPixbuf.Pixbuf> | null = null

function frames(): Array<GdkPixbuf.Pixbuf> {
  if (cache) return cache

  const out: Array<GdkPixbuf.Pixbuf> = []
  for (let i = 0; i < FRAMES; i++) {
    try {
      out.push(GdkPixbuf.Pixbuf.new_from_file(`${ASSETS}/${`${i}`.padStart(2, "0")}.png`))
    } catch (error) {
      console.error(`[cpu] frame ${i} missing: ${error}`)
    }
  }

  cache = out
  return cache
}

export default function CpuCrystal({
  value,
  size = 92,
}: {
  value: Accessor<number>
  size?: number
}) {
  let level = 0
  /** eased, so a spike does not snap the colour */
  let shown = 0
  let frame = 0

  function draw(cr: Cairo.Context, width: number, h: number) {
    const pixbufs = frames()
    if (!pixbufs.length) return

    const picture = pixbufs[frame % pixbufs.length]
    const [r, g, b] = ramp(shown)

    // The gif was cut on black and reads as a lit object against it; over a
    // wallpaper the dark facets have nothing to sit against and it turns to
    // confetti. So this one plate stays opaque while the rest of the panel
    // does not.
    cr.setSourceRGBA(0, 0, 0, 1)
    cr.paint()

    const box = Math.min(width, h)
    const scale = box / picture.get_width()
    const x = (width - box) / 2
    const y = (h - box) / 2

    cr.save()
    cr.translate(x, y)
    cr.scale(scale, scale)

    Gdk.cairo_set_source_pixbuf(cr, picture, 0, 0)
    const mask = cr.getSource()

    // the crystal itself, in the load colour
    cr.setSourceRGBA(r, g, b, 0.95)
    cr.mask(mask)

    // and a second, additive pass so the bright facets blow out into a glow
    // rather than just being lighter grey — this is what sells it as neon
    cr.setOperator(CairoGi.Operator.ADD)
    cr.setSourceRGBA(r, g, b, 0.16 + shown * 0.45)
    cr.mask(mask)
    cr.setOperator(CairoGi.Operator.OVER)

    cr.restore()
  }

  /** real seconds since the animation started, used to pick the gif frame */
  let elapsed = 0

  return (
    <Canvas
      widthRequest={size}
      heightRequest={size}
      draw={draw}
      watch={[value]}
      onChange={() => {
        level = Math.min(1, Math.max(0, value.peek()))
      }}
      // No fps cap: the crystal is a 36-frame loop at 25fps and the frame clock
      // is what keeps it in step with the compositor. `animate` decides for
      // itself whether a repaint is owed, which is cheaper than a rate limit.
      animate={(dt) => {
        const before = shown
        shown += (level - shown) * (1 - Math.exp(-dt / EASE_TAU))

        // Step the gif on real elapsed time rather than on frames drawn, so it
        // keeps the source's own 1.44s-per-revolution whatever the monitor does.
        elapsed += dt
        const next = Math.floor(elapsed / FRAME_SECONDS) % FRAMES

        // Repaint on a frame change, or while the colour is still easing --
        // there is genuinely nothing new to show between those two.
        if (next === frame && Math.abs(shown - before) <= 0.001) return false

        frame = next
        return true
      }}
    />
  )
}
