#!/usr/bin/env python3
"""
Derive the weather panel's backgrounds from one piece of artwork.

The panel's background answers to the sky, but there is only one painting. So
rather than ask for seven, each condition is a graded version of the same
image: the composition never changes, the light does. That is also why this is
generated rather than hand-edited -- swap weather-bg.jpg for a different
picture, re-run, and the whole set follows.

Each mood is (saturation, brightness, contrast, tint rgb, tint alpha, blur).
Tint is a flat colour blended over the top, which is what actually carries the
mood; the enhancers just stop it turning to mud.

    python3 assets/gen-weather-bg.py
"""

from PIL import Image, ImageEnhance, ImageFilter
import pathlib

HERE = pathlib.Path(__file__).parent
SOURCE = HERE / "weather-bg.jpg"
OUT = HERE / "weather"

MOODS = {
    # bright, warm, the artwork close to as-drawn
    "clear-day":   (1.15, 1.06, 1.04, (255, 214, 236), 0.06, 0),
    # deep violet dusk, well down in brightness
    "clear-night": (0.72, 0.52, 1.12, (44, 30, 92), 0.42, 0),
    # colour pulled out, flattened
    "clouds":      (0.62, 0.86, 0.94, (150, 156, 168), 0.24, 0),
    # cool and dim, blue over everything
    "rain":        (0.55, 0.66, 1.02, (54, 86, 138), 0.36, 1),
    # hard steel-grey, the coldest of the lit moods
    "hail":        (0.4, 0.78, 1.18, (150, 176, 196), 0.4, 0),
    # smeared sideways rather than blurred round -- see the motion blur below
    "wind":        (0.6, 0.88, 0.98, (168, 178, 176), 0.26, 0),
    # pale and bright, the pink washed toward ice
    "snow":        (0.45, 1.12, 0.88, (206, 232, 248), 0.34, 0),
    # darkest of the set, violet and contrasty
    "storm":       (0.5, 0.44, 1.24, (58, 30, 84), 0.46, 0),
    # desaturated and genuinely blurred, not just dimmed
    "fog":         (0.34, 0.9, 0.8, (188, 192, 196), 0.4, 5),
}

#  Wind gets a horizontal smear instead of a round blur, because a gaussian
#  reads as "out of focus" and wind should read as "moving".
STREAKED = {"wind": 9}


def grade(image, sat, bright, contrast, tint, alpha, blur):
    out = ImageEnhance.Color(image).enhance(sat)
    out = ImageEnhance.Brightness(out).enhance(bright)
    out = ImageEnhance.Contrast(out).enhance(contrast)

    if blur:
        out = out.filter(ImageFilter.GaussianBlur(blur))

    if alpha:
        out = Image.blend(out, Image.new("RGB", out.size, tint), alpha)

    return out


def streak(image, radius):
    """Average the image with horizontal offsets of itself: a cheap motion blur."""
    out = image
    for step in range(1, radius + 1):
        shifted = image.transform(
            image.size, Image.AFFINE, (1, 0, -step, 0, 1, 0), resample=Image.BILINEAR
        )
        out = Image.blend(out, shifted, 1 / (step + 1))
    return out


def main():
    if not SOURCE.exists():
        raise SystemExit(f"no source artwork at {SOURCE}")

    base = Image.open(SOURCE).convert("RGB")

    for name, params in MOODS.items():
        #  One directory per condition, not one file. The panel plays whatever
        #  .jpg files it finds in the matching folder, so dropping your own art
        #  into assets/weather/rain/ is all it takes to replace this -- and
        #  several files in one folder are cycled as an animation.
        folder = OUT / name
        folder.mkdir(parents=True, exist_ok=True)

        image = grade(base, *params)
        if name in STREAKED:
            image = streak(image, STREAKED[name])

        path = folder / "00.jpg"
        image.save(path, quality=90)
        print(f"  {path.relative_to(HERE.parent)}")


if __name__ == "__main__":
    main()
