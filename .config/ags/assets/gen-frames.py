#!/usr/bin/env python3
"""
Explode an animated gif into a numbered png sequence for use as a widget
background.

    python3 assets/gen-frames.py ~/Pictures/GUI/cpu.gif calendar-bg --width 280

Why not just use the gif directly? GTK4 CSS cannot animate one. A gif handed to
`background-image: url(...)` is decoded by GdkPixbuf into a single static
texture -- you get frame 0 and nothing else. GtkPicture has the same problem
with a plain file. So the frames are extracted here and cycled by a timer in
the widget, which is the same approach widget/CpuCrystal.tsx already takes.

Frames are coalesced first. Most gifs store only the changed region of each
frame (see the differing sizes in `identify`), so without coalescing you get
torn fragments on a transparent field instead of whole pictures.

The per-frame delays are read off the source rather than averaged, because gif
delays are per-frame and an averaged loop visibly drifts against the original.
They are written to delays.json next to the frames.
"""

import json
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent


def die(msg: str) -> None:
    print(f"error: {msg}", file=sys.stderr)
    raise SystemExit(1)


def main() -> None:
    args = sys.argv[1:]
    if len(args) < 2:
        die("usage: gen-frames.py <source.gif> <out-dir-name> [--width N]")

    src = Path(args[0]).expanduser()
    out = HERE / args[1]
    width = 280
    if "--width" in args:
        width = int(args[args.index("--width") + 1])

    if not src.is_file():
        die(f"no such file: {src}")

    magick = shutil.which("magick") or shutil.which("convert")
    if magick is None:
        die("ImageMagick not found (need `magick` or `convert` on PATH)")

    # per-frame delay, in centiseconds, one line per frame
    raw = subprocess.run(
        [shutil.which("magick") and "magick" or "identify", "identify",
         "-format", "%T\n", str(src)],
        capture_output=True, text=True,
    )
    delays = [int(x) for x in raw.stdout.split() if x.strip().isdigit()]
    if not delays:
        die("could not read frame delays -- is this actually an animated gif?")

    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)

    # -coalesce rebuilds every frame as a whole image before resizing
    subprocess.run(
        [magick, str(src), "-coalesce", "-resize", f"{width}x{width}",
         str(out / "%02d.png")],
        check=True,
    )

    written = sorted(out.glob("*.png"))
    if not written:
        die("ImageMagick wrote no frames")

    # a gif delay of 0 means "as fast as possible"; browsers and GTK alike
    # treat that as 10cs, so normalise it here rather than in the widget
    delays = [d if d > 0 else 10 for d in delays][: len(written)]
    (out / "delays.json").write_text(json.dumps(delays))

    total = sum(delays) / 100
    print(f"{len(written)} frames -> {out}")
    print(f"loop: {total:.2f}s   delays(cs): {delays[:8]}{'...' if len(delays) > 8 else ''}")
    print(f"\nNow set FRAMES/DIR in widget/GifBackground.tsx to '{args[1]}'.")


if __name__ == "__main__":
    main()
