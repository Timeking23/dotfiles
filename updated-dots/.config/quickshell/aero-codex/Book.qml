import QtQuick

// The newsstand: every app is a magazine cover on a scrolling rack.
Item {
    id: b
    property var shell
    property real enter: 0
    readonly property int coverW: 196
    readonly property int coverH: 262
    readonly property int gap: 34
    opacity: enter
    transform: Translate { y: (1 - b.enter) * 26 }

    function grab() {
        search.forceActiveFocus()
        rack.contentY = 0
        arrive.restart()
    }

    NumberAnimation {
        id: arrive
        target: b
        property: "enter"
        from: 0
        to: 1
        duration: 240
        easing.type: Easing.OutCubic
    }

    // Backdrop: dark newsstand wall with a faint watermark
    Rectangle {
        anchors.fill: parent
        gradient: Gradient {
            GradientStop { position: 0; color: "#17130f" }
            GradientStop { position: 1; color: "#0a0807" }
        }
    }
    Text {
        anchors.right: parent.right
        anchors.rightMargin: -20
        anchors.bottom: parent.bottom
        anchors.bottomMargin: -60
        text: "Collection"
        font.family: "Playfair Display"; font.italic: true; font.weight: Font.Black
        font.pixelSize: 300
        color: "#ffffff"
        opacity: 0.035
    }

    MouseArea {
        anchors.fill: parent
    }

    // ── Masthead
    Item {
        id: head
        x: 48; y: 26
        width: parent.width - 96; height: 112

        Text {
            id: title
            text: "THE COLLECTION"
            font.family: "Playfair Display"; font.weight: Font.Black
            font.pixelSize: 64; font.letterSpacing: -2
            color: "#f4efe6"
        }
        Text {
            anchors.left: title.right
            anchors.leftMargin: 18
            anchors.baseline: title.baseline
            text: "the apps issue"
            font.family: "DM Serif Display"; font.italic: true
            font.pixelSize: 26
            color: "#e8242c"
        }
        Text {
            anchors.right: parent.right
            y: 14
            horizontalAlignment: Text.AlignRight
            text: "ISSUE №" + b.shell.all.length + "  ·  NOVEMBER 2026\n" + b.shell.shown.length + " TITLES ON THE RACK"
            font.family: "Bebas Neue"; font.pixelSize: 20; font.letterSpacing: 2
            lineHeight: 1.1
            color: "#bfb6a6"
        }
        Rectangle { y: 84; width: parent.width; height: 3; color: "#f4efe6" }
        Rectangle { y: 90; width: parent.width; height: 1; color: "#f4efe6" }

        // Sections
        Row {
            y: 96
            spacing: 26
            Repeater {
                model: b.shell.tabs
                delegate: Text {
                    id: sec
                    required property var modelData
                    required property int index
                    readonly property bool on: b.shell.tab === index
                    text: modelData.name.toUpperCase()
                    font.family: "Bebas Neue"; font.pixelSize: 22; font.letterSpacing: 2
                    color: on ? "#111111" : (secArea.containsMouse ? "#f4efe6" : "#8c8476")
                    Rectangle {
                        z: -1
                        visible: sec.on
                        anchors.fill: parent
                        anchors.margins: -4
                        anchors.leftMargin: -8; anchors.rightMargin: -8
                        color: "#ffd400"
                        rotation: -1.5
                    }
                    MouseArea {
                        id: secArea
                        anchors.fill: parent
                        anchors.margins: -6
                        hoverEnabled: true
                        cursorShape: Qt.PointingHandCursor
                        onClicked: {
                            b.shell.setTab(sec.index)
                            b.grab()
                        }
                    }
                }
            }
        }

        // Search, styled as a cover line
        Item {
            anchors.right: parent.right
            y: 94
            width: 340; height: 30
            Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 2; color: search.text.length ? "#ffd400" : "#5a5248" }
            Text {
                anchors.verticalCenter: parent.verticalCenter
                text: "\u{F0349}"
                font.family: "JetBrainsMono Nerd Font"; font.pixelSize: 18
                color: "#bfb6a6"
            }
            TextInput {
                id: search
                x: 30
                anchors.verticalCenter: parent.verticalCenter
                width: parent.width - 30
                clip: true
                focus: true
                color: "#f4efe6"
                font.family: "DM Serif Display"; font.italic: true; font.pixelSize: 21
                text: b.shell.query
                onTextEdited: b.shell.query = text
                Keys.onPressed: function(e) {
                    var s = b.shell
                    if (e.key === Qt.Key_Escape) s.close()
                    else if (e.key === Qt.Key_Return || e.key === Qt.Key_Enter) s.launch(s.cur)
                    else if (e.key === Qt.Key_Right) s.move(1)
                    else if (e.key === Qt.Key_Left) s.move(-1)
                    else if (e.key === Qt.Key_Down) s.move(s.cols)
                    else if (e.key === Qt.Key_Up) s.move(-s.cols)
                    else if (e.key === Qt.Key_PageDown) s.move(s.cols * 2)
                    else if (e.key === Qt.Key_PageUp) s.move(-s.cols * 2)
                    else if (e.key === Qt.Key_Tab) s.setTab(s.tab + 1)
                    else if (e.key === Qt.Key_Backtab) s.setTab(s.tab - 1)
                    else return
                    e.accepted = true
                }
                Text {
                    anchors.verticalCenter: parent.verticalCenter
                    visible: !search.text.length
                    text: "search the stacks…"
                    font: search.font
                    color: "#6c6458"
                }
            }
        }
    }

    // ── The pile: two covers per row, the right one dropped lower and laid over the left;
    // rows overlap the row above and alternate which side sits low.
    Flickable {
        id: rack
        readonly property real k: Math.min(1.5, height * 0.5 / b.coverH)
        readonly property real cw: b.coverW * k
        readonly property real ch: b.coverH * k
        readonly property real overX: cw * 0.22
        readonly property real drop: ch * 0.16
        readonly property real step: ch * 0.78
        readonly property real pileW: cw * 2 - overX
        readonly property real pileX: (width - pileW) / 2
        x: 48; y: head.y + head.height + 10
        width: parent.width - 96
        height: parent.height - y - 60
        contentWidth: width
        contentHeight: Math.ceil(b.shell.shown.length / 2) * step + (ch - step) + drop + 60
        clip: true
        boundsBehavior: Flickable.StopAtBounds
        flickDeceleration: 2600
        maximumFlickVelocity: 5000

        function slot(i) {
            var row = Math.floor(i / 2)
            var right = i % 2 === 1
            var low = right !== (row % 2 === 1)
            return Qt.point(pileX + (right ? cw - overX : 0), 44 + row * step + (low ? drop : 0))
        }
        function reveal(i) {
            if (i < 0) return
            var p = slot(i)
            if (p.y < contentY + 10) contentY = Math.max(0, p.y - 30)
            else if (p.y + ch > contentY + height - 10) contentY = Math.min(contentHeight - height, p.y + ch - height + 40)
        }
        Behavior on contentY { enabled: !rack.moving; NumberAnimation { duration: 220; easing.type: Easing.OutCubic } }

        Repeater {
            model: b.shell.shown
            delegate: Item {
                id: cell
                required property var modelData
                required property int index
                readonly property bool chosen: b.shell.sel === index
                readonly property var stat: b.shell.match(modelData, b.shell.stats)
                readonly property point at: rack.slot(index)
                x: at.x; y: at.y
                width: rack.cw; height: rack.ch
                // Later covers lie on earlier ones; the selected one is lifted to the top.
                z: chosen ? 100000 : index

                Item {
                    width: b.coverW; height: b.coverH
                    scale: rack.k
                    transformOrigin: Item.TopLeft
                    Cover {
                        anchors.fill: parent
                        app: cell.modelData
                        chosen: cell.chosen
                        running: !!(cell.stat && cell.stat.open)
                        fresh: b.shell.isNew(cell.modelData)
                        uses: b.shell.usage[cell.modelData.key] || 0
                        kindName: b.shell.tabs[b.shell.kind(cell.modelData)].name
                        // A tossed pile leans more than a rack.
                        rotation: chosen ? 0 : tilt * 2.6
                    }
                }

                MouseArea {
                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    onEntered: b.shell.sel = cell.index
                    onClicked: b.shell.launch(cell.modelData)
                }
            }
        }
    }
    Connections {
        target: b.shell
        function onSelChanged() { if (!rack.moving) rack.reveal(b.shell.sel) }
    }
    Component.onCompleted: b.shell.cols = 2

    // Scroll position, as a thin rule
    Rectangle {
        visible: rack.contentHeight > rack.height
        x: rack.x + rack.pileX + rack.pileW + 40
        y: rack.y + rack.visibleArea.yPosition * rack.height
        width: 3
        height: Math.max(30, rack.visibleArea.heightRatio * rack.height)
        color: "#ffd400"
        opacity: 0.7
    }

    // ── Left column: the feature on the selected cover
    Column {
        x: 48; y: rack.y + 30
        width: rack.pileX - 50
        spacing: 12
        visible: !!b.shell.cur && width > 160
        Text {
            text: "IN THIS ISSUE"
            font.family: "Bebas Neue"; font.pixelSize: 18; font.letterSpacing: 3
            color: "#e8242c"
        }
        Text {
            width: parent.width
            text: b.shell.cur ? b.shell.cur.name : ""
            wrapMode: Text.WordWrap
            font.family: "Playfair Display"; font.weight: Font.Black; font.pixelSize: 46
            lineHeight: 0.9
            color: "#f4efe6"
        }
        Rectangle { width: 60; height: 3; color: "#f4efe6" }
        Text {
            width: parent.width
            text: b.shell.cur ? (b.shell.cur.comment || b.shell.cur.generic || "The one everyone is talking about.") : ""
            wrapMode: Text.WordWrap
            font.family: "DM Serif Display"; font.italic: true; font.pixelSize: 22
            color: "#cfc6b6"
        }
        Text {
            width: parent.width
            readonly property var l: b.shell.live
            text: {
                if (!b.shell.cur) return ""
                var out = b.shell.tabs[b.shell.kind(b.shell.cur)].name.toUpperCase() + " SECTION"
                if (b.shell.isNew(b.shell.cur))
                    out = "NEW ARRIVAL · " + new Date(b.shell.arrived[b.shell.cur.key]).toLocaleDateString(Qt.locale(), "d MMM").toUpperCase() + "  ·  " + out
                var n = b.shell.usage[b.shell.cur.key] || 0
                out += "  ·  READ " + n + (n === 1 ? " TIME" : " TIMES")
                if (l && l.open) out += "  ·  OPEN NOW"
                return out
            }
            wrapMode: Text.WordWrap
            font.family: "Bebas Neue"; font.pixelSize: 17; font.letterSpacing: 1.5
            color: "#8c8476"
        }
    }

    // ── Right column: contents
    Item {
        id: toc
        x: rack.x + rack.pileX + rack.pileW + 70
        y: rack.y + 30
        width: parent.width - x - 48
        height: rack.height - 40
        visible: width > 160
        Text {
            id: tocHead
            text: "CONTENTS"
            font.family: "Bebas Neue"; font.pixelSize: 18; font.letterSpacing: 3
            color: "#e8242c"
        }
        ListView {
            id: tocList
            y: tocHead.height + 10
            width: parent.width; height: parent.height - y
            clip: true
            model: b.shell.shown
            currentIndex: b.shell.sel
            onCurrentIndexChanged: positionViewAtIndex(currentIndex, ListView.Contain)
            boundsBehavior: Flickable.StopAtBounds
            delegate: Item {
                id: line
                required property var modelData
                required property int index
                readonly property bool on: b.shell.sel === index
                width: tocList.width; height: 30
                Text {
                    id: num
                    width: 34
                    anchors.verticalCenter: parent.verticalCenter
                    text: String(line.modelData.num).padStart(2, "0")
                    font.family: "Bebas Neue"; font.pixelSize: 18
                    color: line.on ? "#ffd400" : "#6c6458"
                }
                Text {
                    x: 36
                    width: parent.width - 36
                    anchors.verticalCenter: parent.verticalCenter
                    elide: Text.ElideRight
                    text: line.modelData.name
                    font.family: "Playfair Display"; font.pixelSize: 17
                    font.italic: line.on
                    color: line.on ? "#f4efe6" : "#9c9486"
                }
                MouseArea {
                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    onEntered: b.shell.sel = line.index
                    onClicked: b.shell.launch(line.modelData)
                }
            }
        }
    }

    Text {
        anchors.centerIn: rack
        visible: !b.shell.shown.length
        text: "Sold out.\nNothing on the rack matches “" + b.shell.query + "”."
        horizontalAlignment: Text.AlignHCenter
        font.family: "DM Serif Display"; font.italic: true; font.pixelSize: 30
        color: "#8c8476"
    }

    // ── Footer: the selected cover's story
    Item {
        x: 48
        anchors.bottom: parent.bottom
        anchors.bottomMargin: 18
        width: parent.width - 96; height: 30
        Rectangle { width: parent.width; height: 1; color: "#5a5248" }
        Text {
            y: 8
            width: parent.width - hints.implicitWidth - 30
            elide: Text.ElideRight
            text: b.shell.cur ? "<b>" + b.shell.cur.name + "</b> — " + (b.shell.cur.comment || b.shell.cur.generic || "in this issue") : ""
            textFormat: Text.StyledText
            font.family: "Playfair Display"; font.pixelSize: 17
            color: "#e8e0d2"
        }
        Text {
            id: hints
            anchors.right: parent.right
            y: 10
            text: "SCROLL / ARROWS BROWSE   ·   ENTER READS   ·   TAB SECTIONS   ·   ESC CLOSES"
            font.family: "Bebas Neue"; font.pixelSize: 15; font.letterSpacing: 1.5
            color: "#8c8476"
        }
    }
}
