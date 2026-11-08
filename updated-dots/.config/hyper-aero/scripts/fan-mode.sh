#!/usr/bin/env bash

. "$HOME/.config/hyper-aero/scripts/i18n.sh"

profile=/sys/firmware/acpi/platform_profile

current() {
    cat "$profile" 2>/dev/null
}

fan_rpm() {
    local h
    for h in /sys/class/hwmon/hwmon*; do
        if [ "$(cat "$h/name" 2>/dev/null)" = asus ]; then
            printf 'CPU %s RPM  ·  GPU %s RPM' "$(cat "$h/fan1_input" 2>/dev/null || echo 0)" "$(cat "$h/fan2_input" 2>/dev/null || echo 0)"
            return
        fi
    done
}

bar() {
    local cur label cls name
    cur=$(current)
    case "$cur" in
        quiet)       label=QUIET; cls=quiet;       name=$(t "Silencioso") ;;
        balanced)    label=ECO;   cls=eco;         name="Eco  ·  Balanced" ;;
        performance) label=PERF;  cls=performance; name=$(t "Rendimiento") ;;
        *)           label=N/A;   cls=unknown;     name=${cur:-N/A} ;;
    esac
    printf '{"text": "%s", "class": "%s", "alt": "%s", "tooltip": "%s\\n%s\\n%s"}\n' \
        "$label" "$cls" "$cls" "$name" "$(fan_rpm)" "$(t "Clic: cambiar modo")"
}

# El firmware no tiene perfil Eco: Balanced es el modo que ocupa ese lugar.
next() {
    local target
    case "$(current)" in
        quiet)    target=Balanced ;;
        balanced) target=Performance ;;
        *)        target=Quiet ;;
    esac
    # -a -b: sin esto asusd vuelve al perfil anterior al conectar o quitar el cargador.
    if ! asusctl profile set -a -b "$target" >/dev/null 2>&1; then
        notify-send -a TELEMETRY "$(t "Ventilador")" "$(t "No se pudo cambiar el modo")"
    fi
    pkill -RTMIN+10 -x waybar
}

case "${1:-bar}" in
    bar)  bar ;;
    next) next ;;
    *)    echo "uso: fan-mode.sh [bar|next]"; exit 1 ;;
esac
