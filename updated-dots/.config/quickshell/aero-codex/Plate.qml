import QtQuick

Rectangle {
    default property alias content: inner.data
    property int frame: 3
    radius: 3
    gradient: Gradient {
        GradientStop { position: 0; color: "#f2d98c" }
        GradientStop { position: 0.35; color: "#8a6a2c" }
        GradientStop { position: 0.6; color: "#d8b868" }
        GradientStop { position: 1; color: "#4e3a14" }
    }
    Rectangle {
        id: inner
        anchors.fill: parent
        anchors.margins: parent.frame
        radius: 2
        color: "#000000"
        clip: true
    }
}
