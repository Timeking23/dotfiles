import QtQuick
import Quickshell
import Quickshell.Hyprland
import Quickshell.Wayland

// Top bar: blossom menu + roman-numeral workspaces | window title | status + time.
Item {
    id: bar
    property var core
    property string screenName: ""
    readonly property var pal: core.pal
    readonly property var roman: ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"]
    readonly property int active: Hyprland.focusedMonitor && Hyprland.focusedMonitor.activeWorkspace ? Hyprland.focusedMonitor.activeWorkspace.id : 1
    readonly property var used: {
        var out = {}
        var ws = Hyprland.workspaces.values
        for (var i = 0; i < ws.length; i++) {
            if (ws[i].id > 0 && ws[i].toplevels && ws[i].toplevels.values.length) out[ws[i].id] = true
        }
        return out
    }
    readonly property var shownWs: {
        var top = 5
        for (var k in used) top = Math.max(top, parseInt(k))
        top = Math.max(top, active)
        var out = []
        for (var i = 1; i <= Math.min(10, top); i++) out.push(i)
        return out
    }
    readonly property var audio: core.sink ? core.sink.audio : null

    // Fog behind the bar, fading down into the wallpaper
    Rectangle {
        anchors.fill: parent
        gradient: Gradient {
            GradientStop { position: 0; color: "#d0080708" }
            GradientStop { position: 0.75; color: "#70080708" }
            GradientStop { position: 1; color: "#00080708" }
        }
    }
    Rectangle {
        x: 0; y: 33
        width: parent.width; height: 1
        gradient: Gradient {
            orientation: Gradient.Horizontal
            GradientStop { position: 0; color: "#00ffffff" }
            GradientStop { position: 0.5; color: "#30ffffff" }
            GradientStop { position: 1; color: "#00ffffff" }
        }
    }

    // ── Left
    Row {
        x: 18
        height: 34
        spacing: 18
        Text {
            anchors.verticalCenter: parent.verticalCenter
            text: "✿"
            font.pixelSize: 19
            color: menu.containsMouse ? bar.pal.ink : bar.pal.petal
            MouseArea {
                id: menu
                anchors.fill: parent
                anchors.margins: -6
                hoverEnabled: true
                cursorShape: Qt.PointingHandCursor
                onClicked: bar.core.run("codex.sh")
            }
        }
        Row {
            anchors.verticalCenter: parent.verticalCenter
            spacing: 4
            Repeater {
                model: bar.shownWs
                delegate: Item {
                    id: ws
                    required property int modelData
                    readonly property bool on: bar.active === modelData
                    readonly property bool busy: !!bar.used[modelData]
                    width: Math.max(26, num.implicitWidth + 12); height: 30
                    Text {
                        id: num
                        anchors.centerIn: parent
                        anchors.verticalCenterOffset: -2
                        text: bar.roman[ws.modelData]
                        font.family: bar.pal.serif
                        font.pixelSize: ws.on ? 20 : 17
                        font.weight: ws.on ? Font.Bold : Font.Normal
                        font.italic: !ws.on
                        color: ws.on ? bar.pal.petal : (ws.busy ? bar.pal.ink : bar.pal.dim)
                        Behavior on color { ColorAnimation { duration: 200 } }
                    }
                    Rectangle {
                        anchors.horizontalCenter: parent.horizontalCenter
                        y: 26
                        width: ws.on ? 14 : (ws.busy ? 3 : 0); height: ws.on ? 1 : 3
                        radius: ws.on ? 0 : 1.5
                        color: ws.on ? bar.pal.petal : bar.pal.muted
                        Behavior on width { NumberAnimation { duration: 200; easing.type: Easing.OutCubic } }
                    }
                    MouseArea {
                        anchors.fill: parent
                        cursorShape: Qt.PointingHandCursor
                        onClicked: bar.core.hypr("hl.dsp.focus({ workspace = " + ws.modelData + " })")
                        onWheel: function(e) { bar.core.hypr("hl.dsp.focus({ workspace = \"" + (e.angleDelta.y > 0 ? "e-1" : "e+1") + "\" })") }
                    }
                }
            }
        }
    }

    // ── Centre: what has focus
    Text {
        anchors.horizontalCenter: parent.horizontalCenter
        y: 6
        width: Math.min(implicitWidth, parent.width * 0.4)
        elide: Text.ElideMiddle
        horizontalAlignment: Text.AlignHCenter
        text: {
            var t = ToplevelManager.activeToplevel
            return t && t.title ? t.title.toLowerCase() : "— silent bloom —"
        }
        font.family: bar.pal.serif; font.italic: true; font.pixelSize: 17
        color: bar.pal.muted
    }

    // ── Right
    Row {
        anchors.right: parent.right
        anchors.rightMargin: 18
        height: 34
        spacing: 22

        component Stat: Item {
            id: st
            property string glyph
            property string value
            property bool warn: false
            signal clicked()
            signal wheel(real dy)
            anchors.verticalCenter: parent.verticalCenter
            implicitWidth: stRow.implicitWidth
            height: 30
            Row {
                id: stRow
                anchors.verticalCenter: parent.verticalCenter
                spacing: 7
                Text {
                    anchors.verticalCenter: parent.verticalCenter
                    text: st.glyph
                    font.family: "JetBrainsMono Nerd Font"; font.pixelSize: 14
                    color: st.warn ? bar.pal.hot : bar.pal.petal
                }
                Text {
                    anchors.verticalCenter: parent.verticalCenter
                    visible: st.value.length > 0
                    text: st.value
                    font.family: bar.pal.mono; font.pixelSize: 11; font.letterSpacing: 1.5
                    color: stArea.containsMouse ? bar.pal.ink : bar.pal.muted
                }
            }
            MouseArea {
                id: stArea
                anchors.fill: parent
                hoverEnabled: true
                cursorShape: Qt.PointingHandCursor
                onClicked: st.clicked()
                onWheel: function(e) { st.wheel(e.angleDelta.y) }
            }
        }

        // Fan profile, as on the old waybar: click cycles quiet -> eco -> perf.
        Stat {
            readonly property string p: String(bar.core.fans.profile).toLowerCase()
            readonly property int rpm: Math.max(bar.core.fans.cpu || 0, bar.core.fans.gpu || 0)
            glyph: "\u{F0210}"
            value: (p === "balanced" ? "eco" : p === "performance" ? "perf" : p) + (rpm > 0 ? " " + Math.round(rpm / 100) / 10 + "k" : "")
            warn: p === "performance"
            onClicked: bar.core.run("fan-mode.sh", ["next"])
        }
        Stat {
            glyph: bar.core.ssid.length ? "\u{F05A9}" : "\u{F05AA}"
            value: bar.core.ssid.length ? bar.core.ssid.toLowerCase() : "offline"
            warn: !bar.core.ssid.length
            onClicked: bar.core.run("wifi-menu.sh")
        }
        Stat {
            readonly property real v: bar.audio ? bar.audio.volume : 0
            readonly property bool mute: bar.audio ? bar.audio.muted : true
            glyph: mute ? "\u{F075F}" : (v > 0.5 ? "\u{F057E}" : "\u{F0580}")
            value: mute ? "muted" : Math.round(v * 100) + "%"
            onClicked: if (bar.audio) bar.audio.muted = !bar.audio.muted
            onWheel: function(dy) {
                if (!bar.audio) return
                bar.audio.muted = false
                bar.audio.volume = Math.max(0, Math.min(1, bar.audio.volume + (dy > 0 ? 0.05 : -0.05)))
            }
        }
        Stat {
            readonly property int p: bar.core.bat.pct
            readonly property bool charging: bar.core.bat.state === "CHARGING" || bar.core.bat.state === "FULL"
            glyph: charging ? "\u{F0084}" : (p > 80 ? "\u{F0079}" : p > 50 ? "\u{F007F}" : p > 20 ? "\u{F007C}" : "\u{F007A}")
            value: p + "%"
            warn: !charging && p <= 20
        }
        // Wallpapers: click opens the picker, scroll steps through them (the still image is
        // one stop in the loop). Shows the current wallpaper's name.
        Stat {
            readonly property string name: bar.core.wallTitle.length ? bar.core.wallTitle.toLowerCase() : "bloom"
            glyph: "\u{F02E9}"
            value: name.length > 18 ? name.slice(0, 17) + "…" : name
            onClicked: bar.core.openPicker()
            onWheel: function(dy) { bar.core.run("live-wall.sh", [dy > 0 ? "prev" : "next"]) }
        }
        Stat {
            glyph: "\u{F009A}"
            value: ""
            onClicked: Quickshell.execDetached(["swaync-client", "-t", "-sw"])
        }
        Text {
            anchors.verticalCenter: parent.verticalCenter
            text: Qt.formatTime(bar.core.now, "HH:mm")
            font.family: bar.pal.serif; font.weight: Font.Bold; font.pixelSize: 19
            color: bar.pal.ink
        }
        Text {
            anchors.verticalCenter: parent.verticalCenter
            text: "\u{F0425}"
            font.family: "JetBrainsMono Nerd Font"; font.pixelSize: 15
            color: pw.containsMouse ? bar.pal.hot : bar.pal.muted
            MouseArea {
                id: pw
                anchors.fill: parent
                anchors.margins: -6
                hoverEnabled: true
                cursorShape: Qt.PointingHandCursor
                onClicked: bar.core.run("power-menu.sh")
            }
        }
    }
}
