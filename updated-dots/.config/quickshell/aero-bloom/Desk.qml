import QtQuick
import Quickshell
import Quickshell.Services.Mpris

// Widget layout in a 1600x1000 design space. The figure owns the left third and the
// thorn sigil the lower right, so the clock floats between them and the cards stack
// down the right edge.
Item {
    id: d
    property var core
    property Item wall
    readonly property var pal: core.pal

    function ordinal(n) {
        var w = ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth",
                 "eleventh", "twelfth", "thirteenth", "fourteenth", "fifteenth", "sixteenth", "seventeenth", "eighteenth",
                 "nineteenth", "twentieth", "twenty-first", "twenty-second", "twenty-third", "twenty-fourth", "twenty-fifth",
                 "twenty-sixth", "twenty-seventh", "twenty-eighth", "twenty-ninth", "thirtieth", "thirty-first"]
        return w[n]
    }

    // Where the clock goes for this wallpaper (wall-palette.py picks the emptiest spot):
    // tc = top centre, tl = top left, bl = bottom left. The quote takes the other end.
    readonly property string spot: core.wallPal && core.wallPal.clock ? core.wallPal.clock : "tc"
    readonly property point clockAt: spot === "tl" ? Qt.point(60, 74) : spot === "bl" ? Qt.point(60, 610) : Qt.point(600, 74)
    readonly property point quoteAt: spot === "tl" ? Qt.point(64, 820) : spot === "bl" ? Qt.point(64, 92) : Qt.point(604, 820)

    function clock(s) {
        s = Math.max(0, Math.floor(s))
        return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0")
    }

    // ── Clock
    Item {
        id: clockBox
        x: d.clockAt.x; y: d.clockAt.y
        Behavior on x { NumberAnimation { duration: 600; easing.type: Easing.InOutCubic } }
        Behavior on y { NumberAnimation { duration: 600; easing.type: Easing.InOutCubic } }
        width: 560; height: 260
        readonly property var n: d.core.now

        Text {
            id: hm
            text: Qt.formatTime(clockBox.n, "HH:mm")
            font.family: d.pal.serif; font.weight: Font.Light
            font.pixelSize: 176; font.letterSpacing: -4
            color: d.pal.ink
            style: Text.Raised; styleColor: "#40000000"
        }
        Text {
            anchors.left: hm.right
            anchors.leftMargin: 10
            anchors.baseline: hm.baseline
            text: Qt.formatTime(clockBox.n, "ss")
            font.family: d.pal.mono; font.pixelSize: 18
            color: d.pal.petal
        }
        Text {
            id: dateLine
            y: hm.y + hm.height - 22
            text: Qt.formatDate(clockBox.n, "dddd").toLowerCase() + ", the " + d.ordinal(clockBox.n.getDate()) + " of " + Qt.formatDate(clockBox.n, "MMMM").toLowerCase()
            font.family: d.pal.serif; font.italic: true; font.pixelSize: 31
            color: d.pal.ink
            opacity: 0.85
        }
        Barbed {
            core: d.core
            y: dateLine.y + dateLine.height + 12
            width: 300
            value: (clockBox.n.getHours() * 60 + clockBox.n.getMinutes()) / 1440
        }
        Text {
            y: dateLine.y + dateLine.height + 32
            text: {
                var w = d.core.weather
                var place = w.ok ? w.place + "  ·  " + w.temp + "°  " + w.desc + "  ·  H" + w.hi + " L" + w.lo : "fog rolling in"
                return place.toUpperCase()
            }
            font.family: d.pal.mono; font.pixelSize: 12; font.letterSpacing: 3
            color: d.pal.petal
        }
    }

    // ── Now playing
    Glass {
        id: player
        core: d.core
        wall: d.wall
        label: "NOW PLAYING"
        x: 1196; y: 72
        width: 372; height: 206
        readonly property var p: d.core.player
        property real pos: 0
        readonly property real len: p && p.lengthSupported && p.length > 0 ? p.length : 0

        Timer {
            interval: 1000
            repeat: true
            running: !!player.p && player.p.isPlaying && !d.core.covered
            triggeredOnStart: true
            onTriggered: { player.p.positionChanged(); player.pos = player.p.position }
        }

        // Cava as thin stems along the bottom
        Row {
            x: 16; anchors.bottom: parent.bottom; anchors.bottomMargin: 10
            spacing: 4
            opacity: 0.55
            Repeater {
                model: 42
                delegate: Rectangle {
                    required property int index
                    readonly property var src: d.core.bars
                    readonly property real v: src.length ? (src[Math.floor(index * src.length / 42)] || 0) : 0
                    anchors.bottom: parent.bottom
                    width: 4; height: 2 + 30 * v
                    color: d.pal.petal
                    opacity: 0.35 + 0.65 * v
                }
            }
        }

        Item {
            id: art
            x: 18; y: 22
            width: 108; height: 108
            Rectangle { anchors.fill: parent; color: "#141214"; border.width: 1; border.color: d.pal.edge }
            Text {
                anchors.centerIn: parent
                visible: artImg.status !== Image.Ready
                text: "✿"
                font.pixelSize: 44
                color: d.pal.petalDeep
            }
            Image {
                id: artImg
                anchors.fill: parent
                anchors.margins: 1
                source: player.p && player.p.trackArtUrl ? player.p.trackArtUrl : ""
                fillMode: Image.PreserveAspectCrop
                asynchronous: true
                sourceSize: Qt.size(256, 256)
                // Desaturate a little so covers sit in the grey palette.
                layer.enabled: true
                layer.effect: ShaderEffect {
                    fragmentShader: "shaders/mute.frag.qsb"
                }
            }
        }

        Column {
            x: 142; y: 22
            width: parent.width - 160
            spacing: 2
            Text {
                width: parent.width
                text: player.p ? (player.p.trackTitle || player.p.identity) : "silence"
                elide: Text.ElideRight
                font.family: d.pal.serif; font.italic: true; font.weight: Font.Medium; font.pixelSize: 25
                color: d.pal.ink
            }
            Text {
                width: parent.width
                text: (player.p ? (player.p.trackArtist || player.p.identity || "") : "nothing is playing").toUpperCase()
                elide: Text.ElideRight
                font.family: d.pal.mono; font.pixelSize: 10; font.letterSpacing: 2
                color: d.pal.petal
            }
            Item { width: 1; height: 12 }
            Item {
                width: parent.width; height: 10
                Barbed {
                    id: seekBar
                    core: d.core
                    anchors.fill: parent
                    value: player.len > 0 ? player.pos / player.len : 0
                }
                MouseArea {
                    anchors.fill: parent
                    anchors.margins: -4
                    cursorShape: Qt.PointingHandCursor
                    onClicked: function(m) {
                        if (player.p && player.p.canSeek && player.len > 0) {
                            player.p.position = player.len * m.x / width
                            player.pos = player.p.position
                        }
                    }
                }
            }
            Item {
                width: parent.width; height: 16
                Text { text: d.clock(player.pos); font.family: d.pal.mono; font.pixelSize: 10; color: d.pal.muted }
                Text { anchors.right: parent.right; text: d.clock(player.len); font.family: d.pal.mono; font.pixelSize: 10; color: d.pal.muted }
            }
            Row {
                spacing: 24
                Repeater {
                    model: [["\u{F04AE}", "prev"], [player.p && player.p.isPlaying ? "\u{F03E4}" : "\u{F040A}", "toggle"], ["\u{F04AD}", "next"]]
                    delegate: Text {
                        required property var modelData
                        text: modelData[0]
                        font.family: "JetBrainsMono Nerd Font"; font.pixelSize: modelData[1] === "toggle" ? 26 : 20
                        anchors.verticalCenter: parent.verticalCenter
                        color: ctl.containsMouse ? d.pal.petal : d.pal.ink
                        MouseArea {
                            id: ctl
                            anchors.fill: parent
                            anchors.margins: -6
                            hoverEnabled: true
                            cursorShape: Qt.PointingHandCursor
                            onClicked: {
                                var p = player.p
                                if (!p) { d.core.launch("spotify-launcher"); return }
                                if (parent.modelData[1] === "prev" && p.canGoPrevious) p.previous()
                                else if (parent.modelData[1] === "next" && p.canGoNext) p.next()
                                else if (parent.modelData[1] === "toggle" && p.canTogglePlaying) p.togglePlaying()
                            }
                        }
                    }
                }
            }
        }
    }

    // ── Vitals
    Glass {
        id: vitals
        core: d.core
        wall: d.wall
        label: "VITALS"
        x: 1196; y: 306
        width: 372; height: 230

        Column {
            x: 20; y: 22
            width: parent.width - 40
            spacing: 9
            Repeater {
                model: [
                    ["CPU", d.core.cpu.load / 100, d.core.cpu.load + "%", d.core.cpu.temp + "°  " + d.core.cpu.ghz + "GHZ"],
                    ["GPU", d.core.gpu.load / 100, d.core.gpu.load + "%", d.core.gpu.temp + "°  " + d.core.gpu.mhz + "MHZ"],
                    ["MEMORY", d.core.mem.pct / 100, d.core.mem.pct + "%", d.core.mem.used + " / " + d.core.mem.total + "G"],
                    ["BATTERY", d.core.bat.pct / 100, d.core.bat.pct + "%", String(d.core.bat.state).toUpperCase()]
                ]
                delegate: Column {
                    required property var modelData
                    width: parent.width
                    spacing: 1
                    Item {
                        width: parent.width; height: 26
                        Text {
                            anchors.bottom: parent.bottom; anchors.bottomMargin: 4
                            text: modelData[0]
                            font.family: d.pal.mono; font.pixelSize: 10; font.letterSpacing: 3
                            color: d.pal.muted
                        }
                        Text {
                            anchors.horizontalCenter: parent.horizontalCenter
                            anchors.bottom: parent.bottom; anchors.bottomMargin: 4
                            text: modelData[3]
                            font.family: d.pal.mono; font.pixelSize: 9; font.letterSpacing: 1
                            color: d.pal.dim
                        }
                        Text {
                            anchors.right: parent.right
                            anchors.bottom: parent.bottom
                            text: modelData[2]
                            font.family: d.pal.serif; font.italic: true; font.pixelSize: 24
                            color: d.pal.ink
                        }
                    }
                    Barbed {
                        core: d.core
                        width: parent.width
                        value: modelData[1]
                        // Running hot is a warning; a full battery is not.
                        fill: modelData[0] !== "BATTERY" && modelData[1] > 0.85 ? d.pal.hot : d.pal.petal
                    }
                }
            }
        }
    }

    // ── Calendar
    Glass {
        id: cal
        core: d.core
        wall: d.wall
        label: "CALENDAR"
        x: 1196; y: 564
        width: 372; height: 262
        readonly property var n: d.core.now
        readonly property int first: new Date(n.getFullYear(), n.getMonth(), 1).getDay()
        readonly property int days: new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate()

        Text {
            x: 20; y: 16
            text: Qt.formatDate(cal.n, "MMMM").toLowerCase()
            font.family: d.pal.serif; font.italic: true; font.pixelSize: 32
            color: d.pal.ink
        }
        Text {
            anchors.right: parent.right; anchors.rightMargin: 20
            y: 30
            text: Qt.formatDate(cal.n, "yyyy")
            font.family: d.pal.mono; font.pixelSize: 11; font.letterSpacing: 4
            color: d.pal.petal
        }
        Grid {
            x: 20; y: 64
            columns: 7
            columnSpacing: 0
            rowSpacing: 0
            Repeater {
                model: ["S", "M", "T", "W", "T", "F", "S"]
                delegate: Text {
                    required property var modelData
                    width: 47; height: 22
                    horizontalAlignment: Text.AlignHCenter
                    text: modelData
                    font.family: d.pal.mono; font.pixelSize: 10; font.letterSpacing: 2
                    color: d.pal.dim
                }
            }
            Repeater {
                model: 42
                delegate: Item {
                    required property int index
                    readonly property int day: index - cal.first + 1
                    readonly property bool real: day >= 1 && day <= cal.days
                    readonly property bool today: day === cal.n.getDate()
                    width: 47; height: 27
                    visible: index < Math.ceil((cal.first + cal.days) / 7) * 7
                    Rectangle {
                        anchors.centerIn: parent
                        width: 26; height: 26; radius: 13
                        visible: parent.today && parent.real
                        color: "transparent"
                        border.width: 1
                        border.color: d.pal.petal
                    }
                    Text {
                        anchors.centerIn: parent
                        visible: parent.real
                        text: parent.day
                        font.family: d.pal.serif; font.pixelSize: 17
                        font.weight: parent.today ? Font.Bold : Font.Normal
                        color: parent.today ? d.pal.petal : (parent.day < cal.n.getDate() ? d.pal.dim : d.pal.ink)
                    }
                }
            }
        }
    }

    // ── Dock: open windows + the collection
    Glass {
        id: dock
        core: d.core
        wall: d.wall
        tint: 0.5
        readonly property var items: d.core.apps.filter(function(a) { return a.open && a.id.indexOf("win:") !== 0 })
        width: row.implicitWidth + 36
        height: 64
        x: 820 - width / 2; y: 906

        Row {
            id: row
            anchors.centerIn: parent
            spacing: 16
            Item {
                width: 40; height: 40
                Text {
                    anchors.centerIn: parent
                    text: "✿"
                    font.pixelSize: 30
                    color: menuArea.containsMouse ? d.pal.ink : d.pal.petal
                    rotation: menuArea.containsMouse ? 36 : 0
                    Behavior on rotation { NumberAnimation { duration: 300; easing.type: Easing.OutBack } }
                }
                MouseArea {
                    id: menuArea
                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    onClicked: d.core.run("codex.sh")
                }
            }
            Rectangle { width: 1; height: 30; anchors.verticalCenter: parent.verticalCenter; color: d.pal.edge }
            Repeater {
                model: dock.items
                delegate: Item {
                    id: app
                    required property var modelData
                    width: 40; height: 40
                    Image {
                        anchors.centerIn: parent
                        width: appArea.containsMouse ? 38 : 32; height: width
                        Behavior on width { NumberAnimation { duration: 140; easing.type: Easing.OutCubic } }
                        source: Quickshell.iconPath(DesktopEntries.byId(app.modelData.id) ? DesktopEntries.byId(app.modelData.id).icon : app.modelData.id, "application-x-executable")
                        sourceSize: Qt.size(96, 96)
                        mipmap: true
                    }
                    Rectangle {
                        anchors.horizontalCenter: parent.horizontalCenter
                        anchors.bottom: parent.bottom; anchors.bottomMargin: -9
                        width: 4; height: 4; rotation: 45
                        color: d.pal.petal
                    }
                    Rectangle {
                        visible: appArea.containsMouse
                        anchors.horizontalCenter: parent.horizontalCenter
                        y: -42
                        width: tip.implicitWidth + 16; height: 22
                        color: "#e00c0b0d"
                        border.width: 1; border.color: d.pal.edge
                        Text {
                            id: tip
                            anchors.centerIn: parent
                            text: app.modelData.name.toLowerCase()
                            font.family: d.pal.serif; font.italic: true; font.pixelSize: 15
                            color: d.pal.ink
                        }
                    }
                    MouseArea {
                        id: appArea
                        anchors.fill: parent
                        hoverEnabled: true
                        cursorShape: Qt.PointingHandCursor
                        onClicked: d.core.focusWin(app.modelData.addr)
                    }
                }
            }
        }
    }

    // Signature line under the clock, set like an epigraph.
    Text {
        x: d.quoteAt.x; y: d.quoteAt.y
        Behavior on x { NumberAnimation { duration: 600; easing.type: Easing.InOutCubic } }
        Behavior on y { NumberAnimation { duration: 600; easing.type: Easing.InOutCubic } }
        width: 420
        text: "“in my restless dreams,\n I see that town.”"
        font.family: d.pal.serif; font.italic: true; font.pixelSize: 22
        lineHeight: 1.1
        color: d.pal.ink
        opacity: 0.55
    }
}
