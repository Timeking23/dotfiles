import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import Quickshell.Services.Pipewire
import Quickshell.Services.Mpris

ShellRoot {
    id: shell
    readonly property string home: Quickshell.env("HOME")
    readonly property string aero: home + "/.config/hyper-aero"
    property string primaryName: ""

    PwObjectTracker {
        objects: [Pipewire.defaultAudioSink]
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
        readonly property bool editing: false
        readonly property bool night: true
        property bool covered: false
        readonly property bool fx: !covered && bat.state !== "DISCHARGING"
        property var cpu: ({ load: 0, ghz: 0, temp: 0, watts: 0 })
        property var gpu: ({ state: "--", load: 0, mhz: 0, temp: 0, watts: 0, vram: 0, vramMax: 0 })
        property var fans: ({ cpu: 0, gpu: 0, mid: 0, profile: "--" })
        property var mem: ({ pct: 0, used: 0, total: 0 })
        property var bat: ({ pct: 0, state: "" })
        property var topTabs: []
        property var apps: []
        property var cpuHist: []
        property var gpuHist: []
        property var bars: []
        property real clock: 0
        signal step(int dir)
        readonly property var sink: Pipewire.defaultAudioSink
        readonly property var player: pickPlayer(Mpris.players.values)

        readonly property var pal: ({
            shadow: "#00000000", card0: "#d8061a24", card1: "#d8051520", card2: "#e0041018", card3: "#e8030c12",
            cardBorder: "#3fd0e0", sheen: "#22ffffff", ink: "#f2f6e8", muted: "#8fb6bb", dim: "#4c6c72",
            accent: "#ffd94a", glow: "#3fe6d0", hover: "#3346e0d0", sep: "#2f6d78", field: "#a0020a10",
            fieldBorder: "#2f6d78", fill0: "#ff5f8a", fill1: "#e0245e", fill2: "#a00f3e", bad: "#ff4a5a", ok: "#4af08a",
            tray0: "#f0071c26", tray1: "#f0061620", tray2: "#f0051118", tray3: "#f0040d13", trayBorder: "#3fd0e0"
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

        function push(hist, v) {
            var h = hist.slice(-119)
            h.push(v)
            return h
        }

        function focusWin(addr) {
            if (addr) Quickshell.execDetached(["hyprctl", "dispatch", "hl.dsp.focus({ window = 'address:" + addr + "' })"])
        }

        function launch(id) {
            var e = DesktopEntries.byId(id)
            if (!e) return
            if (e.runInTerminal) Quickshell.execDetached(["ghostty", "-e"].concat(Array.prototype.slice.call(e.command)))
            else e.execute()
        }

        function openApp(a) {
            if (a.open && a.addr) focusWin(a.addr)
            else if (!a.open) launch(a.id)
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
                    hub.fans = d.fans
                    hub.mem = d.mem
                    hub.bat = d.bat
                    hub.topTabs = d.top
                    hub.apps = d.apps
                    hub.covered = d.covered
                    hub.cpuHist = hub.push(hub.cpuHist, d.cpu.load)
                    hub.gpuHist = hub.push(hub.gpuHist, d.gpu.load)
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
        running: !!(hub.player && hub.player.isPlaying) && !hub.covered && !hub.hidden
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

    Variants {
        model: Quickshell.screens

        PanelWindow {
            id: win
            required property var modelData
            readonly property bool primary: shell.primaryName.length ? modelData.name === shell.primaryName
                                                                     : Quickshell.screens[0] === modelData
            screen: modelData
            color: "#041820"
            anchors {
                top: true
                bottom: true
                left: true
                right: true
            }
            exclusionMode: ExclusionMode.Ignore
            WlrLayershell.namespace: "status-desktop"
            WlrLayershell.layer: WlrLayer.Bottom
            WlrLayershell.keyboardFocus: WlrKeyboardFocus.OnDemand

            Gallery {
                anchors.fill: parent
                visible: !win.primary
                paused: hub.covered || !visible
                clock: hub.clock
            }

            Deck {
                visible: win.primary
                core: hub
                readonly property real fit: Math.min(win.width / 1600, win.height / 1000)
                x: Math.round((win.width - 1600 * fit) / 2)
                y: Math.round((win.height - 1000 * fit) / 2)
                width: 1600
                height: 1000
                scale: fit
                transformOrigin: Item.TopLeft
            }
        }
    }

    IpcHandler {
        target: "status"

        function toggle(): void {
            hub.hidden = !hub.hidden
        }

        function next(): void {
            hub.step(1)
        }
    }
}
