import QtQuick

// One app as a magazine cover. The style, colours and tilt come from a hash of the app id,
// so every app keeps the same cover between openings.
Item {
    id: c
    property var app
    property bool chosen: false
    property bool running: false
    property bool fresh: false
    property int uses: 0
    property string kindName: ""

    readonly property int seed: {
        var h = 7
        var s = app ? app.key : ""
        for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 100003
        return h
    }
    readonly property int style: seed % 6
    readonly property var inks: ["#e8242c", "#f2c400", "#1f4fd8", "#ff6fa8", "#00a37a", "#ff7a00", "#7b2cbf", "#b8e000", "#18b4c8", "#c0392b"]
    readonly property color ink: inks[Math.floor(seed / 6) % inks.length]
    readonly property color ink2: inks[Math.floor(seed / 60) % inks.length]
    readonly property real tilt: ((seed % 7) - 3) * 0.55
    readonly property string issue: "VOL." + (seed % 40 + 1) + " · NO." + (app ? app.num : 0)
    readonly property string blurb: app ? (app.comment || app.generic || "The one everyone is talking about") : ""
    readonly property string masthead: app ? app.name : ""

    function dark(col) { return (0.299 * col.r + 0.587 * col.g + 0.114 * col.b) < 0.55 }

    rotation: chosen ? 0 : tilt
    scale: chosen ? 1.07 : 1
    z: chosen ? 2 : 0
    Behavior on scale { NumberAnimation { duration: 160; easing.type: Easing.OutCubic } }
    Behavior on rotation { NumberAnimation { duration: 160; easing.type: Easing.OutCubic } }

    // Drop shadow on the rack
    Rectangle {
        x: c.chosen ? 10 : 5; y: c.chosen ? 14 : 6
        width: parent.width; height: parent.height
        color: "#000000"
        opacity: c.chosen ? 0.35 : 0.3
        Behavior on x { NumberAnimation { duration: 160 } }
    }

    Rectangle {
        id: page
        anchors.fill: parent
        clip: true
        color: ["#f4efe6", "#ffffff", "#ece6d6", "#101014", "#ffffff", "#0b0b0b"][c.style]

        // ── 0: fashion monthly — full-bleed ink, Didone masthead behind the "model"
        Item {
            anchors.fill: parent
            visible: c.style === 0
            Rectangle { anchors.fill: parent; color: c.ink }
            Text {
                x: 8; y: 4; width: parent.width - 16; height: 58
                text: c.masthead.toUpperCase()
                font.family: "Playfair Display"; font.weight: Font.Black
                font.pixelSize: 58; fontSizeMode: Text.Fit; minimumPixelSize: 12
                wrapMode: Text.WordWrap; maximumLineCount: 2; lineHeight: 0.85
                horizontalAlignment: Text.AlignHCenter; verticalAlignment: Text.AlignVCenter
                color: c.dark(c.ink) ? "#ffffff" : "#111111"
            }
            Text {
                x: 10; y: parent.height - 92; width: parent.width - 60
                text: c.blurb
                wrapMode: Text.WordWrap; maximumLineCount: 4; elide: Text.ElideRight
                font.family: "Playfair Display"; font.italic: true; font.pixelSize: 13
                color: c.dark(c.ink) ? "#ffffff" : "#111111"
            }
        }

        // ── 1: tech monthly — white, black slab masthead, colour blocks
        Item {
            anchors.fill: parent
            visible: c.style === 1
            Rectangle { x: 0; y: 0; width: parent.width; height: 58; color: "#111111" }
            Rectangle { x: 0; y: 58; width: parent.width * 0.62; height: 8; color: c.ink }
            Rectangle { x: parent.width * 0.62; y: 58; width: parent.width * 0.38; height: 8; color: c.ink2 }
            Text {
                x: 10; y: 6; width: parent.width - 20; height: 48
                text: c.masthead.toUpperCase()
                font.family: "Archivo Black"
                font.pixelSize: 44; fontSizeMode: Text.Fit; minimumPixelSize: 14
                verticalAlignment: Text.AlignVCenter
                color: "#ffffff"
            }
            Rectangle {
                x: 12; y: 76; width: parent.width - 24; height: 110
                color: c.ink
            }
            Text {
                x: 12; y: parent.height - 66; width: parent.width - 24
                text: c.blurb.toUpperCase()
                wrapMode: Text.WordWrap; maximumLineCount: 3; elide: Text.ElideRight
                font.family: "Archivo Black"; font.pixelSize: 12; lineHeight: 0.95
                color: "#111111"
            }
        }

        // ── 2: photocopied zine — paper, tape, typewriter, marker circle
        Item {
            anchors.fill: parent
            visible: c.style === 2
            Repeater {
                model: 26
                delegate: Rectangle {
                    required property int index
                    x: (c.seed * (index + 3) * 37) % page.width
                    y: (c.seed * (index + 5) * 53) % page.height
                    width: 1 + index % 3; height: 1 + (index * 7) % 3
                    color: "#2a2620"; opacity: 0.35
                }
            }
            Text {
                x: 10; y: 8; width: parent.width - 20; height: 46
                text: c.masthead.toLowerCase()
                font.family: "Special Elite"
                font.pixelSize: 40; fontSizeMode: Text.Fit; minimumPixelSize: 11
                wrapMode: Text.WordWrap; maximumLineCount: 2; lineHeight: 0.85; verticalAlignment: Text.AlignVCenter
                color: "#111111"
            }
            Rectangle { x: 10; y: 58; width: parent.width - 20; height: 2; color: "#111111" }
            Rectangle {
                x: 18; y: 72; width: parent.width - 36; height: 114
                color: "#111111"
                rotation: -2
                Rectangle { anchors.fill: parent; anchors.margins: 5; color: "#d8d2c2" }
            }
            Rectangle { x: 6; y: 66; width: 54; height: 16; rotation: -28; color: "#c8e8d8f0"; opacity: 0.75 }
            Rectangle { x: parent.width - 58; y: 70; width: 54; height: 16; rotation: 24; color: "#f0e8b0"; opacity: 0.75 }
            Text {
                x: 12; y: parent.height - 66; width: parent.width - 60
                text: c.blurb
                wrapMode: Text.WordWrap; maximumLineCount: 3; elide: Text.ElideRight
                font.family: "Special Elite"; font.pixelSize: 11
                color: "#111111"
            }
        }

        // ── 3: Y2K glossy — chrome gradient, condensed caps, starburst sticker
        Item {
            anchors.fill: parent
            visible: c.style === 3
            Rectangle {
                anchors.fill: parent
                gradient: Gradient {
                    GradientStop { position: 0; color: Qt.lighter(c.ink, 1.5) }
                    GradientStop { position: 0.45; color: c.ink }
                    GradientStop { position: 0.5; color: Qt.darker(c.ink, 1.8) }
                    GradientStop { position: 1; color: c.ink2 }
                }
            }
            Rectangle {
                x: -20; y: 70; width: parent.width + 40; height: 2
                rotation: -12; color: "#80ffffff"
            }
            Text {
                x: 8; y: 2; width: parent.width - 16; height: 64
                text: c.masthead.toUpperCase()
                font.family: "Bebas Neue"
                font.pixelSize: 70; fontSizeMode: Text.Fit; minimumPixelSize: 14
                wrapMode: Text.WordWrap; maximumLineCount: 2; lineHeight: 0.8; verticalAlignment: Text.AlignVCenter
                color: "#ffffff"
                style: Text.Outline; styleColor: Qt.darker(c.ink, 2.4)
            }
            Text {
                x: 10; y: parent.height - 78; width: parent.width - 80
                text: c.blurb.toUpperCase()
                wrapMode: Text.WordWrap; maximumLineCount: 3; elide: Text.ElideRight
                font.family: "Bebas Neue"; font.pixelSize: 17; lineHeight: 0.9
                color: "#ffffff"
                style: Text.Raised; styleColor: "#80000000"
            }
        }

        // ── 4: news weekly — thick ink border, serif masthead
        Item {
            anchors.fill: parent
            visible: c.style === 4
            Rectangle { anchors.fill: parent; color: "transparent"; border.width: 9; border.color: c.ink }
            Text {
                x: 14; y: 10; width: parent.width - 28; height: 54
                text: c.masthead.toUpperCase()
                font.family: "DM Serif Display"
                font.pixelSize: 54; fontSizeMode: Text.Fit; minimumPixelSize: 12
                wrapMode: Text.WordWrap; maximumLineCount: 2; lineHeight: 0.85; verticalAlignment: Text.AlignVCenter
                horizontalAlignment: Text.AlignHCenter
                color: c.ink
            }
            Text {
                x: 14; y: parent.height - 80; width: parent.width - 28
                text: c.blurb
                wrapMode: Text.WordWrap; maximumLineCount: 3; elide: Text.ElideRight
                horizontalAlignment: Text.AlignHCenter
                font.family: "DM Serif Display"; font.italic: true; font.pixelSize: 14
                color: "#111111"
            }
        }

        // ── 5: editorial / culture — black, vertical condensed masthead, accent rule
        Item {
            anchors.fill: parent
            visible: c.style === 5
            Text {
                x: -parent.height / 2 + 30; y: parent.height / 2 - 30
                width: parent.height - 24; height: 60
                rotation: -90
                text: c.masthead.toUpperCase()
                font.family: "Anton"
                font.pixelSize: 58; fontSizeMode: Text.Fit; minimumPixelSize: 18
                verticalAlignment: Text.AlignVCenter
                color: c.ink
            }
            Rectangle { x: 70; y: 14; width: 2; height: parent.height - 28; color: "#ffffff"; opacity: 0.6 }
            Text {
                x: 82; y: parent.height - 92; width: parent.width - 94
                text: c.blurb
                wrapMode: Text.WordWrap; maximumLineCount: 4; elide: Text.ElideRight
                font.family: "Playfair Display"; font.pixelSize: 12
                color: "#f0f0f0"
            }
        }

        // The cover "photo": the app icon
        Image {
            id: photo
            readonly property var box: [
                Qt.rect(page.width - 112, 64, 100, 100),
                Qt.rect((page.width - 96) / 2, 83, 96, 96),
                Qt.rect((page.width - 92) / 2, 82, 92, 92),
                Qt.rect((page.width - 100) / 2, 78, 100, 100),
                Qt.rect((page.width - 104) / 2, 70, 104, 104),
                Qt.rect(84, 40, page.width - 98, page.width - 98)
            ][c.style]
            x: box.x; y: box.y; width: box.width; height: box.height
            rotation: c.style === 2 ? -2 : 0
            fillMode: Image.PreserveAspectFit
            sourceSize: Qt.size(256, 256)
            source: c.app ? c.app.icon : ""
            asynchronous: true
            mipmap: true
        }

        // Issue line
        Text {
            x: c.style === 5 ? 82 : 10
            y: [66, 70, 58, 66, 60, 16][c.style]
            text: c.issue + "  ·  NOV 2026"
            font.family: "Bebas Neue"; font.pixelSize: 12; font.letterSpacing: 1
            color: [c.dark(c.ink) ? "#ffffff" : "#111111", "#111111", "#111111", "#ffffff", "#111111", "#ffffff"][c.style]
            opacity: 0.85
        }

        // Starburst / tag in the corner: running apps get "NOW PLAYING"
        Item {
            visible: c.running || c.fresh || c.uses > 4
            x: parent.width - 66; y: parent.height * 0.42
            width: 58; height: 58
            rotation: 14
            Repeater {
                model: 3
                delegate: Rectangle {
                    required property int index
                    anchors.fill: parent
                    rotation: index * 30
                    color: c.fresh ? "#ff2d8a" : (c.running ? "#ffd400" : "#ffffff")
                }
            }
            Text {
                anchors.centerIn: parent
                width: 50
                horizontalAlignment: Text.AlignHCenter
                wrapMode: Text.WordWrap
                text: c.fresh ? "NEW!" : (c.running ? "NOW\nOPEN" : "FAN\nFAVE")
                font.family: "Anton"; font.pixelSize: 13; lineHeight: 0.85
                color: c.fresh ? "#ffffff" : "#111111"
            }
        }

        // Section tag
        Rectangle {
            visible: c.kindName.length > 0
            x: c.style === 5 ? 82 : 10
            y: parent.height - 22
            width: tag.implicitWidth + 10; height: 15
            color: c.style === 1 || c.style === 4 ? "#111111" : c.ink2
            Text {
                id: tag
                anchors.centerIn: parent
                text: c.kindName.toUpperCase()
                font.family: "Bebas Neue"; font.pixelSize: 12; font.letterSpacing: 1
                color: c.dark(parent.color) ? "#ffffff" : "#111111"
            }
        }

        // Barcode
        Rectangle {
            x: parent.width - 46; y: parent.height - 30
            width: 38; height: 24
            color: "#ffffff"
            Row {
                x: 3; y: 3
                spacing: 1
                Repeater {
                    model: 14
                    delegate: Rectangle {
                        required property int index
                        width: (c.seed >> (index % 12)) & 1 ? 2 : 1
                        height: 14
                        color: "#000000"
                    }
                }
            }
            Text {
                x: 3; y: 16
                text: String(c.seed).padStart(6, "0")
                font.family: "JetBrainsMono Nerd Font Mono"; font.pixelSize: 6
                color: "#000000"
            }
        }

        // Gloss
        Rectangle {
            anchors.fill: parent
            gradient: Gradient {
                orientation: Gradient.Horizontal
                GradientStop { position: 0; color: "#00ffffff" }
                GradientStop { position: 0.12; color: "#18ffffff" }
                GradientStop { position: 0.2; color: "#00ffffff" }
            }
        }
        // Spine shadow
        Rectangle {
            width: 5; height: parent.height
            gradient: Gradient {
                orientation: Gradient.Horizontal
                GradientStop { position: 0; color: "#50000000" }
                GradientStop { position: 1; color: "#00000000" }
            }
        }
    }

    // Selection: a bright tab sticking out of the top, like a sticky note
    Rectangle {
        visible: c.chosen
        anchors.horizontalCenter: parent.horizontalCenter
        y: -12
        width: 70; height: 18
        color: "#ffd400"
        rotation: -3
        Text {
            anchors.centerIn: parent
            text: "↵ OPEN"
            font.family: "Anton"; font.pixelSize: 11
            color: "#111111"
        }
    }
}
