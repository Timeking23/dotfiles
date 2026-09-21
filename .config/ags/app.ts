/**
 * Entry point.
 *
 * Every window is constructed here, once per connected monitor. There is no
 * router and no window manager of our own: a window either shows itself
 * (`visible` bound to some state) or is toggled by name from the bar.
 *
 * The order below is paint order for anything that overlaps, so Osd goes last.
 *
 * New to this config? Read README.md -- it explains Accessors, the state/widget
 * split, and how the hand-drawn instruments work, in about ten minutes.
 */
import app from "ags/gtk4/app"
import style from "./style.scss"
import Bar from "./widget/Bar"
import Sidebar from "./widget/Sidebar"
import FloatingPanel from "./widget/FloatingPanel"
import player from "./widget/player"
import SysMonitor from "./widget/SysMonitor"
import Calendar from "./widget/Calendar"
import Osd from "./widget/Osd"
import SidebarPanel from "./widget/SidebarPanel"
import FsHud from "./widget/FsHud"
import Playspace from "./widget/Playspace"
import { toggleSidebar } from "./widget/Sidebar"
import { togglePlayspace } from "./state/playspace"

app.start({
  css: style,

  /**
   * External control, for keybinds: `ags request -i ags <name>`.
   *
   * Bound surfaces cannot be driven with `ags toggle`. Their visibility is a
   * binding to state, so toggling the window directly is immediately overridden
   * by the accessor -- and even where it sticks it skips the open/close logic,
   * which is where the cursor gets placed and where the close ANIMATION is
   * played before the window is dropped. Going through the same functions the
   * on-screen buttons use means a keybind behaves identically to a click.
   */
  //  argv is a string ARRAY, not a string -- `ags request -i ags playspace`
  //  arrives as ["playspace"]. Calling .trim() on it throws, `respond` is then
  //  never reached, and the CLI sits there waiting for an answer that is never
  //  coming: the request appears to hang rather than to fail.
  requestHandler(argv: string[], respond: (response: string) => void) {
    //  Always respond, on every path including the failure one. `ags request`
    //  blocks until it gets an answer, so a handler that throws before
    //  responding does not surface as an error -- the CLI just hangs forever.
    try {
      const name = (argv[0] ?? "").trim()

      if (name === "playspace") togglePlayspace()
      else if (name === "sidebar") toggleSidebar()
      else return respond(`unknown request: ${name}`)

      respond("ok")
    } catch (error) {
      respond(`error: ${error}`)
    }
  },

  main() {
    // One set of windows per monitor. Each constructor takes the Gdk.Monitor so
    // its layer-shell surface is anchored to that screen rather than whichever
    // one the compositor happens to consider primary.
    for (const monitor of app.get_monitors()) {
      Bar(monitor)
      Sidebar(monitor)
      SidebarPanel(monitor)
      FloatingPanel(monitor)
      player(monitor)
      SysMonitor(monitor)
      FsHud(monitor)
      Playspace(monitor)
      Calendar(monitor)
      Osd(monitor)
    }
  },
})
