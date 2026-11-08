import QtQuick
import QtMultimedia

// A Wallpaper Engine video played as Bloom's backdrop, with the same grain and vignette
// as the still image. Loaded by Backdrop.qml only while a video wallpaper is on.
Item {
    id: vw
    property var core

    VideoOutput {
        id: vo
        anchors.fill: parent
        fillMode: VideoOutput.PreserveAspectCrop
    }

    MediaPlayer {
        id: player
        source: vw.core && vw.core.video.length ? "file://" + vw.core.video : ""
        videoOutput: vo
        loops: MediaPlayer.Infinite
        Component.onCompleted: play()
        onSourceChanged: play()
    }

    // Pause while windows cover the desktop.
    Connections {
        target: vw.core
        function onCoveredChanged() {
            if (vw.core.covered) player.pause()
            else player.play()
        }
    }

    // Vignette, drawn rather than shaded so nothing here samples the video.
    Rectangle {
        anchors.fill: parent
        gradient: Gradient {
            GradientStop { position: 0; color: "#50000000" }
            GradientStop { position: 0.2; color: "#00000000" }
            GradientStop { position: 0.8; color: "#00000000" }
            GradientStop { position: 1; color: "#70000000" }
        }
    }
}
