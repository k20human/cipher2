"""The wordmark is white silkscreen on the black mask.

It used to be a mask opening, which made its colour depend on the surface
finish. On silkscreen it is white ink whatever the copper is plated with.

What matters now is that the ink lands on solder mask and not on bare copper,
where it flakes off -- and that it stays inside the board. Neither is something
the netlist or ERC has an opinion about.
"""
import sys
import unittest
from pathlib import Path

import pcbnew

PCB = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PCB / "tools"))

import build_board  # noqa: E402

BOARD_FILE = PCB / "cipher2-panel.kicad_pcb"


@unittest.skipUnless(BOARD_FILE.is_file(), "board not generated yet")
class TestWordmark(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.board = pcbnew.LoadBoard(str(BOARD_FILE))
        parts = {d.GetText(): d for d in cls.board.GetDrawings()
                 if isinstance(d, pcbnew.PCB_TEXT)
                 and d.GetLayer() == pcbnew.F_SilkS}
        cls.word = parts[build_board.WORDMARK_WORD]
        cls.digit = parts[build_board.WORDMARK_DIGIT]

    def test_it_says_what_it_should(self):
        self.assertEqual(self.word.GetText() + self.digit.GetText(),
                         build_board.WORDMARK)

    def test_each_half_uses_its_own_face(self):
        """A face that did not survive set_wordmark_font falls back silently.

        KiCad's stroke font is legible, so nothing breaks and nothing warns --
        the board simply comes back in the wrong type.
        """
        self.assertEqual(self.word.GetFontName(), build_board.WORDMARK_FONT)
        self.assertEqual(self.digit.GetFontName(), build_board.DIGIT_FONT)

    def test_the_two_halves_share_a_baseline_and_cap_height(self):
        """Measured, not assumed: this is what align_wordmark exists to do.

        A mixed-face wordmark whose halves sit at different heights reads as a
        mistake rather than a decision, and nothing else here would catch it.
        """
        w = self.word.GetEffectiveTextShape().BBox()
        d = self.digit.GetEffectiveTextShape().BBox()
        self.assertAlmostEqual(pcbnew.ToMM(w.GetBottom()),
                               pcbnew.ToMM(d.GetBottom()), places=2)
        self.assertAlmostEqual(pcbnew.ToMM(w.GetHeight()),
                               pcbnew.ToMM(d.GetHeight()), places=2)

    def test_the_digit_follows_the_word_at_the_declared_gap(self):
        w = self.word.GetEffectiveTextShape().BBox()
        d = self.digit.GetEffectiveTextShape().BBox()
        self.assertAlmostEqual(pcbnew.ToMM(d.GetLeft() - w.GetRight()),
                               build_board.DIGIT_GAP, places=2)

    def test_the_wordmark_is_thick_enough_to_print(self):
        """0.15 mm minimum line, 0.8 mm minimum character height at PCBWay."""
        for part in (self.word, self.digit):
            with self.subTest(text=part.GetText()):
                self.assertGreaterEqual(pcbnew.ToMM(part.GetTextThickness()), 0.15)
                self.assertGreaterEqual(pcbnew.ToMM(part.GetTextSize().y), 0.8)

    def ink(self):
        """The real extent of the glyphs, in mm.

        Both halves together. Not GetBoundingBox: that reports the declared
        metrics, and a display face routinely overshoots them. Cyberway Riders
        reaches 0.24 mm past its own box, which is exactly how the lettering
        first came to sit outside the pour with every test green.
        """
        w = self.word.GetEffectiveTextShape().BBox()
        d = self.digit.GetEffectiveTextShape().BBox()
        return (pcbnew.ToMM(min(w.GetLeft(), d.GetLeft())),
                pcbnew.ToMM(min(w.GetTop(), d.GetTop())),
                pcbnew.ToMM(max(w.GetRight(), d.GetRight())),
                pcbnew.ToMM(max(w.GetBottom(), d.GetBottom())))

    def test_the_ink_stays_inside_its_zone(self):
        x0, x1, y0, y1 = build_board.WORDMARK_ZONE
        left, top, right, bottom = self.ink()
        self.assertGreaterEqual(left, x0)
        self.assertGreaterEqual(top, y0)
        self.assertLessEqual(right, x1)
        self.assertLessEqual(bottom, y1)

    def test_the_ink_keeps_clear_of_the_board_edge(self):
        """Half a millimetre of pour is inset from the outline.

        Ink beyond it opens the mask over bare substrate, which prints beige.
        This is the assertion the first version of this file was missing.
        """
        left, top, right, bottom = self.ink()
        margin = 1.0
        self.assertGreaterEqual(top, margin)
        self.assertGreaterEqual(left, margin)
        self.assertLessEqual(right, build_board.WIDTH - margin)
        self.assertLessEqual(bottom, build_board.HEIGHT - margin)

    def test_it_does_not_touch_the_glitch_bars(self):
        """The bars flank the block. Merged into it they stop reading as bands.

        Checked as rectangles, not as x ranges: at 63 mm the wordmark spans
        almost the whole board, so the bars now sit above and below it rather
        than beside it, and an x-only test would reject a perfectly good gap.
        """
        left, top, right, bottom = self.ink()
        for x1, x2, y1, y2 in build_board.GLITCH_BARS:
            with self.subTest(bar=(x1, y1)):
                clear = (x2 < left - 0.5 or x1 > right + 0.5
                         or y2 < top - 0.5 or y1 > bottom + 0.5)
                self.assertTrue(clear, f"bar {x1},{y1}..{x2},{y2} touches the "
                                       f"wordmark {left:.1f},{top:.1f}..{right:.1f},{bottom:.1f}")

    def test_the_mask_is_intact_under_the_wordmark(self):
        """Ink belongs on mask, not on metal, where it flakes.

        There are no pads in the wordmark's zone, so the whole front mask there
        should be solid. This asserts the design keeps it that way -- a future
        component or a stray opening would break it silently.
        """
        openings = [d for d in self.board.GetDrawings()
                    if d.GetLayer() == pcbnew.F_Mask]
        self.assertEqual(openings, [], "something opens the front solder mask")

    def test_the_bars_are_silkscreen_too(self):
        bars = [d for d in self.board.GetDrawings()
                if isinstance(d, pcbnew.PCB_SHAPE) and d.GetLayer() == pcbnew.F_SilkS]
        self.assertEqual(len(bars), len(build_board.GLITCH_BARS))


if __name__ == "__main__":
    unittest.main()
