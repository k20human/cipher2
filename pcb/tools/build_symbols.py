#!/usr/bin/env python3
"""Generate lib/cipher2.kicad_sym: every symbol this board uses.

Nothing is borrowed from the system libraries. Their names drift between KiCad
releases, and a symbol that vanishes takes the schematic with it. Generating
all of them costs one file and removes the whole dependency.

No elegance is attempted. These symbols exist so ERC can run and so the board
can be checked for parity against the schematic -- not to be framed. Each is a
rectangle with its pins down the sides.

A pin's *number* is the footprint's pad name, never a display convenience.
That correspondence is the one error ERC cannot catch, so it is written once,
here, from lib/PARTS.md.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import netlist
from sexpr import Str, dumps

OUT = Path(__file__).resolve().parents[1] / "lib" / "cipher2.kicad_sym"

PITCH = 2.54
PIN_LENGTH = 2.54
FONT = ["effects", ["font", ["size", 1.27, 1.27]]]
HIDDEN = ["effects", ["font", ["size", 1.27, 1.27]], ["hide", "yes"]]

# The module feeds the board, so its VCC and one of its grounds are power_out:
# saying so lets ERC verify the rails actually have a source. Exactly *one*
# ground may claim it -- ERC treats two power outputs on one net as a conflict,
# which is the right call in general and a false alarm here, where the three
# pins are the same node inside the module. GND2 and GND3 are therefore passive:
# still tied, still routed, simply not claiming to drive anything.
PRO_MICRO_TYPES = {"VCC": "power_out", "RAW": "power_out",
                   "GND1": "power_out", "GND2": "passive", "GND3": "passive",
                   "RST": "passive"}


def pro_micro_pins():
    left, right = netlist.PRO_MICRO_ROWS
    return ([(n, n, "L", PRO_MICRO_TYPES.get(n, "bidirectional")) for n in left]
            + [(n, n, "R", PRO_MICRO_TYPES.get(n, "bidirectional")) for n in right])


def numbered(names, side_split=None, etype="passive"):
    """Pins numbered 1..N, named from `names`, split across both sides."""
    half = side_split if side_split is not None else len(names)
    return [(name, str(i + 1), "L" if i < half else "R", etype)
            for i, name in enumerate(names)]


# name -> (reference prefix, [(display name, pad name, side, electrical type)])
# name -> (reference prefix, [(display name, pad name, side, electrical type)])
SYMBOLS = {
    "ProMicro_5V": ("U", pro_micro_pins()),
    # The three cabled controls. Display names match the real part's terminals
    # so the schematic reads like the wiring diagram in arduino/README.md.
    "Conn_Trackball": ("J", [("+5V", "1", "L", "power_in"), ("SDA", "2", "L", "passive"),
                             ("SCL", "3", "L", "passive"), ("INT", "4", "L", "passive"),
                             ("GND", "5", "L", "power_in")]),
    # Named for what each pin *is*, not what the EC11 datasheet calls it.
    # "C" is the encoder's common and it goes to ground; "S2" likewise. Someone
    # holding a bag of Dupont wires needs to know that, and will not have the
    # datasheet open. The mapping back to the part's own terminals lives in
    # pcb/README.md, where there is room to explain it.
    "Conn_Encoder": ("J", [("A", "1", "L", "passive"), ("GND", "2", "L", "passive"),
                           ("B", "3", "L", "passive"), ("SW", "4", "L", "passive"),
                           ("GND", "5", "L", "passive")]),
    "Conn_Button": ("J", [("SW", "1", "L", "passive"), ("GND", "2", "L", "passive"),
                          ("LED+", "3", "L", "passive"), ("GND", "4", "L", "passive")]),
    "Conn_Spare": ("J", numbered(["D1", "D0", "D6", "D10", "+5V", "GND"])),
    "R": ("R", numbered(["~", "~"], side_split=1)),
    "C": ("C", numbered(["~", "~"], side_split=1)),
    "SolderJumper_2": ("JP", numbered(["A", "B"], side_split=1)),
}


def build_symbol(name, prefix, pins):
    left = [p for p in pins if p[2] == "L"]
    right = [p for p in pins if p[2] == "R"]
    rows = max(len(left), len(right))
    half_h = (rows - 1) * PITCH / 2 + PITCH
    half_w = 7.62

    def place(items, side):
        out = []
        start = (len(items) - 1) * PITCH / 2
        for i, (label, pad, _, etype) in enumerate(items):
            y = start - i * PITCH
            x = -(half_w + PIN_LENGTH) if side == "L" else (half_w + PIN_LENGTH)
            angle = 0 if side == "L" else 180
            out.append(["pin", etype, "line", ["at", x, y, angle],
                        ["length", PIN_LENGTH],
                        ["name", Str(label), FONT],
                        ["number", Str(pad), FONT]])
        return out

    return ["symbol", Str(name),
            ["pin_names", ["offset", 1.016]],
            ["exclude_from_sim", "no"], ["in_bom", "yes"], ["on_board", "yes"],
            ["property", Str("Reference"), Str(prefix),
             ["at", 0, half_h + 1.27, 0], FONT],
            ["property", Str("Value"), Str(name),
             ["at", 0, -half_h - 1.27, 0], FONT],
            ["property", Str("Footprint"), Str(""), ["at", 0, 0, 0], HIDDEN],
            ["property", Str("Datasheet"), Str("~"), ["at", 0, 0, 0], HIDDEN],
            ["property", Str("Description"), Str(name), ["at", 0, 0, 0], HIDDEN],
            ["symbol", Str(f"{name}_0_1"),
             ["rectangle", ["start", -half_w, half_h], ["end", half_w, -half_h],
              ["stroke", ["width", 0.254], ["type", "default"]],
              ["fill", ["type", "background"]]]],
            ["symbol", Str(f"{name}_1_1"), *place(left, "L"), *place(right, "R")],
            ["embedded_fonts", "no"]]


def main():
    lib = ["kicad_symbol_lib",
           ["version", 20241209],
           ["generator", Str("cipher2")],
           ["generator_version", Str("9.0")]]
    for name, (prefix, pins) in SYMBOLS.items():
        lib.append(build_symbol(name, prefix, pins))
    OUT.write_text(dumps(lib) + "\n", encoding="utf-8")
    print(f"wrote {OUT} ({len(SYMBOLS)} symbols)")


if __name__ == "__main__":
    main()
