#!/usr/bin/env python3
"""Run the DRC and hold it to this project's standard.

kicad-cli's own --exit-code-violations is all-or-nothing: either warnings fail
the build or they are invisible. Neither is what this board wants. It wants
zero errors, zero parity differences, zero unconnected items, and every
warning individually examined and written down.

So the accepted warnings live here, in code, with their reasons. Anything else
fails. Putting them in the project file was the first attempt and does not
work: KiCad rewrites rule_severities wholesale on every invocation, silently
restoring its defaults.
"""
import json
import subprocess
import sys
import tempfile
from pathlib import Path

PCB = Path(__file__).resolve().parents[1]
BOARD = PCB / "cipher2-panel.kicad_pcb"

# Warning type -> why it is accepted. Every entry is a decision someone made.
ACCEPTED_WARNINGS = {
    "text_thickness":
        "Cyberway Riders has pointed terminals, and a point tapers below the "
        "0.08 mm minimum line by construction. Raising the text thickness does "
        "not help -- KiCad measures the raw TrueType outline. The tips print "
        "slightly rounded; the strokes themselves are 1.1-1.3 mm against a "
        "0.15 mm minimum silkscreen line.",
}


def run():
    with tempfile.TemporaryDirectory() as tmp:
        report = Path(tmp) / "drc.json"
        subprocess.run(
            ["kicad-cli", "pcb", "drc", "--schematic-parity",
             "--all-track-errors", "--severity-all",
             "--format", "json", "--output", str(report), str(BOARD)],
            check=True, capture_output=True)
        return json.loads(report.read_text(encoding="utf-8"))


def main():
    result = run()
    parity = result.get("schematic_parity", [])
    unconnected = result.get("unconnected_items", [])
    violations = result.get("violations", [])
    errors = [v for v in violations if v.get("severity") != "warning"]
    warnings = [v for v in violations if v.get("severity") == "warning"]
    unexpected = [v for v in warnings if v["type"] not in ACCEPTED_WARNINGS]

    print(f"DRC: {len(errors)} errors, {len(warnings)} warnings, "
          f"{len(parity)} parity, {len(unconnected)} unconnected")

    failed = False
    for label, items in (("error", errors), ("schematic parity", parity),
                         ("unconnected", unconnected),
                         ("unexpected warning", unexpected)):
        for item in items:
            failed = True
            where = item.get("items", [{}])[0].get("description", "")
            print(f"  {label}: {item.get('type', '?')} -- {where[:70]}")

    for warning in warnings:
        if warning["type"] in ACCEPTED_WARNINGS:
            print(f"  accepted: {warning['type']}")

    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
