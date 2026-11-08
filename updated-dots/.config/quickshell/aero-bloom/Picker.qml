import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Wayland

// Wallpaper picker, after easy-paper: a 3D carousel of tall 9:16 preview cards. Holds the
// still images and every Wallpaper Engine workshop wallpaper (from live-wall.sh json).
// Arrows / wheel / drag to browse, click the centre card or press Enter to apply, Esc to
// close. Opened with Super+Shift+J or by clicking the image icon in the bar.
PanelWindow {
    id: pick
    property var core
    property bool shown: false
    property var items: []
    property int cur: 0

    function show() {
        lister.running = true
        shown = true
    }
    function hide() { shown = false }
    function apply(it) {
        if (!it) return
        if (it.kind === "still") core.run("live-wall.sh", ["still", it.id])
        else core.run("live-wall.sh", ["on", it.id])
        hide()
    }

    visible: shown
    color: "transparent"
    anchors {
        top: true
        bottom: true
        left: true
        right: true
    }
    exclusionMode: ExclusionMode.Ignore
    WlrLayershell.namespace: "bloom-picker"
    WlrLayershell.layer: WlrLayer.Overlay
    WlrLayershell.keyboardFocus: WlrKeyboardFocus.Exclusive

    Process {
        id: lister
        command: [Quickshell.env("HOME") + "/.config/hyper-aero/scripts/live-wall.sh", "json"]
        stdout: StdioCollector {
            onStreamFinished: {
                try {
                    var list = JSON.parse(text)
                    pick.items = list
                    var a = 0
                    for (var i = 0; i < list.length; i++) if (list[i].active) a = i
                    pick.cur = a
                    view.currentIndex = a
                    view.positionViewAtIndex(a, PathView.Center)
                } catch (e) {
                }
            }
        }
    }

    // Dim the desktop
    Rectangle {
        anchors.fill: parent
        color: "#0a090a"
        opacity: pick.shown ? 0.82 : 0
        Behavior on opacity { NumberAnimation { duration: 200 } }
        MouseArea { anchors.fill: parent; onClicked: pick.hide() }
    }

    Item {
        id: stageBox
        anchors.fill: parent
        focus: pick.shown
        opacity: pick.shown ? 1 : 0
        Behavior on opacity { NumberAnimation { duration: 220 } }

        Keys.onPressed: function(e) {
            if (e.key === Qt.Key_Escape) pick.hide()
            else if (e.key === Qt.Key_Left || e.key === Qt.Key_H) view.decrementCurrentIndex()
            else if (e.key === Qt.Key_Right || e.key === Qt.Key_L) view.incrementCurrentIndex()
            else if (e.key === Qt.Key_Return || e.key === Qt.Key_Enter || e.key === Qt.Key_Space) pick.apply(pick.items[view.currentIndex])
            else return
            e.accepted = true
        }

        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            y: parent.height * 0.08
            text: "choose a wallpaper"
            font.family: pick.core.pal.serif; font.italic: true; font.pixelSize: 40
            color: pick.core.pal.ink
        }

        PathView {
            id: view
            anchors.fill: parent
            model: pick.items.length
            pathItemCount: Math.min(9, pick.items.length)
            preferredHighlightBegin: 0.5
            preferredHighlightEnd: 0.5
            highlightRangeMode: PathView.StrictlyEnforceRange
            snapMode: PathView.SnapToItem
            highlightMoveDuration: 320
            onCurrentIndexChanged: pick.cur = currentIndex

            path: Path {
                startX: -view.width * 0.1; startY: view.height * 0.5
                PathAttribute { name: "z"; value: 0 }
                PathAttribute { name: "k"; value: 0.55 }
                PathAttribute { name: "turn"; value: 55 }
                PathAttribute { name: "fade"; value: 0.25 }
                PathQuad { x: view.width * 0.5; y: view.height * 0.5; controlX: view.width * 0.2; controlY: view.height * 0.5 }
                PathAttribute { name: "z"; value: 100 }
                PathAttribute { name: "k"; value: 1.0 }
                PathAttribute { name: "turn"; value: 0 }
                PathAttribute { name: "fade"; value: 1 }
                PathQuad { x: view.width * 1.1; y: view.height * 0.5; controlX: view.width * 0.8; controlY: view.height * 0.5 }
                PathAttribute { name: "z"; value: 0 }
                PathAttribute { name: "k"; value: 0.55 }
                PathAttribute { name: "turn"; value: -55 }
                PathAttribute { name: "fade"; value: 0.25 }
            }

            delegate: Item {
                id: card
                required property int index
                readonly property var it: pick.items[index] || ({})
                readonly property bool centre: PathView.isCurrentItem
                readonly property bool anim: (it.preview || "").toLowerCase().endsWith(".gif")
                width: 270; height: 480
                z: PathView.z || 0
                scale: PathView.k || 0.5
                opacity: PathView.fade || 0
                transform: Rotation {
                    origin.x: card.width / 2; origin.y: card.height / 2
                    axis { x: 0; y: 1; z: 0 }
                    angle: card.PathView.turn || 0
                }

                // Card shadow
                Rectangle {
                    x: 10; y: 16; width: parent.width; height: parent.height
                    radius: 18; color: "#000000"; opacity: 0.55
                }
                Rectangle {
                    id: face
                    anchors.fill: parent
                    radius: 18
                    color: "#141214"
                    clip: true
                    border.width: card.centre ? 2 : 1
                    border.color: card.centre ? pick.core.pal.petal : pick.core.pal.edge

                    Image {
                        anchors.fill: parent
                        anchors.margins: 2
                        opacity: card.it.note ? 0.35 : 1
                        visible: !card.anim
                        source: !card.anim && card.it.preview ? "file://" + card.it.preview : ""
                        sourceSize: Qt.size(540, 960)
                        fillMode: Image.PreserveAspectCrop
                        asynchronous: true
                        cache: true
                    }
                    AnimatedImage {
                        anchors.fill: parent
                        anchors.margins: 2
                        visible: card.anim
                        source: card.anim ? "file://" + card.it.preview : ""
                        fillMode: Image.PreserveAspectCrop
                        asynchronous: true
                        // Only the cards near the middle animate.
                        playing: pick.shown && Math.abs(card.index - view.currentIndex) <= 1
                    }

                    // Caption
                    Rectangle {
                        anchors.left: parent.left; anchors.right: parent.right; anchors.bottom: parent.bottom
                        height: 92
                        gradient: Gradient {
                            GradientStop { position: 0; color: "#000c0b0d" }
                            GradientStop { position: 1; color: "#f00c0b0d" }
                        }
                    }
                    Text {
                        x: 16; anchors.bottom: parent.bottom; anchors.bottomMargin: 36
                        width: parent.width - 32
                        elide: Text.ElideRight
                        text: (card.it.title || "").toLowerCase()
                        font.family: pick.core.pal.serif; font.italic: true; font.pixelSize: 22
                        color: pick.core.pal.ink
                    }
                    Row {
                        x: 16; anchors.bottom: parent.bottom; anchors.bottomMargin: 14
                        spacing: 8
                        Text {
                            text: card.it.note ? "NOT SUPPORTED ON LINUX"
                                : ({ video: "VIDEO", still: "STILL", preset: "PRESET" })[card.it.type] || "SCENE"
                            font.family: pick.core.pal.mono; font.pixelSize: 10; font.letterSpacing: 3
                            color: pick.core.pal.petal
                        }
                        Text {
                            visible: !!card.it.active
                            text: "· NOW"
                            font.family: pick.core.pal.mono; font.pixelSize: 10; font.letterSpacing: 3
                            color: pick.core.pal.ink
                        }
                    }
                }

                MouseArea {
                    anchors.fill: parent
                    cursorShape: Qt.PointingHandCursor
                    onClicked: {
                        if (card.centre) pick.apply(card.it)
                        else view.currentIndex = card.index
                    }
                }
            }

            MouseArea {
                anchors.fill: parent
                z: -1
                onWheel: function(e) {
                    if (e.angleDelta.y > 0 || e.angleDelta.x > 0) view.decrementCurrentIndex()
                    else view.incrementCurrentIndex()
                }
                onClicked: pick.hide()
            }
        }

        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            anchors.bottom: parent.bottom
            anchors.bottomMargin: parent.height * 0.08
            text: "←  →  BROWSE    ·    CLICK / ENTER  SET    ·    ESC  CLOSE"
            font.family: pick.core.pal.mono; font.pixelSize: 11; font.letterSpacing: 3
            color: pick.core.pal.muted
        }
    }
}
