import QtQuick
import Quickshell.Services.Mpris

// Classic Winamp 2.x skin renderer. Drop an extracted .wsz (PNG-converted, lowercase
// names) into skins/<name>/ and point `skin` at it. The hand-drawn version is Winamp.qml.drawn.
Item {
    id: w
    property var core
    property string skinName: "lain"
    readonly property string skin: Qt.resolvedUrl("skins/" + skinName + "/")
    // Per-skin bits that aren't in the bitmaps: vis gradient (viscolor.txt), text colours
    // (pledit.txt), whether main.bmp lacks the time colon, and whether eqmain.bmp still
    // carries the slider sprite sheet below the window.
    readonly property var cfg: ({
        saya: { visTop: "#3fcbd1", visMid: "#38c6cc", visLow: "#5fe0b7", text: "#ffffff", accent: "#8ef6c8", colon: true, eqSliders: false, idle: "SONG OF SAYA",
                plNormal: "#ffffff", plCurrent: "#8ef6c8", plBg: "#013e4d", plSel: "#002730" },
        lain: { visTop: "#383867", visMid: "#707091", visLow: "#afafc2", text: "#ffffff", accent: "#7aaacd", colon: false, eqSliders: true, idle: "COPLAND OS ENTERPRISE",
                plNormal: "#ffffff", plCurrent: "#7aaacd", plBg: "#000000", plSel: "#0c87c2" }
    })[skinName]
    readonly property var pl: core ? core.player : null
    readonly property bool playing: !!(pl && pl.isPlaying)
    readonly property real len: pl && pl.lengthSupported && pl.length > 0 ? pl.length : 0
    readonly property var audio: core && core.sink ? core.sink.audio : null
    readonly property real vol: audio ? (audio.muted ? 0 : audio.volume) : 0
    property real pos: 0
    readonly property real baseW: 275
    // Main window (116) stacked over the equalizer window (116), as in Winamp. Any height
    // given beyond that goes to the playlist window underneath.
    readonly property real baseH: 232
    readonly property real k: width / baseW
    readonly property int plH: Math.max(0, Math.floor(height / k) - baseH)
    height: Math.round(width * baseH / baseW)

    readonly property color visTop: cfg.visTop
    readonly property color visMid: cfg.visMid
    readonly property color visLow: cfg.visLow
    readonly property color textColor: cfg.text
    readonly property color accent: cfg.accent

    function act(key) {
        if (!pl) {
            core.launch("spotify-launcher")
            return
        }
        if (key === "prev" && pl.canGoPrevious) pl.previous()
        else if (key === "play" && pl.canPlay) pl.play()
        else if (key === "pause" && pl.canPause) pl.pause()
        else if (key === "stop" && pl.canControl) pl.stop()
        else if (key === "next" && pl.canGoNext) pl.next()
    }

    function setVolume(v) {
        if (!audio) return
        audio.muted = false
        audio.volume = Math.max(0, Math.min(1, v))
    }

    component Sprite: Image {
        property string file
        property int sx: 0
        property int sy: 0
        property int sw: 0
        property int sh: 0
        source: w.skin + file + ".png"
        sourceClipRect: Qt.rect(sx, sy, sw, sh)
        width: sw
        height: sh
        smooth: true
    }

    component SkinButton: Sprite {
        id: btn
        property int pressedY: sh
        signal clicked()
        sy: ma.pressed ? pressedY : 0
        MouseArea { id: ma; anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: btn.clicked() }
    }

    Timer {
        interval: 500
        repeat: true
        running: w.playing && !w.core.covered
        triggeredOnStart: true
        onTriggered: {
            if (w.pl) {
                w.pl.positionChanged()
                w.pos = w.pl.position
            }
        }
    }

    Item {
        width: w.baseW
        height: w.baseH + w.plH
        transformOrigin: Item.TopLeft
        scale: w.k

        Image {
            width: 275; height: 116
            source: w.skin + "main.png"
        }
        Sprite { y: 116; file: "eqmain"; sw: 275; sh: 116 }

        // EQ sliders follow the spectrum: preamp + 10 bands, 14x63 each. The bar art is a
        // 14x2 grid of frames at 13,164 in eqmain.bmp, the knob is 11x11 at 0,164.
        Repeater {
            model: w.cfg.eqSliders ? 11 : 0
            delegate: Item {
                id: slider
                required property int index
                readonly property var src: w.core ? (w.core.bars || []) : []
                readonly property real level: {
                    if (!src.length) return 0.5
                    if (index === 0) {
                        var sum = 0
                        for (var i = 0; i < src.length; i++) sum += src[i]
                        return Math.min(1, sum / src.length * 1.6)
                    }
                    var a = Math.floor((index - 1) * src.length / 10)
                    var b = Math.max(a + 1, Math.floor(index * src.length / 10))
                    var m = 0
                    for (var j = a; j < b; j++) m = Math.max(m, src[j] || 0)
                    return Math.min(1, m)
                }
                readonly property int frame: Math.round((1 - level) * 27)
                x: index === 0 ? 21 : 78 + 18 * (index - 1)
                y: 116 + 38
                width: 14; height: 63
                Sprite {
                    file: "eqmain"
                    sx: 13 + (slider.frame % 14) * 15
                    sy: 164 + Math.floor(slider.frame / 14) * 65
                    sw: 14; sh: 63
                }
                Sprite {
                    x: 1
                    y: Math.round(51 * (1 - slider.level))
                    file: "eqmain"
                    sy: 164
                    sw: 11; sh: 11
                    Behavior on y { NumberAnimation { duration: 90 } }
                }
            }
        }

        // Play / pause / stop indicator
        Sprite {
            x: 26; y: 28
            file: "playpaus"
            sx: w.playing ? 0 : (w.pl && w.pl.playbackState === MprisPlaybackState.Paused ? 9 : 18)
            sw: 9; sh: 9
        }

        // Time: mm:ss using numbers.bmp (9x13 per digit)
        Item {
            id: time
            readonly property int secs: Math.max(0, Math.floor(w.pos))
            readonly property var digits: [Math.floor(secs / 600) % 10, Math.floor(secs / 60) % 10, Math.floor((secs % 60) / 10), secs % 10]
            property bool on: true
            visible: !w.pl || w.playing || on
            Timer { interval: 600; repeat: true; running: !!w.pl && !w.playing && !w.core.covered; onTriggered: time.on = !time.on }
            // Some skins' main.bmp has no colon painted between the digit pairs.
            Rectangle { visible: w.cfg.colon; x: 72; y: 29; width: 2; height: 2; color: "#d8e4e8" }
            Rectangle { visible: w.cfg.colon; x: 72; y: 35; width: 2; height: 2; color: "#d8e4e8" }
            Repeater {
                model: [48, 60, 78, 90]
                delegate: Sprite {
                    required property int index
                    required property int modelData
                    x: modelData; y: 26
                    file: "numbers"
                    sx: 9 * time.digits[index]
                    sw: 9; sh: 13
                }
            }
        }

        // Spectrum analyzer: 76x16 at 24,43, 19 bars of 3px + 1px gap
        Row {
            x: 24; y: 43
            height: 16
            spacing: 1
            Repeater {
                model: 19
                delegate: Item {
                    required property int index
                    readonly property var src: w.core ? (w.core.bars || []) : []
                    readonly property real v: src.length ? (src[Math.floor(index * src.length / 19)] || 0) : 0
                    width: 3
                    height: 16
                    Item {
                        anchors.bottom: parent.bottom
                        width: parent.width
                        height: Math.round(16 * Math.min(1, parent.v))
                        clip: true
                        Rectangle {
                            anchors.bottom: parent.bottom
                            width: parent.width
                            height: 16
                            gradient: Gradient {
                                GradientStop { position: 0.0; color: w.visTop }
                                GradientStop { position: 0.5; color: w.visMid }
                                GradientStop { position: 1.0; color: w.visLow }
                            }
                        }
                    }
                }
            }
        }

        // Song title. This skin's text.bmp only carries A-Z, so a real font keeps
        // digits and non-Latin titles readable.
        Item {
            x: 111; y: 25
            width: 154; height: 10
            clip: true
            Text {
                id: marq
                readonly property string full: w.pl ? ((w.pl.trackArtist ? w.pl.trackArtist + " - " : "") + (w.pl.trackTitle || String(w.pl.identity || ""))) : w.cfg.idle
                property real shift: 0
                anchors.verticalCenter: parent.verticalCenter
                x: implicitWidth > parent.width ? -shift : 0
                text: full
                font.family: "JetBrainsMono Nerd Font Mono"
                font.pixelSize: 8
                color: w.textColor
                onTextChanged: shift = 0
                NumberAnimation on shift {
                    running: marq.implicitWidth > marq.parent.width && !w.core.covered
                    from: 0
                    to: marq.implicitWidth - marq.parent.width + 6
                    duration: Math.max(3000, (marq.implicitWidth - marq.parent.width) * 60)
                    loops: Animation.Infinite
                    easing.type: Easing.InOutSine
                }
            }
        }

        // Stereo indicator
        Sprite {
            x: 239; y: 41
            visible: !!w.pl
            file: "monoster"
            sw: 29; sh: 12
        }

        // Volume
        Item {
            id: volBox
            x: 107; y: 57
            width: 68; height: 13
            Sprite { file: "volume"; sw: 68; sh: 13 }
            Rectangle {
                x: 1 + (parent.width - 5) * Math.min(1, w.vol)
                anchors.verticalCenter: parent.verticalCenter
                width: 3; height: 9
                radius: 1
                color: w.accent
            }
            MouseArea {
                anchors.fill: parent
                cursorShape: Qt.PointingHandCursor
                onPressed: function(m) { w.setVolume(m.x / width) }
                onPositionChanged: function(m) { if (pressed) w.setVolume(m.x / width) }
                onWheel: function(e) { w.setVolume(w.vol + (e.angleDelta.y > 0 ? 0.05 : -0.05)) }
            }
        }

        // Balance (visual only)
        Sprite { x: 177; y: 57; file: "balance"; sx: 9; sw: 38; sh: 13 }

        // EQ / PL toggles (visual only)
        Sprite { x: 219; y: 58; file: "shufrep"; sx: 0; sy: 61; sw: 23; sh: 12 }
        Sprite { x: 242; y: 58; file: "shufrep"; sx: 23; sy: 61; sw: 23; sh: 12 }

        // Seek bar
        Item {
            id: seek
            x: 16; y: 72
            width: 248; height: 6
            readonly property real v: w.len > 0 ? Math.min(1, w.pos / w.len) : 0
            Sprite { file: "posbar"; sw: 248; sh: 6 }
            Sprite {
                visible: w.len > 0
                x: (parent.width - width) * seek.v
                file: "posbar"
                sx: 248; sw: 29; sh: 6
            }
            MouseArea {
                anchors.fill: parent
                anchors.margins: -3
                cursorShape: Qt.PointingHandCursor
                function jump(mx) {
                    if (!w.pl || !w.pl.canSeek || w.len <= 0) return
                    var t = Math.max(0, Math.min(1, mx / seek.width)) * w.len
                    w.pl.position = t
                    w.pos = t
                }
                onPressed: function(m) { jump(m.x) }
                onPositionChanged: function(m) { if (pressed) jump(m.x) }
            }
        }

        // Transport (cbuttons.bmp: row 0 normal, row 18 pressed)
        SkinButton { x: 16;  y: 88; file: "cbuttons"; sx: 0;  sw: 23; sh: 18; onClicked: w.act("prev") }
        SkinButton { x: 39;  y: 88; file: "cbuttons"; sx: 23; sw: 23; sh: 18; onClicked: w.act("play") }
        SkinButton { x: 62;  y: 88; file: "cbuttons"; sx: 46; sw: 23; sh: 18; onClicked: w.act("pause") }
        SkinButton { x: 85;  y: 88; file: "cbuttons"; sx: 69; sw: 23; sh: 18; onClicked: w.act("stop") }
        SkinButton { x: 108; y: 88; file: "cbuttons"; sx: 92; sw: 22; sh: 18; onClicked: w.act("next") }
        // Eject: raise the player, or start Spotify if nothing is running.
        SkinButton {
            x: 136; y: 89; file: "cbuttons"; sx: 114; sw: 22; sh: 16; pressedY: 16
            onClicked: w.pl && w.pl.canRaise ? w.pl.raise() : w.core.launch("spotify-launcher")
        }

        // Shuffle / repeat (shufrep.bmp: off, off-pressed, on, on-pressed rows of 15)
        Sprite {
            x: 164; y: 89
            file: "shufrep"
            sx: 28
            sy: (w.pl && w.pl.shuffle ? 30 : 0) + (shufMa.pressed ? 15 : 0)
            sw: 47; sh: 15
            MouseArea {
                id: shufMa
                anchors.fill: parent
                cursorShape: Qt.PointingHandCursor
                onClicked: if (w.pl && w.pl.shuffleSupported) w.pl.shuffle = !w.pl.shuffle
            }
        }
        Sprite {
            x: 210; y: 89
            file: "shufrep"
            sy: (w.pl && w.pl.loopState !== MprisLoopState.None ? 30 : 0) + (repMa.pressed ? 15 : 0)
            sw: 28; sh: 15
            MouseArea {
                id: repMa
                anchors.fill: parent
                cursorShape: Qt.PointingHandCursor
                onClicked: if (w.pl && w.pl.loopSupported) w.pl.loopState = w.pl.loopState === MprisLoopState.None ? MprisLoopState.Playlist : MprisLoopState.None
            }
        }
        // Playlist window (pledit.bmp): one row per MPRIS player, the active one highlighted.
        // Click a row to play/pause that player. Needs 20 (title) + 38 (bottom) + some list.
        Item {
            id: plist
            visible: w.plH >= 87
            y: w.baseH
            width: 275
            height: w.plH
            readonly property int listH: height - 58
            clip: true

            Rectangle { x: 12; y: 20; width: 243; height: plist.listH; color: w.cfg.plBg }

            // Title bar: corners, tiled fill, title centred
            Item {
                width: 275; height: 20
                clip: true
                Repeater {
                    model: 11
                    delegate: Sprite { required property int index; x: index * 25; file: "pledit"; sx: 127; sw: 25; sh: 20 }
                }
                Sprite { file: "pledit"; sw: 25; sh: 20 }
                Sprite { x: 88; file: "pledit"; sx: 26; sw: 100; sh: 20 }
                Sprite { x: 250; file: "pledit"; sx: 153; sw: 25; sh: 20 }
            }
            // Side borders, tiled down
            Item {
                y: 20; width: 275; height: plist.listH
                clip: true
                Repeater {
                    model: Math.max(0, Math.ceil(plist.listH / 29))
                    delegate: Item {
                        required property int index
                        y: index * 29
                        Sprite { file: "pledit"; sy: 42; sw: 12; sh: 29 }
                        Sprite { x: 255; file: "pledit"; sx: 31; sy: 42; sw: 20; sh: 29 }
                    }
                }
            }
            // Bottom bar
            Sprite { y: plist.height - 38; file: "pledit"; sy: 72; sw: 125; sh: 38 }
            Sprite { x: 125; y: plist.height - 38; file: "pledit"; sx: 126; sy: 72; sw: 150; sh: 38 }

            Column {
                x: 14; y: 22
                width: 239
                Repeater {
                    model: Mpris.players.values
                    delegate: Rectangle {
                        id: row
                        required property var modelData
                        required property int index
                        readonly property bool current: modelData === w.pl
                        readonly property real rowLen: modelData.lengthSupported && modelData.length > 0 ? modelData.length : 0
                        visible: (index + 1) * 11 <= plist.listH - 4
                        width: parent.width; height: 11
                        color: current ? w.cfg.plSel : "transparent"
                        Text {
                            x: 2
                            width: parent.width - lenText.implicitWidth - 8
                            anchors.verticalCenter: parent.verticalCenter
                            elide: Text.ElideRight
                            text: (row.index + 1) + ". " + (row.modelData.trackArtist ? row.modelData.trackArtist + " - " : "") + (row.modelData.trackTitle || String(row.modelData.identity || ""))
                            font.family: "JetBrainsMono Nerd Font Mono"
                            font.pixelSize: 8
                            color: row.current ? w.cfg.plCurrent : w.cfg.plNormal
                        }
                        Text {
                            id: lenText
                            anchors.right: parent.right
                            anchors.rightMargin: 2
                            anchors.verticalCenter: parent.verticalCenter
                            text: row.rowLen > 0 ? Math.floor(row.rowLen / 60) + ":" + String(Math.floor(row.rowLen % 60)).padStart(2, "0") : ""
                            font.family: "JetBrainsMono Nerd Font Mono"
                            font.pixelSize: 8
                            color: row.current ? w.cfg.plCurrent : w.cfg.plNormal
                        }
                        MouseArea {
                            anchors.fill: parent
                            cursorShape: Qt.PointingHandCursor
                            onClicked: if (row.modelData.canTogglePlaying) row.modelData.togglePlaying()
                        }
                    }
                }
            }
        }
    }
}
