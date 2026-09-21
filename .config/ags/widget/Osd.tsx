import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import { createMemo, type Accessor } from "ags"
import type Cairo from "cairo"

import Canvas from "./canvas"
import { osdKind, osdLevel, osdMuted, osdVisible } from "../state/osd"

/**
 * Volume and backlight readout. Appears on change, leaves on its own.
 *
 * Deliberately not on the load ramp the meters use — neither of these is a
 * load, and colouring a high volume red would say something untrue about it.
 */

const SEGMENTS = 22
const GAP = 2

const ICON = {
  volume: "\u{f028}", // fa-volume-up
  quiet: "\u{f027}", // fa-volume-down
  muted: "\u{f026}", // fa-volume-off
  brightness: "\u{f185}", // fa-sun-o
}

/** A row of segments, lit up to `value`. See ./canvas for the drawing model. */
function Meter({ value }: { value: Accessor<number> }) {
  let level = 0

  function draw(cr: Cairo.Context, width: number, h: number) {
    const cellW = (width - GAP * (SEGMENTS - 1)) / SEGMENTS
    if (cellW <= 0) return // too narrow to show anything

    for (let s = 0; s < SEGMENTS; s++) {
      // measure at the middle of each segment, so a half-lit one reads honestly
      const t = (s + 0.5) / SEGMENTS
      const x = s * (cellW + GAP)
      const lit = t <= level

      // a lit segment gets an oversized wash behind it first; that bleed into
      // the gaps is what makes the row read as glowing rather than just filled
      if (lit) {
        cr.rectangle(x - 1, -1, cellW + 2, h + 2)
        cr.setSourceRGBA(0.72, 0.66, 0.94, 0.18)
        cr.fill()
      }

      cr.rectangle(x, 0, cellW, h)
      cr.setSourceRGBA(0.72, 0.66, 0.94, lit ? 0.95 : 0.14)
      cr.fill()
    }
  }

  return (
    <Canvas
      heightRequest={8}
      hexpand
      draw={draw}
      watch={[value]}
      onChange={() => {
        level = Math.min(1, Math.max(0, value.peek()))
      }}
    />
  )
}

export default function Osd(gdkmonitor: Gdk.Monitor) {
  const { BOTTOM } = Astal.WindowAnchor

  const glyph = createMemo(() => {
    if (osdKind() === "brightness") return ICON.brightness
    if (osdMuted()) return ICON.muted
    return osdLevel() < 0.35 ? ICON.quiet : ICON.volume
  })

  const figure = createMemo(() =>
    osdKind() === "volume" && osdMuted() ? "MUTED" : `${Math.round(osdLevel() * 100)}%`,
  )

  return (
    <window
      visible={osdVisible}
      name="osd"
      class="osd"
      gdkmonitor={gdkmonitor}
      anchor={BOTTOM}
      marginBottom={110}
      exclusivity={Astal.Exclusivity.IGNORE}
      layer={Astal.Layer.OVERLAY}
      // never take focus and never eat a click — it is a readout that happens
      // to be in the way
      keymode={Astal.Keymode.NONE}
      application={app}
    >
      <box cssName="osdDeck" spacing={10} widthRequest={228}>
        <label cssName="osdIcon" label={glyph} />
        <box orientation={Gtk.Orientation.VERTICAL} valign={Gtk.Align.CENTER} hexpand>
          <Meter value={osdLevel} />
        </box>
        <label cssName="osdValue" label={figure} />
      </box>
    </window>
  )
}
