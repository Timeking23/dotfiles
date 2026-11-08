#!/usr/bin/env python3
"""Pick an accent colour from a wallpaper image and write it as Bloom's palette.

wall-palette.py <image> [out.json]

Takes the most prominent saturated colour. A wallpaper that is nearly grey (like a
foggy night) gets warm lamplight instead of a dead grey, so highlights still glow.
Output: {"accent": "#rrggbb", "deep": "#rrggbb", "hue": deg, "sat": pct, "mono": bool,
         "clock": "tc" | "tl" | "bl"}

"clock" is where Bloom should put its clock: the candidate spot with the least going on
in the picture (edges and contrast), so it doesn't sit on top of the subject.
"""
import colorsys
import json
import os
import subprocess
import sys


def colours(path):
    out = subprocess.run(
        ["magick", path + "[0]", "-resize", "120x120", "-colors", "10", "-format", "%c", "histogram:info:-"],
        capture_output=True, text=True, check=True).stdout
    found = []
    for line in out.splitlines():
        line = line.strip()
        if ":" not in line or "#" not in line:
            continue
        count = int(line.split(":")[0])
        hx = line[line.index("#") + 1:line.index("#") + 7]
        r, g, b = (int(hx[i:i + 2], 16) / 255 for i in (0, 2, 4))
        found.append((count, r, g, b))
    return found


def hexs(r, g, b):
    return "#%02x%02x%02x" % tuple(int(round(max(0, min(1, c)) * 255)) for c in (r, g, b))


def pick(found):
    total = sum(c for c, *_ in found) or 1
    best, score = None, 0.0
    for count, r, g, b in found:
        h, l, s = colorsys.rgb_to_hls(r, g, b)
        if l < 0.12 or l > 0.92:
            continue
        sc = s * (count / total) ** 0.5
        if sc > score:
            best, score = (h, l, s), sc
    if best is None or best[2] < 0.18:
        # Monochrome wallpaper: warm lamplight.
        return {"accent": "#ead9b6", "deep": "#a8916a", "hue": 38, "sat": 8, "mono": True}
    h, _, s = best
    accent = colorsys.hls_to_rgb(h, 0.74, min(0.85, max(0.45, s)))
    deep = colorsys.hls_to_rgb(h, 0.52, min(0.7, max(0.35, s)))
    return {"accent": hexs(*accent), "deep": hexs(*deep), "hue": int(h * 360), "sat": int(min(100, s * 100)), "mono": False}


# Candidate clock spots in Bloom's 1600x1000 layout (x, y, w, h); the right-hand strip
# belongs to the cards and is never used.
SLOTS = {"tc": (600, 70, 560, 300), "tl": (40, 70, 520, 300), "bl": (40, 600, 520, 300)}
GW, GH = 160, 100


def busy(path):
    """Edge + contrast energy for each slot, on the image cover-fitted to 16:10."""
    raw = subprocess.run(
        ["magick", path + "[0]", "-resize", "%dx%d^" % (GW, GH), "-gravity", "center",
         "-extent", "%dx%d" % (GW, GH), "-colorspace", "gray", "-depth", "8", "gray:-"],
        capture_output=True, check=True).stdout
    px = list(raw)
    med = sorted(px)[len(px) // 2]
    score = {}
    for name, (x, y, w, h) in SLOTS.items():
        x0, y0 = int(x * GW / 1600), int(y * GH / 1000)
        x1, y1 = int((x + w) * GW / 1600), int((y + h) * GH / 1000)
        tot, n = 0.0, 0
        for yy in range(y0, min(GH - 1, y1)):
            for xx in range(x0, min(GW - 1, x1)):
                v = px[yy * GW + xx]
                edge = abs(v - px[yy * GW + xx + 1]) + abs(v - px[(yy + 1) * GW + xx])
                tot += edge + 0.35 * abs(v - med)
                n += 1
        score[name] = tot / max(1, n)
    return score


def main():
    img = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.expanduser("~/.config/hyper-aero/livewall/palette.json")
    pal = pick(colours(img))
    sc = busy(img)
    # Prefer the usual top-centre unless it is clearly busier than another spot.
    best = min(sc, key=sc.get)
    pal["clock"] = best if sc[best] < sc["tc"] * 0.8 else "tc"
    pal["busy"] = {k: round(v, 1) for k, v in sc.items()}
    tmp = out + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(pal, f)
    os.replace(tmp, out)
    print(json.dumps(pal))


if __name__ == "__main__":
    main()
