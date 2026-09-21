#!/usr/bin/env python3
"""
Find the empty mats in a sidebar frame collage and print them as the MATS
literal that widget/Sidebar.tsx uses to place its keys.

    python3 assets/measure-mats.py sidebar-frames.jpeg

A "mat" is the flat empty rectangle inside a picture frame -- the part a key
should cover. They are not always dark: sidebar.jpeg has black mats,
sidebar2.jpeg has white ones, so both extremes are searched.

Why measure instead of eyeballing: a first pass here scanned for dark *rows*
across the whole image and picked up the dark backdrop as well, which put the
first frame's top edge out by 13% of the drawer. Restricting the scan to a
frame's own column and demanding a near-solid run fixes that.

Output fractions are of the whole image, which is what the widget wants: the
picture is painted with `background-size: 100% 100%`, so it stretches to the
drawer and fractions hold at any height.

TO FINE-TUNE BY HAND: edit the MATS array in widget/Sidebar.tsx directly. The
numbers are plain fractions -- 0 is the top/left edge, 1 the bottom/right. Nudge
`top`/`bottom` to move a key up or down, `left`/`right` to widen it. Overlapping
the surrounding ornaments is fine; the key is drawn over them.
"""

import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent

# a mat must be at least this fraction of the image in each direction, which
# keeps out the small dark gaps between the ornaments
MIN_W = 0.14
MIN_H = 0.05

# a real mat is a solid rectangle: this is the minimum ratio of component area
# to bounding-box area, which rejects ragged shapes like the chain and lilies
FILL = 0.85

# labelling runs on a downscale; full resolution is 1.6M pixels and this is a
# pure-python flood fill (scipy is not installed here)
SCALE = 4


def components(mask: np.ndarray) -> list[tuple[float, float, float, float]]:
    """Solid rectangles in `mask`, as (top, bottom, left, right) fractions."""
    h, w = mask.shape
    seen = np.zeros_like(mask, bool)
    out = []

    for sy in range(h):
        for sx in range(w):
            if not mask[sy, sx] or seen[sy, sx]:
                continue

            queue = deque([(sy, sx)])
            seen[sy, sx] = True
            ys, xs, area = [sy], [sx], 0

            while queue:
                y, x = queue.popleft()
                area += 1
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        queue.append((ny, nx))
                        ys.append(ny)
                        xs.append(nx)

            y0, y1, x0, x1 = min(ys), max(ys), min(xs), max(xs)
            bw, bh = x1 - x0 + 1, y1 - y0 + 1
            if bw < MIN_W * w or bh < MIN_H * h:
                continue
            if area / (bw * bh) < FILL:
                continue
            out.append((y0 / h, y1 / h, x0 / w, x1 / w))

    return out


def main() -> None:
    name = sys.argv[1] if len(sys.argv) > 1 else "sidebar-frames.jpeg"
    path = HERE / name
    if not path.is_file():
        raise SystemExit(f"error: no such image: {path}")

    im = Image.open(path).convert("L")
    W, H = im.size
    grey = np.array(im.resize((W // SCALE, H // SCALE), Image.BILINEAR))

    # dark mats (sidebar.jpeg) and light mats (sidebar2.jpeg)
    mats = components(grey < 26) + components(grey > 228)
    mats.sort()

    keep = []
    for m in mats:
        if all(abs(m[0] - k[0]) > 0.02 or abs(m[2] - k[2]) > 0.02 for k in keep):
            keep.append(m)

    print(f"// {name}  {W}x{H}  --  {len(keep)} mats")
    print("const MATS: Array<Mat> = [")
    for top, bottom, left, right in keep:
        side = "left" if left < 0.4 else "right"
        print(
            f"  {{ top: {top:.3f}, bottom: {bottom:.3f}, "
            f"left: {left:.3f}, right: {right:.3f} }}, // {side}"
        )
    print("]")


if __name__ == "__main__":
    main()
