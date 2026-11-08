import QtQuick
import Qt.labs.folderlistmodel
import Quickshell

Item {
    id: g
    property bool paused: false
    property real clock: 0
    property real hud: 0
    property int index: 0
    property bool flip: false
    property real dirn: 1
    property int pending: -1
    property vector4d p0: Qt.vector4d(0, 0, 0, 0)
    property vector4d p1: Qt.vector4d(0, 0, 0, 0)
    property vector4d p2: Qt.vector4d(0, 0, 0, 0)
    property vector4d p3: Qt.vector4d(0, 0, 0, 0)
    property vector4d p4: Qt.vector4d(0, 0, 0, 0)
    property vector4d p5: Qt.vector4d(0, 0, 0, 0)
    property vector4d p6: Qt.vector4d(0, 0, 0, 0)
    readonly property int count: files.count
    readonly property string caption: count ? String(files.get(index, "fileBaseName")).replace(/^\d+[-_ ]*/, "").replace(/[-_]+/g, " ").toUpperCase() : ""
    readonly property Image cur: flip ? b : a
    readonly property Image inc: flip ? a : b
    clip: true

    function url(i) {
        return files.get(i, "fileUrl")
    }

    function show(i, dir) {
        if (!count || sweep.running) return
        var next = (i + count) % count
        if (next === index && cur.status === Image.Ready) return
        dirn = dir
        pending = next
        if (String(inc.source) === String(url(next))) begin()
        else inc.source = url(next)
    }

    function begin() {
        if (pending < 0 || inc.status !== Image.Ready) return
        index = pending
        pending = -1
        sweep.restart()
    }

    function step(dir) {
        if (count > 1) show(index + dir, dir)
    }

    FolderListModel {
        id: files
        folder: "file://" + Quickshell.env("HOME") + "/.cache/hyper-aero/gallery"
        nameFilters: ["*.jpg", "*.jpeg", "*.png", "*.webp", "*.JPG", "*.PNG"]
        showDirs: false
        sortField: FolderListModel.Name
        onCountChanged: {
            if (g.index >= count) g.index = 0
            if (count && !g.cur.source.toString().length) g.cur.source = g.url(g.index)
        }
    }

    Image {
        id: a
        visible: false
        sourceSize.width: 2880
        asynchronous: true
        mipmap: true
        smooth: true
        onStatusChanged: if (status === Image.Ready && g.inc === a) g.begin()
    }

    Image {
        id: b
        visible: false
        sourceSize.width: 2880
        asynchronous: true
        mipmap: true
        smooth: true
        onStatusChanged: if (status === Image.Ready && g.inc === b) g.begin()
    }

    ShaderEffect {
        id: fx
        anchors.fill: parent
        readonly property real time: g.clock
        property real progress: 0
        readonly property real dir: g.dirn
        readonly property real hud: g.hud
        readonly property size res: Qt.size(width, height)
        readonly property var srcTex: g.cur
        readonly property var dstTex: g.inc
        readonly property size srcSize: Qt.size(g.cur.implicitWidth, g.cur.implicitHeight)
        readonly property size dstSize: Qt.size(g.inc.implicitWidth, g.inc.implicitHeight)
        readonly property vector4d p0: g.p0
        readonly property vector4d p1: g.p1
        readonly property vector4d p2: g.p2
        readonly property vector4d p3: g.p3
        readonly property vector4d p4: g.p4
        readonly property vector4d p5: g.p5
        readonly property vector4d p6: g.p6
        fragmentShader: "shaders/gallery.frag.qsb"
    }

    NumberAnimation {
        id: sweep
        target: fx
        property: "progress"
        from: 0
        to: 1
        duration: 1150
        easing.type: Easing.InOutSine
        onFinished: {
            g.flip = !g.flip
            fx.progress = 0
        }
    }

    Timer {
        interval: 25000
        repeat: true
        running: !g.paused && g.count > 1
        onTriggered: g.step(1)
    }
}
