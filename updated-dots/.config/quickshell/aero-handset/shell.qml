import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import Quickshell.Hyprland

// Handset: when Firefox opens, a Y2K slider phone rises, slides open and powers on, and
// the browser window is floated into the phone's screen. The phone is drawn on the
// Bottom layer, so the Firefox window (above it) shows through the transparent screen
// hole and other windows still cover the phone. See handset.sh to turn it on/off.
ShellRoot {
    id: root

    // Source art (assets/source.png) is 736x1308 with a 578x718 screen at 80,212. Firefox
    // won't go narrower than ~500 px, so the *-wide.png assets stretch plain strips of the
    // body by 151 px: 887x1308 with a 729x718 screen.
    // Upright flip phone, 740x1640 art with the 644x860 screen at 48,96. It is scaled so
    // the lid (screen half, ~1060 tall) fills the height; the keypad runs off the bottom.
    readonly property int artW: 740
    readonly property int artH: 2040
    readonly property int lidH: 1064
    readonly property rect hole: Qt.rect(48, 96, 644, 860)
    readonly property int sliderY: 1131
    readonly property int barH: 38

    property string addr: ""          // managed Firefox window, "0x..."
    property string mon: ""           // monitor it is on
    property bool onScreen: false     // its workspace is the visible one, not fullscreen
    property point at: Qt.point(0, 0) // window position, monitor-local logical px
    property string phase: "off"      // off | opening | on | closing

    function scaleFor(h, w) {
        return (h - barH - 20) / lidH
    }

    function sh(cmds) {
        Quickshell.execDetached(["sh", "-c", cmds.map(function(c) { return "hyprctl dispatch \"" + c + "\" >/dev/null" }).join("; ")])
    }
    function prop(p, v) { return "hl.dsp.window.set_prop({ prop = '" + p + "', value = '" + v + "', window = 'address:" + addr + "' })" }
    function win(fn, args) { return "hl.dsp.window." + fn + "({ " + (args ? args + ", " : "") + "window = 'address:" + addr + "' })" }

    // Place the window into the phone's screen for a monitor of the given geometry.
    function place(m) {
        var lw = m.width / m.scale, lh = m.height / m.scale
        var s = scaleFor(lh, lw)
        var px = Math.round((lw - artW * s) / 2)
        var py = Math.round(barH + 10)
        var hx = Math.round(px + hole.x * s), hy = Math.round(py + hole.y * s)
        var hw = Math.round(hole.width * s), hh = Math.round(hole.height * s)
        sh([win("float", "action = 'enable'"),
            win("resize", "x = " + hw + ", y = " + hh),
            win("move", "x = " + (m.x + hx) + ", y = " + (m.y + hy)),
            prop("border_size", "0"), prop("rounding", "0"), prop("no_shadow", "1"),
            win("tag", "tag = 'handset'")])
        at = Qt.point(hx, hy)
        mon = m.name
    }

    function adopt(a, firstOpen) {
        if (addr.length || !enabled) return
        addr = a
        // Hide it until the screen powers on.
        sh([prop("opacity", "0")])
        phase = "opening"
        pendingPlace = true
        poll.running = true
    }

    function release(restore) {
        if (!addr.length) return
        if (restore) sh([prop("opacity", "1"), prop("opacity_inactive", "unset"), prop("opacity_override", "unset"),
                         prop("opacity_inactive_override", "unset"), prop("border_size", "unset"), prop("rounding", "unset"),
                         prop("no_shadow", "unset"), win("tag", "tag = '-handset'")])
        addr = ""
        onScreen = false
    }

    property bool pendingPlace: false
    // Another floating window has focus: drop the phone to the Bottom layer so that
    // window isn't covered. (A tiled window never sits over the floating browser.)
    property bool yield_: false

    function focusBrowser() {
        if (addr.length) Quickshell.execDetached(["hyprctl", "dispatch", "hl.dsp.focus({ window = 'address:" + addr + "' })"])
    }

    property bool enabled: false

    FileView {
        path: Quickshell.env("HOME") + "/.config/hyper-aero/handset/enabled"
        watchChanges: true
        printErrors: false
        onFileChanged: reload()
        onLoaded: root.enabled = true
        onLoadFailed: root.enabled = false
    }

    // Window state: re-read on Hyprland events, and every 700 ms while managed so
    // the phone can follow the window when it is dragged.
    Process {
        id: poll
        command: ["sh", "-c", "printf '{\"c\":'; hyprctl -j clients; printf ',\"m\":'; hyprctl -j monitors; printf '}'"]
        stdout: StdioCollector {
            onStreamFinished: {
                var d
                try { d = JSON.parse(text) } catch (e) { return }
                if (!root.addr.length) return
                var c = d.c.filter(function(x) { return x.address === root.addr })[0]
                if (!c) return
                var m = d.m.filter(function(x) { return x.id === c.monitor })[0]
                if (!m) return
                if (root.pendingPlace) {
                    root.pendingPlace = false
                    root.place(m)
                    root.focusBrowser()
                    root.onScreen = true
                    return
                }
                if (!c.floating && root.phase === "on") {
                    // Tiled again (Super+V): let it go back to being a normal window.
                    root.release(true)
                    root.phase = "off"
                    return
                }
                root.mon = m.name
                var f = d.c.filter(function(x) { return x.focusHistoryID === 0 })[0]
                root.yield_ = !!f && f.address !== root.addr && f.floating
                var s = root.scaleFor(m.height / m.scale, m.width / m.scale)
                var want = Qt.size(Math.round(root.hole.width * s), Math.round(root.hole.height * s))
                if (root.phase === "on" && (Math.abs(c.size[0] - want.width) > 2 || Math.abs(c.size[1] - want.height) > 2))
                    root.sh([root.win("resize", "x = " + want.width + ", y = " + want.height)])
                root.at = Qt.point(c.at[0] - m.x, c.at[1] - m.y)
                root.onScreen = c.workspace.id === m.activeWorkspace.id && !c.fullscreen
                                && !(m.specialWorkspace && m.specialWorkspace.name)
            }
        }
    }
    Timer {
        interval: 700
        repeat: true
        running: root.addr.length > 0
        onTriggered: poll.running = true
    }

    Connections {
        target: Hyprland
        function onRawEvent(ev) {
            var n = ev.name
            if (n === "openwindow") {
                var p = ev.data.split(",")
                if (p[2] === "firefox" && (p.slice(3).join(",").indexOf("Picture-in-Picture") < 0))
                    root.adopt("0x" + p[0], true)
            } else if (n === "closewindow") {
                if ("0x" + ev.data === root.addr) {
                    root.addr = ""
                    if (root.phase !== "off") root.phase = "closing"
                }
            } else if (root.addr.length && ["activewindowv2", "workspace", "workspacev2", "focusedmon", "movewindow", "movewindowv2",
                                             "fullscreen", "changefloatingmode", "activespecial"].indexOf(n) >= 0) {
                poll.running = true
            }
        }
    }

    IpcHandler {
        target: "handset"

        // Wrap the focused (or any) Firefox window that is already open.
        function adopt(): void {
            if (root.addr.length) return
            var list = Hyprland.toplevels.values
            var pick = ""
            for (var i = 0; i < list.length; i++) {
                var o = list[i].lastIpcObject
                if (o && o.class === "firefox") {
                    if (list[i].activated || !pick.length) pick = "0x" + list[i].address
                }
            }
            if (pick.length) root.adopt(pick, false)
        }
        function release(): void {
            root.release(true)
            root.phase = "off"
        }
        function replay(): void {
            if (root.phase === "on") root.phase = "opening"
        }
        function state(): string {
            return root.phase + " " + root.addr + " " + root.mon + " visible=" + root.onScreen
        }
    }

    Variants {
        model: Quickshell.screens

        Scope {
            id: perScreen
            required property var modelData
            readonly property bool mine: root.mon === modelData.name || (!root.mon.length && Quickshell.screens[0] === modelData)
            readonly property bool animating: root.phase === "opening" || root.phase === "closing"
            readonly property bool shown: mine && !root.pendingPlace && (animating || (root.phase === "on" && root.onScreen))

            Frame {
                screen: perScreen.modelData
                core: root
                topLayer: true
                wanted: perScreen.shown && (perScreen.animating || !root.yield_)
            }
            Frame {
                screen: perScreen.modelData
                core: root
                topLayer: false
                wanted: perScreen.shown && !perScreen.animating && root.yield_
            }
        }
    }
}
