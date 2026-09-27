import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import { onCleanup } from "ags"

import PowerProfile from "./PowerProfile"
import WallCarousel from "./WallCarousel"
import Weather from "./Weather"
import { activePanel, closePanel, openPanel, panelOpen, type PanelKey } from "../state/panel"

/**
 * The one window every sidebar panel opens into.
 *
 * The panels used to be popovers hanging off their key, and were never once
 * visible: a GTK popover on a Wayland layer-shell surface is clipped to that
 * surface, and these opened to the RIGHT of a 312px drawer. Everything the keys
 * were meant to show -- the weather rows, the log, the wallpaper picker -- was
 * being drawn into a region that does not exist.
 *
 * Centred on the screen instead, which is also simply the better place for it:
 * the carousel wants 300px cards and the drawer could never have held one.
 *
 * Keymode.EXCLUSIVE, not ON_DEMAND: the carousel is driven with the arrow keys
 * and Escape has to close this from anywhere. It is safe here in a way it would
 * not be on the drawer -- this window only exists while a panel is open, and
 * both Escape and a click on the scrim dismiss it.
 */

const TITLES: Record<PanelKey, string> = {
  weather: "WEATHER",
  wallpaper: "WALLPAPER",
  power: "POWER PROFILE",
}

/**
 * Pages that want the flat casing instead of the brushed-steel one.
 *
 * The case is shared, so this is a class on the shell rather than a second
 * window: `power` is a settings page, and the bevels that make the weather
 * instrument read as hardware make a list of three choices read as a control
 * panel from 1998. See `.SidePanel panelCase.flat` in style/_power.scss.
 */
const FLAT: ReadonlySet<PanelKey> = new Set<PanelKey>(["power"])

export default function SidebarPanel(gdkmonitor: Gdk.Monitor) {
  const { TOP, LEFT, RIGHT, BOTTOM } = Astal.WindowAnchor

  /**
   * Built imperatively: a Gtk.Stack keys its pages by name, and wiring that
   * through JSX children is more indirection than just adding them.
   *
   * Both are built once, at startup, and kept. They are cheap to hold and the
   * alternative -- building on open -- costs a visible hitch on the wallpaper
   * page, which decodes eleven previews.
   */
  const stack = new Gtk.Stack({
    transition_type: Gtk.StackTransitionType.CROSSFADE,
    transition_duration: 120,
    // A Gtk.Stack is homogeneous by default: every page is sized to the largest
    // of them. The cover flow asks for 860x470, so left alone the weather panel
    // opened as a mostly-empty plate that size.
    hhomogeneous: false,
    vhomogeneous: false,
  })

  stack.add_named((<Weather />) as Gtk.Widget, "weather")
  stack.add_named((<WallCarousel />) as Gtk.Widget, "wallpaper")
  stack.add_named((<PowerProfile />) as Gtk.Widget, "power")

  /**
   * The scrim is set with set_child, not passed as a JSX child.
   *
   * AGS routes every <overlay> child through vfunc_add_child, which makes them
   * all overlay children and leaves the Overlay with no main child at all. An
   * Overlay sizes itself from its main child, so the result is a surface that
   * maps at full screen and paints nothing -- which is exactly what this did on
   * the first attempt. Same trap the popovers had.
   */
  const scrim = (
    <box
      cssName="panelScrim"
      hexpand
      vexpand
      $={(self: Gtk.Box) => {
        const click = new Gtk.GestureClick()
        click.connect("released", () => closePanel())
        self.add_controller(click)
      }}
    />
  ) as Gtk.Widget

  const shell = (
    <box
      cssName="panelCase"
      orientation={Gtk.Orientation.VERTICAL}
      halign={Gtk.Align.CENTER}
      valign={Gtk.Align.CENTER}
      spacing={9}
      $={(self: Gtk.Box) => {
        self.append(
          (
            <box cssName="panelHead" spacing={0}>
              {/* accent tick: gives the head a colour cue without colouring
                  the title itself, which would compete with the readouts */}
              <box cssName="panelTick" />
              <label
                cssName="panelTitle"
                label={activePanel((key) => (key ? TITLES[key] : ""))}
                xalign={0}
                hexpand
              />
              <button
                class="panelClose"
                tooltipText="Close (Esc)"
                onClicked={() => closePanel()}
              >
                <label label="×" />
              </button>
            </box>
          ) as Gtk.Widget,
        )
        self.append(stack)

        // the affordance the source material shows too -- a modal you dismiss
        // with a key needs to say so, since there is no title bar to imply it
        self.append(
          (
            <label
              cssName="panelHint"
              label="click outside · × · esc to close"
              xalign={0}
            />
          ) as Gtk.Widget,
        )
      }}
    />
  ) as Gtk.Widget

  const overlay = new Gtk.Overlay()
  overlay.set_child(scrim)
  overlay.add_overlay(shell)

  return (
    <window
      visible={panelOpen}
      name="sidepanel"
      class="SidePanel"
      gdkmonitor={gdkmonitor}
      anchor={TOP | LEFT | RIGHT | BOTTOM}
      exclusivity={Astal.Exclusivity.IGNORE}
      layer={Astal.Layer.OVERLAY}
      keymode={Astal.Keymode.EXCLUSIVE}
      application={app}
      $={(self: Gtk.Window) => {
        const keys = new Gtk.EventControllerKey()
        keys.connect("key-pressed", (_c, keyval: number) => {
          if (keyval === Gdk.KEY_Escape) {
            closePanel()
            return true
          }
          return false
        })
        self.add_controller(keys)

        const drop = activePanel.subscribe(() => {
          const key = activePanel.peek()
          if (key) stack.set_visible_child_name(key)

          //  Swapped on the shell, not on the window: the scrim is a sibling
          //  of the case and should stay exactly as it is on every page.
          //  Left alone on close -- `key` is null then, and stripping the
          //  class mid-fade would re-bevel the case while it is still on
          //  screen.
          if (key) {
            if (FLAT.has(key)) shell.add_css_class("flat")
            else shell.remove_css_class("flat")
          }
        })

        /**
         * `visible` is driven by panelOpen, but the window can also be hidden
         * from outside -- `ags toggle sidepanel`, or the compositor. Without
         * this the state would still say "wallpaper is open" while nothing was
         * on screen, and the next click on that key would toggle it *shut*
         * instead of opening it.
         */
        self.connect("notify::visible", () => {
          const showing = self.get_visible()
          const key = activePanel.peek()

          if (!showing && key) closePanel()
          else if (showing && !key) openPanel("weather")
        })

        onCleanup(drop)
      }}
    >
      {overlay as any}
    </window>
  )
}
