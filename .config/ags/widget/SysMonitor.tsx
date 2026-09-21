import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"

import {
  cpuLabel,
  diskLabel,
  diskPercent,
  memLabel,
  memPercent,
} from "../state/sysinfo"
import { cpuHistory, cpuUsage } from "../state/sysinfo"
import { desktopIsEmpty } from "../state/system"
import {
  thermalCaption,
  thermalLoad,
  thermalReadout,
} from "../state/thermal"
import CpuCrystal from "./CpuCrystal"
import Dial from "./Dial"
import MemMesh from "./MemMesh"
import Sparkline from "./Sparkline"

/**
 * Nerd Font glyphs, all from ranges the font has carried across major
 * versions — the Material Design block moved wholesale once already, so these
 * are worth pinning rather than picking by eye from a cheatsheet.
 */
const ICON = {
  cpu: "\u{f4bc}", // oct-cpu
  mem: "\u{f035b}", // mdi-memory
  temp: "\u{f2c9}", // fa-thermometer-half
  disk: "\u{f02ca}", // mdi-harddisk
}

export default function SysMonitor(gdkmonitor: Gdk.Monitor) {
  const { BOTTOM, RIGHT } = Astal.WindowAnchor

  return (
    <window
      // shows itself only on a bare workspace, and hides the moment a window
      // opens there — no toggling required
      visible={desktopIsEmpty}
      name="sysmon"
      class="sysmon"
      gdkmonitor={gdkmonitor}
      anchor={BOTTOM | RIGHT}
      marginBottom={12}
      marginRight={12}
      exclusivity={Astal.Exclusivity.IGNORE}
      // TOP rather than BACKGROUND so the iceberg can be grabbed and spun.
      // It costs nothing visually: the window already hides itself the moment
      // anything opens on the workspace, so there is never a window for it to
      // sit on top of.
      layer={Astal.Layer.TOP}
      // still NONE — pointer input does not need keyboard focus, and a
      // wallpaper widget that steals the keyboard is a bug
      keymode={Astal.Keymode.NONE}
      application={app}
    >
      <box orientation={Gtk.Orientation.VERTICAL} cssName="chassis" widthRequest={340}>
        <box orientation={Gtk.Orientation.VERTICAL} cssName="screenHousing">
          <box cssName="graphPlate" orientation={Gtk.Orientation.VERTICAL}>
            <box>
              <label cssName="meterIcon" label={ICON.cpu} />
              <label cssName="sectionLabel" label="CPU" xalign={0} hexpand />
              <label cssName="sectionValue" label={cpuLabel} xalign={1} />
            </box>
            {/* the crystal reads the instant, the sparkline the last minute —
                one answers "how hard is it working", the other "is it
                climbing", and neither substitutes for the other */}
            <box spacing={8}>
              <CpuCrystal value={cpuUsage} size={86} />
              <box orientation={Gtk.Orientation.VERTICAL} valign={Gtk.Align.CENTER} hexpand>
                <Sparkline values={cpuHistory} height={54} />
              </box>
            </box>
          </box>

          <label cssName="sectionCaption" label="MEMORY BY PROCESS" xalign={0} />

          <box cssName="graphPlate">
            <MemMesh height={188} />
          </box>
        </box>

        {/* side by side rather than stacked: three of the same instrument
            invite comparison, and a column of bars does not */}
        <box cssName="meterPlate" spacing={4} homogeneous heightRequest={104}>
          <Dial icon={ICON.mem} label="MEM" value={memPercent} caption={memLabel} />
          {/* was SWAP, which reads a permanent zero on a machine with none
              configured — a gauge that cannot move is worse than no gauge */}
          <Dial
            icon={ICON.temp}
            label="TEMP"
            value={thermalLoad}
            readout={thermalReadout}
            caption={thermalCaption}
          />
          <Dial icon={ICON.disk} label="DISK" value={diskPercent} caption={diskLabel} />
        </box>
      </box>
    </window>
  )
}
