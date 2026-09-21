#!/usr/bin/env python3
"""
Generates the tileable grunge overlays used by the player chassis.

Re-run after editing to regenerate:  python3 assets/gen-texture.py

Noise is built in the frequency domain (white noise -> gaussian low-pass ->
inverse FFT). Filtering a periodic signal keeps it periodic, so the result
tiles seamlessly with no visible seam or mirror-blending artefacts.

Alpha is baked into the PNG because GTK4 CSS has no per-layer opacity — the
texture is composited over the gradients underneath purely by its own alpha.
"""

import numpy as np
from PIL import Image, ImageDraw

SIZE = 256
OUT = __file__.rsplit("/", 1)[0]


def periodic_noise(n, scale, rng):
    """Smooth noise that wraps exactly at the edges."""
    field = np.fft.fft2(rng.normal(size=(n, n)))
    fy = np.fft.fftfreq(n)[:, None]
    fx = np.fft.fftfreq(n)[None, :]
    low_pass = np.exp(-(fx**2 + fy**2) * (scale**2) * 2 * np.pi**2)
    out = np.real(np.fft.ifft2(field * low_pass))
    return out / (np.abs(out).max() + 1e-9)


def fractal(n, octaves, rng):
    total = np.zeros((n, n))
    weight = 0.0
    for scale, amp in octaves:
        total += amp * periodic_noise(n, scale, rng)
        weight += amp
    return total / weight


def to_rgba(value, dark_a, light_a, dark=(8, 12, 13), light=(228, 242, 240)):
    """Signed field -> speckle: negatives darken, positives catch light."""
    h, w = value.shape
    rgba = np.zeros((h, w, 4), dtype=np.uint8)

    neg = value < 0
    pos = ~neg

    for i in range(3):
        rgba[..., i] = np.where(neg, dark[i], light[i])

    alpha = np.where(neg, -value * dark_a, value * light_a)
    rgba[..., 3] = np.clip(alpha, 0, 255).astype(np.uint8)
    return rgba


def add_scratches(img, rng, count, alpha):
    """Thin bright hairlines, drawn nine times so they wrap across the seam."""
    layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)

    for _ in range(count):
        x0, y0 = rng.integers(0, SIZE, 2)
        angle = rng.uniform(0, np.pi)
        length = rng.integers(SIZE // 12, SIZE // 4)
        x1 = x0 + np.cos(angle) * length
        y1 = y0 + np.sin(angle) * length
        a = int(rng.integers(alpha // 2, alpha))

        for dx in (-SIZE, 0, SIZE):
            for dy in (-SIZE, 0, SIZE):
                draw.line(
                    [(x0 + dx, y0 + dy), (x1 + dx, y1 + dy)],
                    fill=(235, 248, 246, a),
                    width=1,
                )

    return Image.alpha_composite(img, layer)


def build(name, octaves, dark_a, light_a, scratches, scratch_alpha, seed):
    rng = np.random.default_rng(seed)
    field = fractal(SIZE, octaves, rng)

    # normalise by spread, not by peak: dividing by the single largest value
    # leaves the bulk of the field bunched near zero and the texture invisible
    field = np.clip(field / (field.std() + 1e-9), -2.6, 2.6) / 2.6

    # bias toward pitting rather than symmetric noise — corrosion eats metal,
    # it doesn't add it
    field = np.sign(field) * np.abs(field) ** 1.15

    img = Image.fromarray(to_rgba(field, dark_a, light_a), "RGBA")
    if scratches:
        img = add_scratches(img, rng, scratches, scratch_alpha)

    path = f"{OUT}/{name}.png"
    img.save(path)
    print(f"wrote {path}")


# chassis: coarse corrosion blotches + fine grain + scratches
build(
    "grunge",
    octaves=[(1.4, 0.28), (3.0, 0.40), (7.0, 0.78), (16.0, 0.72)],
    dark_a=148,
    light_a=82,
    scratches=11,
    scratch_alpha=30,
    seed=7,
)

def periodic_noise_aniso(n, scale_x, scale_y, rng):
    """Noise smoothed harder along one axis than the other.

    Real brushed steel is abrasive lines running one way: the surface varies
    fast ACROSS the grain and barely at all ALONG it. So the low-pass gets a
    different width per axis -- a big scale_x smears the field along x into
    long streaks, while a small scale_y keeps the tight variation that makes
    them read as separate striations.

    Still built in the frequency domain, so it still tiles seamlessly.
    """
    field = np.fft.fft2(rng.normal(size=(n, n)))
    fy = np.fft.fftfreq(n)[:, None]
    fx = np.fft.fftfreq(n)[None, :]
    low_pass = np.exp(-(fx**2 * scale_x**2 + fy**2 * scale_y**2) * 2 * np.pi**2)
    out = np.real(np.fft.ifft2(field * low_pass))
    return out / (np.abs(out).max() + 1e-9)


def build_brushed(name, scale_x, scale_y, dark_a, light_a, seed):
    """Fine horizontal brush striations, for large panel surfaces.

    WHY THIS EXISTS, and why the panels do not use `grain`:

    `grain` and `grunge` both carry mid-frequency octaves -- blotches roughly
    60-110px across. On a 37px bar you only ever see a sliver of one, so they
    read as texture. On a 480x340 popup you see four whole tiles of them, and
    over the panel's pale metal ramp they come out as visible grey CLOUD. The
    popups looked mouldy rather than brushed, which is the single thing that
    was making them look unfinished.

    This has no mid-frequency content at all -- only the tight striations --
    and about a third the alpha, so it survives being stretched across a big
    surface.
    """
    rng = np.random.default_rng(seed)
    field = periodic_noise_aniso(SIZE, scale_x, scale_y, rng)
    field = np.clip(field / (field.std() + 1e-9), -2.4, 2.4) / 2.4

    img = Image.fromarray(to_rgba(field, dark_a, light_a), "RGBA")
    path = f"{OUT}/{name}.png"
    img.save(path)
    print(f"wrote {path}")


# panels: fine horizontal brush, no blotches
build_brushed("brushed", scale_x=30.0, scale_y=0.85, dark_a=34, light_a=22, seed=23)


def build_scanlines():
    """CRT raster: a dark line every 3px plus a faint vertical grille.

    You do NOT need a compositor shader or a screen filter for the terminal
    look — that comes from palette, hairlines and monospace type. This is
    optional garnish, tiled as a normal background layer.
    """
    n = 6
    px = np.zeros((n, n, 4), dtype=np.uint8)

    px[..., :3] = 0
    px[0::3, :, 3] = 46  # horizontal scanline
    px[:, 0::3, 3] = np.maximum(px[:, 0::3, 3], 16)  # aperture grille

    Image.fromarray(px, "RGBA").save(f"{OUT}/scanlines.png")
    print(f"wrote {OUT}/scanlines.png")


build_scanlines()


# inset plates: finer, dirtier, no scratches — grime on glass, not worn metal
build(
    "grain",
    octaves=[(1.2, 0.45), (2.6, 0.45), (7.0, 0.4)],
    dark_a=120,
    light_a=40,
    scratches=0,
    scratch_alpha=0,
    seed=19,
)
