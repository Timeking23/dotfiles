import QtQuick

// Blossoms shed from the figure on the left and drift off with the smoke.
// Positions are fractions of the screen so it works on any monitor.
Item {
    id: pt
    property var core
    readonly property int count: 22

    Repeater {
        model: pt.count
        delegate: Item {
            id: petal
            required property int index
            // Deterministic per-petal randomness
            function rnd(k) { var v = Math.sin((index + 1) * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v) }
            readonly property real life: 11 + rnd(1) * 9
            readonly property real offset: rnd(2) * life
            readonly property real t: ((pt.core.clock + offset) % life) / life
            readonly property real x0: pt.width * (0.12 + rnd(3) * 0.15)
            readonly property real y0: pt.height * (0.12 + rnd(4) * 0.4)
            readonly property real reach: pt.width * (0.3 + rnd(5) * 0.45)
            readonly property real fall: pt.height * (0.15 + rnd(6) * 0.45)
            readonly property real sway: 18 + rnd(7) * 40
            readonly property real size: 5 + rnd(8) * 7

            x: x0 + reach * t + sway * Math.sin(t * 9 + index)
            y: y0 + fall * t * t + 10 * Math.sin(t * 5 + index * 2)
            opacity: Math.min(1, t * 6) * (1 - Math.pow(t, 3)) * (0.55 + rnd(9) * 0.45)
            rotation: t * (360 + rnd(10) * 540) * (rnd(11) > 0.5 ? 1 : -1)
            visible: pt.core.fx || opacity > 0

            Rectangle {
                width: petal.size; height: petal.size * 1.55
                radius: width / 2
                // Flip in 3D to fake tumbling
                transform: Scale { origin.x: petal.size / 2; xScale: Math.cos(petal.t * 14 + petal.index) }
                gradient: Gradient {
                    GradientStop { position: 0; color: pt.core.pal.petal }
                    GradientStop { position: 1; color: pt.core.pal.petalDeep }
                }
            }
        }
    }
}
