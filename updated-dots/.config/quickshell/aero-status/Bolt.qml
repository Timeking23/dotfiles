import QtQuick

Rectangle {
    width: 22; height: 22
    radius: 11
    border.width: 1
    border.color: "#2c2f33"
    gradient: Gradient {
        GradientStop { position: 0; color: "#f6f7f8" }
        GradientStop { position: 0.45; color: "#a4a8ac" }
        GradientStop { position: 1; color: "#4c5054" }
    }
    Rectangle {
        anchors.centerIn: parent
        width: 14; height: 3
        rotation: 35
        color: "#3a3d41"
    }
}
