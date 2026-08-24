"""Geometric checks on the placement, so PLACEMENT stays safe to edit.

The DRC catches copper clearance. It does not catch a module body overhanging
the outline, a mounting hole under a component, or the USB connector pointing
into the board instead of off its edge -- and that last one makes the board
useless while every automated check stays green.
"""
import sys
import unittest
from pathlib import Path

import pcbnew

PCB = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PCB / "tools"))

import build_board  # noqa: E402
import netlist  # noqa: E402

W, H = build_board.WIDTH, build_board.HEIGHT


def boxes(board):
    """Return {reference: (x1, y1, x2, y2)} in mm, text fields excluded."""
    out = {}
    for footprint in board.GetFootprints():
        b = footprint.GetBoundingBox(False, False)
        out[footprint.GetReference()] = (
            pcbnew.ToMM(b.GetLeft()), pcbnew.ToMM(b.GetTop()),
            pcbnew.ToMM(b.GetRight()), pcbnew.ToMM(b.GetBottom()))
    return out


def overlap(a, b):
    return not (a[2] <= b[0] or b[2] <= a[0] or a[3] <= b[1] or b[3] <= a[1])


class TestPlacement(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.board = build_board.build()
        cls.boxes = boxes(cls.board)

    def test_every_component_is_placed(self):
        self.assertEqual(set(netlist.COMPONENTS) | {"H1", "H2", "H3", "H4"},
                         set(self.boxes))

    def test_nothing_overhangs_the_outline(self):
        """U1 is the deliberate exception: its USB connector must stick out."""
        for ref, box in self.boxes.items():
            if ref == "U1":
                continue
            with self.subTest(ref=ref):
                self.assertGreaterEqual(box[0], 0.0, f"{ref} crosses the left edge")
                self.assertGreaterEqual(box[1], 0.0, f"{ref} crosses the top edge")
                self.assertLessEqual(box[2], W, f"{ref} crosses the right edge")
                self.assertLessEqual(box[3], H, f"{ref} crosses the bottom edge")

    def test_no_two_components_overlap(self):
        refs = sorted(self.boxes)
        for i, a in enumerate(refs):
            for b in refs[i + 1:]:
                with self.subTest(pair=f"{a}/{b}"):
                    self.assertFalse(overlap(self.boxes[a], self.boxes[b]),
                                     f"{a} and {b} overlap")

    def test_usb_connector_reaches_past_the_right_edge(self):
        """The hub sits to the right of the board in the enclosure.

        Facing the wrong way, the cable cannot reach and the board is scrap --
        and nothing else in the toolchain has an opinion about which way a
        connector points.
        """
        self.assertGreater(self.boxes["U1"][2], W,
                           "U1's USB end does not overhang the right edge")
        self.assertGreaterEqual(self.boxes["U1"][0], 0.0)

    def test_wordmark_zone_is_clear(self):
        """Nothing but the ground pour may live under the lettering.

        The wordmark is a mask opening: what shows through is whatever copper
        sits beneath it. Over the pour that is gold; over a pad or a silkscreen
        marking it is a mess, and over bare substrate it is beige.

        A rectangle, not a full-width band: the band forbade R2 and R3 the top
        right corner, which the lettering never reaches.
        """
        x0, x1, y0, y1 = build_board.WORDMARK_ZONE
        for ref, box in self.boxes.items():
            with self.subTest(ref=ref):
                self.assertTrue(
                    box[2] <= x0 or box[0] >= x1 or box[3] <= y0 or box[1] >= y1,
                    f"{ref} at {tuple(round(v, 2) for v in box)} intrudes into "
                    f"the wordmark zone {build_board.WORDMARK_ZONE}",
                )

    def test_every_pad_carries_a_net_or_is_declared_unconnected(self):
        """Duplicate pad names are why connect() iterates instead of searching.

        A netless pad is only acceptable when netlist.NO_CONNECT says so. The
        seven spare Pro Micro pins are the whole of that list.
        """
        for footprint in self.board.GetFootprints():
            ref = footprint.GetReference()
            if ref.startswith("H"):
                continue
            for pad in footprint.Pads():
                number = pad.GetNumber()
                if not number:
                    continue        # the button's unplated mounting hole
                with self.subTest(pad=f"{ref}.{number}"):
                    if (ref, number) in netlist.NO_CONNECT:
                        # Not netless: it carries KiCad's own single-pin net,
                        # which is what the schematic gives it and therefore
                        # what parity insists on finding here.
                        self.assertEqual(
                            pad.GetNetname(),
                            build_board.unconnected_net_name(ref, number))
                    else:
                        self.assertNotEqual(pad.GetNetname(), "",
                                            f"{ref}.{number} has no net")

    def test_mounting_holes_are_clear_of_everything(self):
        for hole in ("H1", "H2", "H3", "H4"):
            hx = (self.boxes[hole][0] + self.boxes[hole][2]) / 2
            hy = (self.boxes[hole][1] + self.boxes[hole][3]) / 2
            for ref, box in self.boxes.items():
                if ref.startswith("H"):
                    continue
                with self.subTest(hole=hole, ref=ref):
                    inside = box[0] <= hx <= box[2] and box[1] <= hy <= box[3]
                    self.assertFalse(inside, f"{hole} falls inside {ref}")

class TestBoardSize(unittest.TestCase):
    """The outline is a number three documents quote and a form asks for.

    It was written as 100 x 40 in the README and the order sheet while the
    generator said 42, and nothing noticed: PCBWay bills by area and compares
    what you declare against what it finds in the files, so the mismatch would
    have surfaced as a query mid-order.
    """

    def test_the_outline_matches_the_declared_size(self):
        board = build_board.build()
        xs, ys = [], []
        for drawing in board.GetDrawings():
            if drawing.GetLayer() != pcbnew.Edge_Cuts:
                continue
            for point in (drawing.GetStart(), drawing.GetEnd()):
                xs.append(pcbnew.ToMM(point.x))
                ys.append(pcbnew.ToMM(point.y))
        self.assertAlmostEqual(max(xs) - min(xs), build_board.WIDTH, places=3)
        self.assertAlmostEqual(max(ys) - min(ys), build_board.HEIGHT, places=3)

    def test_the_readme_quotes_the_same_size(self):
        readme = (PCB / "README.md").read_text(encoding="utf-8")
        expected = f"{build_board.WIDTH:g} × {build_board.HEIGHT:g} mm"
        self.assertIn(expected, readme,
                      f"pcb/README.md does not say {expected}")

    def test_it_fits_the_enclosure_strip(self):
        """44 mm of usable width, measured by the owner in the printed case."""
        self.assertLessEqual(build_board.HEIGHT, 44.0)
        self.assertLessEqual(build_board.WIDTH, 180.0)


if __name__ == "__main__":
    unittest.main()
