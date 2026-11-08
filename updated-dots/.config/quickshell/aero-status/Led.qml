import QtQuick
import QtQuick.Effects

Item {
    id: l
    property string label: ""
    property int value: 0
    property bool live: true
    property real shown: value
    Behavior on shown { enabled: l.live; NumberAnimation { duration: 1400; easing.type: Easing.OutCubic } }
    height: 36

    Text {
        anchors.verticalCenter: parent.verticalCenter
        text: l.label
        font.family: "Michroma"
        font.pixelSize: 10
        color: "#ffe25a"
    }
    Rectangle {
        x: 36
        width: parent.width - 36
        height: parent.height
        color: "#c0060003"
        border.width: 1
        border.color: "#507a1020"
        Text {
            anchors.centerIn: parent
            text: "8888"
            font.family: "JetBrainsMono Nerd Font"
            font.weight: Font.Bold
            font.pixelSize: 19
            color: "#2a070c"
        }
        Text {
            anchors.centerIn: parent
            text: String(Math.round(l.shown)).padStart(4, "0")
            font.family: "JetBrainsMono Nerd Font"
            font.weight: Font.Bold
            font.pixelSize: 19
            color: "#ff4a58"
            layer.enabled: true
            layer.effect: MultiEffect {
                shadowEnabled: true
                shadowColor: "#ff2030"
                shadowBlur: 0.7
                blurMax: 12
                shadowHorizontalOffset: 0
                shadowVerticalOffset: 0
                shadowOpacity: 0.95
                autoPaddingEnabled: true
            }
        }
    }
}
