# Stickers

Drop a transparent image in here named after its slot. It appears immediately —
the directory is watched, no AGS restart needed. Delete it and the window
unmaps itself.

    player.png         charm on the top-right corner of the music player casing
    top-right.png      desktop decal, top-right
    bottom-right.png   desktop decal, bottom-right (inboard of SysMonitor)

Extension is free: `png`, `webp`, `gif`, `svg`, `jpg` — first match in that
order wins. A GIF shows its first frame only; the loader scales through a
pixbuf, which drops the animation.

Sizes and margins live in `widget/Stickers.tsx` (`PLACEMENT`) and in the
`<Sticker>` call at the bottom of `widget/player.tsx`.

## Making one transparent

Flat single-colour background:

    magick in.png -fuzz 12% -transparent white out.png

Anything else — use the anime-tuned segmentation model, it is markedly better
on line art than the general one:

    pipx install "rembg[cli]"
    rembg i -m isnet-anime in.jpg player.png

Then trim the empty border so the slot box is all sticker:

    magick player.png -trim +repage player.png
