import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from sexpr import Str, dumps, loads  # noqa: E402


class TestSexpr(unittest.TestCase):
    def test_bare_atoms_stay_bare(self):
        self.assertEqual(dumps(["at", 0, 1.5]), "(at 0 1.5)")

    def test_strings_are_quoted(self):
        self.assertEqual(dumps(["name", Str("R1")]), '(name "R1")')

    def test_quotes_inside_strings_are_escaped(self):
        self.assertEqual(dumps(["v", Str('a"b')]), '(v "a\\"b")')

    def test_nested_nodes_are_indented(self):
        out = dumps(["a", ["b", 1], ["c", 2]])
        self.assertEqual(out, "(a\n  (b 1)\n  (c 2)\n)")

    def test_round_trip_preserves_structure(self):
        node = ["symbol", Str("R"), ["pin", "passive", "line", ["at", 0, 3.81, 270]]]
        self.assertEqual(loads(dumps(node))[0], node)

    def test_parses_a_real_kicad_footprint(self):
        """The parser must survive KiCad's own output, not just ours."""
        path = Path("/usr/share/kicad/footprints/Resistor_SMD.pretty/"
                    "R_0805_2012Metric.kicad_mod")
        tree = loads(path.read_text(encoding="utf-8"))
        self.assertEqual(tree[0][0], "footprint")
        pads = [n for n in tree[0] if isinstance(n, list) and n[0] == "pad"]
        self.assertEqual(len(pads), 2)


if __name__ == "__main__":
    unittest.main()


class TestNumericCoercion(unittest.TestCase):
    def test_integers_come_back_as_int(self):
        self.assertEqual(loads("(version 20241209)")[0], ["version", 20241209])

    def test_decimals_come_back_as_float(self):
        node = loads("(at -1.27 3.81)")[0]
        self.assertEqual(node, ["at", -1.27, 3.81])
        self.assertIsInstance(node[1], float)

    def test_layer_names_stay_strings(self):
        self.assertEqual(loads("(layer F.Cu)")[0], ["layer", "F.Cu"])

    def test_yes_no_stay_strings(self):
        self.assertEqual(loads("(hide yes)")[0], ["hide", "yes"])

    def test_quoted_digits_stay_a_string(self):
        """Pad "1" is a name, not the number one."""
        node = loads('(pad "1" thru_hole)')[0]
        self.assertIsInstance(node[1], Str)
        self.assertEqual(node[1], "1")
