#!/bin/bash
# Toggle night light shader on/off

SHADER="$HOME/.config/hypr/shaders/nightlight.glsl"
CURRENT=$(hyprctl getoption decoration:screen_shader -j | grep -o '"str": "[^"]*"' | cut -d'"' -f4)

if [ -z "$CURRENT" ] || [ "$CURRENT" = "[[EMPTY]]" ]; then
    hyprctl keyword decoration:screen_shader "$SHADER"
    notify-send "Night Light" "Enabled" -t 2000
else
    hyprctl keyword decoration:screen_shader "[[EMPTY]]"
    notify-send "Night Light" "Disabled" -t 2000
fi
