#!/usr/bin/env python3
"""Generate cipher2-panel.kicad_sch from netlist.py.

Two decisions worth knowing before reading the code.

**Symbols are copied in, not referenced.** A .kicad_sch embeds the definition
of every symbol it uses; it does not point at a library. So this reads
lib/cipher2.kicad_sym and re-emits each definition under lib_symbols.

**Wiring is by label, not by drawn wire.** Every pin gets a 2.54 mm stub
ending in a label carrying the net name. That is electrically a wire, and it
removes all graphical routing. The result is ugly and entirely valid; a human
can rearrange it in the GUI afterwards without breaking anything -- the
generator simply must not be run again after that.

Pin positions are read back from the generated library rather than recomputed
here. If the two ever disagreed, the stubs would miss their pins, and reading
the file that KiCad will read is the only way to be sure they cannot.
"""
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import netlist
from sexpr import Str, dumps, loads

PCB = Path(__file__).resolve().parents[1]
LIB = PCB / "lib" / "cipher2.kicad_sym"
OUT = PCB / "cipher2-panel.kicad_sch"
PROJECT = "cipher2-panel"

NAMESPACE = uuid.UUID("6f9619ff-8b86-d011-b42d-00c04fc964ff")
SHEET_UUID = str(uuid.uuid5(NAMESPACE, "cipher2-panel/root"))

FONT = ["effects", ["font", ["size", 1.27, 1.27]]]
HIDDEN = ["effects", ["font", ["size", 1.27, 1.27]], ["hide", "yes"]]

# A3, three columns of four. Enough room for the labels to breathe; the sheet
# is read by ERC, not by a person, so density buys nothing.
#
# Every origin is a multiple of 2.54 mm. KiCad checks endpoints against a
# 1.27 mm connection grid, and a symbol whose pins fall between grid points
# raises one warning per pin -- 76 of them, the first time this ran. The pin
# offsets are already on the grid; only the origins were not.
GRID = 2.54
COLUMNS = tuple(GRID * n for n in (27, 83, 139))          # 68.58, 210.82, 353.06
ROWS = tuple(GRID * n for n in (22, 50, 78, 106))         # 55.88, 127.0, 198.12, 269.24
STUB = 2.54


def uid(*parts):
    """Deterministic UUID: the same input must regenerate byte-identically."""
    return str(uuid.uuid5(NAMESPACE, "/".join(str(p) for p in parts)))


def library():
    """Return {symbol name: definition node} from the generated library."""
    tree = loads(LIB.read_text(encoding="utf-8"))[0]
    return {str(n[1]): n for n in tree if isinstance(n, list) and n[0] == "symbol"}


def symbol_pins(definition):
    """Return {pad name: (x, y, angle)} in library coordinates."""
    out = {}
    for unit in definition:
        if not (isinstance(unit, list) and unit[0] == "symbol"):
            continue
        for item in unit:
            if not (isinstance(item, list) and item[0] == "pin"):
                continue
            at = next(n for n in item if isinstance(n, list) and n[0] == "at")
            number = next(n for n in item if isinstance(n, list) and n[0] == "number")
            out[str(number[1])] = (at[1], at[2], at[3])
    return out


def placed_pin(origin, pin):
    """Library coordinates are y-up; a schematic is y-down. Hence the minus."""
    x, y, angle = pin
    return origin[0] + x, origin[1] - y, angle


def net_of(ref, pad):
    for name, connections in netlist.NETS.items():
        for other_ref, other_pin in connections:
            if other_ref == ref and str(netlist.pin_number(other_ref, other_pin)) == pad:
                return name
    return None


def stub(ref, pad, x, y, angle, net_name):
    """A 2.54 mm wire out of the pin, ending in a label. Electrically a wire."""
    outward = -STUB if angle == 0 else STUB
    end_x = x + outward
    justify = "right" if angle == 0 else "left"
    return [
        ["wire", ["pts", ["xy", x, y], ["xy", end_x, y]],
         ["stroke", ["width", 0], ["type", "default"]],
         ["uuid", Str(uid("wire", ref, pad))]],
        ["label", Str(net_name), ["at", end_x, y, 180 if angle == 0 else 0],
         ["effects", ["font", ["size", 1.27, 1.27]], ["justify", justify, "bottom"]],
         ["uuid", Str(uid("label", ref, pad))]],
    ]


def instance(ref, component, definition, origin):
    pins = symbol_pins(definition)
    node = ["symbol",
            ["lib_id", Str(f"cipher2:{component.symbol}")],
            ["at", origin[0], origin[1], 0],
            ["unit", 1],
            # dnp and in_bom are not the same flag. dnp is "a real part,
            # deliberately not fitted" -- R2 and R3, which stay in the full BOM
            # so the empty pads are explained. in_bom no is "not a part at all"
            # -- SJ1, which is copper, not a component someone orders.
            ["exclude_from_sim", "no"],
            ["in_bom", "yes" if component.in_bom else "no"],
            ["on_board", "yes"], ["dnp", "yes" if component.dnp else "no"],
            ["uuid", Str(uid("symbol", ref))],
            ["property", Str("Reference"), Str(ref),
             ["at", origin[0], origin[1] - 22.0, 0], FONT],
            ["property", Str("Value"), Str(component.value),
             ["at", origin[0], origin[1] + 22.0, 0], FONT],
            ["property", Str("Footprint"), Str(component.footprint),
             ["at", origin[0], origin[1], 0], HIDDEN],
            ["property", Str("Datasheet"), Str("~"), ["at", *origin, 0], HIDDEN],
            ["property", Str("Description"), Str(component.symbol),
             ["at", *origin, 0], HIDDEN]]
    for pad in pins:
        node.append(["pin", Str(pad), ["uuid", Str(uid("pin", ref, pad))]])
    node.append(["instances",
                 ["project", Str(PROJECT),
                  ["path", Str(f"/{SHEET_UUID}"),
                   ["reference", Str(ref)], ["unit", 1]]]])
    return node


def main():
    definitions = library()
    sheet = ["kicad_sch",
             ["version", 20250114],
             ["generator", Str("cipher2")],
             ["generator_version", Str("9.0")],
             ["uuid", Str(SHEET_UUID)],
             ["paper", Str("A3")]]

    used = sorted({c.symbol for c in netlist.COMPONENTS.values()})
    lib_symbols = ["lib_symbols"]
    for name in used:
        definition = list(definitions[name])
        definition[1] = Str(f"cipher2:{name}")
        lib_symbols.append(definition)
    sheet.append(lib_symbols)

    wires, labels, no_connects = [], [], []
    for index, (ref, component) in enumerate(netlist.COMPONENTS.items()):
        origin = (COLUMNS[index // len(ROWS)], ROWS[index % len(ROWS)])
        definition = definitions[component.symbol]
        sheet.append(instance(ref, component, definition, origin))
        for pad, pin in symbol_pins(definition).items():
            x, y, angle = placed_pin(origin, pin)
            name = net_of(ref, pad)
            if name is None:
                if (ref, pad) not in netlist.NO_CONNECT:
                    raise SystemExit(
                        f"{ref}.{pad} is on no net. Either wire it in NETS or "
                        f"declare it in NO_CONNECT -- silence is not an option.")
                # A no-connect flag is a statement, not an omission: it is what
                # stops ERC from reporting the pin, and what tells the next
                # reader the pin was considered.
                no_connects.append(["no_connect", ["at", x, y],
                                    ["uuid", Str(uid("nc", ref, pad))]])
                continue
            wire, label = stub(ref, pad, x, y, angle, name)
            wires.append(wire)
            labels.append(label)

    sheet.extend(no_connects)
    sheet.extend(wires)
    sheet.extend(labels)
    sheet.append(["sheet_instances", ["path", Str("/"), ["page", Str("1")]]])
    sheet.append(["embedded_fonts", "no"])

    OUT.write_text(dumps(sheet) + "\n", encoding="utf-8")
    print(f"wrote {OUT} ({len(netlist.COMPONENTS)} symbols, {len(wires)} wired pins, "
          f"{len(no_connects)} no-connect)")


if __name__ == "__main__":
    main()
