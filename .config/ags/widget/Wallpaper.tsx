import GdkPixbuf from "gi://GdkPixbuf?version=2.0"
import Gdk from "gi://Gdk?version=4.0"
import { type Accessor } from "ags"
import type Cairo from "cairo"

import Canvas from "./canvas"

/**
 * The wallpaper preview, and nothing else.
 *
 * This file used to hold the picker as well -- first a single thumbnail with
 * two arrow keys, then an AdwCarousel in a popover. Both were invisible in
 * practice: a popover on a layer-shell surface is clipped to that surface, and
 * the drawer has no room to the right of itself. The picker is now a cover flow
 * in the centre window, widget/WallCarousel.tsx, which is also the only place a
 * 300px card was ever going to fit.
 */

/** how wide a preview is decoded -- well under a card, and eleven are held */
const DECODE_WIDTH = 320

/** Cover-fit preview. Gtk.Image letterboxes; a wallpaper wants to be cropped. */
export function Thumb({
  path,
  height,
}: {
  path: Accessor<string> | string
  height: number
}) {
  let pixbuf: GdkPixbuf.Pixbuf | null = null
  let loaded = ""

  function draw(cr: Cairo.Context, width: number, h: number) {
    cr.setSourceRGBA(0.03, 0.05, 0.06, 1)
    cr.rectangle(0, 0, width, h)
    cr.fill()

    if (!pixbuf) return

    const pw = pixbuf.get_width()
    const ph = pixbuf.get_height()
    // cover, not contain: scale to the larger ratio and centre the overflow
    const scale = Math.max(width / pw, h / ph)

    cr.save()
    cr.rectangle(0, 0, width, h)
    cr.clip()
    cr.translate((width - pw * scale) / 2, (h - ph * scale) / 2)
    cr.scale(scale, scale)
    Gdk.cairo_set_source_pixbuf(cr, pixbuf, 0, 0)
    cr.paint()
    cr.restore()
  }

  /** @returns whether anything changed and a redraw is owed */
  function load(file: string) {
    if (file === loaded) return false
    loaded = file

    try {
      // decoded at drawer width rather than full size: a workshop preview runs
      // to 1920px, and holding eleven of those for something drawn 104px tall
      // is a lot of pixmap for nothing
      pixbuf = file
        ? GdkPixbuf.Pixbuf.new_from_file_at_scale(file, DECODE_WIDTH, -1, true)
        : null
    } catch {
      pixbuf = null
    }

    return true
  }

  // A fixed path is a carousel page and never changes, so there is nothing to
  // watch and `watch={[]}` makes this a still picture -- no subscription and no
  // frame clock at all. An Accessor is the live selection, and Canvas repaints
  // us whenever it moves.
  if (typeof path === "string") {
    load(path)
    return <Canvas heightRequest={height} hexpand draw={draw} />
  }

  return (
    <Canvas
      heightRequest={height}
      hexpand
      draw={draw}
      watch={[path]}
      onChange={() => load(path.peek())}
    />
  )
}
