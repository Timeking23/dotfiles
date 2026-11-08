import QtQuick
import QtQuick.Effects
import Quickshell
import Quickshell.Io

// A black flip phone with silver gothic decals (hearts, crosses, barbed vines, a bead
// strap), drawn in QML at art size 740x1640, standing upright. It is scaled so the screen
// half fills the height; the keypad half runs off the bottom of the screen.
// Opening: the closed phone rises, the lid flips open on its hinge, the screen powers on
// CRT-style with a heart boot logo, flashes, and the browser appears. Closing reverses it.
// Earlier designs: Phone.qml.fomz (silver slider, sideways), Phone.qml.portrait, Phone.qml.art.
Item {
    id: ph
    property real s: 1
    property string phase: "off"
    property rect hole
    property int sliderY: 0
    property real lift: 1000
    // The screen in art coordinates (same as shell.qml's `hole`).
    readonly property rect artHole: Qt.rect(48, 96, 644, 860)
    readonly property int artW: 740
    readonly property int artH: 2040
    readonly property int hingeY: 1020

    property real rise: 1      // 1 = below the screen, 0 = in place
    property real slide: 1     // lid: 1 = folded shut, 0 = open
    property real beam: 0      // CRT line width 0..1
    property real open: 0      // CRT line height 0..1
    property real boot: 0      // boot logo on the black screen
    property real flash: 0     // white flash over the screen
    // 0 = whole phone in view (keys showing), 1 = zoomed in so the screen half fills the
    // height and the keypad runs off the bottom. The browser only shows once zoomed in.
    property real zoom: 0
    property int barH: 38
    // Zoomed out: the lid plus the top of the keypad (to the number keys) in view; the
    // rest of the long keypad half runs off the bottom of the screen.
    readonly property real farK: Math.min(1, ((lift - barH - 10) / 1760) / Math.max(0.01, s))
    // The black glass only exists until the browser shows; on the Top layer it would
    // otherwise sit over the browser.
    property bool powered: false

    property var now: new Date()
    property int battery: 100
    property bool charging: false

    signal poweredOn()
    signal opened()
    signal closed()
    signal clicked()

    // Palette
    readonly property color body0: "#202026"
    readonly property color body1: "#060608"
    readonly property color rim: "#3c3c44"
    readonly property color silver: "#e4e4ea"
    readonly property color silverDim: "#9a9aa4"
    readonly property color keyFace: "#0e0e12"

    onPhaseChanged: {
        if (phase === "opening") { closeAnim.stop(); openAnim.restart() }
        else if (phase === "closing") { openAnim.stop(); closeAnim.restart() }
        else if (phase === "on") { rise = 0; slide = 0; beam = 1; open = 1; boot = 0; flash = 0; zoom = 1; powered = true }
        else if (phase === "off") { rise = 1; slide = 1; beam = 0; open = 0; boot = 0; flash = 0; zoom = 0; powered = false }
    }

    SequentialAnimation {
        id: openAnim
        ScriptAction { script: { ph.rise = 1; ph.slide = 1; ph.beam = 0; ph.open = 0; ph.boot = 0; ph.flash = 0; ph.zoom = 0; ph.powered = false } }
        NumberAnimation { target: ph; property: "rise"; to: 0; duration: 560; easing.type: Easing.OutBack; easing.overshoot: 0.9 }
        NumberAnimation { target: ph; property: "slide"; to: 0; duration: 520; easing.type: Easing.OutBack; easing.overshoot: 1.1 }
        PauseAnimation { duration: 60 }
        NumberAnimation { target: ph; property: "beam"; to: 1; duration: 140; easing.type: Easing.OutQuad }
        NumberAnimation { target: ph; property: "open"; to: 1; duration: 180; easing.type: Easing.OutCubic }
        NumberAnimation { target: ph; property: "boot"; to: 1; duration: 160 }
        PauseAnimation { duration: 420 }
        // Ready: move in close
        NumberAnimation { target: ph; property: "zoom"; to: 1; duration: 720; easing.type: Easing.InOutCubic }
        NumberAnimation { target: ph; property: "flash"; to: 1; duration: 140 }
        ScriptAction { script: { ph.boot = 0; ph.powered = true; ph.poweredOn() } }
        NumberAnimation { target: ph; property: "flash"; to: 0; duration: 380; easing.type: Easing.InQuad }
        ScriptAction { script: ph.opened() }
    }

    SequentialAnimation {
        id: closeAnim
        ScriptAction { script: ph.powered = false }
        NumberAnimation { target: ph; property: "flash"; to: 1; duration: 90 }
        ParallelAnimation {
            NumberAnimation { target: ph; property: "open"; to: 0; duration: 160; easing.type: Easing.InCubic }
            NumberAnimation { target: ph; property: "flash"; to: 0.4; duration: 160 }
        }
        NumberAnimation { target: ph; property: "beam"; to: 0; duration: 120 }
        NumberAnimation { target: ph; property: "zoom"; to: 0; duration: 520; easing.type: Easing.InOutCubic }
        NumberAnimation { target: ph; property: "slide"; to: 1; duration: 380; easing.type: Easing.InCubic }
        NumberAnimation { target: ph; property: "rise"; to: 1; duration: 420; easing.type: Easing.InBack; easing.overshoot: 0.8 }
        ScriptAction { script: ph.closed() }
    }

    // Live status strip data
    Timer {
        interval: 15000
        repeat: true
        running: ph.phase !== "off"
        triggeredOnStart: true
        onTriggered: { ph.now = new Date(); batCap.reload(); batState.reload() }
    }
    FileView {
        id: batCap
        path: "/sys/class/power_supply/BAT1/capacity"
        printErrors: false
        onLoaded: ph.battery = parseInt(text()) || 0
    }
    FileView {
        id: batState
        path: "/sys/class/power_supply/BAT1/status"
        printErrors: false
        onLoaded: ph.charging = text().trim() !== "Discharging"
    }

    function run(cmd) { Quickshell.execDetached(["sh", "-c", cmd]) }

    // ── Reusable bits ────────────────────────────────────────────────

    // Silver-printed glyph decal
    component Decal: Text {
        property real size: 28
        font.family: "DejaVu Sans"
        font.pixelSize: size
        color: ph.silver
        style: Text.Raised
        styleColor: "#40ffffff"
    }

    // Glossy black body panel
    component Shell: Rectangle {
        radius: 40
        border.width: 3
        border.color: ph.rim
        gradient: Gradient {
            orientation: Gradient.Horizontal
            GradientStop { position: 0; color: ph.body1 }
            GradientStop { position: 0.12; color: ph.body0 }
            GradientStop { position: 0.5; color: "#0c0c10" }
            GradientStop { position: 1; color: ph.body1 }
        }
        // Top-lit: light falls from above, darker toward the bottom edge
        Rectangle {
            anchors.fill: parent
            anchors.margins: 3
            radius: parent.radius - 3
            gradient: Gradient {
                GradientStop { position: 0; color: "#1affffff" }
                GradientStop { position: 0.18; color: "#00ffffff" }
                GradientStop { position: 0.82; color: "#00000000" }
                GradientStop { position: 1; color: "#66000000" }
            }
        }
        // Chamfered rim catching the light
        Rectangle {
            anchors.fill: parent
            anchors.margins: 5
            radius: parent.radius - 5
            color: "transparent"
            border.width: 2
            border.color: "#14ffffff"
        }
        // Gloss streak
        Rectangle {
            x: 18; y: 20
            width: 10; height: parent.height - 40
            radius: 5
            gradient: Gradient {
                GradientStop { position: 0; color: "#30ffffff" }
                GradientStop { position: 0.5; color: "#10ffffff" }
                GradientStop { position: 1; color: "#00ffffff" }
            }
        }
    }

    // Keypad key: black rounded key, white printing, presses in.
    component Key: Rectangle {
        id: key
        property string main: ""
        property string kana: ""
        property string latin: ""
        property real mainSize: 38
        signal pressed()
        radius: 16
        color: keyArea.pressed ? "#26262c" : ph.keyFace
        border.width: 2
        border.color: "#2e2e36"
        // Raised: shadow below, a lit top edge, and it sinks when pressed
        Rectangle {
            z: -1
            x: 0; y: keyArea.pressed ? 1 : 5
            width: parent.width; height: parent.height
            radius: parent.radius
            color: "#000000"
            opacity: 0.75
        }
        Rectangle {
            x: 6; y: 3
            width: parent.width - 12; height: 3
            radius: 1.5
            color: "#ffffff"
            opacity: keyArea.pressed ? 0.04 : 0.14
        }
        Rectangle {
            anchors.fill: parent
            radius: parent.radius
            gradient: Gradient {
                GradientStop { position: 0; color: "#12ffffff" }
                GradientStop { position: 0.5; color: "#00ffffff" }
                GradientStop { position: 1; color: "#40000000" }
            }
        }
        Rectangle {
            anchors.fill: parent; anchors.margins: 3
            radius: parent.radius - 2
            color: "transparent"
            border.width: 1
            border.color: "#18ffffff"
        }
        Row {
            anchors.centerIn: parent
            spacing: 8
            Text {
                anchors.verticalCenter: parent.verticalCenter
                text: key.main
                font.family: "DejaVu Sans"; font.weight: Font.Bold; font.pixelSize: key.mainSize
                color: "#ffffff"
            }
            Column {
                anchors.verticalCenter: parent.verticalCenter
                visible: key.kana.length > 0 || key.latin.length > 0
                Text { text: key.kana; font.pixelSize: 15; color: "#ffffff" }
                Text { text: key.latin; font.family: "DejaVu Sans"; font.pixelSize: 13; color: "#d0d0d8" }
            }
        }
        MouseArea {
            id: keyArea
            anchors.fill: parent
            cursorShape: Qt.PointingHandCursor
            onClicked: key.pressed()
        }
    }

    // A strand of barbed vine: thin line with crossed barbs
    component Vine: Item {
        id: vine
        property int count: 6
        width: 16
        Rectangle { anchors.horizontalCenter: parent.horizontalCenter; width: 2; height: parent.height; color: ph.silverDim }
        Repeater {
            model: vine.count
            delegate: Text {
                required property int index
                anchors.horizontalCenter: parent.horizontalCenter
                y: (index + 0.5) * vine.height / vine.count - 10
                text: "✕"
                font.pixelSize: 16
                color: ph.silver
            }
        }
    }

    // ── The phone ────────────────────────────────────────────────────

    Item {
        id: zoomer
        width: ph.artW * ph.s
        height: ph.artH * ph.s
        transform: Scale {
            origin.x: zoomer.width / 2
            origin.y: 0
            xScale: ph.farK + (1 - ph.farK) * ph.zoom
            yScale: ph.farK + (1 - ph.farK) * ph.zoom
        }

    Item {
        id: stage
        width: ph.artW
        height: ph.artH
        scale: ph.s
        transformOrigin: Item.TopLeft
        y: ph.rise * (ph.lift / ph.s + 40)
        rotation: ph.rise * 7
        opacity: ph.rise > 0.97 ? 0 : 1

    Item {
        id: art
        width: ph.artW
        height: ph.artH

        // Soft shadow under the whole phone. Once the browser shows, the screen is cut out
        // of it too; otherwise the 60% black sat over the browser and greyed the page.
        Item {
            id: shadowHole
            width: ph.artW; height: ph.artH
            visible: false
            layer.enabled: true
            Rectangle { x: ph.artHole.x; y: ph.artHole.y; width: ph.artHole.width; height: ph.artHole.height; color: "#000000" }
        }
        Item {
            width: ph.artW; height: ph.artH
            layer.enabled: true
            layer.effect: MultiEffect {
                maskEnabled: ph.powered
                maskInverted: true
                maskSource: shadowHole
                maskThresholdMin: 0.5
                maskSpreadAtMin: 0.0
            }
            Rectangle {
                x: 14; y: 30
                width: ph.artW - 10; height: ph.artH - 20
                radius: 50
                color: "#000000"
                opacity: 0.6
                layer.enabled: true
                layer.effect: MultiEffect { blurEnabled: true; blur: 1.0; blurMax: 56 }
            }
        }

        // ── Keypad half
        Shell {
            id: base
            x: 0; y: 1040
            width: ph.artW; height: 1000

            // docomo-style logo and the big cross decal
            Text {
                anchors.horizontalCenter: parent.horizontalCenter
                anchors.horizontalCenterOffset: 70
                y: 18
                text: "docomo"
                font.family: "DejaVu Sans"; font.italic: true; font.weight: Font.Bold; font.pixelSize: 26
                color: ph.silver
            }
            Decal { x: 40; y: 14; text: "✠"; size: 70 }
            Decal { x: 560; y: 18; text: "♡ ✕ ♡"; size: 20 }
            Decal { x: parent.width - 70; y: 60; text: "✦"; size: 24 }

            // D-pad
            Item {
                id: dpad
                x: ph.artW / 2 - 110; y: 110
                width: 220; height: 220
                Rectangle {
                    anchors.fill: parent; radius: width / 2
                    color: "#08080a"
                    border.width: 3; border.color: "#4a4a52"
                }
                Rectangle {
                    anchors.centerIn: parent
                    width: 180; height: 180; radius: 90
                    color: "transparent"
                    border.width: 1; border.color: "#30ffffff"
                }
                Decal { anchors.horizontalCenter: parent.horizontalCenter; y: 8; text: "▲"; size: 18 }
                Decal { anchors.horizontalCenter: parent.horizontalCenter; anchors.bottom: parent.bottom; anchors.bottomMargin: 8; text: "▼"; size: 18 }
                Decal { anchors.verticalCenter: parent.verticalCenter; x: 10; text: "◀"; size: 18 }
                Decal { anchors.verticalCenter: parent.verticalCenter; anchors.right: parent.right; anchors.rightMargin: 10; text: "▶"; size: 18 }
                Rectangle {
                    anchors.centerIn: parent
                    width: 96; height: 96; radius: 48
                    color: centerArea.pressed ? "#26262c" : "#111116"
                    border.width: 2; border.color: "#5a5a64"
                    Decal { anchors.centerIn: parent; text: "♥"; size: 40 }
                    MouseArea {
                        id: centerArea
                        anchors.fill: parent
                        cursorShape: Qt.PointingHandCursor
                        onClicked: ph.run("$HOME/.config/hyper-aero/scripts/codex.sh toggle")
                    }
                }
            }

            // Side soft keys
            Key { x: 50; y: 130; width: 150; height: 74; main: "メニュー"; mainSize: 24
                  onPressed: ph.run("$HOME/.config/hyper-aero/scripts/codex.sh toggle") }
            Key { x: 50; y: 236; width: 150; height: 74; main: "✉"; mainSize: 32 }
            Key { x: ph.artW - 200; y: 130; width: 150; height: 74; main: "◎"; mainSize: 32
                  onPressed: ph.run("$HOME/.config/hyper-aero/scripts/screenshot.sh full") }
            Key { x: ph.artW - 200; y: 236; width: 150; height: 74; main: "⏻"; mainSize: 30
                  onPressed: ph.clicked() }

            // Call / clear / end
            Key { x: 50; y: 370; width: 170; height: 72; main: "☎"; mainSize: 32 }
            Key { x: ph.artW / 2 - 80; y: 370; width: 160; height: 72; main: "クリア"; mainSize: 24 }
            Key { x: ph.artW - 220; y: 370; width: 170; height: 72; main: "✆"; mainSize: 32 }

            // Number pad
            Grid {
                x: 82; y: 480
                columns: 3
                columnSpacing: 22
                rowSpacing: 18
                Repeater {
                    model: [["1", "あ", ".,@"], ["2", "か", "ABC"], ["3", "さ", "DEF"],
                            ["4", "た", "GHI"], ["5", "な", "JKL"], ["6", "は", "MNO"],
                            ["7", "ま", "PQRS"], ["8", "や", "TUV"], ["9", "ら", "WXYZ"],
                            ["＊", "゛゜", ""], ["0", "わ", "ー"], ["#", "、。", ""]]
                    delegate: Key {
                        required property var modelData
                        width: 178; height: 84
                        main: modelData[0]; kana: modelData[1]; latin: modelData[2]
                    }
                }
            }
            Row {
                anchors.horizontalCenter: parent.horizontalCenter
                y: 880
                spacing: 60
                Repeater {
                    model: ["Ⅰ", "Ⅱ", "Ⅲ"]
                    delegate: Decal { required property var modelData; text: modelData; size: 30 }
                }
            }

            // Lace cross: a cross shape filled with a dotted lace pattern
            Item {
                x: 26; y: 6
                width: 96; height: 116
                rotation: -12
                Repeater {
                    model: [[34, 0, 28, 116], [0, 30, 96, 28]]
                    delegate: Rectangle {
                        required property var modelData
                        x: modelData[0]; y: modelData[1]; width: modelData[2]; height: modelData[3]
                        color: "#14141a"
                        border.width: 3; border.color: ph.silver
                        Grid {
                            anchors.centerIn: parent
                            columns: Math.max(1, Math.floor((parent.width - 6) / 8))
                            spacing: 3
                            Repeater {
                                model: Math.max(1, Math.floor((parent.parent.width - 6) / 8)) * Math.max(1, Math.floor((parent.parent.height - 6) / 8))
                                delegate: Rectangle { width: 4; height: 4; radius: 2; color: "#c8c8d0" }
                            }
                        }
                    }
                }
            }
            // Skeleton arm along the left edge
            Item {
                x: 6; y: 440
                width: 40; height: 420
                Repeater {
                    model: [[12, 0, 14, 180], [10, 196, 18, 170]]
                    delegate: Rectangle {
                        required property var modelData
                        x: modelData[0]; y: modelData[1]; width: modelData[2]; height: modelData[3]
                        radius: 7; color: "#d8d8de"
                        border.width: 2; border.color: "#7a7a84"
                    }
                }
                Repeater {
                    model: [[8, -6], [8, 170], [6, 360]]
                    delegate: Rectangle {
                        required property var modelData
                        x: modelData[0]; y: modelData[1]; width: 24; height: 24; radius: 12
                        color: "#e8e8ee"; border.width: 2; border.color: "#7a7a84"
                    }
                }
                Decal { x: 4; y: 384; text: "✝"; size: 30 }
            }
            Vine { x: ph.artW - 30; y: 330; height: 600; count: 15 }
            Repeater {
                model: [[ph.artW - 50, 350, "✿"], [ph.artW - 48, 520, "❀"], [ph.artW - 50, 690, "✿"], [ph.artW - 48, 860, "❀"]]
                delegate: Decal { required property var modelData; x: modelData[0]; y: modelData[1]; text: modelData[2]; size: 26 }
            }
            Decal { x: ph.artW - 170; y: 930; text: "✦ ⋆ ✧"; size: 22 }
            Decal { x: 60; y: 960; text: "SH-02L"; size: 16; color: ph.silverDim }
            Decal { anchors.horizontalCenter: parent.horizontalCenter; y: 930; text: "♡ ✕✕✕ ♡"; size: 20 }
            // Microphone hole
            Rectangle { anchors.horizontalCenter: parent.horizontalCenter; y: 972; width: 12; height: 5; radius: 2.5; color: "#000000" }
        }

        // Side keys on the body edges (volume rocker, side button)
        Repeater {
            model: [[-8, 1120, 12, 120], [ph.artW - 4, 1150, 12, 70], [-8, 300, 12, 90]]
            delegate: Rectangle {
                required property var modelData
                x: modelData[0]; y: modelData[1]; width: modelData[2]; height: modelData[3]
                radius: 6
                gradient: Gradient {
                    orientation: Gradient.Horizontal
                    GradientStop { position: 0; color: "#3a3a42" }
                    GradientStop { position: 1; color: "#0a0a0c" }
                }
            }
        }

        // ── Hinge
        Rectangle {
            x: 70; y: 996
            width: ph.artW - 140; height: 52
            radius: 26
            gradient: Gradient {
                GradientStop { position: 0; color: "#2c2c34" }
                GradientStop { position: 0.5; color: "#0a0a0c" }
                GradientStop { position: 1; color: "#24242a" }
            }
            border.width: 2; border.color: ph.rim
            Decal { anchors.centerIn: parent; text: "❀"; size: 30 }
            Decal { anchors.verticalCenter: parent.verticalCenter; x: 60; text: "✕ ♥ ✕"; size: 16 }
            Decal { anchors.verticalCenter: parent.verticalCenter; anchors.right: parent.right; anchors.rightMargin: 60; text: "✕ ♥ ✕"; size: 16 }
        }

        // ── Lid: swings shut onto the keypad around the hinge
        Item {
            id: lid
            width: ph.artW; height: 1000
            readonly property real angle: ph.slide * 180
            transform: Rotation {
                origin.x: ph.artW / 2
                origin.y: ph.hingeY
                axis { x: 1; y: 0; z: 0 }
                angle: -lid.angle
            }

            // Face (inside): screen and its frame
            Item {
                anchors.fill: parent
                visible: lid.angle < 90

                Item {
                    id: holeMask
                    anchors.fill: parent
                    visible: false
                    layer.enabled: true
                    Rectangle { x: ph.artHole.x; y: ph.artHole.y; width: ph.artHole.width; height: ph.artHole.height; color: "#000000" }
                }
                Item {
                    anchors.fill: parent
                    layer.enabled: true
                    layer.effect: MultiEffect {
                        maskEnabled: true
                        maskInverted: true
                        maskSource: holeMask
                        maskThresholdMin: 0.5
                        maskSpreadAtMin: 0.0
                    }

                    Shell { anchors.fill: parent }

                    // Earpiece, camera ring and the heart row
                    // Speaker grille
                    Grid {
                        anchors.horizontalCenter: parent.horizontalCenter
                        y: 18
                        columns: 9; rows: 2; spacing: 5
                        Repeater {
                            model: 18
                            delegate: Rectangle { width: 5; height: 5; radius: 2.5; color: "#000000"; border.width: 1; border.color: "#3a3a42" }
                        }
                    }
                    // Notification LED
                    Rectangle {
                        x: ph.artW / 2 + 70; y: 22; width: 9; height: 9; radius: 4.5
                        color: "#ff9cc4"
                        opacity: 0.55 + 0.45 * ph.boot
                    }
                    Rectangle {
                        x: 46; y: 16; width: 26; height: 26; radius: 13
                        color: "#000000"; border.width: 3; border.color: ph.silverDim
                    }
                    Decal { x: 84; y: 12; text: "◯"; size: 22; rotation: -20 }
                    Decal { anchors.horizontalCenter: parent.horizontalCenter; y: 40; text: "·♡· ✕✕✕ ·♡· ✕✕✕ ·♡· ✕✕✕ ·♡·"; size: 20 }
                    Decal { anchors.horizontalCenter: parent.horizontalCenter; anchors.horizontalCenterOffset: 120; y: 14; text: "• • • • •"; size: 14 }
                    // Ring charm doodle
                    Rectangle { x: 96; y: 10; width: 34; height: 22; radius: 11; rotation: -24; color: "transparent"; border.width: 3; border.color: ph.silver }
                    Rectangle { x: 112; y: 6; width: 8; height: 8; radius: 4; color: ph.silver }
                    Decal { x: ph.artW - 100; y: 14; text: "· · · ·"; size: 20 }

                    // Bezel round the glass, with a recessed inner shadow
                    Rectangle {
                        x: ph.artHole.x - 14; y: ph.artHole.y - 46
                        width: ph.artHole.width + 28; height: ph.artHole.height + 60
                        radius: 14
                        color: "#050506"
                        border.width: 2; border.color: "#33333b"
                        Rectangle {
                            anchors.fill: parent; anchors.margins: 2
                            radius: 12
                            gradient: Gradient {
                                GradientStop { position: 0; color: "#90000000" }
                                GradientStop { position: 0.06; color: "#00000000" }
                                GradientStop { position: 0.94; color: "#00000000" }
                                GradientStop { position: 1; color: "#20ffffff" }
                            }
                        }
                    }

                    // Under the screen
                    Decal { anchors.horizontalCenter: parent.horizontalCenter; y: 962; text: "✕✕✕ ♥ ✕✕✕"; size: 22 }
                    Decal { x: 56; y: 956; text: "✝"; size: 28 }
                    Decal { x: ph.artW - 120; y: 952; text: "✦ ⋆ ✧"; size: 22 }
                    // Tiny hearts and dots down both sides of the screen
                    Repeater {
                        model: 14
                        delegate: Item {
                            required property int index
                            y: 130 + index * 60
                            Decal { x: 14; text: index % 3 === 1 ? "♡" : "·"; size: 16 }
                            Decal { x: ph.artW - 32; text: index % 3 === 2 ? "✕" : "·"; size: 16 }
                        }
                    }
                }

                // Status strip, printed into the top of the bezel like the photo
                Row {
                    x: ph.artHole.x + 6; y: ph.artHole.y - 30
                    spacing: 10
                    Text { text: "▮▮▮"; font.pixelSize: 16; color: ph.silver }
                    Text { text: "✉"; font.pixelSize: 18; color: ph.silver }
                    Text { text: "♥"; font.pixelSize: 18; color: "#ff9cc4" }
                }
                Text {
                    x: ph.artHole.x + ph.artHole.width - width - 6
                    y: ph.artHole.y - 32
                    text: ph.battery + "%  " + Qt.formatTime(ph.now, "HH:mm")
                    font.family: "DejaVu Sans"; font.pixelSize: 18
                    color: ph.silver
                }

                // Screen glass: black until the browser appears behind it.
                Rectangle {
                    x: ph.artHole.x - 2; y: ph.artHole.y - 2
                    width: ph.artHole.width + 4; height: ph.artHole.height + 4
                    color: ph.powered ? "transparent" : "#000000"

                    // Boot logo
                    Column {
                        anchors.centerIn: parent
                        spacing: 16
                        opacity: ph.boot
                        visible: !ph.powered && ph.boot > 0
                        Text {
                            anchors.horizontalCenter: parent.horizontalCenter
                            text: "♥"
                            font.pixelSize: 120
                            color: "#f2f2f6"
                        }
                        Text {
                            anchors.horizontalCenter: parent.horizontalCenter
                            text: "w e l c o m e"
                            font.family: "DejaVu Serif"; font.italic: true; font.pixelSize: 34
                            color: "#d8d8e0"
                        }
                        Row {
                            anchors.horizontalCenter: parent.horizontalCenter
                            spacing: 8
                            Repeater {
                                model: 8
                                delegate: Text {
                                    required property int index
                                    text: "✕"
                                    font.pixelSize: 18
                                    color: index < Math.round(ph.boot * 8) ? "#ffffff" : "#3a3a42"
                                }
                            }
                        }
                    }

                    // Glass glare while the screen is dark
                    Rectangle {
                        visible: !ph.powered
                        x: parent.width * 0.08; y: -parent.height * 0.1
                        width: parent.width * 0.22; height: parent.height * 1.2
                        rotation: 22
                        gradient: Gradient {
                            orientation: Gradient.Horizontal
                            GradientStop { position: 0; color: "#00ffffff" }
                            GradientStop { position: 0.5; color: "#14ffffff" }
                            GradientStop { position: 1; color: "#00ffffff" }
                        }
                    }

                    // CRT power line / panel, then the white flash.
                    Rectangle {
                        anchors.centerIn: parent
                        width: parent.width * ph.beam
                        height: Math.max(3, parent.height * ph.open)
                        visible: ph.beam > 0 && (ph.flash > 0 || ph.open < 1)
                        color: "#eef0ff"
                        opacity: ph.powered ? ph.flash : Math.max(ph.flash, 1 - ph.open) * (0.25 + 0.75 * (1 - ph.boot))
                    }
                }
            }

            // Back of the lid, seen while it is folded shut
            Item {
                anchors.fill: parent
                visible: lid.angle >= 90
                transform: Scale { origin.y: 500; yScale: -1 }
                Shell { anchors.fill: parent }
                Decal { anchors.centerIn: parent; anchors.verticalCenterOffset: -40; text: "✠"; size: 260 }
                Decal { anchors.horizontalCenter: parent.horizontalCenter; y: 120; text: "♡ ✕ ♡ ✕ ♡"; size: 34 }
                Decal { anchors.horizontalCenter: parent.horizontalCenter; y: 820; text: "♥"; size: 70 }
                Vine { x: 40; y: 200; height: 600; count: 12 }
                Vine { x: ph.artW - 56; y: 200; height: 600; count: 12 }
            }
        }
    }
    }

    }

    MouseArea {
        anchors.fill: parent
        onClicked: ph.clicked()
    }
}
