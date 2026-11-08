import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Widgets

Card {
    id: w
    property var core
    readonly property var now: core ? core.now : new Date()
    property int shift: 0
    readonly property var view: new Date(now.getFullYear(), now.getMonth() + shift, 1)
    readonly property int lead: (view.getDay() + 6) % 7
    readonly property int days: new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate()
    readonly property int prevDays: new Date(view.getFullYear(), view.getMonth(), 0).getDate()
    readonly property real cw: body.width / 7
    readonly property real ch: Math.max(14, (body.height - nav.height - 18 - foot.height) / 6)
    readonly property string home: Quickshell.env("HOME")
    readonly property string script: home + "/.config/hyper-aero/scripts/desk-notion.py"
    readonly property bool live: visible && !!core && !core.hidden && !core.editing
    readonly property bool lit: !!core && core.night
    readonly property string todayIso: iso(now.getFullYear(), now.getMonth() + 1, now.getDate())
    readonly property string from: iso(view.getFullYear(), view.getMonth() + 1, 1)
    readonly property string to: iso(view.getFullYear(), view.getMonth() + 1, days)
    property string selected: todayIso
    property bool panel: false
    property var notes: []
    property var events: []
    property string calState: "none"
    property string calDetail: ""
    property string noteState: "loading"
    property string noteDetail: ""
    property bool hasDone: false
    property var queue: []
    readonly property var marks: {
        var out = ({})
        for (var i = 0; i < notes.length; i++) out[notes[i].date] = true
        for (var j = 0; j < events.length; j++) out[events[j].date] = true
        return out
    }
    readonly property var dayNotes: {
        var sel = selected
        var ev = events.filter(function(n) { return n.date === sel }).sort(function(a, b) {
            return a.time.localeCompare(b.time) || a.text.localeCompare(b.text)
        })
        return ev.concat(notes.filter(function(n) { return n.date === sel }).sort(function(a, b) {
            return Number(a.done) - Number(b.done) || a.text.localeCompare(b.text)
        }))
    }
    readonly property int selRow: Math.floor((lead + Number(selected.slice(8)) - 1) / 7)
    title: "CALENDAR"
    tag: "WEEK " + week(now)
    glass: false

    function week(d) {
        var t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
        var day = t.getUTCDay() || 7
        t.setUTCDate(t.getUTCDate() + 4 - day)
        var y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
        return String(Math.ceil(((t - y0) / 86400000 + 1) / 7)).padStart(2, "0")
    }

    function iso(y, m, d) {
        return y + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0")
    }

    function dayLabel() {
        var p = selected.split("-")
        var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]))
        return Qt.locale("C").toString(d, "MMM d, yyyy").toUpperCase()
    }

    function noteFooter() {
        if (noteState === "unconfigured") return "notion: no token — see desk/notion.json"
        if (noteState === "loading") return "notion: connecting…"
        if (noteState === "error") return "notion: " + noteDetail
        return "notion: " + notes.length + (notes.length === 1 ? " note" : " notes")
    }

    function footer() {
        if (calState === "error") return noteFooter() + " · google: " + calDetail
        if (calState === "ok") return noteFooter() + " · google: " + events.length
        return noteFooter()
    }

    function send(args) {
        var q = args.length ? queue : queue.filter(function(a) { return a.length })
        queue = q.concat([args])
        pump()
    }

    function pump() {
        if (api.running || !queue.length) return
        api.command = [script, from, to].concat(queue[0])
        queue = queue.slice(1)
        api.running = true
    }

    function apply(line) {
        try {
            var d = JSON.parse(line)
            noteState = d.state
            noteDetail = d.detail || ""
            events = d.events || []
            calState = d.calState || "none"
            calDetail = d.calDetail || ""
            if (d.state === "ok") {
                notes = d.notes
                hasDone = d.hasDone
            } else if (d.state === "unconfigured") {
                notes = []
            }
        } catch (err) {
        }
    }

    function setDone(id, done) {
        notes = notes.map(function(n) { return n.id === id ? Object.assign({}, n, { done: done }) : n })
        send(["done", id, done ? "1" : "0"])
    }

    function drop(id) {
        notes = notes.filter(function(n) { return n.id !== id })
        send(["delete", id])
    }

    function pick(day) {
        if (panel && selected === day) {
            panel = false
            return
        }
        selected = day
        panel = true
    }

    onFromChanged: if (live) send([])

    Process {
        id: api
        stdout: SplitParser {
            onRead: function(line) { w.apply(line) }
        }
        onRunningChanged: if (!running) Qt.callLater(w.pump)
    }

    Timer {
        interval: 120000
        repeat: true
        running: w.live
        triggeredOnStart: true
        onTriggered: w.send([])
    }

    Timer {
        interval: 60000
        running: w.shift !== 0 && !w.panel
        onTriggered: w.shift = 0
    }

    Item {
        parent: w
        anchors.fill: parent
        z: -1

        Rectangle {
            anchors.fill: parent
            anchors.topMargin: 4
            anchors.leftMargin: 2
            anchors.rightMargin: -2
            anchors.bottomMargin: -5
            radius: 22
            color: w.pal.shadow
        }

        ClippingRectangle {
            anchors.fill: parent
            radius: 20
            color: w.pal.card2
            border.width: 0

            Image {
                anchors.fill: parent
                source: "file://" + w.home + "/.config/hyper-aero/desk/calendar-bg.jpg"
                fillMode: Image.PreserveAspectCrop
                asynchronous: true
                smooth: true
            }
            Rectangle {
                anchors.fill: parent
                opacity: w.lit ? 0.42 : 0.62
                gradient: Gradient {
                    GradientStop { position: 0.0; color: w.pal.card0 }
                    GradientStop { position: 0.46; color: w.pal.card1 }
                    GradientStop { position: 0.54; color: w.pal.card2 }
                    GradientStop { position: 1.0; color: w.pal.card3 }
                }
            }
        }

        Rectangle {
            anchors.fill: parent
            radius: 20
            color: "transparent"
            border.width: 1
            border.color: w.pal.cardBorder
            Rectangle {
                x: 16; y: 1
                width: parent.width - 32
                height: 1
                color: w.pal.sheen
            }
        }
    }

    Item {
        id: nav
        width: parent.width
        height: 22

        Text {
            anchors.verticalCenter: parent.verticalCenter
            text: Qt.locale("C").toString(w.view, "MMMM yyyy").toUpperCase()
            font.family: "Michroma"
            font.pixelSize: Math.max(9, Math.min(13, w.cw * 0.26))
            color: w.pal.ink
            style: w.lit ? Text.Raised : Text.Normal
            styleColor: "#d9000000"
        }
        Row {
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            spacing: 4
            Repeater {
                model: [["\u{F0141}", -1], ["TODAY", 0], ["\u{F0142}", 1]]
                delegate: Rectangle {
                    required property var modelData
                    width: modelData[1] === 0 ? 46 : 22
                    height: 22; radius: 11
                    visible: modelData[1] !== 0 || w.shift !== 0 || w.selected !== w.todayIso
                    color: navArea.containsMouse ? w.pal.hover : w.pal.field
                    border.width: 1
                    border.color: navArea.containsMouse ? w.pal.glow : w.pal.sep
                    Text {
                        anchors.centerIn: parent
                        text: modelData[0]
                        font.family: modelData[1] === 0 ? "Michroma" : "JetBrainsMono Nerd Font"
                        font.pixelSize: modelData[1] === 0 ? 7 : 13
                        color: w.pal.accent
                    }
                    MouseArea {
                        id: navArea
                        anchors.fill: parent
                        hoverEnabled: true
                        cursorShape: Qt.PointingHandCursor
                        onClicked: {
                            w.panel = false
                            if (modelData[1] === 0) {
                                w.shift = 0
                                w.selected = w.todayIso
                            } else {
                                w.shift += modelData[1]
                            }
                        }
                    }
                }
            }
        }
    }

    Row {
        id: head
        y: nav.height + 4
        Repeater {
            model: ["M", "T", "W", "T", "F", "S", "S"]
            delegate: Text {
                required property string modelData
                required property int index
                width: w.cw
                horizontalAlignment: Text.AlignHCenter
                text: modelData
                font.family: "JetBrainsMono Nerd Font"
                font.weight: Font.Bold
                font.pixelSize: 9
                color: index >= 5 ? w.pal.accent : w.pal.muted
                style: w.lit ? Text.Raised : Text.Normal
                styleColor: "#d9000000"
            }
        }
    }

    Rectangle {
        x: -3
        y: grid.y - 2
        width: parent.width + 6
        height: w.ch * 6 + 4
        radius: 9
        color: w.lit ? "#47000000" : "#26ffffff"
        border.width: 1
        border.color: w.pal.sep
    }

    Grid {
        id: grid
        y: head.y + 16
        columns: 7
        Repeater {
            model: 42
            delegate: Item {
                id: cell
                required property int index
                readonly property int n: index - w.lead + 1
                readonly property bool inMonth: n >= 1 && n <= w.days
                readonly property int label: inMonth ? n : (n < 1 ? w.prevDays + n : n - w.days)
                readonly property bool today: inMonth && w.shift === 0 && n === w.now.getDate()
                readonly property string day: inMonth ? w.iso(w.view.getFullYear(), w.view.getMonth() + 1, n) : ""
                readonly property bool chosen: inMonth && w.selected === day
                readonly property bool marked: inMonth && !!w.marks[day]
                width: w.cw
                height: w.ch
                visible: index < 35 || w.lead + w.days > 35

                Rectangle {
                    anchors.fill: parent
                    anchors.margins: 1
                    radius: 7
                    color: cell.chosen || dayArea.containsMouse ? w.pal.hover : "transparent"
                    border.width: cell.chosen || dayArea.containsMouse ? 1 : 0
                    border.color: w.pal.glow
                }
                Rectangle {
                    anchors.centerIn: parent
                    width: Math.min(parent.width, parent.height) - 4
                    height: width
                    radius: width / 2
                    visible: parent.today
                    antialiasing: true
                    border.width: 1
                    border.color: "#ccffffff"
                    gradient: Gradient {
                        GradientStop { position: 0.0; color: w.pal.fill0 }
                        GradientStop { position: 0.5; color: w.pal.fill1 }
                        GradientStop { position: 1.0; color: w.pal.fill2 }
                    }
                }
                Text {
                    anchors.centerIn: parent
                    text: parent.label
                    font.family: "Exo 2"
                    font.weight: parent.today ? Font.Black : Font.DemiBold
                    font.pixelSize: Math.max(9, Math.min(15, w.ch * 0.46))
                    color: parent.today ? "#ffffff" : (parent.inMonth ? w.pal.ink : w.pal.dim)
                    style: w.lit ? Text.Raised : Text.Normal
                    styleColor: "#d9000000"
                }
                Rectangle {
                    anchors.horizontalCenter: parent.horizontalCenter
                    anchors.bottom: parent.bottom
                    anchors.bottomMargin: 2
                    width: parent.width - 12
                    height: 2
                    radius: 1
                    visible: parent.marked
                    color: w.pal.glow
                }
                MouseArea {
                    id: dayArea
                    anchors.fill: parent
                    enabled: cell.inMonth
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    onClicked: w.pick(cell.day)
                }
            }
        }
    }

    Text {
        id: foot
        anchors.bottom: parent.bottom
        width: parent.width
        height: 12
        text: w.footer()
        elide: Text.ElideRight
        font.family: "JetBrainsMono Nerd Font"
        font.pixelSize: 9
        color: w.noteState === "error" || w.calState === "error" ? w.pal.bad : w.pal.muted
        style: w.lit ? Text.Raised : Text.Normal
        styleColor: "#d9000000"
    }

    Rectangle {
        id: pop
        x: -5
        y: w.selRow >= 3 ? 0 : parent.height - height
        z: 10
        width: parent.width + 10
        height: Math.round(parent.height * 0.68)
        radius: 14
        opacity: w.panel ? 1 : 0
        scale: w.panel ? 1 : 0.96
        visible: opacity > 0.01
        color: w.lit ? "#0c0a10" : "#ffffff"
        Behavior on opacity { NumberAnimation { duration: 120; easing.type: Easing.OutCubic } }
        Behavior on scale { NumberAnimation { duration: 120; easing.type: Easing.OutCubic } }
        onVisibleChanged: if (!visible) input.focus = false

        MouseArea {
            anchors.fill: parent
        }

        Rectangle {
            anchors.fill: parent
            radius: parent.radius
            border.width: 1
            border.color: w.pal.trayBorder
            gradient: Gradient {
                GradientStop { position: 0.0; color: w.pal.tray0 }
                GradientStop { position: 0.46; color: w.pal.tray1 }
                GradientStop { position: 0.54; color: w.pal.tray2 }
                GradientStop { position: 1.0; color: w.pal.tray3 }
            }
        }

        Text {
            id: popDate
            x: 11; y: 9
            text: w.dayLabel()
            font.family: "Michroma"
            font.pixelSize: 10
            color: w.pal.accent
        }
        Rectangle {
            anchors.right: parent.right
            anchors.rightMargin: 7
            y: 5
            width: 20; height: 20; radius: 10
            color: closeArea.containsMouse ? w.pal.hover : "transparent"
            Text {
                anchors.centerIn: parent
                text: "\u{F0156}"
                font.family: "JetBrainsMono Nerd Font"
                font.pixelSize: 13
                color: w.pal.muted
            }
            MouseArea {
                id: closeArea
                anchors.fill: parent
                hoverEnabled: true
                cursorShape: Qt.PointingHandCursor
                onClicked: w.panel = false
            }
        }

        ListView {
            id: lv
            x: 7
            y: 28
            width: parent.width - 14
            height: parent.height - y - entry.height - 14
            clip: true
            spacing: 2
            model: w.dayNotes
            boundsBehavior: Flickable.StopAtBounds

            delegate: Rectangle {
                required property var modelData
                readonly property bool fixed: !!modelData.readonly
                readonly property bool tickable: w.hasDone && !fixed
                width: lv.width
                height: Math.max(24, txt.implicitHeight + 8)
                radius: 8
                color: rowArea.containsMouse ? w.pal.hover : "transparent"

                MouseArea {
                    id: rowArea
                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: parent.tickable ? Qt.PointingHandCursor : Qt.ArrowCursor
                    onClicked: if (parent.tickable) w.setDone(modelData.id, !modelData.done)
                }
                Text {
                    id: box
                    x: 4
                    y: 4
                    visible: parent.tickable || parent.fixed
                    text: parent.fixed ? "\u{F00ED}" : (modelData.done ? "\u{F0135}" : "\u{F0131}")
                    font.family: "JetBrainsMono Nerd Font"
                    font.pixelSize: 14
                    color: modelData.done ? w.pal.ok : w.pal.accent
                }
                Text {
                    id: txt
                    anchors.left: box.visible ? box.right : parent.left
                    anchors.leftMargin: 6
                    anchors.right: minus.visible ? minus.left : parent.right
                    anchors.rightMargin: 4
                    y: 4
                    text: (modelData.time ? modelData.time + "  " : "") + modelData.text
                    wrapMode: Text.Wrap
                    maximumLineCount: 2
                    elide: Text.ElideRight
                    font.family: "Exo 2"
                    font.pixelSize: 12
                    font.strikeout: modelData.done
                    color: modelData.done ? w.pal.dim : w.pal.ink
                }
                Text {
                    id: minus
                    anchors.right: parent.right
                    anchors.rightMargin: 5
                    y: 4
                    visible: !parent.fixed
                    text: "\u{F0374}"
                    font.family: "JetBrainsMono Nerd Font"
                    font.pixelSize: 13
                    color: dropArea.containsMouse ? w.pal.bad : w.pal.muted
                    MouseArea {
                        id: dropArea
                        anchors.fill: parent
                        anchors.margins: -3
                        hoverEnabled: true
                        cursorShape: Qt.PointingHandCursor
                        onClicked: w.drop(modelData.id)
                    }
                }
            }

            Text {
                visible: lv.count === 0
                anchors.centerIn: parent
                text: "No notes for this day"
                font.family: "Exo 2"
                font.pixelSize: 11
                color: w.pal.muted
            }
        }

        Rectangle {
            id: entry
            x: 8
            anchors.bottom: parent.bottom
            anchors.bottomMargin: 8
            width: parent.width - 16
            height: 28
            radius: 14
            color: w.pal.field
            border.width: input.activeFocus ? 2 : 1
            border.color: input.activeFocus ? w.pal.glow : w.pal.fieldBorder

            Text {
                id: plus
                x: 9
                anchors.verticalCenter: parent.verticalCenter
                text: "\u{F0415}"
                font.family: "JetBrainsMono Nerd Font"
                font.pixelSize: 14
                color: w.pal.accent
            }
            TextInput {
                id: input
                anchors.left: plus.right
                anchors.leftMargin: 6
                anchors.right: parent.right
                anchors.rightMargin: 10
                anchors.verticalCenter: parent.verticalCenter
                clip: true
                enabled: w.noteState !== "unconfigured"
                font.family: "Exo 2"
                font.pixelSize: 12
                color: w.pal.ink
                selectByMouse: true
                onAccepted: {
                    if (text.trim().length) w.send(["add", w.selected, text])
                    text = ""
                }
                Keys.onEscapePressed: {
                    text = ""
                    w.panel = false
                }
                Text {
                    anchors.verticalCenter: parent.verticalCenter
                    visible: !input.text.length
                    text: input.enabled ? "add a note…" : "connect notion to add notes"
                    font: input.font
                    color: w.pal.muted
                }
            }
            MouseArea {
                anchors.fill: parent
                cursorShape: Qt.IBeamCursor
                onClicked: input.forceActiveFocus()
                z: -1
            }
        }
    }
}
