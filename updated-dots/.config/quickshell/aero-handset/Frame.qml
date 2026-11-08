import QtQuick
import Quickshell
import Quickshell.Wayland

// One copy of the phone on one layer. shell.qml makes a Top copy (used while the browser
// is in front or the phone is animating) and a Bottom copy (when another floating window has focus,
// so that window can sit over the phone instead of under it).
PanelWindow {
    id: frame
    property var core
    property bool topLayer: false
    property bool wanted: false
    readonly property real s: core.scaleFor(height, width)

    visible: wanted
    color: "transparent"
    anchors {
        top: true
        bottom: true
        left: true
        right: true
    }
    exclusionMode: ExclusionMode.Ignore
    // Not "aero-*": hyprland.lua blurs behind every aero-* layer, which smeared the
    // desktop behind the phone (most visibly while closing).
    WlrLayershell.namespace: "handset-frame"
    WlrLayershell.layer: topLayer ? WlrLayer.Top : WlrLayer.Bottom
    WlrLayershell.keyboardFocus: WlrKeyboardFocus.None
    // Only the phone body takes clicks; the screen hole and everything else fall through.
    mask: Region {
        item: phone
        Region {
            x: frame.core.at.x
            y: frame.core.at.y
            width: frame.core.hole.width * frame.s
            height: frame.core.hole.height * frame.s
            intersection: Intersection.Subtract
        }
    }

    Phone {
        id: phone
        s: frame.s
        // While opening/closing, sit where place() puts the window (centred under the
        // bar); once in use, follow the window so dragging it moves the phone too.
        readonly property bool follow: frame.core.phase === "on"
        x: follow ? frame.core.at.x - frame.core.hole.x * frame.s : Math.round((frame.width - frame.core.artW * frame.s) / 2)
        y: follow ? frame.core.at.y - frame.core.hole.y * frame.s : frame.core.barH + 10
        width: frame.core.artW * frame.s
        height: frame.core.artH * frame.s
        phase: frame.core.phase
        hole: frame.core.hole
        sliderY: frame.core.sliderY
        lift: frame.height
        // Only the Top copy drives the shared state; both copies animate identically.
        // Full opacity even when unfocused: Hyprland's inactive_opacity (0.9) over the
        // black phone body made the browser look dim until it was clicked.
        onPoweredOn: if (frame.topLayer && frame.core.addr.length)
            frame.core.sh([frame.core.prop("opacity", "1"), frame.core.prop("opacity_inactive", "1"),
                           frame.core.prop("opacity_override", "1"), frame.core.prop("opacity_inactive_override", "1")])
        onOpened: if (frame.topLayer) frame.core.phase = frame.core.addr.length ? "on" : "closing"
        onClosed: if (frame.topLayer) frame.core.phase = "off"
        onClicked: frame.core.focusBrowser()
    }
}
