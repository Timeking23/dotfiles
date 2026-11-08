#!/usr/bin/env bash
# Phone frame around Firefox (quickshell config: aero-handset).
#   handset.sh on|off      enable/disable (persists across logins)
#   handset.sh daemon      start if enabled (run from aero-start.sh)
#   handset.sh restart     restart the daemon
#   handset.sh adopt       wrap an already-open Firefox window

FLAG_DIR="$HOME/.config/hyper-aero/handset"
FLAG="$FLAG_DIR/enabled"
LOG="${XDG_RUNTIME_DIR:-/tmp}/aero-handset.log"

start() {
    pgrep -f "qs -c aero-handset$" >/dev/null && return
    setsid -f qs -c aero-handset >"$LOG" 2>&1 </dev/null
}

stop() {
    timeout 2 qs -c aero-handset ipc call handset release >/dev/null 2>&1
    pkill -f "qs -c aero-handset$"
    # Never leave a browser stuck invisible if the daemon died mid-animation.
    for a in $(hyprctl -j clients | jq -r '.[] | select(.tags | index("handset") or index("handset*")) | .address'); do
        for p in "opacity 1" "opacity_inactive unset" "opacity_override unset" "opacity_inactive_override unset" \
                 "border_size unset" "rounding unset" "no_shadow unset"; do
            set -- $p
            hyprctl dispatch "hl.dsp.window.set_prop({ prop = '$1', value = '$2', window = 'address:$a' })" >/dev/null
        done
        hyprctl dispatch "hl.dsp.window.tag({ tag = '-handset', window = 'address:$a' })" >/dev/null
    done
}

case "${1:-daemon}" in
    on)
        mkdir -p "$FLAG_DIR"
        touch "$FLAG"
        start
        ;;
    off)
        rm -f "$FLAG"
        stop
        ;;
    daemon)
        [ -e "$FLAG" ] && start
        ;;
    restart)
        stop
        sleep 0.4
        [ -e "$FLAG" ] && start
        ;;
    adopt)
        timeout 3 qs -c aero-handset ipc call handset adopt
        ;;
    *)
        echo "usage: handset.sh on|off|daemon|restart|adopt"
        exit 1
        ;;
esac
exit 0
