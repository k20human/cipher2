"""Cross-check every symbol pin number against its footprint's pad names.

This is the one error ERC cannot catch. A symbol whose pin "3" is wired to SDA
passes every schematic check ever written; if the footprint calls that pad "B",
the board is wrong and nothing says so until it is soldered.

The check is not tautological: symbol pin numbers come from build_symbols.py,
pad names come from KiCad's own .kicad_mod files. Two independent sources.
"""
import sys
import unittest
from pathlib import Path

PCB = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PCB / "tools"))

import build_symbols  # noqa: E402
import netlist  # noqa: E402
from sexpr import loads  # noqa: E402

SYSTEM_FOOTPRINTS = Path("/usr/share/kicad/footprints")


def footprint_path(spec):
    lib, name = spec.split(":")
    root = PCB / "lib" / "cipher2.pretty" if lib == "cipher2" else SYSTEM_FOOTPRINTS / f"{lib}.pretty"
    return root / f"{name}.kicad_mod"


def pad_names(path):
    tree = loads(path.read_text(encoding="utf-8"))[0]
    return {str(n[1]) for n in tree
            if isinstance(n, list) and n[0] == "pad" and str(n[1])}


def symbol_pin_numbers(symbol_name):
    _, pins = build_symbols.SYMBOLS[symbol_name]
    return {pad for _, pad, _, _ in pins}


class TestSymbolFootprintAgreement(unittest.TestCase):
    def test_every_component_has_a_symbol(self):
        for ref, component in netlist.COMPONENTS.items():
            self.assertIn(component.symbol, build_symbols.SYMBOLS,
                          f"{ref} names symbol {component.symbol}, which is not generated")

    def test_pin_numbers_match_pad_names(self):
        for ref, component in netlist.COMPONENTS.items():
            with self.subTest(ref=ref, footprint=component.footprint):
                path = footprint_path(component.footprint)
                if not path.is_file():
                    self.skipTest(f"{component.footprint} not drawn yet (Task 5)")
                pads = pad_names(path)
                pins = symbol_pin_numbers(component.symbol)
                self.assertEqual(
                    pins, pads,
                    f"{ref}: symbol pins {sorted(pins)} vs footprint pads {sorted(pads)}",
                )

    def test_netlist_only_names_pins_the_symbol_declares(self):
        for net, connections in netlist.NETS.items():
            for ref, pin in connections:
                symbol = netlist.COMPONENTS[ref].symbol
                self.assertIn(
                    str(netlist.pin_number(ref, pin)), symbol_pin_numbers(symbol),
                    f"net {net} uses {ref}.{pin}, absent from symbol {symbol}",
                )

    def test_every_symbol_pin_is_wired_or_declared_unconnected(self):
        """Silence is not a state a pin may be in.

        Either a pin is on a net, or NO_CONNECT says someone looked at it and
        decided. Anything else is an oversight, and this is where it surfaces.
        """
        used = {(ref, str(netlist.pin_number(ref, pin)))
                for pins in netlist.NETS.values() for ref, pin in pins}
        for ref, component in netlist.COMPONENTS.items():
            for pin in symbol_pin_numbers(component.symbol):
                with self.subTest(pin=f"{ref}.{pin}"):
                    self.assertTrue(
                        (ref, pin) in used or (ref, pin) in netlist.NO_CONNECT,
                        f"{ref}.{pin} is neither wired nor declared unconnected",
                    )

    def test_no_connect_names_real_pins(self):
        """A stale NO_CONNECT entry would silently excuse a pin that moved."""
        for ref, pin in netlist.NO_CONNECT:
            self.assertIn(ref, netlist.COMPONENTS)
            self.assertIn(pin, symbol_pin_numbers(netlist.COMPONENTS[ref].symbol),
                          f"NO_CONNECT names {ref}.{pin}, absent from the symbol")

    def test_no_connect_and_nets_are_disjoint(self):
        used = {(ref, str(netlist.pin_number(ref, pin)))
                for pins in netlist.NETS.values() for ref, pin in pins}
        self.assertEqual(used & netlist.NO_CONNECT, set(),
                         "a pin cannot be both wired and declared unconnected")


if __name__ == "__main__":
    unittest.main()
