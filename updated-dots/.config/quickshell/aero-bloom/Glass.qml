import QtQuick
import QtQuick.Effects

// Frosted card: blurs the wallpaper behind itself, tints it, and draws a hairline
// frame with small thorn crosses at the corners.
Item {
    id: g
    property var core
    property Item wall
    property string label: ""
    property real tint: 0.5
    default property alias content: body.data

    Item {
        id: frost
        anchors.fill: parent
        // Over a scene wallpaper (drawn by another program) there is nothing here to
        // blur; use a darker tint instead.
        visible: !g.core.live && !g.core.video.length
        layer.enabled: true
        layer.effect: MultiEffect {
            blurEnabled: true
            blur: 1.0
            blurMax: 48
            saturation: -0.6
        }
        ShaderEffectSource {
            anchors.fill: parent
            sourceItem: g.wall
            live: true
            recursive: false
            sourceRect: {
                // Re-read when the card moves or the screen changes.
                var _ = [g.x, g.y, g.width, g.height, g.wall ? g.wall.width : 0]
                if (!g.wall) return Qt.rect(0, 0, 0, 0)
                var r = g.mapToItem(g.wall, 0, 0, g.width, g.height)
                return Qt.rect(r.x, r.y, r.width, r.height)
            }
        }
    }
    Rectangle {
        anchors.fill: parent
        color: "#0c0b0d"
        opacity: g.core.live || g.core.video.length ? Math.max(0.62, g.tint) : g.tint
    }
    // ── Frame: a double rule that glows in the accent near the corners and fades to
    // nothing mid-edge, bracket corners set with a small gem, and a diamond on each edge.
    readonly property color accent: g.core.pal.petal

    component Rule: Rectangle {
        property bool vertical: false
        property real strength: 0.85
        gradient: Gradient {
            orientation: vertical ? Gradient.Vertical : Gradient.Horizontal
            GradientStop { position: 0; color: Qt.alpha(g.accent, strength) }
            GradientStop { position: 0.22; color: Qt.alpha("#ffffff", 0.16) }
            GradientStop { position: 0.5; color: Qt.alpha("#ffffff", 0.07) }
            GradientStop { position: 0.78; color: Qt.alpha("#ffffff", 0.16) }
            GradientStop { position: 1; color: Qt.alpha(g.accent, strength) }
        }
    }

    // Outer rule
    Rule { x: 0; y: 0; width: g.width; height: 1 }
    Rule { x: 0; y: g.height - 1; width: g.width; height: 1 }
    Rule { x: 0; y: 0; width: 1; height: g.height; vertical: true }
    Rule { x: g.width - 1; y: 0; width: 1; height: g.height; vertical: true }
    // Inner rule, fainter
    Rectangle {
        anchors.fill: parent
        anchors.margins: 5
        color: "transparent"
        border.width: 1
        border.color: Qt.alpha("#ffffff", 0.06)
    }
    // Soft inner glow along the top edge
    Rectangle {
        x: 1; y: 1; width: g.width - 2; height: 26
        gradient: Gradient {
            GradientStop { position: 0; color: Qt.alpha(g.accent, 0.07) }
            GradientStop { position: 1; color: "transparent" }
        }
    }

    // Corners: an L bracket, a gem on the corner, and a short spur past it
    Repeater {
        model: [[0, 0], [1, 0], [0, 1], [1, 1]]
        delegate: Item {
            id: corner
            required property var modelData
            readonly property int sx: modelData[0] ? -1 : 1
            readonly property int sy: modelData[1] ? -1 : 1
            x: modelData[0] * g.width
            y: modelData[1] * g.height
            // bracket arms, 2 px, inset 3 px
            Rectangle { x: corner.sx > 0 ? 3 : -25; y: corner.sy > 0 ? 3 : -5; width: 22; height: 2; color: g.accent }
            Rectangle { x: corner.sx > 0 ? 3 : -5; y: corner.sy > 0 ? 3 : -25; width: 2; height: 22; color: g.accent }
            // spurs running out past the corner
            Rectangle { x: corner.sx > 0 ? -9 : 1; y: -0.5; width: 8; height: 1; color: Qt.alpha(g.accent, 0.6) }
            Rectangle { x: -0.5; y: corner.sy > 0 ? -9 : 1; width: 1; height: 8; color: Qt.alpha(g.accent, 0.6) }
            // gem
            Rectangle {
                x: -4; y: -4; width: 8; height: 8
                rotation: 45
                color: "#0c0b0d"
                border.width: 1.5; border.color: g.accent
                Rectangle { anchors.centerIn: parent; width: 2.5; height: 2.5; color: g.accent }
            }
        }
    }

    // Edge diamonds with little ticks (left/right always; bottom always; top only when
    // there's no label there)
    Repeater {
        model: [[0.5, 1], [0, 0.5], [1, 0.5]].concat(g.label.length ? [] : [[0.5, 0]])
        delegate: Item {
            required property var modelData
            x: modelData[0] * g.width
            y: modelData[1] * g.height
            readonly property bool vert: modelData[1] === 0.5
            Rectangle { x: parent.vert ? -0.5 : -14; y: parent.vert ? -14 : -0.5; width: parent.vert ? 1 : 28; height: parent.vert ? 28 : 1; color: Qt.alpha(g.accent, 0.55) }
            Rectangle {
                x: -3.5; y: -3.5; width: 7; height: 7; rotation: 45
                color: "#0c0b0d"; border.width: 1; border.color: g.accent
            }
        }
    }

    // Label set into the top edge, flanked by diamonds
    Rectangle {
        visible: g.label.length > 0
        x: 26; y: -8
        width: lab.implicitWidth + 34; height: 16
        color: "#0c0b0d"
        Rectangle { x: 4; anchors.verticalCenter: parent.verticalCenter; width: 5; height: 5; rotation: 45; color: g.accent }
        Text {
            id: lab
            anchors.centerIn: parent
            text: g.label
            font.family: g.core.pal.mono; font.pixelSize: 10; font.letterSpacing: 3
            color: g.accent
        }
        Rectangle { anchors.right: parent.right; anchors.rightMargin: 4; anchors.verticalCenter: parent.verticalCenter; width: 5; height: 5; rotation: 45; color: g.accent }
    }

    Item {
        id: body
        anchors.fill: parent
    }
}
