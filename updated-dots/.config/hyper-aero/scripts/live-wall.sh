#!/usr/bin/env bash
# Wallpaper Engine wallpapers as the live desktop background (via linux-wallpaperengine).
#   live-wall.sh list            workshop wallpapers you're subscribed to
#   live-wall.sh on [id]         play one (default: last used, else the first)
#   live-wall.sh next|prev       cycle through them, with Bloom's still image as one stop
#   live-wall.sh off             back to Bloom's still wallpaper
#   live-wall.sh daemon          resume at login if it was on
#   live-wall.sh still [path]    use a still image as Bloom's backdrop (no path: bloom.png)
#   live-wall.sh json            everything the picker shows, as JSON
#   live-wall.sh refresh         restart the current scene (after unlock / screensaver)
# While playing, $DIR/active holds the id and $DIR/mode says how it plays:
#   "video <path>"  Bloom plays the file itself under its fog/glass (one opaque surface,
#                   no layering, so no flicker)
#   "scene"         linux-wallpaperengine draws on the background layer and Bloom goes
#                   transparent over it

DIR="$HOME/.config/hyper-aero/livewall"
ACTIVE="$DIR/active"
MODE="$DIR/mode"
LAST="$DIR/last"
LOG="${XDG_RUNTIME_DIR:-/tmp}/live-wall.log"
STILL="$DIR/still"
# Wallpapers linux-wallpaperengine can't play, one "id reason" per line. Filled in when a
# scene crashes on start (e.g. 3D perspective cameras) or uses a puppet model.
BROKEN="$DIR/unsupported"
touch "$BROKEN"
# Folders scanned for still images (png/jpg/webp), besides Bloom's own wallpaper.
STILL_DIRS=("$HOME/Pictures/Wallpapers" "$HOME/Downloads/wallpaper")
BLOOM_IMG="$HOME/.config/hyper-aero/wallpapers/bloom.png"
# Accent colour taken from the current wallpaper (wall-palette.py); Bloom tints itself
# with it. No file = Bloom's own pink, used with the bloom.png still.
PALETTE="$DIR/palette.json"

repaint() {
    if [ -z "$1" ] || [ "$1" = "$BLOOM_IMG" ]; then rm -f "$PALETTE"; return; fi
    "$HOME/.config/hyper-aero/scripts/wall-palette.py" "$1" "$PALETTE" >/dev/null 2>&1 || rm -f "$PALETTE"
}
WS="$HOME/.local/share/Steam/steamapps/workshop/content/431960"
ASSETS="$HOME/.local/share/Steam/steamapps/common/wallpaper_engine/assets"
mkdir -p "$DIR"

ids() {
    for d in "$WS"/*/; do
        [ -f "$d/project.json" ] || continue
        t=$(jq -r '.type // "" | ascii_downcase' "$d/project.json" 2>/dev/null)
        # Web wallpapers aren't supported by linux-wallpaperengine.
        [ "$t" = web ] && continue
        basename "$d"
    done
}

title() {
    jq -r '.title // "?"' "$WS/$1/project.json" 2>/dev/null
}

monitor() {
    m=$(cat "${XDG_RUNTIME_DIR:-/tmp}/aero-primary" 2>/dev/null)
    [ -n "$m" ] || m=$(hyprctl monitors -j | jq -r '.[0].name')
    echo "$m"
}

kill_players() {
    local pat="^(\./|/usr/[a-z/]*/)?linux-wallpaperengine --layer"
    pkill -f "$pat" 2>/dev/null
    pkill -f "^mpvpaper .*livewall\.sock" 2>/dev/null
    # A player stuck mid-load can ignore SIGTERM; don't leave two running.
    for _ in 1 2 3 4; do pgrep -f "$pat" >/dev/null || return 0; sleep 0.5; done
    pkill -9 -f "$pat" 2>/dev/null
}

stop() {
    kill_players
    rm -f "$ACTIVE" "$MODE" "$DIR/title"
    repaint "$(cat "$STILL" 2>/dev/null)"
}

play() {
    id="$1"
    [ -d "$WS/$id" ] || { echo "no workshop wallpaper $id"; exit 1; }
    kill_players
    sleep 0.3
    type=$(jq -r '.type // "" | ascii_downcase' "$WS/$id/project.json")
    file=$(jq -r '.file // ""' "$WS/$id/project.json")
    # Both players sit on the background layer, under Bloom (which goes transparent).
    if [ "$type" = video ] && [ -f "$WS/$id/$file" ]; then
        printf 'video %s\n' "$WS/$id/$file" >"$MODE"
    else
        command -v linux-wallpaperengine >/dev/null || { echo "linux-wallpaperengine is not installed (yay -S linux-wallpaperengine-git)"; exit 1; }
        # A preset has no files of its own: it is another wallpaper ("dependency") with
        # saved property values, which we pass along with --set-property.
        bg="$WS/$id"
        props=()
        dep=$(jq -r '.dependency // ""' "$WS/$id/project.json")
        if [ -n "$dep" ] && [ -d "$WS/$dep" ]; then
            bg="$WS/$dep"
            mapfile -t kv < <(jq -r '.preset // {} | to_entries[] | select(.value != null)
                | "\(.key)=\(if .value == true then "1" elif .value == false then "0" else .value end)"' "$WS/$id/project.json")
            for p in "${kv[@]}"; do props+=(--set-property "$p"); done
        fi
        # Hyprland leaves a layer created over a fullscreen window at alpha 0 forever, so
        # wait (up to 2 min) until the focused workspace has no fullscreen window.
        for _ in $(seq 1 240); do
            [ "$(hyprctl -j activeworkspace | jq -r .hasfullscreen)" = true ] || break
            sleep 0.5
        done
        setsid -f linux-wallpaperengine --layer background --assets-dir "$ASSETS" --fps 30 --silent --no-fullscreen-pause \
            --screen-root "$(monitor)" --bg "$bg" --scaling fill "${props[@]}" >"$LOG" 2>&1 </dev/null
        # If it dies on start (or draws white), Bloom would be transparent over nothing:
        # a watcher falls back to the still image and remembers the wallpaper.
        setsid -f "$0" watch "$id" >/dev/null 2>&1 </dev/null
        echo scene >"$MODE"
    fi
    echo "$id" >"$LAST"
    echo "$id" >"$ACTIVE"
    title "$id" >"$DIR/title"
    repaint "$WS/$id/$(jq -r '.preview // "preview.jpg"' "$WS/$id/project.json")"
    notify-send -a "Wallpaper" "Live wallpaper" "$(title "$id")" 2>/dev/null
}

# The loop is: still image -> wallpaper 1 -> ... -> wallpaper N -> still image.
step() {
    mapfile -t all < <(ids | grep -vxFf <(cut -d' ' -f1 "$BROKEN"; echo __none__))
    n=${#all[@]}
    [ "$n" -gt 0 ] || exit 1
    i=-1
    if [ -e "$ACTIVE" ]; then
        cur=$(cat "$ACTIVE")
        for k in "${!all[@]}"; do [ "${all[$k]}" = "$cur" ] && i=$k; done
    fi
    i=$(( i + $1 ))
    if [ "$i" -ge "$n" ] || [ "$i" -eq -1 ]; then
        stop
        notify-send -a "Wallpaper" "Wallpaper" "Bloom (still)" 2>/dev/null
        return
    fi
    [ "$i" -lt -1 ] && i=$(( n - 1 ))
    play "${all[$i]}"
}

case "${1:-list}" in
    list)
        cur=$(cat "$ACTIVE" 2>/dev/null)
        for id in $(ids); do
            mark=" "; [ "$id" = "$cur" ] && mark="*"
            printf '%s %-12s %-6s %s\n' "$mark" "$id" "$(jq -r '.type // "?"' "$WS/$id/project.json")" "$(title "$id")"
        done
        ;;
    on)
        id="${2:-$(cat "$LAST" 2>/dev/null)}"
        [ -n "$id" ] || id=$(ids | head -1)
        play "$id"
        ;;
    next) step 1 ;;
    prev) step -1 ;;
    off) stop ;;
    toggle) if [ -e "$ACTIVE" ]; then stop; else "$0" on; fi ;;
    still)
        stop
        if [ -n "$2" ] && [ "$2" != "$BLOOM_IMG" ]; then echo "$2" >"$STILL"; else rm -f "$STILL"; fi
        repaint "$2"
        ;;
    pause|resume)
        # Freeze the scene player while windows cover the desktop (Bloom calls this);
        # the compositor keeps showing its last frame. Saves the GPU a lot.
        sig=STOP; [ "$1" = resume ] && sig=CONT
        pkill -$sig -f "^(\./|/usr/[a-z/]*/)?linux-wallpaperengine --layer" 2>/dev/null
        ;;
    refresh)
        # Scenes don't follow display changes (lock, DPMS, screensaver) and can come
        # back shifted; restarting puts them right. Videos are played by Bloom itself.
        [ "$(cat "$MODE" 2>/dev/null)" = scene ] && [ -e "$ACTIVE" ] || exit 0
        sleep 1
        play "$(cat "$ACTIVE")" >/dev/null 2>&1
        ;;
    watch)
        id="$2"
        sleep 4
        [ "$(cat "$ACTIVE" 2>/dev/null)" = "$id" ] || exit 0
        # A vertex shader that fails to compile leaves the whole scene drawn white.
        if grep -q 'must write to gl_Position' "$LOG"; then
            pkill -f "^(\./|/usr/[a-z/]*/)?linux-wallpaperengine --layer"
            sleep 0.5
        fi
        pgrep -f "^(\./|/usr/[a-z/]*/)?linux-wallpaperengine --layer" >/dev/null && exit 0
        why=$(grep -m1 -iE 'must write to gl_Position|must have|unsupported|error|exception' "$LOG" | cut -c1-80)
        grep -q "^$id " "$BROKEN" || echo "$id crash ${why:-exited}" >>"$BROKEN"
        rm -f "$ACTIVE" "$MODE" "$DIR/title"
        notify-send -a "Wallpaper" "Can't play this one on Linux" "$(title "$id") — back to your still wallpaper" 2>/dev/null
        ;;
    json)
        cur=$(cat "$ACTIVE" 2>/dev/null)
        still=$(cat "$STILL" 2>/dev/null)
        {
            jq -n --arg p "$BLOOM_IMG" --arg cur "$cur" --arg still "$still" \
                '{kind: "still", id: $p, title: "bloom", type: "still", preview: $p, active: ($cur == "" and ($still == "" or $still == $p))}'
            for d in "${STILL_DIRS[@]}"; do
                [ -d "$d" ] || continue
                find "$d" -maxdepth 1 -type f \( -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.webp' \) | sort | while read -r f; do
                    jq -n --arg p "$f" --arg cur "$cur" --arg still "$still" \
                        '{kind: "still", id: $p, title: ($p | split("/") | last | sub("\\.[^.]*$"; "")), type: "still", preview: $p, active: ($cur == "" and $still == $p)}'
                done
            done
            for id in $(ids); do
                note=$(grep -m1 "^$id " "$BROKEN" | cut -d' ' -f2)
                jq --arg id "$id" --arg dir "$WS/$id" --arg cur "$cur" --arg note "$note" \
                    '{kind: "live", id: $id, title: (.title // $id),
                      type: (if .dependency then "preset" else ((.type // "?") | ascii_downcase) end), note: $note,
                      preview: ($dir + "/" + (.preview // "preview.jpg")), active: ($cur == $id)}' "$WS/$id/project.json"
            done
        } | jq -s -c .
        ;;
    daemon)
        # The active file survives a reboot; restart what it names.
        [ -e "$ACTIVE" ] && play "$(cat "$ACTIVE")"
        ;;
    *)
        echo "usage: live-wall.sh list|on [id]|next|prev|off|toggle|daemon|still [path]|json"
        exit 1
        ;;
esac
exit 0
