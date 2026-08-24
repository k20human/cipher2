#!/bin/sh
# Produce everything PCBWay needs, plus the outline the enclosure is built from.
#
# Run from anywhere; paths are relative to pcb/. Every artefact here is
# regenerated from cipher2-panel.kicad_pcb, which is itself regenerated from
# netlist.py -- nothing in fab/ is ever edited.
set -eu
cd "$(dirname "$0")/.."
BOARD=cipher2-panel

rm -rf fab/gerbers
mkdir -p fab/gerbers mech

# Seven layers. A missing one is a wrong board: the fab builds what it
# receives, not what was meant.
kicad-cli pcb export gerbers --output fab/gerbers --precision 6 \
  --layers F.Cu,B.Cu,F.Mask,B.Mask,F.SilkS,B.SilkS,Edge.Cuts "$BOARD.kicad_pcb"

kicad-cli pcb export drill --output fab/gerbers --format excellon \
  --excellon-units mm --drill-origin absolute --generate-map "$BOARD.kicad_pcb"

# Two bills of materials, not one. bom.csv is what you order; bom-full.csv
# keeps R2, R3 and SJ1 with their do-not-populate flag, which is what explains
# the empty pads six months from now.
kicad-cli sch export bom --output fab/bom.csv --exclude-dnp \
  --fields 'Reference,Value,Footprint,${QUANTITY}' \
  --group-by Value --labels 'Refs,Value,Footprint,Qty' "$BOARD.kicad_sch"

kicad-cli sch export bom --output fab/bom-full.csv --include-excluded-from-bom \
  --fields 'Reference,Value,Footprint,${DNP}' \
  --labels 'Ref,Value,Footprint,DNP' "$BOARD.kicad_sch"

kicad-cli pcb export pos --output fab/placement.csv --format csv \
  --units mm --side front --exclude-dnp "$BOARD.kicad_pcb"

kicad-cli pcb export dxf --output mech --output-units mm \
  --layers Edge.Cuts,User.Comments "$BOARD.kicad_pcb"

( cd fab/gerbers && zip -q -r "../$BOARD-gerbers.zip" . )
echo "fab/$BOARD-gerbers.zip ready"
