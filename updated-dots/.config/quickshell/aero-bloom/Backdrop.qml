import QtQuick
import Quickshell

// The wallpaper, with animated fog, grain and vignette on top. `wall` is the plain
// image, which the glass cards blur behind themselves. When core.video is set (a Wallpaper
// Engine video from live-wall.sh), VideoWall plays it in place of the image.
Item {
    id: bd
    property var core
    readonly property Item wall: img

    Image {
        id: img
        anchors.fill: parent
        source: "file://" + (bd.core.still.length ? bd.core.still : Quickshell.env("HOME") + "/.config/hyper-aero/wallpapers/bloom.png")
        fillMode: Image.PreserveAspectCrop
        asynchronous: false
        smooth: true
    }

    ShaderEffect {
        anchors.fill: parent
        visible: !vid.active
        readonly property var src: img
        readonly property size res: Qt.size(width, height)
        readonly property size tex: Qt.size(Math.max(1, img.sourceSize.width), Math.max(1, img.sourceSize.height))
        readonly property real time: bd.core.clock
        fragmentShader: "shaders/fog.frag.qsb"
    }

    Loader {
        id: vid
        anchors.fill: parent
        active: bd.core.video.length > 0
        source: "VideoWall.qml"
        onLoaded: item.core = bd.core
    }
}
