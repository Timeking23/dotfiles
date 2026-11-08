import QtQuick

Rectangle {
    id: g
    property string title: ""
    property string caption: ""
    property real frac: 0
    property color from: "#ff3a4a"
    property color to: "#ffe25a"
    property real clock: 0
    height: 68
    color: "transparent"
    border.width: 1
    border.color: "#303fa0e0"
    radius: 3

    Text {
        x: 14; y: 9
        text: g.title
        font.family: "Michroma"
        font.pixelSize: 12
        color: "#ffe25a"
    }
    Text {
        anchors.right: parent.right
        anchors.rightMargin: 14
        y: 6
        text: g.caption
        font.family: "JetBrainsMono Nerd Font"
        font.weight: Font.Bold
        font.pixelSize: 15
        color: "#ffffff"
    }
    Rectangle {
        x: 14
        y: 38
        width: parent.width - 28
        height: 18
        color: "#a0050c14"
        border.width: 1
        border.color: "#403fa0e0"
        clip: true
        Rectangle {
            x: 2; y: 2
            height: parent.height - 4
            width: (parent.width - 4) * Math.max(0, Math.min(1, g.frac))
            gradient: Gradient {
                orientation: Gradient.Horizontal
                GradientStop { position: 0; color: g.from }
                GradientStop { position: 1; color: g.to }
            }
            Behavior on width { NumberAnimation { duration: 900; easing.type: Easing.OutCubic } }
            clip: true
            Rectangle {
                width: 90; height: parent.height
                readonly property real phase: (g.clock / 6.4) % 1
                x: phase < 0.4 ? -90 + phase / 0.4 * (g.width + 90) : -90
                gradient: Gradient {
                    orientation: Gradient.Horizontal
                    GradientStop { position: 0; color: "#00ffffff" }
                    GradientStop { position: 0.5; color: "#66ffffff" }
                    GradientStop { position: 1; color: "#00ffffff" }
                }
            }
        }
    }
}
