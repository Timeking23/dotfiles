#!/usr/bin/env python3
"""
Fill assets/weather/<mood>/ with real sky photographs.

Companion to gen-weather-bg.py, which derives 00.jpg in each folder from your
own artwork. This adds 01.jpg and 02.jpg: actual photographs of that condition,
so the panel cycles between the drawing and the sky it is describing.

Wikimedia Commons, not a general image scrape. Everything there carries an
explicit licence and a named author, both of which are recorded in
assets/weather/CREDITS.md -- CC BY requires attribution, and dotfiles get
published. Anything without a usable licence is skipped rather than taken.

The photographs are graded with the same mood table gen-weather-bg.py uses, at
reduced strength: they already ARE the condition, so they need unifying with
the panel rather than recolouring into it.

    python3 assets/fetch-weather-art.py
"""

import json
import pathlib
import re
import time
import urllib.parse
import urllib.request

from PIL import Image, ImageEnhance, ImageFilter

from importlib.machinery import SourceFileLoader

HERE = pathlib.Path(__file__).parent
OUT = HERE / "weather"

_gen = SourceFileLoader("genbg", str(HERE / "gen-weather-bg.py")).load_module()

API = "https://commons.wikimedia.org/w/api.php"
UA = "ags-weather-art/1.0 (personal dotfiles; contact via local machine)"

#  Wanted size. The panel is 560pt wide and painted background-size:cover, so
#  1400px covers a 2x display with room to crop.
WIDTH = 1400
TARGET = (1400, 1100)

PER_MOOD = 2

#  How hard to apply the mood grade to a photograph, against 1.0 for the
#  derived artwork. Low: these are real skies and should still look it.
GRADE_STRENGTH = 0.45

QUERIES = {
    "clear-day": "clear blue sky sunny landscape",
    "clear-night": "starry night sky moonlit",
    "clouds": "overcast grey cloudy sky",
    "rain": "heavy rain falling sky",
    #  Keep these SHORT. Commons ANDs every term, so a seven-word query returns
    #  nothing at all -- which is how "wind" managed to find zero usable images
    #  while a two-word version of the same idea returns a full page.
    "hail": "hail storm clouds",
    "wind": "wind storm clouds",
    "snow": "snowfall winter snow sky",
    "storm": "thunderstorm lightning dark sky",
    "fog": "fog mist landscape",
}

#  Licences that may be redistributed with attribution. Anything else -- most
#  importantly "Fair use" -- is skipped.
OK_LICENCE = ("cc", "public domain", "pd", "cc0")

#  A keyword search for weather words pulls in things that use them
#  figuratively or astronomically -- "Hubble Peers into the Storm" is a nebula,
#  not a sky. Cheaper to reject by title than to look at every result.
OFF_SUBJECT = (
    "hubble", "nebula", "galaxy", "supernova", "jupiter", "saturn",
    "diagram", "chart", "map of", "logo", "coat of arms", "portrait",
)


#  Commons will 429 a burst. One second between calls and a backing-off retry
#  is enough; without it a full run dies about two thirds of the way through.
PAUSE = 1.0
RETRIES = 4

_last = [0.0]


def get(url):
    for attempt in range(RETRIES):
        wait = PAUSE - (time.monotonic() - _last[0])
        if wait > 0:
            time.sleep(wait)
        _last[0] = time.monotonic()

        request = urllib.request.Request(url, headers={"User-Agent": UA})
        try:
            with urllib.request.urlopen(request, timeout=40) as response:
                return response.read()
        except urllib.error.HTTPError as error:
            if error.code != 429 or attempt == RETRIES - 1:
                raise
            backoff = 2 ** (attempt + 1)
            print(f"    (429, waiting {backoff}s)")
            time.sleep(backoff)

    raise RuntimeError("unreachable")


def search(term, limit=8):
    query = urllib.parse.urlencode({
        "action": "query",
        "generator": "search",
        "gsrsearch": f"filetype:bitmap {term}",
        "gsrnamespace": "6",
        "gsrlimit": str(limit),
        "prop": "imageinfo",
        "iiprop": "url|extmetadata|size",
        "iiurlwidth": str(WIDTH),
        "format": "json",
    })

    pages = json.loads(get(f"{API}?{query}")).get("query", {}).get("pages", {})
    #  the API returns pages unordered; `index` is the search rank
    return sorted(pages.values(), key=lambda p: p.get("index", 99))


def base_name(title):
    """Strip the trailing upload id, so two crops of one photo count as one."""
    return re.sub(r"\s*\(\d+\)\s*", " ", title.replace("File:", "")).strip().lower()


def usable(info):
    meta = info.get("extmetadata", {})
    licence = (meta.get("LicenseShortName", {}).get("value") or "").lower()
    if not any(token in licence for token in OK_LICENCE):
        return None

    width = info.get("thumbwidth") or 0
    height = info.get("thumbheight") or 0
    #  portrait crops badly into a wide panel, and tiny sources look like mush
    if width < 900 or height < 500 or height > width:
        return None

    def plain(field):
        raw = meta.get(field, {}).get("value", "") or ""
        # these fields arrive as HTML
        out, skip = [], False
        for ch in raw:
            if ch == "<":
                skip = True
            elif ch == ">":
                skip = False
            elif not skip:
                out.append(ch)
        return " ".join("".join(out).split())[:120]

    return {
        "url": info["thumburl"],
        "licence": meta.get("LicenseShortName", {}).get("value", "?"),
        "author": plain("Artist") or "unknown",
        "page": info.get("descriptionurl", ""),
    }


def grade(image, mood):
    """The mood table, softened, plus the horizontal smear for wind."""
    sat, bright, contrast, tint, alpha, blur = _gen.MOODS[mood]
    s = GRADE_STRENGTH

    def toward(value):
        return 1 + (value - 1) * s

    out = ImageEnhance.Color(image).enhance(toward(sat))
    out = ImageEnhance.Brightness(out).enhance(toward(bright))
    out = ImageEnhance.Contrast(out).enhance(toward(contrast))

    if blur:
        out = out.filter(ImageFilter.GaussianBlur(blur * s))
    if mood in _gen.STREAKED:
        out = _gen.streak(out, max(1, int(_gen.STREAKED[mood] * s)))
    if alpha:
        out = Image.blend(out, Image.new("RGB", out.size, tint), alpha * s)

    return out


def fit(image, size):
    """Cover-fit: scale to fill, centre-crop the overflow."""
    tw, th = size
    scale = max(tw / image.width, th / image.height)
    resized = image.resize(
        (max(tw, int(image.width * scale)), max(th, int(image.height * scale))),
        Image.LANCZOS,
    )
    left = (resized.width - tw) // 2
    top = (resized.height - th) // 2
    return resized.crop((left, top, left + tw, top + th))


def main():
    import io

    credits = ["# Weather art credits", ""]
    credits.append("`00.jpg` in each folder is derived from the panel's own artwork")
    credits.append("by `gen-weather-bg.py`. The photographs below came from Wikimedia")
    credits.append("Commons via `fetch-weather-art.py` and keep their original licences.")
    credits.append("")

    for mood, term in QUERIES.items():
        folder = OUT / mood
        folder.mkdir(parents=True, exist_ok=True)

        #  Resumable: a folder that already has its photographs is left alone,
        #  so a run interrupted by a rate limit can simply be run again.
        existing = sorted(folder.glob("[0-9][0-9].jpg"))
        photos = [f for f in existing if f.name != "00.jpg"]
        sidecar = folder / "credits.json"

        if len(photos) >= PER_MOOD and sidecar.exists():
            print(f"{mood}: already has {len(photos)}, skipping")
            #  Attribution is read back from the sidecar rather than guessed.
            #  CC BY is only satisfied if the credit survives a resumed run.
            for name, entry in json.loads(sidecar.read_text()).items():
                credits.append(
                    f"- `weather/{mood}/{name}` — {entry['title']} — {entry['author']} — "
                    f"{entry['licence']} — {entry['page']}"
                )
            continue

        print(f"{mood}:")

        taken = 0
        seen = set()
        record = {}
        for page in search(term):
            if taken >= PER_MOOD:
                break

            infos = page.get("imageinfo") or []
            if not infos:
                continue

            #  Commons often holds several crops of one photograph under names
            #  differing only by id; two of those in a folder is a cycle that
            #  looks broken rather than animated.
            key = base_name(page["title"])
            if key in seen:
                continue
            if any(word in key for word in OFF_SUBJECT):
                continue
            seen.add(key)

            entry = usable(infos[0])
            if not entry:
                continue

            try:
                raw = get(entry["url"])
                image = Image.open(io.BytesIO(raw)).convert("RGB")
            except Exception as error:
                print(f"    skip ({error})")
                continue

            taken += 1
            name = f"{taken:02d}.jpg"
            fit(grade(image, mood), TARGET).save(folder / name, quality=88)

            title = page["title"].replace("File:", "")
            record[name] = {
                "title": title,
                "author": entry["author"],
                "licence": entry["licence"],
                "page": entry["page"],
            }
            print(f"    {name}  {entry['licence']:<12} {title[:52]}")
            credits.append(
                f"- `weather/{mood}/{name}` — {title} — {entry['author']} — "
                f"{entry['licence']} — {entry['page']}"
            )

        if record:
            sidecar.write_text(json.dumps(record, indent=2) + "\n")
        if not taken:
            print("    nothing usable found")

    (OUT / "CREDITS.md").write_text("\n".join(credits) + "\n")
    print(f"\nwrote {OUT / 'CREDITS.md'}")


if __name__ == "__main__":
    main()
