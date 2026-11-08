#!/usr/bin/env bash

S="$HOME/.config/hyper-aero/scripts"

pgrep -x eww >/dev/null || setsid -f eww daemon >/dev/null 2>&1 </dev/null
for _ in $(seq 1 150); do
    eww ping >/dev/null 2>&1 && break
    sleep 0.1
done

if [ -e "$HOME/.config/hyper-aero/status-desktop/enabled" ]; then
    "$S/status-desktop.sh" daemon
elif ! eww active-windows 2>/dev/null | grep -q '^telemetry'; then
    "$S/aero-eww" open telemetry >/dev/null 2>&1 || eww open telemetry >/dev/null 2>&1
fi

# Bloom brings its own bar; everything else uses waybar.
if [ -e "$HOME/.config/hyper-aero/status-desktop/enabled" ] && [ "$(cat "$HOME/.config/hyper-aero/status-desktop/shell" 2>/dev/null)" = aero-bloom ]; then
    :
else
    pgrep -x waybar >/dev/null || setsid -f "$S/aerobar.sh" >/dev/null 2>&1 </dev/null
fi
"$S/codex.sh" daemon
"$S/handset.sh" daemon
"$S/live-wall.sh" daemon
