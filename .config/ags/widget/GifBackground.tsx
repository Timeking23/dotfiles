import Gdk from "gi://Gdk?version=4.0"
import GLib from "gi://GLib?version=2.0"
import { Gtk } from "ags/gtk4"

/**
 * An animated gif, as a widget background.
 *
 * GTK4 CSS cannot do this. `background-image: url("x.gif")` is decoded by
 * GdkPixbuf into one static texture -- you get frame 0 forever -- and a plain
 * GtkPicture pointed at a gif behaves the same way. So the frames are exploded
 * to png at build time (assets/gen-frames.py) and cycled here.
 *
 * The timer is re-armed each tick rather than run at a fixed interval, because
 * gif frame delays are per-frame; a single averaged interval drifts visibly
 * against the original over a long loop.
 *
 * It only runs while the widget is on screen. The calendar is a toggled window,
 * and a 36-frame loop repainting behind a window nobody can see is pure drain --
 * so the timer starts on `map` and is torn down on `unmap`.
 */

const ASSETS = `${GLib.get_user_config_dir()}/ags/assets`

type Loaded = { textures: Array<Gdk.Texture>; delays: Array<number> }

/** decoded once per gif, shared across monitors */
const cache = new Map<string, Loaded>()

function load(dir: string): Loaded {
  const hit = cache.get(dir)
  if (hit) return hit

  const base = `${ASSETS}/${dir}`
  let delays: Array<number> = []

  try {
    const [, bytes] = GLib.file_get_contents(`${base}/delays.json`)
    delays = JSON.parse(new TextDecoder().decode(bytes))
  } catch (error) {
    console.error(`[gif] ${dir}: no delays.json (${error}) -- run assets/gen-frames.py`)
    const empty = { textures: [], delays: [] }
    cache.set(dir, empty)
    return empty
  }

  const textures: Array<Gdk.Texture> = []
  for (let i = 0; i < delays.length; i++) {
    const file = `${base}/${`${i}`.padStart(2, "0")}.png`
    try {
      textures.push(Gdk.Texture.new_from_filename(file))
    } catch (error) {
      console.error(`[gif] ${dir}: frame ${i} missing (${error})`)
    }
  }

  const out = { textures, delays }
  cache.set(dir, out)
  return out
}

export default function GifBackground({
  dir,
  opacity = 1,
}: {
  /** folder under assets/, as produced by gen-frames.py */
  dir: string
  opacity?: number
}) {
  const picture = new Gtk.Picture({
    contentFit: Gtk.ContentFit.COVER,
    canShrink: true,
    // never eat a click meant for the widget in front of it
    canTarget: false,
  })
  picture.set_opacity(opacity)

  const { textures, delays } = load(dir)
  let frame = 0
  let timer = 0

  function stop() {
    if (timer) {
      GLib.source_remove(timer)
      timer = 0
    }
  }

  function tick(): boolean {
    if (!textures.length) return GLib.SOURCE_REMOVE

    picture.set_paintable(textures[frame])
    frame = (frame + 1) % textures.length

    // centiseconds -> ms, floored so a malformed 0 cannot spin the main loop
    const wait = Math.max(20, (delays[frame] ?? 10) * 10)
    timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, wait, tick)
    return GLib.SOURCE_REMOVE
  }

  picture.connect("map", () => {
    if (!timer) tick()
  })
  picture.connect("unmap", stop)
  picture.connect("destroy", stop)

  return picture
}
