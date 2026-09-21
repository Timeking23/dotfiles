#!/bin/bash
# Render fastfetch's built-in ASCII logo to a png for use as a widget背景.
#
# fastfetch ships NO image assets -- `pacman -Ql fastfetch` has only jsonc
# presets, and every logo is block characters compiled into the binary. So the
# logo is printed, the info column is cut off, and the block glyphs are set in
# the shell's own font.
#
#   ./gen-logo.sh [logo-name] [hex-colour] [alpha]
#   ./gen-logo.sh Arch '#7fe3b0' 0.30
#
# `fastfetch --list-logos` shows the ~400 available names.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
NAME="${1:-Manjaro}"
COLOUR="${2:-#7fe3b0}"
ALPHA="${3:-0.30}"
FONT="$(fc-match -f '%{file}' 'JetBrainsMono Nerd Font')"
TMP="$(mktemp)"

fastfetch --logo "$NAME" --logo-type builtin --pipe \
  | awk '{ line = substr($0, 1, 52); sub(/[ \t]+$/, "", line); if (line == "") { if (seen) exit; next } seen = 1; print line }' \
  > "$TMP"

magick -background none -fill "$COLOUR" -font "$FONT" -pointsize 28 \
  label:@"$TMP" -trim +repage \
  -alpha set -channel A -evaluate multiply "$ALPHA" +channel \
  "$HERE/key-logo.png"

rm -f "$TMP"
echo "wrote $HERE/key-logo.png  ($NAME, $COLOUR, alpha $ALPHA)"
