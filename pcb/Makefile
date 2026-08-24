PY := python3
BOARD := cipher2-panel

.PHONY: test symbols footprints schematic board fab render clean

test:
	$(PY) -m unittest discover -s test -p 'test_*.py' -v

symbols:
	$(PY) tools/build_symbols.py

footprints:
	$(PY) tools/build_footprints.py

schematic: symbols footprints
	$(PY) tools/build_schematic.py
	kicad-cli sch erc --severity-all --exit-code-violations $(BOARD).kicad_sch

board: schematic
	$(PY) tools/build_board.py
	$(PY) tools/check_drc.py

fab: board
	./tools/export_fab.sh

render:
	mkdir -p render
	kicad-cli pcb render --output render/top.png --side top \
	  --width 2000 --height 1550 --background opaque --quality high $(BOARD).kicad_pcb
	kicad-cli pcb render --output render/bottom.png --side bottom \
	  --width 2000 --height 1550 --background opaque --quality high $(BOARD).kicad_pcb
	kicad-cli pcb export svg --output render/front.svg --mode-single \
	  --layers F.Cu,F.Mask,F.SilkS,Edge.Cuts $(BOARD).kicad_pcb
	kicad-cli pcb export svg --output render/mask.svg --mode-single \
	  --layers F.Mask,Edge.Cuts $(BOARD).kicad_pcb
	@echo "render/ : top.png bottom.png front.svg mask.svg"

clean:
	rm -rf fab/* mech/* $(BOARD).kicad_sch $(BOARD).kicad_pcb \
	       lib/cipher2.kicad_sym $(BOARD)-erc.rpt $(BOARD)-drc.rpt render
