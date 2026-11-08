import QtQuick

// A meter drawn as a strand of barbed wire: a dim strand, a pale filled strand,
// and little crossed barbs knotted along the filled part.
Item {
    id: bw
    property var core
    property real value: 0
    property color fill: core.pal.petal
    implicitHeight: 9

    Rectangle {
        anchors.verticalCenter: parent.verticalCenter
        width: parent.width; height: 1
        color: bw.core.pal.dim
    }
    Rectangle {
        anchors.verticalCenter: parent.verticalCenter
        width: parent.width * Math.max(0, Math.min(1, bw.value)); height: 1
        color: bw.fill
        Behavior on width { NumberAnimation { duration: 600; easing.type: Easing.OutCubic } }
    }
    Repeater {
        model: Math.max(0, Math.floor(bw.width / 16))
        delegate: Item {
            required property int index
            readonly property bool lit: (index * 16 + 8) / bw.width <= bw.value
            x: index * 16 + 4; y: 0
            width: 8; height: bw.height
            Rectangle { anchors.centerIn: parent; width: 9; height: 1; rotation: 50; color: parent.lit ? bw.fill : bw.core.pal.dim }
            Rectangle { anchors.centerIn: parent; width: 9; height: 1; rotation: -50; color: parent.lit ? bw.fill : bw.core.pal.dim }
        }
    }
}
