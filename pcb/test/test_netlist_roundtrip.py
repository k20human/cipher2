"""Read the schematic back through KiCad's own netlist exporter.

The generator writing what it was told is not evidence; KiCad agreeing on what
that file means is. This test catches malformed symbol embedding, stubs that
did not land on their pin, and pad names that do not exist in the symbol --
none of which the generator can notice about itself.
"""
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

PCB = Path(__file__).resolve().parents[1]
SCHEMATIC = PCB / "cipher2-panel.kicad_sch"
sys.path.insert(0, str(PCB / "tools"))

import netlist  # noqa: E402
from sexpr import loads  # noqa: E402


def kicad_netlist():
    """Return {net name: {(ref, pad), ...}} as KiCad itself reads the schematic."""
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / "roundtrip.net"
        subprocess.run(
            ["kicad-cli", "sch", "export", "netlist", "--format", "kicadsexpr",
             "--output", str(out), str(SCHEMATIC)],
            check=True, capture_output=True,
        )
        tree = loads(out.read_text(encoding="utf-8"))[0]

    nets = {}
    for node in tree:
        if not (isinstance(node, list) and node[0] == "nets"):
            continue
        for net in node[1:]:
            name, pins = None, set()
            for field in net[1:]:
                if not isinstance(field, list):
                    continue
                if field[0] == "name":
                    name = str(field[1])
                elif field[0] == "node":
                    ref = pad = None
                    for sub in field[1:]:
                        if not isinstance(sub, list):
                            continue
                        if sub[0] == "ref":
                            ref = str(sub[1])
                        elif sub[0] == "pin":
                            pad = str(sub[1])
                    pins.add((ref, pad))
            if name:
                nets[name.lstrip("/")] = pins
    return nets


def split_unconnected(nets):
    """KiCad names every unwired pin unconnected-(REF-PadN).

    That happens whether or not a no-connect flag is present -- the flag
    silences ERC, it does not invent a connection. Separating them here lets
    the round-trip assert both halves: the real nets match, and the synthetic
    ones are exactly the pins NO_CONNECT declares.
    """
    real, loose = {}, set()
    for name, pins in nets.items():
        if name.startswith("unconnected-"):
            loose |= pins
        else:
            real[name] = pins
    return real, loose


@unittest.skipUnless(shutil.which("kicad-cli"), "kicad-cli not installed")
@unittest.skipUnless(SCHEMATIC.is_file(), "schematic not generated yet")
class TestSchematicMatchesNetlist(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.actual, cls.loose = split_unconnected(kicad_netlist())

    def expected(self):
        return {name: {(ref, str(netlist.pin_number(ref, pin))) for ref, pin in pins}
                for name, pins in netlist.NETS.items()}

    def test_the_same_set_of_nets_survived(self):
        self.assertEqual(set(self.expected()), set(self.actual))

    def test_every_net_carries_the_same_pins(self):
        for name, pins in self.expected().items():
            with self.subTest(net=name):
                self.assertEqual(pins, self.actual[name])

    def test_no_pin_was_left_floating(self):
        """A stub that missed its pin shows up as a net KiCad invented."""
        declared = {p for pins in self.expected().values() for p in pins}
        seen = {p for pins in self.actual.values() for p in pins}
        self.assertEqual(seen, declared)

    def test_unconnected_pins_are_exactly_the_declared_ones(self):
        """KiCad's own reading of which pins go nowhere must match NO_CONNECT."""
        self.assertEqual(self.loose, netlist.NO_CONNECT)
