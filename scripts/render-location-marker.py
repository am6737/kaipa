"""Render CurrentLocationMarker as PNGs, one per accent preset.

AMap's own location layer on Android takes an image, not a view. These are
that image, drawn to match src/components/globe/CurrentLocationMarker.tsx: a
52pt box, the heading cone, and a 16pt accent dot with a 3pt white rim. The
`-dot` variants leave the cone out, for a fix without a heading; the trail
map's own Android marker uses both. Run again whenever that component or
ACCENT_PRESETS changes:

    python3 scripts/render-location-marker.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ACCENTS = {
    'blue': '#0A84FF',
    'indigo': '#5E5CE6',
    'teal': '#0EAFB1',
    'green': '#2EB85C',
    'orange': '#FF9500',
    'pink': '#FF375F',
    'black': '#000000',
}
BOX = 52          # pt, as in the component
SCALE = 3         # @3x
SS = 4            # supersampling
OUT = Path(__file__).resolve().parent.parent / 'assets' / 'trail'


def rgb(hex_color):
    h = hex_color.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def cone_points(k):
    # M26 26 L11 5 Q26 -2 41 5 Z
    pts = [(26, 26), (11, 5)]
    for i in range(1, 33):
        t = i / 32
        x = (1 - t) ** 2 * 11 + 2 * (1 - t) * t * 26 + t ** 2 * 41
        y = (1 - t) ** 2 * 5 + 2 * (1 - t) * t * -2 + t ** 2 * 5
        pts.append((x, y))
    return [(x * k, y * k) for x, y in pts]


def render(color, cone=True):
    k = SCALE * SS
    size = BOX * k
    r, g, b = rgb(color)

    # Cone: accent, alpha fading from 0.28 at the dot to 0.06 at the tip.
    mask = Image.new('L', (size, size), 0)
    if cone:
        ImageDraw.Draw(mask).polygon(cone_points(k), fill=255)
    fade = Image.new('L', (size, size), 0)
    fd = ImageDraw.Draw(fade)
    for y in range(size):
        t = min(1, max(0, (26 * k - y) / (25 * k)))
        fd.line([(0, y), (size, y)], fill=round(255 * (0.28 + (0.06 - 0.28) * t)))
    cone_alpha = Image.composite(fade, Image.new('L', (size, size), 0), mask)
    img = Image.new('RGBA', (size, size), (r, g, b, 0))
    img.putalpha(cone_alpha)

    # Soft shadow under the dot: 0px 1px 4px rgba(0,0,0,0.24).
    c = 26 * k
    shadow = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).ellipse([c - 8 * k, c - 7 * k, c + 8 * k, c + 9 * k], fill=(0, 0, 0, round(255 * 0.24)))
    shadow = shadow.filter(ImageFilter.GaussianBlur(2 * k))
    img = Image.alpha_composite(img, shadow)

    d = ImageDraw.Draw(img)
    d.ellipse([c - 8 * k, c - 8 * k, c + 8 * k, c + 8 * k], fill=(255, 255, 255, 255))
    d.ellipse([c - 5 * k, c - 5 * k, c + 5 * k, c + 5 * k], fill=(r, g, b, 255))
    return img.resize((BOX * SCALE, BOX * SCALE), Image.LANCZOS)


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    for name, color in ACCENTS.items():
        render(color).save(OUT / f'location-{name}.png', optimize=True)
        render(color, cone=False).save(OUT / f'location-{name}-dot.png', optimize=True)
        print(OUT / f'location-{name}.png')
