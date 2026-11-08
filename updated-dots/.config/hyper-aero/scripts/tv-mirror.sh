#!/usr/bin/env bash

. "$HOME/.config/hyper-aero/scripts/i18n.sh"

S="$HOME/.config/hyper-aero/scripts"

CONNECTED=0
MODE=""

load_state() {
    local line
    line=$(python3 "$S/aero-displays.py" state 2>/dev/null | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
except ValueError:
    d = {}
print(1 if d.get("external") else 0, d.get("mode", ""))')
    read -r CONNECTED MODE <<<"$line"
}

note() {
    command -v notify-send >/dev/null 2>&1 && notify-send -a "TV" "$@"
}

find_sink() {
    pactl list short sinks 2>/dev/null | awk -v want="$1" '$2 ~ want { print $2; exit }'
}

# the HDMI sink can lag behind the monitor change for a moment
route_audio() {
    local sink="" i id
    for i in 1 2 3 4 5 6 7 8 9 10; do
        sink=$(find_sink "$1")
        [ -n "$sink" ] && break
        sleep 0.3
    done
    [ -n "$sink" ] || return 1
    pactl set-default-sink "$sink"
    pactl list short sink-inputs | while read -r id _; do
        pactl move-sink-input "$id" "$sink"
    done
}

toggle() {
    load_state
    if [ "$CONNECTED" != 1 ]; then
        note -u critical "$(t "TV no conectada")" "$(t "Encendé la TV o revisá el cable HDMI.")"
        pkill -RTMIN+11 -x waybar
        return 1
    fi
    local mode=duplicate audio=hdmi
    if [ "$MODE" = duplicate ]; then
        mode=extend
        audio=analog
    fi
    if ! "$S/displays.sh" mode "$mode" >/dev/null; then
        note -u critical "$(t "No pude cambiar a la TV")"
        pkill -RTMIN+11 -x waybar
        return 1
    fi
    route_audio "$audio" || note "$(t "No encontré la salida de audio")"
    pkill -RTMIN+11 -x waybar
}

bar() {
    load_state
    if [ "$CONNECTED" != 1 ]; then
        printf '{"text": "--", "class": "absent", "tooltip": "%s"}\n' "$(t "TV no conectada")"
    elif [ "$MODE" = duplicate ]; then
        printf '{"text": "ON", "class": "on", "tooltip": "%s"}\n' "$(t "Pantalla en la TV · clic para volver")"
    else
        printf '{"text": "OFF", "class": "off", "tooltip": "%s"}\n' "$(t "Clic para mostrar la pantalla en la TV")"
    fi
}

case "${1:-}" in
    bar)    bar ;;
    toggle) toggle ;;
    *)      echo "uso: tv-mirror.sh [bar|toggle]"; exit 1 ;;
esac
