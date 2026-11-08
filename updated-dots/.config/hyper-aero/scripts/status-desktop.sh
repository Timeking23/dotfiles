#!/usr/bin/env bash

A="$HOME/.config/hyper-aero"
S="$A/scripts"
FLAG="$A/status-desktop/enabled"
LOG="${XDG_RUNTIME_DIR:-/tmp}/aero-status.log"
# Which desktop shell to run: aero-status (game deck) or aero-bloom (fog + blossoms,
# brings its own top bar instead of waybar). Pick with `status-desktop.sh use <name>`.
PICK="$A/status-desktop/shell"
SHELL_NAME=$(cat "$PICK" 2>/dev/null || echo aero-status)

stop_shells() {
    pkill -f "qs -c aero-status$"
    pkill -f "qs -c aero-bloom$"
}

start_shell() {
    if [ "$SHELL_NAME" = aero-bloom ]; then
        pkill -x waybar
    elif ! pgrep -x waybar >/dev/null; then
        setsid -f "$S/aerobar.sh" >/dev/null 2>&1 </dev/null
    fi
    pgrep -f "qs -c $SHELL_NAME$" >/dev/null && return
    if [ -z "$QS_ICON_THEME" ]; then
        theme=$(gsettings get org.gnome.desktop.interface icon-theme 2>/dev/null | tr -d "'")
        [ -n "$theme" ] && export QS_ICON_THEME="$theme"
    fi
    setsid -f qs -c "$SHELL_NAME" >"$LOG" 2>&1 </dev/null
}

stop_old() {
    pkill -f "mpvpaper.*aero-motion.sock"
    pkill -f "qs -c aero-desk$"
    eww close telemetry telemetry-slim >/dev/null 2>&1
}

case "${1:-daemon}" in
    on)
        touch "$FLAG"
        stop_old
        start_shell
        ;;
    off)
        rm -f "$FLAG"
        stop_shells
        pgrep -x waybar >/dev/null || setsid -f "$S/aerobar.sh" >/dev/null 2>&1 </dev/null
        "$S/wallpaper.sh" start
        "$S/desk.sh" daemon
        "$S/aero-start.sh"
        ;;
    daemon)
        [ -e "$FLAG" ] && start_shell
        ;;
    use)
        case "$2" in
            aero-status|aero-bloom) ;;
            *) echo "usage: status-desktop.sh use aero-status|aero-bloom"; exit 1 ;;
        esac
        echo "$2" >"$PICK"
        SHELL_NAME="$2"
        stop_shells
        sleep 0.4
        touch "$FLAG"
        stop_old
        start_shell
        ;;
    restart)
        stop_shells
        sleep 0.4
        [ -e "$FLAG" ] && start_shell
        ;;
    toggle)
        timeout 3 qs -c "$SHELL_NAME" ipc call status toggle >/dev/null 2>&1
        ;;
    *)
        echo "usage: status-desktop.sh on|off|restart|toggle|use aero-status|aero-bloom"
        exit 1
        ;;
esac
exit 0
