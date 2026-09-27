import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import GLib from "gi://GLib?version=2.0"

import { weatherCondition, weatherGlyph, weatherLabel } from "../state/weather"
import { positionLabel } from "../state/wallpaper"
import { activePanel, togglePanel, type PanelKey } from "../state/panel"
import { profileGlyph, profileShort } from "../state/profile"

/**
 * The drawer is a picture of three empty frames; this hangs one key in each.
 *
 * A key carries only its own state. Click it and the real panel opens in the
 * centre of the screen -- see widget/SidebarPanel.tsx. It used to open as a
 * popover beside the key, which never worked: a popover on a layer-shell
 * surface is clipped to that surface, and a 312px drawer has no room to the
 * right of itself, so every panel was drawn into nothing.
 */

/**
 * The frame mats, as fractions of the artwork's height.
 *
 * Measured off assets/sidebar-frames.jpeg by finding the run of near-black rows
 * inside each frame's own x span -- a naive scan for dark bands picks up the
 * dark backdrop as well and puts these out by up to 13% of the drawer.
 *
 * The picture is painted on the window with `background-size: 100% 100%`, so it
 * stretches to whatever the drawer actually is and these fractions hold.
 */
/**
 * How tall the artwork is, in drawer-heights.
 *
 * The column scrolls: each photo page is given one drawer-height, so it keeps
 * the stretched-vertical look it had on its own. Squeezing them into a single
 * drawer height instead would halve every frame.
 *
 * No longer a whole number, because the lace divider between the two pages is
 * a 238px strip rather than a full page -- stretching that banner over a whole
 * drawer-height would blow it up about 10x. The stack is assembled as CSS
 * layers in style/_sidebar.scss (JPEG cannot carry the divider's alpha):
 *
 *   sidebar-1.jpeg   1200px
 *   lace band         154px   <- the only part given its own room
 *   sidebar-2.jpeg   1200px
 *   -----------------------
 *                    2554px  =  2554/1200 drawer-heights
 *
 * The divider is 238px tall, not 154px: the bow's tails overlap page 2 rather
 * than reserving space, so they are deliberately NOT counted here.
 *
 * Changing the artwork means updating this, the three layer percentages in
 * _sidebar.scss, and MATS below -- all three are fractions of the same stack.
 */
const PAGES = 2554 / 1200

type Mat = { top: number; bottom: number; left: number; right: number }

// Nudge by hand -- they are plain fractions of the artwork, 0 = top/left.
// Overlapping the surrounding flowers and butterflies is fine; keys draw over.
//
// These were measured off the old 2400px two-page collage and rescaled for the
// divider: every mat below the first page slid down by the 154px gap, and all
// of them were then re-divided by 2554 instead of 2400. Rescale from those
// original 2400-based numbers, never from the values below, or the rounding
// compounds. measure-mats.py works on a single stacked file, so re-running it
// means appending the sources to a scratch image first.
//
// All five stay even though only two are occupied now: they describe the
// ARTWORK, which still has five painted frames, not the keys hung in them. An
// empty one is simply a picture of an empty frame. To move a key, change the
// index it is given to hold() below -- never renumber these.
const MATS: Array<Mat> = [
  { top: 0.115, bottom: 0.223, left: 0.565, right: 0.923 }, // right          <- WEATHER
  { top: 0.226, bottom: 0.319, left: 0.020, right: 0.327 }, // left
  { top: 0.348, bottom: 0.442, left: 0.500, right: 0.883 }, // right          <- WALLPAPER
  { top: 0.579, bottom: 0.729, left: 0.057, right: 0.528 }, // left  (sidebar2)
  { top: 0.807, bottom: 0.960, left: 0.438, right: 0.833 }, // right (sidebar2)
]

/**
 * A key hung in one of the painted frames.
 *
 * The face is built like a bar plate, because that is the deck's one casing
 * language: textured metal, a raised bevel, violet only where something is
 * engaged. Three things stacked on it --
 *
 *   glyph    a Nerd Font glyph, NOT a themed `iconName`. state/status.ts spells
 *            out why: an icon name resolves against whatever icon theme happens
 *            to be installed and renders nothing at all when it misses, whereas
 *            the font is already a hard dependency of every label on the bar.
 *            This is what the weather key was getting wrong.
 *   title    the name, in the bar's letter-spaced caps
 *   readout  the live value, on a sunken LCD chip -- so a key reports its state
 *            with its panel shut, rather than only naming what it opens
 *
 * The key holding the open panel goes sunken and violet, the same way the
 * focused workspace reads on the bar.
 */
function FrameKey({
  title,
  kind,
  panel,
  glyph,
  readout,
  tooltip,
  onOpen,
}: {
  title: string
  /** modifier class, for anything this key wants to look like on its own */
  kind: string
  /** which page of the centre window this opens */
  panel: PanelKey
  /** Nerd Font glyph -- live, so the weather key changes with the sky */
  glyph: any
  /** the live value on the LCD chip */
  readout: any
  tooltip?: any
  onOpen?: () => void
}) {
  const cls = activePanel((open) =>
    open === panel ? `frameKey ${kind} engaged` : `frameKey ${kind}`,
  )

  return (
    <button
      class={cls}
      valign={Gtk.Align.FILL}
      halign={Gtk.Align.FILL}
      vexpand
      hexpand
      tooltipText={tooltip ?? `Open ${title.toLowerCase()}`}
      onClicked={() => {
        onOpen?.()
        togglePanel(panel)
      }}
    >
      {/* A box in a box.
          
          The OUTER one expands to fill the button, which is what makes its
          border visible: without vexpand/hexpand it shrinks to the three labels
          and the inner frame draws as a small rectangle floating in the middle
          of the picture instead of tracing the key.
          
          The INNER one stays centred, because the button is stretched to its
          painted mat and that is a good deal taller than the labels on it. */}
      <box
        cssName="frameKeyFrame"
        valign={Gtk.Align.FILL}
        halign={Gtk.Align.FILL}
        vexpand
        hexpand
      >
        <box
          orientation={Gtk.Orientation.VERTICAL}
          cssName="frameKeyFace"
          valign={Gtk.Align.CENTER}
          halign={Gtk.Align.FILL}
          vexpand
          hexpand
          spacing={3}
        >
          <label cssName="frameKeyGlyph" label={glyph} />
          <label cssName="frameKeyText" label={title} />
          <label cssName="frameKeyRead" label={readout} />
        </box>
      </box>
    </button>
  )
}

/**
 * How long the drawer takes to come in or go out, in milliseconds.
 *
 * Must match the two keyframes in style/_animations.scss.
 *
 * The travel is a CSS `transform`, NOT a GtkRevealer. A revealer's slide works
 * by animating the child's ALLOCATION, and a ScrolledWindow is perfectly happy
 * to be narrow -- so instead of the drawer being clipped as it left, it was
 * re-laid-out smaller every frame and the artwork squashed horizontally. It
 * stretched shut rather than sliding shut. A transform moves rendered pixels
 * and never touches layout, so there is nothing for GTK to reflow.
 */
const SLIDE_MS = 260

/** One per monitor, so the bar button can drive them all. */
const drawers: Array<{ window: Gtk.Window }> = []

/**
 * Open or shut the drawer, with motion in both directions.
 *
 * Shutting has to hold the window alive until the slide has finished, which is
 * the whole reason this is not `app.toggle_window("sidebar")` any more: a CSS
 * animation only plays on the way IN, since an unmapped widget is simply gone.
 * So closing sets a class, waits out the keyframe, and only then hides.
 *
 * Opening needs no such help -- `drawerIn` plays when the drawer is mapped,
 * which means `ags toggle sidebar` from a keybind still gets the animation.
 */
export function toggleSidebar() {
  for (const { window } of drawers) {
    if (!window.visible) {
      window.remove_css_class("closing")
      window.visible = true
      continue
    }

    window.add_css_class("closing")
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, SLIDE_MS + 20, () => {
      window.visible = false
      window.remove_css_class("closing")
      return GLib.SOURCE_REMOVE
    })
  }
}

export default function Sidebar(gdkmonitor: Gdk.Monitor) {
  const { TOP, LEFT, BOTTOM } = Astal.WindowAnchor
  let registered = false

  const keys: Array<Gtk.Widget> = []
  let canvas: Gtk.Overlay | null = null

  /**
   * Put each key on its frame.
   *
   * Measured against the column's OWN height, read after allocation, not the
   * monitor's. The bar holds an exclusive zone, so a drawer anchored top and
   * bottom is shorter than the screen -- about 37px here -- and using the
   * monitor height slid every key down by that much.
   */
  function layout(column: Gtk.Widget, viewportHeight: number, width: number) {
    // the collage is PAGES drawer-heights tall; mat fractions are of the whole
    const height = viewportHeight * PAGES
    if (height <= 0 || width <= 0) return

    column.set_size_request(-1, Math.round(height))

    MATS.forEach((mat, i) => {
      const key = keys[i]
      if (!key) return

      // Absolute placement from the container's edges. These are overlay
      // children, not box children: in a vertical box margin_top stacks from
      // the previous sibling, so the keys had to be declared in mat order and
      // adding one out of sequence silently threw every later key off.
      key.set_margin_top(Math.round(mat.top * height))
      key.set_margin_start(Math.round(mat.left * width))
      key.set_margin_end(Math.round((1 - mat.right) * width))
      key.set_margin_bottom(0)

      key.set_size_request(-1, Math.round((mat.bottom - mat.top) * height))
    })
  }

  function hold(index: number) {
    return (self: Gtk.Widget) => {
      keys[index] = self
    }
  }

  return (
    <window
      visible={false}
      name="sidebar"
      class="Sidebar"
      gdkmonitor={gdkmonitor}
      anchor={LEFT | TOP | BOTTOM}
      // NORMAL, not EXCLUSIVE: this is an overlay drawer that starts hidden, and
      // an exclusive layer surface with no size is what wedges Hyprland.
      exclusivity={Astal.Exclusivity.NORMAL}
      layer={Astal.Layer.OVERLAY}
      keymode={Astal.Keymode.ON_DEMAND}
      application={app}
      widthRequest={312}
      $={(self: Gtk.Window) => {
        //  Registered HERE, at construction -- not from the "map" handler.
        //  The drawer starts hidden and only maps when it is opened, so
        //  registering on map meant the list was still empty the first time the
        //  bar button was pressed: nothing to toggle, and the sidebar could
        //  never be opened at all.
        if (!registered) {
          drawers.push({ window: self })
          registered = true
        }
      }}
    >
      {/* Box in a box, around the whole drawer.
          
          The outer `sidebarFrame` and the inner `dossierScroll` are both
          STATIC -- they are the viewport, not the content. The artwork stack
          (sidebar-1 + lace + sidebar-2, appended) scrolls INSIDE them, so the
          two borders stay put around the drawer instead of scrolling away with
          the pictures, which is what would happen if the frame were on
          `dossier`. Both expand, or they collapse to the artwork's size and no
          border is visible down the sides. */}
      <box cssName="sidebarFrame" vexpand hexpand>
      <scrolledwindow
        cssName="dossierScroll"
        hscrollbarPolicy={Gtk.PolicyType.NEVER}
        vscrollbarPolicy={Gtk.PolicyType.AUTOMATIC}
        vexpand
        $={(self: Gtk.ScrolledWindow) => {
          // GTK4 dropped the size-allocate signal, and get_height() is still 0
          // on the first idle after `map` -- mapped but not yet allocated. So
          // poll briefly and stop once it has a size; a single idle silently
          // left every key stacked at the top.
          self.connect("map", () => {
            let tries = 0
            let lastWidth = -1

            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 40, () => {
              tries += 1
              const h = self.get_height()
              const w = self.get_width()

              //  Wait for the width to STOP changing, not merely to be
              //  non-zero. A transform-based slide does not resize anything, so
              //  this is belt-and-braces now -- but the keys are placed from
              //  measured fractions of the drawer, and one early reading puts
              //  every one of them in the wrong place for the whole session.
              const settled = w > 0 && w === lastWidth
              lastWidth = w

              if (h > 0 && settled && canvas) {
                layout(canvas, h, w)
                return GLib.SOURCE_REMOVE
              }
              return tries < 40 ? GLib.SOURCE_CONTINUE : GLib.SOURCE_REMOVE
            })
          })
        }}
      >
      <overlay
        cssName="dossier"
        $={(self: Gtk.Overlay) => {
          canvas = self
          // the overlay needs a main child to take its width from
          self.set_child(new Gtk.Box({ hexpand: true }))
        }}
      >
        {/* declared in mat order -- these are overlay children placed from the
            container's edges, so the order is not load-bearing, but reading the
            file top-to-bottom should match reading the drawer top-to-bottom */}
        <box $type="overlay" valign={Gtk.Align.START} $={hold(0)} halign={Gtk.Align.FILL}>
          <FrameKey
            title="WEATHER"
            kind="keyWeather"
            panel="weather"
            // the live condition, as the same glyph family the bar uses for
            // network and bluetooth -- the key reports the sky, not just its name
            glyph={weatherGlyph}
            readout={weatherLabel}
            tooltip={weatherCondition((c) => `Weather · ${c.toLowerCase()}`)}
          />
        </box>

        <box $type="overlay" valign={Gtk.Align.START} $={hold(1)} halign={Gtk.Align.FILL}>
          <FrameKey
            title="POWER"
            kind="keyPower"
            panel="power"
            // the tier's own glyph, so the key changes shape with the profile
            // rather than only changing the word on the chip below it
            glyph={profileGlyph}
            readout={profileShort}
            tooltip="Platform profile and fan curve"
          />
        </box>

        <box $type="overlay" valign={Gtk.Align.START} $={hold(2)} halign={Gtk.Align.FILL}>
          <FrameKey
            title="WALLPAPER"
            kind="keyWallpaper"
            panel="wallpaper"
            glyph={"\u{f03e}"} // nf-fa-image
            // where you are in the set, without opening the carousel
            readout={positionLabel}
            tooltip="Wallpaper Engine scenes"
          />
        </box>

      </overlay>
      </scrolledwindow>
      </box>
    </window>
  )
}
