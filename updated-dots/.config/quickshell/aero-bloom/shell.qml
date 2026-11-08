import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import Quickshell.Services.Pipewire
import Quickshell.Services.Mpris
import Quickshell.Hyprland

// Bloom: a fog-and-blossom desktop built around wallpapers/bloom.png.
// Desktop layer (wallpaper, fog, petals, widgets) + a top bar per screen.
ShellRoot {
    id: shell
    readonly property string home: Quickshell.env("HOME")
    readonly property string aero: home + "/.config/hyper-aero"
    property string primaryName: ""

    PwObjectTracker {
        objects: [Pipewire.defaultAudioSink]
    }

    // live-wall.sh writes this while a Wallpaper Engine wallpaper is on:
    //   "video <path>"  Bloom plays the video itself as its backdrop
    //   "scene"         linux-wallpaperengine draws below; Bloom goes transparent
    FileView {
        path: shell.aero + "/livewall/mode"
        watchChanges: true
        printErrors: false
        onFileChanged: reload()
        onLoaded: {
            var t = text().trim()
            hub.video = t.indexOf("video ") === 0 ? t.slice(6) : ""
            hub.live = t === "scene"
        }
        onLoadFailed: { hub.video = ""; hub.live = false }
    }

    FileView {
        path: shell.aero + "/livewall/palette.json"
        watchChanges: true
        printErrors: false
        onFileChanged: reload()
        onLoaded: {
            try { hub.wallPal = JSON.parse(text()) } catch (e) { hub.wallPal = null }
        }
        onLoadFailed: hub.wallPal = null
    }

    FileView {
        path: shell.aero + "/livewall/still"
        watchChanges: true
        printErrors: false
        onFileChanged: reload()
        onLoaded: hub.still = text().trim()
        onLoadFailed: hub.still = ""
    }

    FileView {
        path: shell.aero + "/livewall/title"
        watchChanges: true
        printErrors: false
        onFileChanged: reload()
        onLoaded: hub.wallTitle = text().trim()
        onLoadFailed: hub.wallTitle = ""
    }

    FileView {
        path: (Quickshell.env("XDG_RUNTIME_DIR") || "/tmp") + "/aero-primary"
        watchChanges: true
        printErrors: false
        blockLoading: true
        onFileChanged: reload()
        onLoaded: shell.primaryName = text().trim()
    }

    Item {
        id: hub
        property var now: new Date()
        property bool hidden: false
        property bool covered: false
        property bool live: false
        property string video: ""
        property string wallTitle: ""
        // A still image picked in the wallpaper picker; empty = bloom.png
        property string still: ""
        // Animations stop while a window covers the desktop or on battery.
        readonly property bool fx: !covered && !hidden && bat.state !== "DISCHARGING"
        property real clock: 0
        property var cpu: ({ load: 0, ghz: 0, temp: 0, watts: 0 })
        property var gpu: ({ state: "--", load: 0, mhz: 0, temp: 0, watts: 0, vram: 0, vramMax: 0 })
        property var mem: ({ pct: 0, used: 0, total: 0 })
        property var bat: ({ pct: 0, state: "" })
        property var fans: ({ cpu: 0, gpu: 0, mid: 0, profile: "--" })
        property var apps: []
        property var bars: []
        property var weather: ({ ok: false })
        property string ssid: ""
        property int signal: 0
        readonly property var sink: Pipewire.defaultAudioSink
        readonly property var player: pickPlayer(Mpris.players.values)

        // Accent from the current wallpaper (live-wall.sh -> wall-palette.py); Bloom's
        // own pink when there is none.
        property var wallPal: null
        readonly property var pal: ({
            ink: "#ece8e6", muted: "#a59fa2", dim: "#5f5a5d", faint: "#2effffff",
            petal: wallPal ? wallPal.accent : "#efc3cf", petalDeep: wallPal ? wallPal.deep : "#c9899c",
            // Warning colour: hot pink with Bloom's own palette, ember orange otherwise.
            hot: wallPal ? "#ff9f6e" : "#ff8aa5",
            glass: "#5a0c0b0d", edge: "#26ffffff",
            serif: "Cormorant Garamond", mono: "IBM Plex Mono", black: "UnifrakturMaguntia"
        })

        function pickPlayer(list) {
            var first = null
            for (var i = 0; i < list.length; i++) {
                if (!list[i]) continue
                if (list[i].isPlaying) return list[i]
                if (!first) first = list[i]
            }
            return first
        }

        function hypr(cmd) {
            Quickshell.execDetached(["hyprctl", "dispatch", cmd])
        }

        function focusWin(addr) {
            if (addr) hypr("hl.dsp.focus({ window = 'address:" + addr + "' })")
        }

        function launch(id) {
            var e = DesktopEntries.byId(id)
            if (!e) return
            if (e.runInTerminal) Quickshell.execDetached(["ghostty", "-e"].concat(Array.prototype.slice.call(e.command)))
            else e.execute()
        }

        function openPicker() {
            if (picker.shown) picker.hide()
            else picker.show()
        }

        function run(script, args) {
            Quickshell.execDetached([shell.aero + "/scripts/" + script].concat(args || []))
        }
    }

    Timer {
        interval: 1000
        repeat: true
        running: true
        triggeredOnStart: true
        onTriggered: hub.now = new Date()
    }

    Timer {
        interval: 33
        repeat: true
        running: hub.fx
        onTriggered: hub.clock += 0.033
    }

    // Hyprland maps a layer that appears over a fullscreen window hidden (alpha 0) and
    // never fades it back in, which leaves its default wallpaper showing. So the desktop
    // window is only created once the focused workspace has no fullscreen window.
    property bool deskReady: false
    Process {
        id: fsCheck
        command: ["hyprctl", "-j", "activeworkspace"]
        stdout: StdioCollector {
            onStreamFinished: {
                try {
                    if (!JSON.parse(text).hasfullscreen) shell.deskReady = true
                } catch (e) {
                    shell.deskReady = true
                }
            }
        }
    }
    Component.onCompleted: fsCheck.running = true
    Connections {
        target: Hyprland
        enabled: !shell.deskReady
        function onRawEvent(ev) {
            if (["workspace", "workspacev2", "fullscreen", "focusedmon", "closewindow"].indexOf(ev.name) >= 0)
                fsCheck.running = true
        }
    }

    // Freeze a scene wallpaper while windows cover the desktop, resume when it shows.
    Connections {
        target: hub
        function onCoveredChanged() { if (hub.live) hub.run("live-wall.sh", [hub.covered ? "pause" : "resume"]) }
        function onLiveChanged() { if (hub.live && hub.covered) hub.run("live-wall.sh", ["pause"]) }
    }

    Process {
        id: feed
        command: [shell.aero + "/scripts/status-feed.py"]
        running: true
        stdout: SplitParser {
            onRead: function(line) {
                try {
                    var d = JSON.parse(line)
                    hub.cpu = d.cpu
                    hub.gpu = d.gpu
                    hub.mem = d.mem
                    hub.bat = d.bat
                    hub.fans = d.fans
                    hub.apps = d.apps
                    hub.covered = d.covered
                } catch (err) {
                }
            }
        }
        onExited: feedRestart.restart()
    }

    Timer {
        id: feedRestart
        interval: 5000
        onTriggered: feed.running = true
    }

    Process {
        command: ["cava", "-p", shell.aero + "/desk/cava-desk.conf"]
        running: !!(hub.player && hub.player.isPlaying) && hub.fx
        stdout: SplitParser {
            onRead: function(line) {
                var parts = line.split(";")
                var out = []
                for (var i = 0; i < parts.length; i++) {
                    if (parts[i].length) out.push(Math.min(1, parseInt(parts[i]) / 100))
                }
                hub.bars = out
            }
        }
        onRunningChanged: if (!running) hub.bars = []
    }

    // Weather every 20 min, wifi every 15 s.
    Process {
        id: weatherProc
        command: [shell.aero + "/scripts/desk-weather.sh"]
        stdout: StdioCollector {
            onStreamFinished: {
                try {
                    var w = JSON.parse(text)
                    if (w.ok) hub.weather = w
                } catch (err) {
                }
            }
        }
    }
    Timer {
        interval: 20 * 60 * 1000
        repeat: true
        running: true
        triggeredOnStart: true
        onTriggered: weatherProc.running = true
    }

    Process {
        id: wifiProc
        command: ["nmcli", "-t", "-f", "ACTIVE,SSID,SIGNAL", "dev", "wifi"]
        stdout: StdioCollector {
            onStreamFinished: {
                var lines = text.split("\n")
                hub.ssid = ""
                hub.signal = 0
                for (var i = 0; i < lines.length; i++) {
                    var p = lines[i].split(":")
                    if (p[0] === "yes") {
                        hub.ssid = p.slice(1, p.length - 1).join(":")
                        hub.signal = parseInt(p[p.length - 1]) || 0
                    }
                }
            }
        }
    }
    Timer {
        interval: 15000
        repeat: true
        running: true
        triggeredOnStart: true
        onTriggered: wifiProc.running = true
    }

    Variants {
        model: Quickshell.screens

        Scope {
            id: perScreen
            required property var modelData
            readonly property bool primary: shell.primaryName.length ? modelData.name === shell.primaryName
                                                                     : Quickshell.screens[0] === modelData

            PanelWindow {
                id: desk
                screen: perScreen.modelData
                visible: shell.deskReady
                // Always transparent: an opaque window colour makes Qt mark the whole surface
                // opaque, and Hyprland then stops sending frame callbacks to the scene
                // wallpaper underneath, so it never draws. The dark fill lives inside instead.
                color: "transparent"

                Rectangle {
                    anchors.fill: parent
                    visible: !hub.live
                    color: "#0b0a0b"
                }
                anchors {
                    top: true
                    bottom: true
                    left: true
                    right: true
                }
                exclusionMode: ExclusionMode.Ignore
                WlrLayershell.namespace: "bloom-desktop"
                WlrLayershell.layer: WlrLayer.Bottom
                WlrLayershell.keyboardFocus: WlrKeyboardFocus.None

                Backdrop {
                    id: backdrop
                    anchors.fill: parent
                    core: hub
                    visible: !hub.live
                }

                Petals {
                    anchors.fill: parent
                    core: hub
                    visible: !hub.hidden
                }

                Desk {
                    visible: perScreen.primary && !hub.hidden
                    core: hub
                    wall: backdrop.wall
                    readonly property real fit: Math.min(desk.width / 1600, desk.height / 1000)
                    x: Math.round((desk.width - 1600 * fit) / 2)
                    y: Math.round((desk.height - 1000 * fit) / 2)
                    width: 1600
                    height: 1000
                    scale: fit
                    transformOrigin: Item.TopLeft
                }
            }

            PanelWindow {
                screen: perScreen.modelData
                color: "transparent"
                anchors {
                    top: true
                    left: true
                    right: true
                }
                implicitHeight: 38
                exclusiveZone: 34
                WlrLayershell.namespace: "bloom-bar"
                WlrLayershell.layer: WlrLayer.Top

                Bar {
                    anchors.fill: parent
                    core: hub
                    screenName: perScreen.modelData.name
                }
            }
        }
    }

    Picker {
        id: picker
        core: hub
    }

    // Keep the Super+D "show/hide desktop" style toggle working.
    IpcHandler {
        target: "status"

        function toggle(): void {
            hub.hidden = !hub.hidden
        }

        // Wallpaper picker (Super+Shift+J)
        function picker(): void {
            hub.openPicker()
        }
    }
}
