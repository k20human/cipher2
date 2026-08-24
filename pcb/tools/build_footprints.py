#!/usr/bin/env python3
"""Generate the three footprints KiCad does not ship.

Everything else on this board uses a library footprint, which is verified by
people who do this full time. These three are ours, so they are generated from
declared dimensions rather than drawn, and test_footprints.py asserts those
dimensions back. A hand-drawn footprint is the one artefact whose error is
found after soldering.

Only one is left. The button, the encoder and the trackball moved onto cables
when the board became a hub, taking their hand-drawn footprints with them --
and they were the risky ones. What remains is a grid of pads on a 2.54 mm
pitch, which is hard to get wrong and easy to assert.

Dimensions and their source:
  Pro Micro   33 x 18 mm, rows 0.6 in apart      SparkFun DEV-12640
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import netlist
from sexpr import Str, dumps

PRETTY = Path(__file__).resolve().parents[1] / "lib" / "cipher2.pretty"

PITCH = 2.54
ROW_SPACING = 15.24          # 0.6 inch, the Pro Micro's defining dimension
PAD_D, DRILL_D = 1.7, 1.0    # 0.1 in header pins
SILK_W, FAB_W = 0.12, 0.1


def text_effects(size=1.0):
    return ["effects", ["font", ["size", size, size], ["thickness", 0.15]]]


def header(name, descr, tags):
    return ["footprint", Str(name),
            ["version", 20241229],
            ["generator", Str("cipher2")],
            ["generator_version", Str("9.0")],
            ["layer", Str("F.Cu")],
            ["descr", Str(descr)],
            ["tags", Str(tags)],
            # Reference on F.Fab, not F.SilkS. At the origin of a 16 mm hole or
            # a 24-pin module it lands on a pad and the DRC calls it silk over
            # copper -- rightly. What a person needs when soldering is on the
            # silkscreen already, and it says WAKE and D1 rather than SW1 and U1.
            ["property", Str("Reference"), Str("REF**"),
             ["at", 0, 0, 0], ["layer", Str("F.Fab")], ["uuid", Str(f"{name}-ref")],
             text_effects()],
            ["property", Str("Value"), Str(name),
             ["at", 0, 0, 0], ["layer", Str("F.Fab")], ["uuid", Str(f"{name}-val")],
             text_effects()],
            ["attr", "through_hole"]]


def pad(name, x, y, shape="circle", size=PAD_D, drill=DRILL_D):
    return ["pad", Str(name), "thru_hole", shape, ["at", x, y],
            ["size", size, size], ["drill", drill],
            ["layers", Str("*.Cu"), Str("*.Mask")]]


def line(x1, y1, x2, y2, layer, width):
    return ["fp_line", ["start", x1, y1], ["end", x2, y2],
            ["stroke", ["width", width], ["type", "solid"]], ["layer", Str(layer)]]


def box(x1, y1, x2, y2, layer, width):
    corners = [(x1, y1), (x2, y1), (x2, y2), (x1, y2)]
    return [line(*a, *b, layer, width)
            for a, b in zip(corners, corners[1:] + corners[:1])]


def circle(cx, cy, radius, layer, width):
    return ["fp_circle", ["center", cx, cy], ["end", cx + radius, cy],
            ["stroke", ["width", width], ["type", "solid"]],
            ["fill", "no"], ["layer", Str(layer)]]


def label(text, x, y, layer="F.SilkS", size=0.8):
    return ["fp_text", "user", Str(text), ["at", x, y, 0], ["layer", Str(layer)],
            ["uuid", Str(f"t{x}-{y}-{text}")], text_effects(size)]


def pro_micro():
    """Two rows of twelve, USB at -y, **mirrored**.

    The module is mounted upside down -- components facing the board -- because
    that is how its headers were soldered, and redoing 24 pins was not worth
    it. Flipping a module swaps its two pin rows, so the footprint swaps them
    back: PRO_MICRO_ROWS[0] sits at +x here where an upright module would put
    it at -x.

    This is the one thing on the board that would be wrong for a normally
    built Pro Micro. A replacement module soldered the usual way will not fit
    -- see pcb/README.md.
    """
    left, right = netlist.PRO_MICRO_ROWS
    top = -(len(left) - 1) * PITCH / 2
    node = header("ProMicro_2x12_P2.54mm",
                  "SparkFun Pro Micro 5V/16MHz, MIRRORED for upside-down "
                  "mounting, on two 1x12 sockets, USB at -Y",
                  "pro micro atmega32u4 module mirrored")
    for row, x in ((left, ROW_SPACING / 2), (right, -ROW_SPACING / 2)):
        for i, name in enumerate(row):
            # Square pad on the first pin of each row: the two together mark
            # the USB end, which is the orientation a soldered module cannot
            # be talked out of.
            node.append(pad(name, x, top + i * PITCH,
                            shape="rect" if i == 0 else "circle"))
    node += box(-9.0, -16.5, 9.0, 16.5, "F.Fab", FAB_W)
    # Silkscreen open on the USB side: that fourth line would sit on the board
    # outline the module deliberately overhangs, and the DRC would be right to
    # object. Three sides are enough to see the module's footprint.
    # Stopping 1.4 mm short of the module's USB end keeps the silkscreen a
    # clear millimetre inside the board outline, which the overhang otherwise
    # crosses. Silk printed over a routed edge smears.
    usb_end = -15.5
    node += [line(-9.4, usb_end, -9.4, 16.9, "F.SilkS", SILK_W),
             line(-9.4, 16.9, 9.4, 16.9, "F.SilkS", SILK_W),
             line(9.4, 16.9, 9.4, usb_end, "F.SilkS", SILK_W)]
    # USB connector overhang, drawn so the placement check has something to see.
    node += box(-4.0, -19.5, 4.0, -16.5, "F.Fab", FAB_W)
    node.append(label("USB", 0, -18.0, "F.Fab", 1.0))
    node.append(label("D1", ROW_SPACING / 2, top - 1.8))
    node.append(label("RAW", -ROW_SPACING / 2, top - 1.8))
    node.append(circle(ROW_SPACING / 2 + 2.2, top, 0.4, "F.SilkS", 0.3))
    node.append(["embedded_fonts", "no"])
    return node


def main():
    PRETTY.mkdir(parents=True, exist_ok=True)
    for build in (pro_micro,):
        node = build()
        name = str(node[1])
        (PRETTY / f"{name}.kicad_mod").write_text(dumps(node) + "\n", encoding="utf-8")
        print(f"wrote {name}.kicad_mod")


if __name__ == "__main__":
    main()
