import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Wayland

ShellRoot {
    id: shell
    readonly property string home: Quickshell.env("HOME")
    property bool open: false
    property int tab: 0
    property int sel: 0
    property string query: ""
    property var stats: []
    property var usage: ({})
    // When each app first showed up (ms since epoch; 0 = was already here when this
    // started being tracked). Anything younger than newFor is a "new arrival".
    property var arrived: ({})
    property bool arrivedReady: false
    readonly property real newFor: 7 * 24 * 3600 * 1000
    property real now: Date.now()
    // Covers per row in the rack, used for up/down.
    property int cols: 2
    readonly property var skip: ["xgps", "xgpsspeed", "qv4l2", "qvidcap", "uuctl", "rofi", "rofi-theme-selector",
                                 "io.elementary.granite-7.demo", "org.quickshell", "code-url-handler", "kitty-open"]
    readonly property var tabs: [
        { name: "All", glyph: "\u{F0349}", cats: [] },
        { name: "Web", glyph: "\u{F059F}", cats: ["Network", "WebBrowser"] },
        { name: "Media", glyph: "\u{F075A}", cats: ["AudioVideo", "Audio", "Video", "Player"] },
        { name: "Games", glyph: "\u{F0297}", cats: ["Game"] },
        { name: "Code", glyph: "\u{F0169}", cats: ["Development", "TextEditor", "TerminalEmulator"] },
        { name: "System", glyph: "\u{F0493}", cats: ["System", "Settings", "Utility"] },
        { name: "New", glyph: "\u{F0E7}", cats: [], fresh: true }
    ]
    readonly property var all: collect(DesktopEntries.applications.values)
    readonly property var shown: filter(all, tab, query, arrived, now)
    readonly property var cur: shown.length ? shown[Math.min(sel, shown.length - 1)] : null
    readonly property var live: match(cur, stats)

    function tint(app) {
        return app ? ["#c8a048", "#2f8cff", "#e0389c", "#34d070", "#f0a030", "#7a8cff"][kind(app)] : "#c8a048"
    }

    function collect(list) {
        var seen = {}
        var out = []
        for (var i = 0; i < list.length; i++) {
            var e = list[i]
            if (!e || e.noDisplay || seen[e.id] || skip.indexOf(e.id) >= 0) continue
            seen[e.id] = true
            out.push({
                key: e.id, name: e.name || e.id, comment: e.comment || e.genericName || "", generic: e.genericName || "",
                wm: (e.startupClass || "").toLowerCase(), cats: Array.prototype.slice.call(e.categories || []),
                terminal: e.runInTerminal, command: Array.prototype.slice.call(e.command || []),
                icon: Quickshell.iconPath(e.icon, "application-x-executable")
            })
        }
        out.sort(function(a, b) { return a.name.toLowerCase().localeCompare(b.name.toLowerCase()) })
        for (var n = 0; n < out.length; n++) out[n].num = n + 1
        return out
    }

    function kind(app) {
        for (var t = 1; t < tabs.length; t++) {
            for (var c = 0; c < tabs[t].cats.length; c++) {
                if (app.cats.indexOf(tabs[t].cats[c]) >= 0) return t
            }
        }
        return 5
    }

    // New arrivals go on top of the pile, newest first; the rest stay alphabetical.
    function filter(list, t, q) {
        q = q.trim().toLowerCase()
        var out = list.filter(function(a) {
            if (tabs[t].fresh) { if (!isNew(a)) return false }
            else if (t > 0 && kind(a) !== t) return false
            return !q.length || (a.name + " " + a.generic + " " + a.comment).toLowerCase().indexOf(q) >= 0
        })
        return out.sort(function(a, b) {
            var na = isNew(a) ? arrived[a.key] : 0
            var nb = isNew(b) ? arrived[b.key] : 0
            return nb - na || a.num - b.num
        })
    }

    function isNew(app) {
        var t = app ? arrived[app.key] : 0
        return !!t && now - t < newFor
    }

    // Record any app not seen before. On the very first run everything already installed
    // is stamped 0 so only later installs count as new.
    function stamp(firstRun) {
        var a = Object.assign({}, arrived)
        var changed = false
        for (var i = 0; i < all.length; i++) {
            if (a[all[i].key] === undefined) {
                a[all[i].key] = firstRun ? 0 : Date.now()
                changed = true
            }
        }
        if (!changed) return
        arrived = a
        arrivedFile.setText(JSON.stringify(a))
    }

    onAllChanged: if (arrivedReady) stamp(false)

    function match(app, list) {
        if (!app) return null
        for (var i = 0; i < list.length; i++) {
            var s = list[i]
            if (s.id === app.key || s.id === "win:" + app.key.toLowerCase() || (app.wm.length && s.id === "win:" + app.wm)) return s
        }
        return null
    }

    function launch(app) {
        if (!app) return
        var u = Object.assign({}, usage)
        u[app.key] = (u[app.key] || 0) + 1
        usage = u
        usageFile.setText(JSON.stringify(u))
        var e = DesktopEntries.byId(app.key)
        if (app.terminal) Quickshell.execDetached(["ghostty", "-e"].concat(app.command))
        else if (e) e.execute()
        close()
    }

    function move(d) {
        if (shown.length) sel = Math.max(0, Math.min(shown.length - 1, sel + d))
    }

    function setTab(t) {
        tab = (t + tabs.length) % tabs.length
        sel = 0
    }

    function show() {
        tab = 0
        sel = 0
        query = ""
        statFile.reload()
        usageFile.reload()
        now = Date.now()
        open = true
    }

    function close() {
        open = false
    }

    onQueryChanged: sel = 0

    FileView {
        id: statFile
        path: (Quickshell.env("XDG_RUNTIME_DIR") || "/tmp") + "/aero-status.json"
        printErrors: false
        onLoaded: {
            try {
                shell.stats = JSON.parse(text()).apps || []
            } catch (err) {
                shell.stats = []
            }
        }
    }

    FileView {
        id: usageFile
        path: shell.home + "/.local/state/hyper-aero/phone-usage.json"
        printErrors: false
        onLoaded: {
            try {
                shell.usage = JSON.parse(text()) || {}
            } catch (err) {
                shell.usage = {}
            }
        }
    }

    FileView {
        id: arrivedFile
        path: shell.home + "/.local/state/hyper-aero/codex-arrived.json"
        printErrors: false
        onLoaded: {
            try {
                shell.arrived = JSON.parse(text()) || {}
            } catch (err) {
                shell.arrived = {}
            }
            shell.arrivedReady = true
            shell.stamp(false)
        }
        onLoadFailed: {
            if (shell.arrivedReady) return
            shell.arrivedReady = true
            shell.stamp(true)
        }
    }

    PanelWindow {
        id: win
        visible: shell.open
        color: "#f0030210"
        anchors {
            top: true
            bottom: true
            left: true
            right: true
        }
        exclusionMode: ExclusionMode.Ignore
        WlrLayershell.namespace: "status-codex"
        WlrLayershell.layer: WlrLayer.Overlay
        WlrLayershell.keyboardFocus: WlrKeyboardFocus.Exclusive

        onVisibleChanged: if (visible) book.grab()

        MouseArea {
            anchors.fill: parent
            onClicked: shell.close()
        }

        Book {
            id: book
            shell: shell
            anchors.fill: parent
        }
    }

    IpcHandler {
        target: "codex"

        function toggle(): void {
            if (shell.open) shell.close()
            else shell.show()
        }

        function reveal(): void {
            shell.show()
        }

        function hide(): void {
            shell.close()
        }

        function launch(key: string): void {
            shell.launch(shell.all.filter(function(a) { return a.key === key })[0])
        }
    }
}
