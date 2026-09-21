import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import { For } from "ags"
import AstalHyprland from "gi://AstalHyprland"

import { title } from "../state/media"
import { setCalendarPinned } from "./Calendar"
import Tray from "./Tray"
import Palette from "./Palette"
import {
  btClass,
  btIcon,
  btTooltip,
  netClass,
  netIcon,
  netTooltip,
} from "../state/status"
import {
  batteryClass,
  batteryIcon,
  batteryLabel,
  batteryTooltip,
  focusedWorkspace,
  time,
  workspaces,
} from "../state/system"
import { toggleSidebar } from "./Sidebar"

function Music() {
  return (
    <button class="music" onClicked={() => app.toggle_window("player")}>
      <label label={title} />
    </button>
  )
}

function Workspaces() {
  return (
    <box>
      <For each={workspaces((all) => all.slice().sort((a, b) => a.id - b.id))}>
        {(ws: AstalHyprland.Workspace) => (
          <button
            class={focusedWorkspace((focused) => (focused?.id === ws.id ? "focused" : ""))}
            onClicked={() => ws.focus()}
          >
            <label label={`${ws.id}`} />
          </button>
        )}
      </For>
    </box>
  )
}

/** Network and bluetooth at a glance; the detail lives in the tooltip. */
function Status() {
  return (
    <box spacing={7}>
      <label class={netClass} label={netIcon} tooltipText={netTooltip} />
      <label class={btClass} label={btIcon} tooltipText={btTooltip} />
    </box>
  )
}

function Battery() {
  return (
    <box class={batteryClass} spacing={4} tooltipText={batteryTooltip}>
      <image iconName={batteryIcon} />
      <label label={batteryLabel} />
    </box>
  )
}

export default function Bar(gdkmonitor: Gdk.Monitor) {
  const { TOP, LEFT, RIGHT } = Astal.WindowAnchor

  return (
    <window
      visible
      name="bar"
      class="Bar"
      gdkmonitor={gdkmonitor}
      exclusivity={Astal.Exclusivity.EXCLUSIVE}
      anchor={TOP | LEFT | RIGHT}
      application={app}
    >
      <centerbox cssName="centerbox">
        <box $type="start" spacing={6} halign={Gtk.Align.START}>
          <button
            tooltipText="Say hello ryona"
            onClicked={() => toggleSidebar()}
            label="ryona"
          />
          <Workspaces />
        </box>

        <box $type="center" halign={Gtk.Align.CENTER}>
          <Music />
        </box>

        <box $type="end" spacing={6} halign={Gtk.Align.END}>
          <Palette />
          <Tray />
          <Status />
          {/* the clock is the obvious place to hang a calendar off */}
          <button
            tooltipText="Calendar and notes"
            onClicked={() => setCalendarPinned((open) => !open)}
          >
            <label label={time} />
          </button>
          <button onClicked={() => app.toggle_window("floating")}>
            <Battery />
          </button>
        </box>
      </centerbox>
    </window>
  )
}
