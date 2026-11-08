import QtQuick

Rectangle {
    property string text: ""
    height: 36
    border.width: 2
    border.color: "#2c2f33"
    radius: 3
    gradient: Gradient {
        GradientStop { position: 0; color: "#c5c8cb" }
        GradientStop { position: 0.5; color: "#8f9397" }
        GradientStop { position: 1; color: "#65696d" }
    }
    Text {
        anchors.centerIn: parent
        text: parent.text
        font.family: "Michroma"
        font.pixelSize: 15
        color: "#16181b"
    }
}
