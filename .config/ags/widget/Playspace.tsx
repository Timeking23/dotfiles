import Adw from "gi://Adw?version=1"
import Pango from "gi://Pango?version=1.0"
import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import { createMemo, createRoot } from "ags"

import {
  closePlayspace,
  enterPage,
  moveCardTo,
  movePage,
  nextFreeWorkspace,
  pageCursor,
  pages,
  playspaceClosing,
  playspaceOpen,
  setPageTo,
  type Page,
} from "../state/playspace"
import { windowShots } from "../state/wsshots"
import Canvas from "./canvas"

/**
 * The playspace -- every window, one at a time, inside a picture frame.
 *
 *   up / down      page through every application on every workspace
 *   left / right   send the one you are looking at to the previous/next workspace
 *   enter          go to it
 *   escape         back out
 *   scroll / swipe the same as up and down
 *
 * A FEED RATHER THAN A GRID. A grid of ten workspaces makes every tile small
 * enough that the window pictures stop being readable, which defeats having
 * them at all. One window at a time means each one gets the whole frame.
 */

/** Where the frame's opening is, as a fraction of scratch.jpg.
 *
 *  Measured off the image rather than guessed: the carved border is not
 *  symmetric and its dark crevices defeat both a luminance scan and a row
 *  density scan, so these came from cropping candidates and looking at them.
 *  Content is inset by exactly this much, which leaves the carving visible all
 *  the way round and nothing overlapping it. */
const FRAME = { left: 0.115, right: 0.112, top: 0.14, bottom: 0.115 }

const GLYPHS: Array<[match: string, glyph: string]> = [
  ["kitty", "\u{f489}"], ["foot", "\u{f489}"], ["ghostty", "\u{f489}"],
  ["alacritty", "\u{f489}"], ["term", "\u{f489}"],
  ["brave", "\u{f26e}"], ["firefox", "\u{f269}"], ["chrom", "\u{f268}"],
  ["code", "\u{f121}"], ["discord", "\u{f392}"], ["spotify", "\u{f1bc}"],
  ["steam", "\u{f1b6}"], ["thunar", "\u{f07b}"], ["dolphin", "\u{f07b}"],
  ["nautilus", "\u{f07b}"], ["mpv", "\u{f03d}"], ["obs", "\u{f03d}"],
  ["gimp", "\u{f1fc}"], ["blender", "\u{f1fc}"],
]

const UNKNOWN = "\u{f2d0}"

function glyphFor(appClass: string): string {
  const needle = appClass.toLowerCase()
  for (const [match, glyph] of GLYPHS) if (needle.includes(match)) return glyph
  return UNKNOWN
}

function prettyClass(appClass: string): string {
  return appClass.replace(/[-_]+/g, " ").toUpperCase()
}

// ============================
// CHANNEL NUMBER
// ============================
//  The workspace you are on, bottom right, the way a television showed which
//  channel you had just turned to: it appears when the number changes, sits for
//  a moment, and fades.
//
//  DRAWN, NOT TYPED. There is no seven-segment or VCR font on this machine and
//  installing one needs root -- but more to the point, a segment display is not
//  a typeface. It is seven bars that are either lit or not, and the UNLIT ones
//  stay faintly visible. Drawing it gets that for free, and the ghost of the
//  dark segments behind every number is most of what makes it read as a tube
//  rather than as text. It picks up the CRT shader's scanlines like everything
//  else on screen.

/** which bars are lit for each digit, in the usual a-g order */
const SEGMENTS: Record<string, string> = {
  "0": "abcdef", "1": "bc", "2": "abged", "3": "abgcd", "4": "fgbc",
  "5": "afgcd", "6": "afgedc", "7": "abc", "8": "abcdefg", "9": "abcdfg",
}

/** seconds at full brightness, then how long it takes to go */
const HOLD = 1.1
const FADE = 0.7

/**
 * One seven-segment digit.
 *
 * Every bar is drawn, always -- the unlit ones at a fraction of the brightness,
 * which is the dark "8" sitting behind the number.
 */
function drawDigit(
  cr: any, x: number, y: number, w: number, h: number, t: number,
  on: string, alpha: number,
) {
  const half = (h - t) / 2

  const bars: Record<string, [number, number, number, number]> = {
    a: [x + t, y, w - 2 * t, t],
    b: [x + w - t, y + t, t, half - t],
    c: [x + w - t, y + half + t, t, half - t],
    d: [x + t, y + h - t, w - 2 * t, t],
    e: [x, y + half + t, t, half - t],
    f: [x, y + t, t, half - t],
    g: [x + t, y + half, w - 2 * t, t],
  }

  for (const name of Object.keys(bars)) {
    const [bx, by, bw, bh] = bars[name]

    if (on.includes(name)) {
      //  Bloom pass first, wide and faint, so the bar glows into the glass.
      cr.setSourceRGBA(1.0, 0.72, 0.28, 0.18 * alpha)
      cr.rectangle(bx - t * 0.6, by - t * 0.6, bw + t * 1.2, bh + t * 1.2)
      cr.fill()
      cr.setSourceRGBA(1.0, 0.82, 0.45, 0.95 * alpha)
    } else {
      cr.setSourceRGBA(1.0, 0.72, 0.28, 0.07 * alpha)
    }

    cr.rectangle(bx, by, bw, bh)
    cr.fill()
  }
}

function ChannelNumber() {
  const workspace = createMemo(() => pages()[pageCursor()]?.workspaceId ?? 0)

  let shown = -1
  let age = HOLD + FADE // start faded; nothing has changed channel yet

  return (
    <Canvas
      cssName="psChannel"
      widthRequest={230}
      heightRequest={170}
      halign={Gtk.Align.END}
      valign={Gtk.Align.END}
      fps={30}
      watch={[workspace]}
      animate={(dt: number) => {
        age += dt
        return age < HOLD + FADE // repaint only while it is still moving
      }}
      draw={(cr: any, width: number, height: number) => {
        //  peek, not call: reading reactively inside draw would subscribe the
        //  draw itself, which Canvas already handles through `watch`.
        const value = workspace.peek()
        if (value !== shown) {
          shown = value
          age = 0
        }

        const lit = age < HOLD ? 1 : Math.max(0, 1 - (age - HOLD) / FADE)
        if (lit <= 0) return

        const text = String(shown)
        const t = Math.max(3, height * 0.085)
        const dh = height * 0.7
        const dw = dh * 0.56
        const gap = t * 1.4

        const totalW = text.length * dw + (text.length - 1) * gap
        let x = width - totalW - t * 1.5
        const y = (height - dh) / 2

        for (const ch of text) {
          drawDigit(cr, x, y, dw, dh, t, SEGMENTS[ch] ?? "", lit)
          x += dw + gap
        }
      }}
    />
  )
}

/**
 * One window, filling the frame.
 *
 * The picture is allowed to be big here -- that is the whole point of a feed --
 * so unlike the old grid cards it expands rather than being pinned to a
 * thumbnail size.
 */
function PageView({ page }: { page: Page }) {
  const shot = createMemo(() => windowShots()[page.card.address] ?? null)
  const hasShot = createMemo(() => shot() !== null)
  const noShot = createMemo(() => shot() === null)

  return (
    <box cssName="psPage" orientation={Gtk.Orientation.VERTICAL} spacing={10}>
      <box cssName="psPageHead" spacing={10}>
        <label cssName="psPageWs" label={`WS ${page.workspaceId}`} />
        <label cssName="psPageClass" label={prettyClass(page.card.appClass)} hexpand
          halign={Gtk.Align.START} maxWidthChars={40} ellipsize={Pango.EllipsizeMode.END} />
        <label cssName="psPageCount" label={`${page.index + 1} / ${page.total}`} />
      </box>

      <Gtk.Picture
        cssName="psPageShot"
        paintable={shot}
        visible={hasShot}
        contentFit={Gtk.ContentFit.CONTAIN}
        canShrink
        hexpand
        vexpand
      />

      <label cssName="psPageGlyph" label={glyphFor(page.card.appClass)} visible={noShot} vexpand />

      <label cssName="psPageTitle" label={page.card.title} maxWidthChars={60}
        ellipsize={Pango.EllipsizeMode.END} />
    </box>
  )
}

export default function Playspace(gdkmonitor: Gdk.Monitor) {
  const { TOP, LEFT, RIGHT, BOTTOM } = Astal.WindowAnchor

  const boardClass = createMemo(() => (playspaceClosing() ? "closing" : ""))

  /** Guards the two-way sync below from fighting itself. */
  let syncing = false

  return (
    <window
      visible={playspaceOpen}
      name="playspace"
      class="Playspace"
      gdkmonitor={gdkmonitor}
      anchor={TOP | LEFT | RIGHT | BOTTOM}
      exclusivity={Astal.Exclusivity.IGNORE}
      layer={Astal.Layer.OVERLAY}
      keymode={Astal.Keymode.EXCLUSIVE}
      application={app}
      $={(self: Gtk.Window) => {
        const keys = new Gtk.EventControllerKey()
        keys.connect("key-pressed", (_c: unknown, keyval: number) => {
          switch (keyval) {
            case Gdk.KEY_Up:    movePage(-1); return true
            case Gdk.KEY_Down:  movePage(1);  return true
            //  Sideways MOVES the window rather than navigating: in a feed
            //  there is no "next workspace" to look at, but sending the thing
            //  you are looking at somewhere else is exactly what you want.
            case Gdk.KEY_Left:  shift(-1); return true
            case Gdk.KEY_Right: shift(1);  return true
            case Gdk.KEY_Return:
            case Gdk.KEY_KP_Enter: enterPage(); return true
            case Gdk.KEY_Escape: closePlayspace(); return true
          }
          return false
        })
        self.add_controller(keys)

        function shift(delta: number) {
          const current = pages()[pageCursor()]
          if (!current) return
          const target = Math.max(1, Math.min(nextFreeWorkspace(), current.workspaceId + delta))
          moveCardTo(current.card.address, target)
        }
      }}
    >
      {/*  The frame picture itself is the window's background -- stretched to
          whatever the screen is, so it reshapes rather than letterboxing. */}
      <box cssName="psFrame" class={boardClass}>
        {/*  The stage sits in the frame's opening. Margins are computed from the
            MONITOR rather than hardcoded, because GTK4 CSS has no percentage
            margins and the same fractions have to work on any screen. */}
        <overlay
          cssName="psStage"
          hexpand
          vexpand
          $={(self: Gtk.Box) => {
            const geo = gdkmonitor.get_geometry()
            const scale = gdkmonitor.get_scale_factor() || 1
            const w = geo.width / scale
            const h = geo.height / scale

            self.set_margin_start(Math.round(FRAME.left * w))
            self.set_margin_end(Math.round(FRAME.right * w))
            self.set_margin_top(Math.round(FRAME.top * h))
            self.set_margin_bottom(Math.round(FRAME.bottom * h))
          }}
        >
          <Adw.Carousel
            cssName="psFeed"
            orientation={Gtk.Orientation.VERTICAL}
            allowScrollWheel
            interactive
            hexpand
            vexpand
            $={(feed: Adw.Carousel) => {
              let dispose: (() => void) | null = null

              const rebuild = () => {
                dispose?.()
                dispose = null

                let child = feed.get_first_child()
                while (child) {
                  const next = child.get_next_sibling()
                  feed.remove(child)
                  child = next
                }

                createRoot((d) => {
                  dispose = d
                  for (const page of pages()) {
                    feed.append(PageView({ page }) as unknown as Gtk.Widget)
                  }
                })

                //  Put the feed back where the cursor says, since rebuilding
                //  drops it to the first page.
                const at = pageCursor()
                const target = feed.get_nth_page(at)
                if (target) {
                  syncing = true
                  feed.scroll_to(target, false)
                  syncing = false
                }
              }

              rebuild()
              pages.subscribe(rebuild)

              //  Keyboard -> feed.
              pageCursor.subscribe(() => {
                if (syncing) return
                const target = feed.get_nth_page(pageCursor())
                if (!target) return
                syncing = true
                feed.scroll_to(target, true)
                syncing = false
              })

              //  Feed -> keyboard, so a swipe or a scroll wheel moves the same
              //  cursor the arrow keys do and Enter always opens what is on
              //  screen.
              feed.connect("page-changed", (_f: unknown, index: number) => {
                if (syncing) return
                syncing = true
                setPageTo(index)
                syncing = false
              })
            }}
          />

          {/*  Over the feed, bottom right, like a channel number. */}
          <box $type="overlay" halign={Gtk.Align.END} valign={Gtk.Align.END}>
            <ChannelNumber />
          </box>
        </overlay>
      </box>
    </window>
  )
}
