#!/usr/bin/env bash

sounds="$HOME/.config/hyper-aero/sounds"
conf="$HOME/.config/hyper-aero/theme/current/hyprlock.conf"

pidof hyprlock >/dev/null && exit 0

"$HOME/.config/hyper-aero/scripts/saver.sh" stop >/dev/null 2>&1

pw-play "$sounds/lock.wav" &
if [ -f "$conf" ]; then
    { hyprlock -c "$conf" && pw-play "$sounds/unlock.wav"; "$HOME/.config/hyper-aero/scripts/live-wall.sh" refresh; } &
else
    { hyprlock && pw-play "$sounds/unlock.wav"; "$HOME/.config/hyper-aero/scripts/live-wall.sh" refresh; } &
fi
wait
