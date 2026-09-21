import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"

import { fsRootLabel, fsSummary } from "../state/filetree"
import { desktopIsEmpty } from "../state/system"
import FileGraph from "./FileGraph"

/**
 * Desktop HUD, sharing the player/sysmon chassis but with the metal taken off
 * (see .fsgraph in style.scss). Anchored bottom-left so it sits opposite
 * SysMonitor rather than fighting it for the same corner.
 */
export default function FsHud(gdkmonitor: Gdk.Monitor) {
  const { BOTTOM, LEFT } = Astal.WindowAnchor

  return (
    <window
      visible={desktopIsEmpty}
      name="fsgraph"
      class="fsgraph"
      gdkmonitor={gdkmonitor}
      anchor={BOTTOM | LEFT}
      marginBottom={12}
      marginLeft={12}
      exclusivity={Astal.Exclusivity.IGNORE}
      // TOP rather than BACKGROUND so the zoom keys, hover and scroll actually
      // get pointer events. It costs nothing visually: the window already hides
      // itself the moment anything opens on the workspace, so there is never a
      // window for it to sit on top of.
      layer={Astal.Layer.TOP}
      // still NONE — pointer input does not need keyboard focus, and a
      // wallpaper widget that steals the keyboard is a bug
      keymode={Astal.Keymode.NONE}
      application={app}
    >
      <box orientation={Gtk.Orientation.VERTICAL} cssName="chassis" widthRequest={360}>
        <box cssName="headerPlate">
          <label cssName="headerTitle" label="FS" xalign={0} />
          <label cssName="headerPath" label={fsRootLabel} xalign={0} hexpand />
          <label cssName="headerStatus" label={fsSummary} xalign={1} />
        </box>

        <box cssName="graphPlate">
          <FileGraph height={300} />
        </box>
      </box>
    </window>
  )
}
