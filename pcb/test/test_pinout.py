"""The board's pinout is a contract with the firmware, not a design choice.

These tests read screen_wake.ino itself rather than a transcription of it, so
a pin renumbered in the sketch fails here instead of arriving as a dead board.
"""
import re
import sys
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
SKETCH = REPO / "arduino" / "screen_wake" / "screen_wake.ino"
sys.path.insert(0, str(REPO / "pcb" / "tools"))

import netlist  # noqa: E402


def firmware_pins():
    """Return {'PIN_BUTTON': 5, ...} as the sketch declares them."""
    text = SKETCH.read_text(encoding="utf-8")
    pattern = r"static\s+const\s+uint8_t\s+(PIN_\w+)\s*=\s*(\d+)\s*;"
    return {name: int(value) for name, value in re.findall(pattern, text)}


class TestFirmwareContract(unittest.TestCase):
    def test_sketch_is_readable(self):
        self.assertTrue(SKETCH.is_file(), f"sketch not found at {SKETCH}")
        self.assertEqual(
            set(firmware_pins()),
            {"PIN_BUTTON", "PIN_LED", "PIN_ENC_A", "PIN_ENC_B", "PIN_ENC_SW"},
            "the sketch declares a different set of pins than this board assumes",
        )

    def test_every_firmware_pin_reaches_its_net(self):
        for constant, number in firmware_pins().items():
            net = netlist.FIRMWARE_NETS[constant]
            expected = ("U1", f"D{number}")
            self.assertIn(
                expected, netlist.NETS[net],
                f"{constant} = D{number} but net {net} does not touch {expected}",
            )

    def test_i2c_pins_are_not_firmware_constants(self):
        """D2 and D3 are the ATmega32U4's only hardware I2C lines.

        Wire claims them; no sketch constant can move them. Their absence from
        PIN_* is therefore load-bearing, and asserting it guards against a
        future edit that would make them look reassignable.
        """
        numbers = set(firmware_pins().values())
        self.assertNotIn(2, numbers)
        self.assertNotIn(3, numbers)
        self.assertIn(("U1", "D2"), netlist.NETS["SDA"])
        self.assertIn(("U1", "D3"), netlist.NETS["SCL"])


class TestNetlistIntegrity(unittest.TestCase):
    def test_every_pin_reference_names_a_declared_component(self):
        for net, pins in netlist.NETS.items():
            for ref, pin in pins:
                self.assertIn(ref, netlist.COMPONENTS, f"net {net} names unknown {ref}")

    def test_no_pin_appears_on_two_nets(self):
        seen = {}
        for net, pins in netlist.NETS.items():
            for pin in pins:
                self.assertNotIn(
                    pin, seen, f"{pin} is on both {seen.get(pin)} and {net}",
                )
                seen[pin] = net

    def test_no_net_has_a_single_pin(self):
        for net, pins in netlist.NETS.items():
            self.assertGreater(len(pins), 1, f"net {net} connects nothing")

    def test_all_three_ground_pins_are_used(self):
        gnd = [pin for ref, pin in netlist.NETS["GND"] if ref == "U1"]
        self.assertEqual(
            sorted(gnd), ["GND1", "GND2", "GND3"],
            "the Pro Micro has three ground pins and all three must be tied",
        )

    def test_pro_micro_rows_are_twelve_pins_each(self):
        left, right = netlist.PRO_MICRO_ROWS
        self.assertEqual(len(left), 12)
        self.assertEqual(len(right), 12)


if __name__ == "__main__":
    unittest.main()
