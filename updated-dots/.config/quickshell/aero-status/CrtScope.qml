import QtQuick
import QtQuick.Effects

Rectangle {
    id: s
    property string title: ""
    property var hist: []
    property int load: 0
    property int heat: 0
    property int hotAt: 90
    property string line1: ""
    property string line2: ""
    property bool live: true
    property real clock: 0
    property real stamp: 0
    property real shownLoad: load
    property real shownHeat: heat
    readonly property color green: "#39ff8a"
    readonly property bool hot: heat >= hotAt
    readonly property real dpr: Math.max(1, Screen.devicePixelRatio)
    readonly property real stepX: scroller.width / 118
    Behavior on shownLoad { enabled: s.live; NumberAnimation { duration: 900; easing.type: Easing.OutCubic } }
    Behavior on shownHeat { enabled: s.live; NumberAnimation { duration: 1400; easing.type: Easing.OutCubic } }
    height: 112
    color: "#5a021a10"
    border.width: 1
    border.color: "#401f9a58"
    radius: 3

    onHistChanged: {
        if (!live) return
        plot.requestPaint()
        stamp = clock
    }
    onLiveChanged: if (live) plot.requestPaint()

    Text {
        x: 14; y: 11
        text: s.title
        font.family: "Michroma"
        font.pixelSize: 14
        color: s.green
    }
    Text {
        id: heatText
        x: 92; y: 8
        text: Math.round(s.shownHeat) + "°C"
        font.family: "JetBrainsMono Nerd Font"
        font.weight: Font.Bold
        font.pixelSize: 19
        color: s.hot ? "#ff4a5a" : "#ffe25a"
        Behavior on color { ColorAnimation { duration: 400 } }
        SequentialAnimation on opacity {
            running: s.hot && s.live
            loops: Animation.Infinite
            NumberAnimation { to: 0.55; duration: 650; easing.type: Easing.InOutSine }
            NumberAnimation { to: 1; duration: 650; easing.type: Easing.InOutSine }
            onRunningChanged: if (!running) heatText.opacity = 1
        }
    }
    Text {
        anchors.right: parent.right
        anchors.rightMargin: 14
        y: 3
        text: Math.round(s.shownLoad) + "%"
        font.family: "JetBrainsMono Nerd Font"
        font.weight: Font.Bold
        font.pixelSize: 27
        color: s.green
        layer.enabled: true
        layer.effect: MultiEffect {
            shadowEnabled: true
            shadowColor: "#39ff8a"
            shadowBlur: 0.6
            blurMax: 14
            shadowHorizontalOffset: 0
            shadowVerticalOffset: 0
            shadowOpacity: 0.7
            autoPaddingEnabled: true
        }
    }

    Item {
        id: scroller
        x: 14; y: 40
        width: parent.width - 28
        height: 42
        clip: true

        Canvas {
            id: plot
            width: Math.ceil((parent.width + s.stepX) * s.dpr)
            height: Math.ceil(parent.height * s.dpr)
            transformOrigin: Item.TopLeft
            scale: 1 / s.dpr
            transform: Translate { x: -s.stepX * Math.min(1, (s.clock - s.stamp) / 2) }
            onPaint: {
                var c = getContext("2d")
                c.setTransform(1, 0, 0, 1, 0, 0)
                c.clearRect(0, 0, width, height)
                var h = s.hist
                if (h.length < 2) return
                c.scale(s.dpr, s.dpr)
                var w = width / s.dpr, hh = height / s.dpr
                var dx = s.stepX
                var x0 = w - (h.length - 1) * dx
                function yy(v) { return hh - 3 - (hh - 8) * Math.min(100, v) / 100 }
                function trace() {
                    c.beginPath()
                    c.moveTo(x0, yy(h[0]))
                    for (var k = 1; k < h.length; k++) {
                        var mx = x0 + (k - 0.5) * dx
                        c.quadraticCurveTo(x0 + (k - 1) * dx, yy(h[k - 1]), mx, (yy(h[k - 1]) + yy(h[k])) / 2)
                    }
                    c.lineTo(w, yy(h[h.length - 1]))
                }
                var fill = c.createLinearGradient(0, 0, 0, hh)
                fill.addColorStop(0, "rgba(57,255,138,0.32)")
                fill.addColorStop(1, "rgba(57,255,138,0.0)")
                trace()
                c.lineTo(w, hh)
                c.lineTo(x0, hh)
                c.closePath()
                c.fillStyle = fill
                c.fill()
                c.lineJoin = "round"
                c.strokeStyle = "rgba(57,255,138,0.28)"
                c.lineWidth = 5
                trace()
                c.stroke()
                c.strokeStyle = "#7dffb0"
                c.lineWidth = 1.5
                trace()
                c.stroke()
            }
        }

        Rectangle {
            id: sweepLine
            width: 46; height: parent.height
            x: -46 + ((s.clock / 4.2) % 1) * (scroller.width + 46)
            gradient: Gradient {
                orientation: Gradient.Horizontal
                GradientStop { position: 0; color: "#0039ff8a" }
                GradientStop { position: 0.85; color: "#2439ff8a" }
                GradientStop { position: 1; color: "#0039ff8a" }
            }
        }
    }

    Text {
        x: 14
        anchors.bottom: parent.bottom
        anchors.bottomMargin: 8
        text: s.line1
        font.family: "JetBrainsMono Nerd Font"
        font.pixelSize: 13
        color: "#a8f0c4"
    }
    Text {
        anchors.right: parent.right
        anchors.rightMargin: 14
        anchors.bottom: parent.bottom
        anchors.bottomMargin: 8
        text: s.line2
        font.family: "JetBrainsMono Nerd Font"
        font.pixelSize: 13
        color: "#a8f0c4"
    }
}
