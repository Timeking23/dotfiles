#!/usr/bin/env python3
import subprocess
import json

# ─── CONFIG ─────────────────────────────────────────────
TOTAL_STEPS = 10
HEART       = '♡'
FLAT        = 'ـ'
S1          = 'ﮩ٨ـ'
S2          = 'ﮩﮩ٨ـ'

PLAY_ICON   = '󰎈'
PAUSE_ICON  = '󰏤'
STOPPED     = '⏹ no media'

MAX_TITLE  = 24
MAX_ARTIST = 12

# ─── HELPERS ────────────────────────────────────────────
def run(cmd):
    """Run a shell command and return output or None"""
    try:
        return subprocess.check_output(cmd, stderr=subprocess.DEVNULL).decode().strip()
    except subprocess.CalledProcessError:
        return None

def get_state():
    """Get media player status and metadata"""
    status = run(['playerctl', 'status'])
    if status not in ('Playing', 'Paused'):
        return None
    title  = run(['playerctl', 'metadata', 'title'])  or ''
    artist = run(['playerctl', 'metadata', 'artist']) or ''
    try:
        pos    = float(run(['playerctl', 'position']))
        length = float(run(['playerctl', 'metadata', 'mpris:length'])) / 1_000_000
    except (TypeError, ValueError):
        pos, length = 0, 1
    progress = min(max(pos / length, 0), 1) if length > 0 else 0
    step     = int(progress * TOTAL_STEPS)
    return {
        'status': status,
        'title': title,
        'artist': artist,
        'pos': pos,
        'length': length,
        'step': step
    }

def fmt_time(seconds):
    """Format seconds as M:SS"""
    m, s = divmod(int(seconds), 60)
    return f'{m}:{s:02d}'

def truncate(text, max_len):
    """Truncate text and add ellipsis if needed"""
    return text if len(text) <= max_len else text[:max_len-1] + '…'

def build_bar(step):
    """Build heart-based progress bar"""
    step = min(max(step, 0), TOTAL_STEPS - 1)
    segments = []
    for j in range(TOTAL_STEPS):
        if j < step:
            segments.append(S1 if j % 2 == 0 else S2)
        else:
            segments.append(FLAT)
    segments[step] = HEART
    # Use LTR/PDF markers for proper display in Waybar
    return '\u202d' + ''.join(segments) + '\u202c'

# ─── MAIN ───────────────────────────────────────────────
state = get_state()
if state is None:
    output = {"text": STOPPED, "class": "stopped"}
else:
    icon = PLAY_ICON if state['status'] == 'Playing' else PAUSE_ICON
    artist = truncate(state['artist'], MAX_ARTIST)
    title = truncate(state['title'], MAX_TITLE)
    bar = build_bar(state['step'])
    time_str = f"{fmt_time(state['pos'])} / {fmt_time(state['length'])}"
    output = {
        "text": f"{icon} {artist} – {title} {bar} {time_str}",
        "class": state['status'].lower()  # "playing" or "paused"
    }

print(json.dumps(output, ensure_ascii=False))
