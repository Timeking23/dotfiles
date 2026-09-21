#!/usr/bin/env python3
"""
Build the three sidebar artwork layers, with their glows baked in.

    python3 assets/gen-glow.py

Why baked? GTK4 CSS has no filter/blur and no per-layer compositing beyond
`background-blend-mode`, so a glow cannot be applied to a background image at
render time. It has to be in the pixels.

Reads the PRISTINE sources from ~/Pictures and writes the derived assets, so
running it twice is idempotent -- it never re-glows its own output:

    sidebar.jpeg    -> sidebar-1.jpeg   pink bloom
    sidebar2.jpeg   -> sidebar-2.jpeg   silver bloom on the chain
    linebreak.jpeg  -> linebreak.png    white knocked out, neon on the bow

The layer geometry that consumes these lives in style/_sidebar.scss, and the
frame-mat fractions in widget/Sidebar.tsx. If a source image is swapped, both
of those need revisiting -- this script only makes pixels.
"""

import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
SRC = Path.home() / "Pictures"

PAGE_W = 675


def die(msg: str) -> None:
    print(f"error: {msg}", file=sys.stderr)
    raise SystemExit(1)


def load(name: str) -> np.ndarray:
    p = SRC / name
    if not p.is_file():
        die(f"no such source: {p}")
    return np.asarray(Image.open(p).convert("RGB"), dtype=np.float32) / 255.0


def blur(a: np.ndarray, radius: float) -> np.ndarray:
    """Gaussian blur via PIL, on a float array of any channel count."""
    from PIL import ImageFilter

    if a.ndim == 2:
        img = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8), "L")
        out = img.filter(ImageFilter.GaussianBlur(radius))
        return np.asarray(out, dtype=np.float32) / 255.0
    chans = [blur(a[..., i], radius) for i in range(a.shape[2])]
    return np.stack(chans, axis=-1)


def screen(base: np.ndarray, top: np.ndarray) -> np.ndarray:
    """Screen blend -- lightens, never clips to a hard edge. What a bloom wants."""
    return 1.0 - (1.0 - base) * (1.0 - top)


def halo(mask: np.ndarray, tight: float, wide: float, gain: float,
         tight_w: float = 0.9, wide_w: float = 1.2) -> np.ndarray:
    """
    Blur a mask into a glow amount in 0..1.

    The gain is the whole point, and skipping it is the mistake that made the
    first version of this script produce a glow nobody could see. A blur
    conserves energy: spreading a mask over a 26px radius drops its amplitude
    by more than an order of magnitude, so the halo landed at 0.03 out of 1.0
    on the dark background -- measured, not guessed -- and the drawer's 34%
    ink scrim then took a third of even that.

    Multiplying by a constant instead would just clip the bright cores to flat
    white blobs. `1 - exp(-gain*x)` lifts the faint tail hard while saturating
    smoothly at the top, which is what makes the dim outer halo readable
    without eating the detail inside the bright art.

    The two weights decide what the glow LOOKS like at a given brightness.
    Leaning on the wide pass spreads a broad wash that greys the whole page
    out as the gain rises; leaning on the tight pass keeps the light close to
    the thing emitting it, so edges survive and the gain can go about twice as
    high before anything turns to mush.
    """
    amt = blur(mask, tight) * tight_w + blur(mask, wide) * wide_w
    return 1.0 - np.exp(-gain * amt)


def bloom(rgb: np.ndarray, mask: np.ndarray, color: np.ndarray,
          tight: float, wide: float, gain: float,
          tight_w: float = 0.9, wide_w: float = 1.2) -> np.ndarray:
    """
    Screen a coloured halo over the art.

    The colour is passed in rather than taken from the blurred source pixels.
    Blurring the source and screening it back drifts towards white wherever
    the glow piles up, which on a pink page reads as grey haze rather than as
    pink light.
    """
    amt = halo(mask, tight, wide, gain, tight_w, wide_w)
    return screen(rgb, color[None, None, :] * amt[..., None])


def hsv(rgb: np.ndarray):
    """Value and saturation only; hue is never needed here."""
    v = rgb.max(axis=-1)
    lo = rgb.min(axis=-1)
    s = np.where(v > 1e-6, (v - lo) / np.maximum(v, 1e-6), 0.0)
    return v, s


def wide_components(mask: np.ndarray, min_span: float) -> np.ndarray:
    """
    Keep only blobs whose bounding box spans at least `min_span` of the width.

    The chain is the one silver object that crosses the whole page, so this
    separates it from the crosses, the paper cat and the lily without anyone
    having to hand-type a diagonal band. Plain BFS on the mask -- the same
    approach measure-mats.py already uses, and the masked pixel count here is
    small enough that it is not worth a dependency.
    """
    h, w = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    keep = np.zeros_like(mask, dtype=bool)
    need = min_span * w

    for sy in range(h):
        for sx in range(w):
            if not mask[sy, sx] or seen[sy, sx]:
                continue
            q = deque([(sy, sx)])
            seen[sy, sx] = True
            blob = []
            x0 = x1 = sx
            while q:
                y, x = q.popleft()
                blob.append((y, x))
                x0, x1 = min(x0, x), max(x1, x)
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        q.append((ny, nx))
            if x1 - x0 >= need:
                for y, x in blob:
                    keep[y, x] = True
    return keep


# -----------------------------------------------------------------------------
#  page 1  --  pink bloom
# -----------------------------------------------------------------------------
#  Everything pink on this page (chandeliers, butterflies, lilies, lips, cross)
#  sits on near-black, and the only other lit things are the GREY frames. So
#  "how pink is it" is just how far red runs ahead of green -- that is zero on
#  anything neutral, and needs no hue arithmetic. Weighted by value so the
#  compression noise in the black background cannot bloom.

PINK = np.array([1.0, 0.82, 0.883], dtype=np.float32)   # mean of the page's own pink
SILVER = np.array([0.80, 0.90, 1.0], dtype=np.float32)  # cooled; neutral reads as haze


#  The page breathes between two gains rather than sitting at one. GAIN_LOW is
#  baked into sidebar-1.jpeg and is the trough; glow-1.png carries the
#  DIFFERENCE up to GAIN_HIGH and is faded in and out by a @keyframes opacity
#  animation on its own widget. A baked glow cannot pulse -- GTK4 can animate a
#  widget's opacity, but nothing can animate one background layer of several.
GAIN_LOW = 9.0
GAIN_HIGH = 18.0
GLOW_ARGS = dict(tight=7.0, wide=26.0, tight_w=1.5, wide_w=0.9)


def page_1_mask(rgb: np.ndarray) -> np.ndarray:
    v, _ = hsv(rgb)
    return np.clip(rgb[..., 0] - rgb[..., 1], 0, 1) ** 0.8 * v


def page_1() -> Image.Image:
    rgb = load("sidebar.jpeg")
    # Tight pass for the filament, wide pass for the room glow -- biased hard
    # towards the tight one. At the even weights the other two layers use this
    # page went milky somewhere past gain 6; biased, it still holds its edges
    # at 9, and stays legible even at the 18 the pulse peaks on.
    return to_img(bloom(rgb, page_1_mask(rgb), PINK, gain=GAIN_LOW, **GLOW_ARGS))


def page_1_glow() -> Image.Image:
    """
    The extra glow between GAIN_LOW and GAIN_HIGH, as a straight-alpha layer.

    This is drawn by a separate widget, and GTK composites widgets with plain
    `over` -- not the `screen` the bloom itself uses. Painting the difference
    flat would therefore wash the bright art out towards solid pink as the
    pulse peaked. So the alpha is solved for instead: find the a that makes
    `over` land on the same colour `screen` would have, per channel, and
    average it. At opacity 0 the page is exactly GAIN_LOW, at opacity 1 it is
    within a pixel value or two of GAIN_HIGH.
    """
    rgb = load("sidebar.jpeg")
    mask = page_1_mask(rgb)
    lo = bloom(rgb, mask, PINK, gain=GAIN_LOW, **GLOW_ARGS)
    hi = bloom(rgb, mask, PINK, gain=GAIN_HIGH, **GLOW_ARGS)

    head = hi - lo
    tail = PINK[None, None, :] - lo
    a = np.clip(head / np.where(np.abs(tail) < 1e-4, 1e-4, tail), 0, 1).mean(axis=-1)

    rgba = np.concatenate([np.broadcast_to(PINK, rgb.shape), a[..., None]], axis=-1)
    print(f"  glow layer: alpha p99 {np.percentile(a, 99):.3f}  max {a.max():.3f}")
    return Image.fromarray((np.clip(rgba, 0, 1) * 255).astype(np.uint8), "RGBA")


# -----------------------------------------------------------------------------
#  page 2  --  silver bloom, chain only
# -----------------------------------------------------------------------------
#  Silver is bright AND neutral, which on its own also describes the two white
#  frame mats, the paper cat and the lily. The mats must not bloom -- a frame
#  key is drawn over each, so a halo would leak out around the widget's edge.
#  They are cut out by coordinate (they are the measured mats, and the only
#  fixed things on the page), and what survives is then filtered to the one
#  blob that crosses the page: the chain.

#  MATS[3] and MATS[4] from widget/Sidebar.tsx, as fractions of the ORIGINAL
#  2400px two-page collage, converted to this page's own 1200px space.
MATS_PAGE_2 = [
    (0.552, 0.712, 0.057, 0.528),
    (0.795, 0.957, 0.438, 0.833),
]


def page_2() -> Image.Image:
    rgb = load("sidebar2.jpeg")
    h, w, _ = rgb.shape
    v, s = hsv(rgb)

    silver = np.clip((v - 0.42) / 0.58, 0, 1) * np.clip(1.0 - s * 2.6, 0, 1)

    # cut the mats out, with a margin so their bloom cannot creep past a key
    pad = 14
    for top, bottom, left, right in MATS_PAGE_2:
        y0 = int(top * 2400) - 1200
        y1 = int(bottom * 2400) - 1200
        x0, x1 = int(left * w), int(right * w)
        silver[max(0, y0 - pad):y1 + pad, max(0, x0 - pad):x1 + pad] = 0.0

    # Dilate BEFORE labelling. A chain is by definition a row of separate links
    # with dark gaps between them, so on the raw mask every link is its own
    # blob and nothing spans anything. Bridging first makes the run of links
    # one object; the result is then intersected back so only real silver
    # pixels bloom, not the bridge.
    #
    # The bridge radius is tuned tight on purpose. Anything looser welds the
    # chain to the crosses and to the lily at the bottom of the page, and the
    # whole silver half of the page becomes one blob that spans everything --
    # at r=8 the winning component was 674px wide and 216k pixels. At r=3 the
    # chain comes out at 488px (72% of the page) and the next-largest blob,
    # the cross-and-lily corner, at 316px (47%), so min_span cuts cleanly
    # between them.
    silver_px = silver > 0.30
    bridged = blur(silver_px.astype(np.float32), 3.0) > 0.14
    chain = wide_components(bridged, min_span=0.60) & silver_px
    if not chain.any():
        die("no page-wide silver blob found -- did sidebar2.jpeg change?")

    # One grow pass back along the chain: bridging at r=3 drops the faintest
    # links at each end, and a chain that stops glowing 70px short of its own
    # tip looks like a mistake. The nearest competing silver is far enough away
    # that 12px cannot reach it.
    chain = (blur(chain.astype(np.float32), 12.0) > 0.02) & silver_px
    mask = silver * chain

    return to_img(bloom(rgb, mask, SILVER, tight=6.0, wide=22.0, gain=4.5))


# -----------------------------------------------------------------------------
#  divider  --  white knocked out, neon on the bow
# -----------------------------------------------------------------------------
#  Alpha comes from inverted luminance rather than a colour key, so the white
#  field AND the gaps between the lace threads both drop out, with the soft
#  edges a threshold would destroy. The level ramp is what stops the pale lace
#  threads hazing to grey once they are over a dark ground.
#
#  The neon sits UNDER the art as its own layer, so the bow keeps its black
#  satin and gains a halo, instead of being washed out from the inside. That
#  halo falls outside the lace silhouette, so the output alpha has to grow to
#  make room for it -- a glow on a transparent PNG is an alpha change first and
#  a colour change second.

NEON = np.array([0.72, 0.42, 1.0], dtype=np.float32)   # violet, to match $violet-300

#  Transparent rows kept above and below the art purely so the halo has
#  somewhere to fall. Changing this changes the strip's HEIGHT, which means
#  the divider's size and position percentages in style/_sidebar.scss have to
#  be recomputed -- the script prints them.
HALO_PAD = 30


def divider() -> Image.Image:
    src = Image.open(SRC / "linebreak.jpeg").convert("RGB")
    src = src.resize((PAGE_W, round(src.height * PAGE_W / src.width)), Image.LANCZOS)
    rgb = np.asarray(src, dtype=np.float32) / 255.0

    lum = rgb.mean(axis=-1)
    alpha = np.clip((1.0 - lum - 0.08) / (0.62 - 0.08), 0, 1)

    # Crop to the art. Measured, not guessed: the source carries ~73px of dead
    # white above the lace and ~69 below, which rendered as a black slab.
    #
    # HALO_PAD rows of that are kept back deliberately. They are transparent,
    # so they add no black -- but without them the bow's glow is sliced off
    # square at the bottom edge of the strip, and a neon glow with a ruler-cut
    # edge is worse than no neon at all.
    rows = np.where(alpha.max(axis=1) > 0.10)[0]
    if rows.size == 0:
        die("divider knocked out to nothing -- check the level ramp")
    art0, art1 = int(rows[0]), int(rows[-1]) + 1
    y0 = max(0, art0 - HALO_PAD)
    y1 = min(alpha.shape[0], art1 + HALO_PAD)
    rgb, alpha = rgb[y0:y1], alpha[y0:y1]
    h, w = alpha.shape

    # Isolate the bow. It is the solid satin in the middle; the lace either
    # side is a mesh of thin threads. A minimum filter is what tells them
    # apart -- erode by a few pixels and anything lacy disappears through its
    # own holes while the satin survives.
    #
    # The centre weighting is a raised cosine, NOT a slice. Cutting the mask at
    # a hard x rectangle put a straight vertical edge through the lace, and
    # blurring that produced a glowing BOX around the bow.
    from PIL import ImageFilter
    solid = Image.fromarray((alpha * 255).astype(np.uint8), "L")
    solid = np.asarray(solid.filter(ImageFilter.MinFilter(9)), dtype=np.float32) / 255.0

    x = (np.arange(w, dtype=np.float32) / w - 0.5) / 0.24
    window = np.clip(0.5 * (1.0 + np.cos(np.pi * np.clip(x, -1, 1))), 0, 1)
    bow = np.clip((solid - 0.55) / 0.45, 0, 1) * window[None, :]

    glow = halo(bow, tight=10.0, wide=34.0, gain=3.0) * 0.80

    # art OVER neon, both straight-alpha
    out_a = alpha + glow * (1.0 - alpha)
    safe = np.maximum(out_a, 1e-6)[..., None]
    lit = screen(rgb, NEON[None, None, :] * bow[..., None] * 0.22)
    out_rgb = (lit * alpha[..., None] + NEON[None, None, :] * (glow * (1.0 - alpha))[..., None]) / safe

    rgba = np.concatenate([np.clip(out_rgb, 0, 1), np.clip(out_a, 0, 1)[..., None]], axis=-1)
    gap, page, total = 154, 1200, 2554
    print(f"  divider {w}x{h}  (art {art1 - art0}px + {HALO_PAD}px halo room each side)")
    print(f"  _sidebar.scss:  size 100% {h / total * 100:.3f}%"
          f"   position 0 {(page - HALO_PAD) / (total - h) * 100:.3f}%")
    return Image.fromarray((rgba * 255).astype(np.uint8), "RGBA")


def to_img(rgb: np.ndarray) -> Image.Image:
    return Image.fromarray((np.clip(rgb, 0, 1) * 255).astype(np.uint8), "RGB")


def main() -> None:
    print("page 1  pink bloom (trough)")
    page_1().save(HERE / "sidebar-1.jpeg", quality=94)
    print("page 1  pulse layer")
    page_1_glow().save(HERE / "glow-1.png")
    print("page 2  silver bloom (chain)")
    page_2().save(HERE / "sidebar-2.jpeg", quality=94)
    print("divider  knockout + neon bow")
    divider().save(HERE / "linebreak.png")
    print("\nwrote sidebar-1.jpeg, glow-1.png, sidebar-2.jpeg, linebreak.png")
    print("If the divider's height changed, update the percentages in")
    print("style/_sidebar.scss and PAGES/MATS in widget/Sidebar.tsx.")


if __name__ == "__main__":
    main()
