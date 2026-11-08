import QtQuick
import Quickshell.Services.Mpris

// Rusted console frame. Everything sits on the slots painted into skins/rust/frame.png,
// in that image's own 714x705 coordinates, and the whole thing scales to fit.
Item {
    id: w
    property var core
    property var pal
    property string skin: Qt.resolvedUrl("skins/rust/")
    readonly property var p: core ? core.player : null
    readonly property bool playing: !!(p && p.isPlaying)
    readonly property real len: p && p.length > 0 ? p.length : 0
    property real pos: 0
    readonly property real baseW: 714
    readonly property real baseH: 705
    readonly property real k: Math.min(width / baseW, height / baseH)
    readonly property real vol: core ? (core.muted ? 0 : core.volume) : 0

    readonly property color ink: "#f6e2d0"
    readonly property color dimInk: "#c49a80"
    readonly property color lit: "#ffae62"
    readonly property color plate: "#cc1c0c07"
    readonly property color rim: "#a9603a"

    function clock(s) {
        var t = Math.max(0, Math.floor(s))
        return Math.floor(t / 60) + ":" + String(t % 60).padStart(2, "0")
    }

    function cycleLoop() {
        if (!p || !p.loopSupported) return
        if (p.loopState === MprisLoopState.None) p.loopState = MprisLoopState.Playlist
        else if (p.loopState === MprisLoopState.Playlist) p.loopState = MprisLoopState.Track
        else p.loopState = MprisLoopState.None
    }

    component SlotKey: Item {
        id: key
        property string glyph: ""
        property int size: 30
        property bool on: false
        property bool bare: false
        signal clicked()
        Rectangle {
            anchors.fill: parent
            radius: 3
            visible: !key.bare || ma.containsMouse
            color: ma.pressed ? "#e60e0503" : (ma.containsMouse ? "#d9472214" : w.plate)
            border.width: 2
            border.color: key.on || ma.containsMouse ? w.lit : w.rim
        }
        Text {
            anchors.centerIn: parent
            anchors.verticalCenterOffset: ma.pressed ? 1 : 0
            text: key.glyph
            font.family: "JetBrainsMono Nerd Font"
            font.pixelSize: key.size
            color: key.on || ma.containsMouse ? w.lit : w.ink
            style: Text.Outline
            styleColor: "#c0000000"
        }
        MouseArea {
            id: ma
            anchors.fill: parent
            hoverEnabled: true
            cursorShape: Qt.PointingHandCursor
            onClicked: key.clicked()
        }
    }

    Timer {
        interval: 1000
        repeat: true
        running: !!w.p
        triggeredOnStart: true
        onTriggered: {
            if (w.p) {
                w.p.positionChanged()
                w.pos = w.p.position
            }
        }
    }

    Item {
        width: w.baseW
        height: w.baseH
        anchors.centerIn: parent
        scale: w.k

        Image {
            anchors.fill: parent
            source: w.skin + "frame.png"
            mipmap: true
            smooth: true
        }

        // Album art over the picture while music plays
        Item {
            x: 84; y: 56
            width: 559; height: 468
            opacity: w.playing && art.status === Image.Ready ? 1 : 0
            visible: opacity > 0.01
            Behavior on opacity { NumberAnimation { duration: 420; easing.type: Easing.OutCubic } }
            Rectangle {
                anchors.fill: parent
                color: "#d9120704"
            }
            Image {
                id: art
                anchors.horizontalCenter: parent.horizontalCenter
                y: 12
                width: parent.width - 24
                height: parent.height - 52
                source: w.p && w.p.trackArtUrl ? w.p.trackArtUrl : ""
                fillMode: Image.PreserveAspectFit
                asynchronous: true
                cache: false
                smooth: true
                sourceSize: Qt.size(832, 832)
            }
            Rectangle {
                anchors.centerIn: art
                width: art.paintedWidth + 4
                height: art.paintedHeight + 4
                color: "transparent"
                border.width: 2
                border.color: w.rim
            }
        }

        // Title strip, over the header glyphs
        Rectangle {
            x: 74; y: 11
            width: 496; height: 34
            radius: 2
            color: "#f0190b07"
            clip: true
            Text {
                id: marq
                readonly property string full: w.p ? ((w.p.trackArtist ? w.p.trackArtist + " - " : "") + (w.p.trackTitle || String(w.p.identity || ""))) : "NO SIGNAL"
                readonly property real overflow: Math.max(0, implicitWidth - (parent.width - 16))
                property real phase: 0
                anchors.verticalCenter: parent.verticalCenter
                x: 8 - overflow * phase
                text: full
                font.family: "JetBrainsMono Nerd Font Mono"
                font.pixelSize: 22
                color: w.ink
                NumberAnimation on phase {
                    running: marq.overflow > 0
                    from: 0
                    to: 1
                    duration: 14000
                    loops: Animation.Infinite
                    easing.type: Easing.InOutSine
                }
            }
        }

        // Seek, along the foot of the viewport
        Item {
            id: seek
            x: 90; y: 496
            width: 546; height: 24
            readonly property real v: w.len > 0 ? Math.min(1, w.pos / w.len) : 0
            Rectangle {
                anchors.verticalCenter: parent.verticalCenter
                width: parent.width
                height: 10
                radius: 2
                color: w.plate
                border.width: 1
                border.color: w.rim
                Rectangle {
                    x: 2; y: 2
                    width: Math.max(0, (parent.width - 4) * seek.v)
                    height: parent.height - 4
                    color: w.lit
                }
            }
            MouseArea {
                anchors.fill: parent
                cursorShape: Qt.PointingHandCursor
                function jump(mx) {
                    if (!w.p || !w.p.canSeek || w.len <= 0) return
                    var t = Math.max(0, Math.min(1, mx / seek.width)) * w.len
                    w.p.position = t
                    w.pos = t
                }
                onPressed: function(m) { jump(m.x) }
                onPositionChanged: function(m) { if (pressed) jump(m.x) }
            }
        }

        // Left rail: playback modes up top, player and mute below
        SlotKey {
            x: 31; y: 84; width: 35; height: 26
            glyph: "\u{F049D}"; size: 21
            on: !!(w.p && w.p.shuffle)
            onClicked: if (w.p && w.p.shuffleSupported) w.p.shuffle = !w.p.shuffle
        }
        SlotKey {
            x: 31; y: 112; width: 35; height: 26
            glyph: w.p && w.p.loopState === MprisLoopState.Track ? "\u{F0458}" : "\u{F0456}"; size: 21
            on: !!(w.p && w.p.loopState !== MprisLoopState.None)
            onClicked: w.cycleLoop()
        }
        SlotKey {
            x: 31; y: 252; width: 35; height: 42
            glyph: "\u{F03D7}"; size: 24
            onClicked: if (w.p && w.p.canRaise) w.p.raise()
        }
        SlotKey {
            x: 31; y: 328; width: 35; height: 37
            glyph: w.core && w.core.muted ? "\u{F075F}" : "\u{F057E}"; size: 24
            on: !!(w.core && w.core.muted)
            onClicked: if (w.core && w.core.sink && w.core.sink.audio) w.core.sink.audio.muted = !w.core.sink.audio.muted
        }

        // Right rail: level meter in the tall slot, volume steps in the two tabs
        Item {
            id: meter
            x: 656; y: 83
            width: 26; height: 72
            Rectangle {
                anchors.fill: parent
                radius: 2
                color: w.plate
                border.width: 1
                border.color: w.rim
            }
            Rectangle {
                anchors.bottom: parent.bottom
                anchors.bottomMargin: 3
                anchors.horizontalCenter: parent.horizontalCenter
                width: parent.width - 8
                height: Math.min(1, w.vol) * (parent.height - 6)
                color: w.lit
            }
            MouseArea {
                anchors.fill: parent
                cursorShape: Qt.PointingHandCursor
                function set(my) { if (w.core) w.core.nudgeVolume(Math.max(0, Math.min(1, 1 - my / meter.height)) - w.vol) }
                onPressed: function(m) { set(m.y) }
                onPositionChanged: function(m) { if (pressed) set(m.y) }
                onWheel: function(e) { if (w.core) w.core.nudgeVolume(e.angleDelta.y > 0 ? 0.05 : -0.05) }
            }
        }
        SlotKey {
            x: 651; y: 333; width: 37; height: 27
            glyph: "\u{F0415}"; size: 20
            onClicked: if (w.core) w.core.nudgeVolume(0.05)
        }
        SlotKey {
            x: 651; y: 389; width: 37; height: 27
            glyph: "\u{F0374}"; size: 20
            onClicked: if (w.core) w.core.nudgeVolume(-0.05)
        }

        // Emblem plate: elapsed over total
        Rectangle {
            x: 28; y: 577
            width: 87; height: 62
            radius: 2
            color: "#d91a0b06"
            border.width: 1
            border.color: w.rim
            Column {
                anchors.centerIn: parent
                Text {
                    anchors.horizontalCenter: parent.horizontalCenter
                    text: w.clock(w.pos)
                    font.family: "Michroma"
                    font.pixelSize: 19
                    color: w.lit
                }
                Text {
                    anchors.horizontalCenter: parent.horizontalCenter
                    text: w.len > 0 ? "/ " + w.clock(w.len) : "/ --:--"
                    font.family: "JetBrainsMono Nerd Font Mono"
                    font.pixelSize: 15
                    color: w.dimInk
                }
            }
        }

        // Purple panel: spectrum
        Rectangle {
            x: 170; y: 547
            width: 244; height: 62
            color: "#d91f0c07"
            Row {
                anchors.fill: parent
                anchors.margins: 4
                spacing: 2
                Repeater {
                    model: 24
                    delegate: Item {
                        required property int index
                        readonly property real v: w.core && w.core.bars.length ? (w.core.bars[Math.floor(index * w.core.bars.length / 24)] || 0) : (w.playing ? 0.25 + 0.25 * Math.abs(Math.sin(w.pos * 1.7 + index)) : 0.03)
                        width: 8
                        height: parent.height
                        Rectangle {
                            anchors.bottom: parent.bottom
                            width: parent.width
                            height: Math.max(2, parent.height * Math.min(1, parent.v))
                            gradient: Gradient {
                                GradientStop { position: 0.0; color: "#ffd9a8" }
                                GradientStop { position: 1.0; color: "#b4431c" }
                            }
                            Behavior on height { NumberAnimation { duration: 90 } }
                        }
                    }
                }
            }
        }

        // Grey panel: cover and album
        Rectangle {
            x: 431; y: 544
            width: 161; height: 65
            color: "#d91c0c07"
            Rectangle {
                id: coverBox
                x: 3; y: 3
                width: 59; height: 59
                color: "#2c150d"
                border.width: 1
                border.color: w.rim
                Image {
                    anchors.fill: parent
                    anchors.margins: 1
                    source: w.p && w.p.trackArtUrl ? w.p.trackArtUrl : ""
                    fillMode: Image.PreserveAspectCrop
                    asynchronous: true
                    sourceSize: Qt.size(118, 118)
                }
            }
            Text {
                anchors.left: coverBox.right
                anchors.leftMargin: 6
                anchors.right: parent.right
                anchors.rightMargin: 4
                anchors.verticalCenter: parent.verticalCenter
                text: w.p ? (w.p.trackAlbum || w.p.identity || "") : ""
                wrapMode: Text.Wrap
                maximumLineCount: 3
                elide: Text.ElideRight
                font.family: "JetBrainsMono Nerd Font Mono"
                font.pixelSize: 14
                color: w.dimInk
            }
        }

        // Transport strip, with play on the big framed key beside it
        SlotKey {
            x: 166; y: 633; width: 121; height: 43
            glyph: "\u{F04AE}"; size: 30
            onClicked: if (w.core) w.core.media("prev")
        }
        SlotKey {
            x: 299; y: 633; width: 158; height: 43
            glyph: "\u{F04DB}"; size: 30
            onClicked: if (w.p && w.p.canControl) w.p.stop()
        }
        SlotKey {
            x: 471; y: 633; width: 123; height: 43
            glyph: "\u{F04AD}"; size: 30
            onClicked: if (w.core) w.core.media("next")
        }
        SlotKey {
            x: 611; y: 549; width: 74; height: 90
            glyph: w.playing ? "\u{F03E4}" : "\u{F040A}"; size: 46
            on: w.playing
            onClicked: if (w.core) w.core.media("toggle")
        }
    }
}
