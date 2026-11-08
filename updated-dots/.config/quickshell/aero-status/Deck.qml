import QtQuick
import Quickshell

Item {
    id: d
    property var core
    readonly property int mainW: 1270
    readonly property bool shown: !core.hidden
    readonly property bool live: core.fx && shown
    property real hudAmount: shown ? 1 : 0
    Behavior on hudAmount { NumberAnimation { duration: 320; easing.type: Easing.OutCubic } }

    Gallery {
        id: gallery
        width: core.hidden ? d.width : d.mainW
        height: d.height
        paused: core.covered
        clock: d.core.clock
        hud: d.hudAmount
        p0: Qt.vector4d(20, 58, 1228, 38)
        p1: Qt.vector4d(880, 112, 372, 112)
        p2: Qt.vector4d(880, 236, 372, 112)
        p3: Qt.vector4d(880, 360, 372, 84)
        p4: Qt.vector4d(20, 496, 1230, 362)
        p5: Qt.vector4d(20, 888, 600, 68)
        p6: Qt.vector4d(650, 888, 600, 68)
        Connections {
            target: d.core
            function onStep(dir) { gallery.step(dir) }
        }
    }

    Item {
        id: hud
        width: d.mainW
        height: d.height
        opacity: d.shown ? 1 : 0
        visible: opacity > 0.01
        Behavior on opacity { NumberAnimation { duration: 260 } }

        Row {
            x: 20; y: 58
            spacing: 12
            Repeater {
                model: 5
                delegate: Rectangle {
                    id: tab
                    required property int index
                    readonly property var e: d.core.topTabs[index] || null
                    width: 236; height: 38
                    color: tabArea.containsMouse && e ? "#800a4a60" : "transparent"
                    Behavior on color { ColorAnimation { duration: 140 } }
                    border.width: index === 0 && e ? 1 : 0
                    border.color: "#ffe25a"
                    radius: 3
                    Text {
                        x: 11
                        anchors.verticalCenter: parent.verticalCenter
                        text: tab.index + 1
                        font.family: "Michroma"
                        font.pixelSize: 14
                        color: tab.e ? "#ff6a8a" : "#6c8a90"
                    }
                    Text {
                        x: 34
                        anchors.verticalCenter: parent.verticalCenter
                        width: 90
                        elide: Text.ElideRight
                        text: tab.e ? tab.e.name : "Empty"
                        font.family: "Exo 2"
                        font.weight: Font.Bold
                        font.pixelSize: 15
                        color: tab.e ? "#ffe25a" : "#6c8a90"
                    }
                    Text {
                        anchors.right: parent.right
                        anchors.rightMargin: 11
                        anchors.verticalCenter: parent.verticalCenter
                        text: (tab.e ? tab.e.cpu.toFixed(1) : "0") + "%  " + (tab.e ? (tab.e.ram >= 1024 ? (tab.e.ram / 1024).toFixed(1) + "G" : tab.e.ram + "M") : "0M")
                        font.family: "JetBrainsMono Nerd Font"
                        font.pixelSize: 13
                        color: tab.e ? "#ffffff" : "#6c8a90"
                    }
                    MouseArea {
                        id: tabArea
                        anchors.fill: parent
                        hoverEnabled: true
                        cursorShape: tab.e ? Qt.PointingHandCursor : Qt.ArrowCursor
                        onClicked: if (tab.e) d.core.focusWin(tab.e.addr)
                    }
                }
            }
        }

        Column {
            x: 880; y: 112
            width: 372
            spacing: 12

            CrtScope {
                width: parent.width
                title: "CPU"
                hist: d.core.cpuHist
                load: d.core.cpu.load
                heat: d.core.cpu.temp
                hotAt: 90
                line1: d.core.cpu.ghz.toFixed(2) + " GHz"
                line2: d.core.cpu.watts.toFixed(0) + " W"
                live: d.live
                clock: d.core.clock
            }

            CrtScope {
                width: parent.width
                title: "GPU"
                hist: d.core.gpuHist
                load: d.core.gpu.load
                heat: d.core.gpu.temp
                hotAt: 85
                line1: d.core.gpu.state === "ACTIVE" ? d.core.gpu.mhz + " MHz" : d.core.gpu.state
                line2: (d.core.gpu.vram / 1024).toFixed(1) + " GB VRAM   " + d.core.gpu.watts.toFixed(0) + " W"
                live: d.live
                clock: d.core.clock
            }

            Rectangle {
                width: parent.width
                height: 84
                color: "transparent"
                radius: 3
                Text {
                    x: 14; y: 9
                    text: "FANS"
                    font.family: "Michroma"
                    font.pixelSize: 13
                    color: "#ffe25a"
                }
                Text {
                    anchors.right: parent.right
                    anchors.rightMargin: 14
                    y: 9
                    text: "RPM  ·  " + d.core.fans.profile
                    font.family: "JetBrainsMono Nerd Font"
                    font.pixelSize: 12
                    color: "#8fe6f0"
                }
                Row {
                    x: 14; y: 36
                    spacing: 12
                    Led { width: 106; label: "CPU"; value: d.core.fans.cpu; live: d.live }
                    Led { width: 106; label: "GPU"; value: d.core.fans.gpu; live: d.live }
                    Led { width: 106; label: "MID"; value: d.core.fans.mid; live: d.live }
                }
            }
        }

        Row {
            x: 20; y: 450
            spacing: 10

            Repeater {
                model: [[-1, "\u{F0141}"], [1, "\u{F0142}"]]
                delegate: Rectangle {
                    required property var modelData
                    width: 34; height: 30
                    color: navArea.containsMouse ? "#e0b81434" : "#a0062438"
                    border.width: 1
                    border.color: "#3fd0e0"
                    radius: 3
                    Text {
                        anchors.centerIn: parent
                        text: modelData[1]
                        font.family: "JetBrainsMono Nerd Font"
                        font.pixelSize: 19
                        color: "#ffe25a"
                    }
                    MouseArea {
                        id: navArea
                        anchors.fill: parent
                        hoverEnabled: true
                        cursorShape: Qt.PointingHandCursor
                        onClicked: gallery.step(modelData[0])
                    }
                }
            }

            Item { width: 8; height: 1 }

            Repeater {
                model: gallery.count > 1 ? gallery.count : 0
                delegate: Rectangle {
                    required property int index
                    anchors.verticalCenter: parent.verticalCenter
                    width: 9; height: 9
                    rotation: 45
                    color: index === gallery.index ? "#ffe25a" : "#80101c3c"
                    border.width: 1
                    border.color: "#ffe25a"
                    MouseArea {
                        anchors.fill: parent
                        anchors.margins: -7
                        cursorShape: Qt.PointingHandCursor
                        onClicked: gallery.show(parent.index, parent.index >= gallery.index ? 1 : -1)
                    }
                }
            }

            Item { width: 8; height: 1 }

            Text {
                anchors.verticalCenter: parent.verticalCenter
                text: gallery.caption
                font.family: "Michroma"
                font.pixelSize: 14
                color: "#ffffff"
                style: Text.Outline
                styleColor: "#a0000000"
            }
        }

        Rectangle {
            x: 20; y: 496
            width: d.mainW - 40; height: 34
            gradient: Gradient {
                orientation: Gradient.Horizontal
                GradientStop { position: 0; color: "#d0b81434" }
                GradientStop { position: 0.5; color: "#60a07818" }
                GradientStop { position: 1; color: "#00a07818" }
            }
            Text {
                x: 14
                anchors.verticalCenter: parent.verticalCenter
                text: "STATUS TABLE"
                font.family: "Michroma"
                font.pixelSize: 16
                color: "#fff6c8"
            }
            Text {
                anchors.right: parent.right
                anchors.rightMargin: 14
                anchors.verticalCenter: parent.verticalCenter
                text: d.core.topTabs.length + " OPEN"
                font.family: "Michroma"
                font.pixelSize: 11
                color: "#fff6c8"
            }
        }

        Repeater {
            model: [[38, Text.AlignLeft, 300, "APP"], [650, Text.AlignRight, 190, "CPU"], [960, Text.AlignRight, 190, "MEMORY"]]
            delegate: Text {
                required property var modelData
                x: modelData[0]; y: 542
                width: modelData[2]
                horizontalAlignment: modelData[1]
                text: modelData[3]
                font.family: "Michroma"
                font.pixelSize: 11
                color: "#ffe25a"
            }
        }

        ListView {
            id: table
            x: 20; y: 564
            width: d.mainW - 40; height: 288
            clip: true
            boundsBehavior: Flickable.StopAtBounds
            model: d.core.apps
            delegate: Rectangle {
                id: row
                required property var modelData
                readonly property bool on: modelData.open
                width: table.width
                height: 36
                radius: 2
                color: rowArea.containsMouse ? "#90b81434" : "transparent"
                Behavior on color { ColorAnimation { duration: 140 } }
                Rectangle {
                    x: 18
                    anchors.bottom: parent.bottom
                    width: parent.width - 36; height: 1
                    color: "#303fd0e0"
                }
                Text {
                    x: 18
                    anchors.verticalCenter: parent.verticalCenter
                    text: row.modelData.name + (row.modelData.windows > 1 ? "  ×" + row.modelData.windows : "")
                    font.family: "Exo 2"
                    font.weight: row.on ? Font.Bold : Font.Medium
                    font.pixelSize: 18
                    color: row.on ? "#ffffff" : "#8fb0b6"
                }
                Text {
                    x: 630; width: 190
                    anchors.verticalCenter: parent.verticalCenter
                    horizontalAlignment: Text.AlignRight
                    text: (row.on ? row.modelData.cpu.toFixed(1) : "0") + " %"
                    font.family: "JetBrainsMono Nerd Font"
                    font.pixelSize: 17
                    color: row.on ? "#ffe25a" : "#8fb0b6"
                }
                Text {
                    x: 940; width: 190
                    anchors.verticalCenter: parent.verticalCenter
                    horizontalAlignment: Text.AlignRight
                    text: row.modelData.ram + " MB"
                    font.family: "JetBrainsMono Nerd Font"
                    font.pixelSize: 17
                    color: row.on ? "#ffe25a" : "#8fb0b6"
                }
                MouseArea {
                    id: rowArea
                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    onClicked: d.core.openApp(row.modelData)
                }
            }
        }

        Gauge {
            x: 20; y: 888
            width: 600
            title: "MEMORY"
            caption: d.core.mem.used.toFixed(1) + " / " + d.core.mem.total.toFixed(0) + " GB"
            frac: d.core.mem.pct / 100
            clock: d.core.clock
        }

        Gauge {
            x: 650; y: 888
            width: 600
            title: "ENERGY"
            caption: d.core.bat.pct + "%  " + d.core.bat.state
            frac: d.core.bat.pct / 100
            clock: d.core.clock
            from: "#ffe25a"
            to: "#39ff8a"
        }
    }

    Rectangle {
        x: d.mainW
        width: d.width - d.mainW
        height: d.height
        opacity: d.shown ? 1 : 0
        visible: opacity > 0.01
        Behavior on opacity { NumberAnimation { duration: 260 } }
        ShaderEffect {
            anchors.fill: parent
            readonly property size res: Qt.size(width, height)
            fragmentShader: "shaders/metal.frag.qsb"
        }

        Bolt { x: 6; y: 52 }
        Bolt { x: parent.width - 28; y: 52 }
        Bolt { x: 6; y: parent.height - 28 }
        Bolt { x: parent.width - 28; y: parent.height - 28 }

        Plate { x: 40; y: 58; width: parent.width - 80; text: "CALENDAR" }

        Rectangle {
            x: 16; y: 106
            width: parent.width - 32; height: 404
            color: "#101418"
            border.width: 3
            border.color: "#2c2f33"
            radius: 3
            WCalendar {
                anchors.fill: parent
                anchors.margins: 6
                core: d.core
                pal: d.core.pal
            }
        }

        Plate { x: 40; y: 528; width: parent.width - 80; text: "WINAMP" }

        Winamp {
            x: 16; y: 576
            width: parent.width - 32
            // Fill down to the bolts; the extra goes to the playlist window.
            height: parent.height - y - 36
            core: d.core
        }
    }
}
