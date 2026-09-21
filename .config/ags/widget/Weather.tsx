import { Gtk } from "ags/gtk4"
import { For, type Accessor } from "ags"

import CityMesh from "./CityMesh"
import { date } from "../state/system"
import {
  feelsLikeOnly,
  forecast,
  sunset,
  visibility,
  weatherCondition,
  weatherHumidity,
  windDirection,
  windSpeed,
  type ForecastCell,
} from "../state/weather"

/**
 * The weather panel.
 *
 * Built around one instrument rather than around a picture. WeatherMesh plots
 * the whole week as a spinnable holographic terrain and pulls the headline
 * figures out to the margin on leader lines -- the same language the memory
 * mesh on the desktop uses, so the two read as parts of one machine.
 *
 * Everything below the stage is caption: the readings the surface does not
 * already encode, and the week's figures under the surface that plots them.
 *
 * WHAT WAS HERE BEFORE, and why it went:
 *
 *   - A photographic hero. It was a picture of some weather, once, and every
 *     band under it had to be translucent for it to show, which is what made
 *     the numbers muddy.
 *   - A thermometer, four tiles and a big LCD figure. All of it was saying the
 *     temperature a fourth time; the terrain's height IS the temperature, and
 *     the NOW leader line carries the digits.
 */

/** One figure on the rail. Deliberately plain -- the stage is the feature. */
function Readout({
  label,
  value,
  index,
}: {
  label: string
  value: Accessor<string>
  index: number
}) {
  return (
    <box
      orientation={Gtk.Orientation.VERTICAL}
      cssName="wxCell"
      spacing={2}
      // staggers the rail in as the panel opens. Inline because GTK4 CSS has no
      // :nth-child(N) to hang a per-item delay off -- only even/odd/first/last.
      css={`animation-delay: ${60 + index * 35}ms;`}
    >
      <label cssName="wxCellLabel" label={label} />
      <label cssName="wxCellValue" label={value} />
    </box>
  )
}

/** One forecast day, under the column that plots it. */
function Cell(cell: ForecastCell, index: number) {
  return (
    <box
      orientation={Gtk.Orientation.VERTICAL}
      class={index === 0 ? "today" : ""}
      cssName="wxDay"
      spacing={2}
      css={`animation-delay: ${280 + index * 45}ms;`}
    >
      <label cssName="wxDayName" label={cell.label} />
      <label cssName="wxDayGlyph" label={cell.glyph} />
      <box spacing={5} halign={Gtk.Align.CENTER}>
        <label cssName="wxDayHigh" label={cell.high} />
        <label cssName="wxDayLow" label={cell.low} />
      </box>
    </box>
  )
}

export default function Weather() {
  return (
    <box
      orientation={Gtk.Orientation.VERTICAL}
      cssName="wxPanel"
      widthRequest={560}
      halign={Gtk.Align.CENTER}
      valign={Gtk.Align.START}
    >
      {/* ---- the instrument. This IS the panel; the rest is caption. ---- */}
      <box cssName="wxStage" orientation={Gtk.Orientation.VERTICAL}>
        <box cssName="wxStageHead" spacing={8}>
          <label cssName="wxStageTag" label="CITY MODEL" xalign={0} />
          <box hexpand />
          <label cssName="wxStageNote" label={date} xalign={1} />
        </box>

        {/* The place. The five-day figures live in the strip at the bottom --
            there used to be a second hologram here plotting the same forecast,
            which was simply the same information drawn twice. */}
        <CityMesh height={300} />

        <box cssName="wxStageFoot" spacing={8}>
          <label cssName="wxStageNote" label="drag to rotate" xalign={0} hexpand />
          <label cssName="wxStageTag" label={weatherCondition} xalign={1} />
        </box>
      </box>

      {/* ---- readings the surface does not already encode ---- */}
      <box cssName="wxRail" spacing={1} homogeneous>
        <Readout index={0} label="FEELS" value={feelsLikeOnly} />
        <Readout index={1} label="WIND" value={windSpeed} />
        <Readout index={2} label="DIR" value={windDirection} />
        <Readout index={3} label="HUM" value={weatherHumidity} />
        <Readout index={4} label="VIS" value={visibility} />
        <Readout index={5} label="SUNSET" value={sunset} />
      </box>

      {/* ---- the week, as figures under the surface that plots it ---- */}
      <box cssName="wxForecast" spacing={4} homogeneous>
        <For each={forecast}>
          {(cell: ForecastCell, index) => Cell(cell, index.peek())}
        </For>
      </box>
    </box>
  )
}
