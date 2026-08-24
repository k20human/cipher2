"""Guard the list of accepted DRC warnings, so it cannot quietly grow.

The gate in tools/check_drc.py fails on anything not named here. That makes
this list the only place a warning can be tolerated -- and this file makes
adding to it a deliberate act with a visible diff.
"""
import sys
import unittest
from pathlib import Path

PCB = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PCB / "tools"))

import check_drc  # noqa: E402


class TestAcceptedWarnings(unittest.TestCase):
    def test_only_one_warning_is_accepted(self):
        """A second entry means someone tolerated something new. Read its reason."""
        self.assertEqual(set(check_drc.ACCEPTED_WARNINGS), {"text_thickness"})

    def test_every_accepted_warning_carries_a_real_reason(self):
        for rule, reason in check_drc.ACCEPTED_WARNINGS.items():
            with self.subTest(rule=rule):
                self.assertGreater(len(reason.split()), 15,
                                   f"{rule} is accepted without an argument")

    def test_the_makefile_gates_on_the_script(self):
        """kicad-cli's own flag is all-or-nothing; this project is not."""
        makefile = (PCB / "Makefile").read_text(encoding="utf-8")
        self.assertIn("tools/check_drc.py", makefile)
        self.assertNotIn("--exit-code-violations $(BOARD).kicad_pcb", makefile)
