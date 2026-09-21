import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import { execAsync } from "ags/process"
import { type Accessor } from "ags"

import {
  brightness,
  brightnessLabel,
  btLabel,
  btPowered,
  setBrightness,
  setVolume,
  toggleBluetooth,
  toggleMute,
  toggleWifi,
  volume,
  volumeLabel,
  wifiEnabled,
  wifiLabel,
} from "../state/settings"

/**
 * Settings panel: the four things you actually reach for, as two kinds of row.
 *
 * A Toggle is a thing that is on or off and has a status line. A Level is a
 * thing with a continuous value and a slider. Keeping to exactly two row types
 * is what stops a settings panel turning into a pile of one-off widgets -- and
 * it means a new setting is four lines, not a new layout.
 *
 * Each row also has a secondary action on its right: the label button opens the
 * full application for that setting, because a panel this size should not try
 * to be a network manager.
 */

/** on/off, with a status line and an optional "open the real app" button */
function Toggle({
  tag,
  on,
  status,
  onToggle,
  detail,
}: {
  tag: string
  on: Accessor<boolean>
  status: Accessor<string>
  onToggle: () => void
  detail?: () => void
}) {
  return (
    <box cssName="setRow" spacing={8}>
      <button
        class={on((v) => (v ? "setKey on" : "setKey"))}
        tooltipText={`Toggle ${tag.toLowerCase()}`}
        onClicked={onToggle}
      >
        <label label={tag} />
      </button>

      <label cssName="setStatus" label={status} xalign={0} hexpand ellipsize={3} />

      {detail ? (
        <button class="setMore" tooltipText="Open settings" onClicked={detail}>
          <label label="..." />
        </button>
      ) : null}
    </box>
  )
}

/** a continuous value, with its own readout */
function Level({
  tag,
  value,
  readout,
  onSet,
  onTag,
}: {
  tag: string
  value: Accessor<number>
  readout: Accessor<string>
  onSet: (v: number) => void
  onTag?: () => void
}) {
  return (
    <box cssName="setRow" spacing={8}>
      <button class="setKey" onClicked={() => onTag?.()} sensitive={!!onTag}>
        <label label={tag} />
      </button>

      <slider
        hexpand
        min={0}
        max={1}
        value={value}
        // change-value fires only on user input; value-changed would also fire
        // when the binding writes back and loop the two against each other
        onChangeValue={(_self, _scroll, v: number) => {
          onSet(v)
          return false
        }}
      />

      <label cssName="setReadout" label={readout} xalign={1} />
    </box>
  )
}

export default function FloatingPanel(gdkmonitor: Gdk.Monitor) {
  const { TOP, RIGHT } = Astal.WindowAnchor

  return (
    <window
      visible={false} // toggled, starts hidden
      name="floating" // toggle by name
      class="Floating"
      gdkmonitor={gdkmonitor}
      // two adjacent edges only -- adding BOTTOM would stretch this into a
      // full-height right-hand column instead of a floating corner panel
      anchor={TOP | RIGHT}
      marginTop={12}
      marginRight={12}
      exclusivity={Astal.Exclusivity.NORMAL} // overlay, reserve nothing
      layer={Astal.Layer.OVERLAY}
      keymode={Astal.Keymode.ON_DEMAND}
      application={app}
    >
      <box orientation={Gtk.Orientation.VERTICAL} cssName="setShell" widthRequest={286}>
        <box cssName="setHead">
          <label cssName="setTitle" label="SETTINGS" xalign={0} hexpand />
          <button class="setClose" onClicked={() => app.toggle_window("floating")}>
            <label label="x" />
          </button>
        </box>

        <box orientation={Gtk.Orientation.VERTICAL} cssName="setBody">
          <Toggle
            tag="WIFI"
            on={wifiEnabled}
            status={wifiLabel}
            onToggle={toggleWifi}
            detail={() =>
              execAsync("/usr/bin/networkmanager_dmenu").catch(console.error)
            }
          />

          <Toggle
            tag="BT"
            on={btPowered}
            status={btLabel}
            onToggle={toggleBluetooth}
            detail={() => execAsync("/usr/bin/rofi-bluetooth").catch(console.error)}
          />

          <Level
            tag="VOL"
            value={volume}
            readout={volumeLabel}
            onSet={setVolume}
            // the tag doubles as the mute key -- it is already the thing your
            // pointer is next to when you go for the slider
            onTag={toggleMute}
          />

          <Level
            tag="BRI"
            value={brightness}
            readout={brightnessLabel}
            onSet={setBrightness}
          />
        </box>
      </box>
    </window>
  )
}
