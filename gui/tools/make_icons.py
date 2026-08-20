#!/usr/bin/env python3
"""Generate the PWA icons.

Kept as a script rather than committed binaries so the mark can be changed
without a graphics editor. Re-run after editing; the PNGs are committed.
"""

import os

from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "icons")
BG = (0, 0, 0, 255)
FG = (0, 255, 65, 255)


def draw_mark(size, inset_ratio):
    """A bracket frame with three falling strokes: rain, contained."""
    img = Image.new("RGBA", (size, size), BG)
    d = ImageDraw.Draw(img)
    inset = int(size * inset_ratio)
    stroke = max(2, size // 32)
    right = size - inset
    arm = int((right - inset) * 0.32)

    # Two corner brackets, left and right.
    for x, direction in ((inset, 1), (right, -1)):
        d.line([(x, inset), (x, right)], fill=FG, width=stroke)
        d.line([(x, inset), (x + arm * direction, inset)], fill=FG, width=stroke)
        d.line([(x, right), (x + arm * direction, right)], fill=FG, width=stroke)

    # Three strokes of unequal length, the shortest in the middle.
    span = right - inset
    for i, length in enumerate((0.62, 0.34, 0.50)):
        x = inset + span * (0.28 + i * 0.22)
        top = inset + span * 0.18
        d.line([(x, top), (x, top + span * length)], fill=FG, width=stroke)

    return img


def main():
    os.makedirs(OUT, exist_ok=True)
    # Maskable icons are cropped to a safe circle, so the mark needs more room.
    for name, size, inset in (
        ("icon-192.png", 192, 0.16),
        ("icon-512.png", 512, 0.16),
        ("icon-512-maskable.png", 512, 0.28),
    ):
        draw_mark(size, inset).save(os.path.join(OUT, name))
        print(f"wrote {name}")


if __name__ == "__main__":
    main()
