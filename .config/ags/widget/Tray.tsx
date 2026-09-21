import AstalTray from "gi://AstalTray"
import { Gtk } from "ags/gtk4"
import { For, createBinding } from "ags"

/**
 * System tray. Nothing was hosting StatusNotifier on this machine — the name
 * was registered activatable with no owner — so AstalTray claims it, and
 * anything that was quietly failing to show an icon starts showing one.
 *
 * Each item carries its own menu as a Gio.MenuModel plus the action group that
 * backs it; the group has to be inserted under the "dbusmenu" prefix, which is
 * what the model's action names are namespaced against.
 */
export default function Tray() {
  const tray = AstalTray.get_default()
  const items = createBinding(tray, "items")

  return (
    <box cssName="tray" spacing={2}>
      <For each={items}>
        {(item: AstalTray.TrayItem) => (
          <menubutton
            class="trayItem"
            tooltipMarkup={createBinding(item, "tooltipMarkup")}
            menuModel={createBinding(item, "menuModel")}
            $={(self: Gtk.MenuButton) => {
              self.insert_action_group("dbusmenu", item.actionGroup)
            }}
          >
            <image gicon={createBinding(item, "gicon")} pixelSize={14} />
          </menubutton>
        )}
      </For>
    </box>
  )
}
