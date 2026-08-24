"""Dimensional assertions on the one footprint we draw ourselves.

There used to be three. The button, the encoder and the trackball moved onto
cables when the board became a hub, and took their hand-drawn footprints with
them -- they were the risky ones. What is left is a grid of pads on a 2.54 mm
pitch.

A footprint is the one artefact whose error is discovered after the board is
soldered. These assertions cost nothing; a respin costs a fortnight.

The pad *names* are checked elsewhere (test_symbols.py, against the symbol).
What is checked here is geometry -- the numbers that decide whether a real
component physically fits.
"""
import sys
import unittest
from pathlib import Path

PCB = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PCB / "tools"))

import netlist  # noqa: E402
from sexpr import loads  # noqa: E402

PRETTY = PCB / "lib" / "cipher2.pretty"


def footprint(name):
    return loads((PRETTY / f"{name}.kicad_mod").read_text(encoding="utf-8"))[0]


def pads(name):
    """Return [(pad name, kind, x, y, size, drill)] for every pad."""
    out = []
    for node in footprint(name):
        if not (isinstance(node, list) and node[0] == "pad"):
            continue
        at = next(n for n in node if isinstance(n, list) and n[0] == "at")
        size = next(n for n in node if isinstance(n, list) and n[0] == "size")
        drill = next((n for n in node if isinstance(n, list) and n[0] == "drill"), None)
        out.append((str(node[1]), node[2], at[1], at[2], size[1],
                    drill[1] if drill else None))
    return out


def by_name(name):
    return {p[0]: p for p in pads(name)}


class TestProMicro(unittest.TestCase):
    NAME = "ProMicro_2x12_P2.54mm"

    def test_twenty_four_pads(self):
        self.assertEqual(len(pads(self.NAME)), 24)

    def test_pads_are_named_after_the_signals(self):
        left, right = netlist.PRO_MICRO_ROWS
        self.assertEqual(set(by_name(self.NAME)), set(left) | set(right))

    def test_row_spacing_is_six_tenths_of_an_inch(self):
        """15.24 mm. Wrong here and no Pro Micro ever made will seat."""
        p = by_name(self.NAME)
        self.assertAlmostEqual(abs(p["D1"][2] - p["RAW"][2]), 15.24, places=3)

    def test_pin_pitch_is_2p54(self):
        p = by_name(self.NAME)
        self.assertAlmostEqual(abs(p["D1"][3] - p["D0"][3]), 2.54, places=3)

    def test_each_row_is_a_straight_line(self):
        p = by_name(self.NAME)
        for row in netlist.PRO_MICRO_ROWS:
            xs = {round(p[name][2], 3) for name in row}
            self.assertEqual(len(xs), 1, f"row {row[0]}..{row[-1]} is not straight")

    def test_usb_end_is_the_first_pin_of_each_row(self):
        """D1 and RAW sit at the USB end, and must share it.

        Get this back to front and the connector points into the board instead
        of off its edge -- the one placement error the DRC cannot see.
        """
        p = by_name(self.NAME)
        self.assertAlmostEqual(p["D1"][3], p["RAW"][3], places=3)
        self.assertLess(p["D1"][3], p["D9"][3])


if __name__ == "__main__":
    unittest.main()
