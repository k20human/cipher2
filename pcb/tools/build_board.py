#!/usr/bin/env python3
"""Build cipher2-panel.kicad_pcb from netlist.py. Never edit the board by hand.

Coordinates are millimetres from the top-left corner of the outline, KiCad's
own convention: x grows right, y grows *down*.

The board is a hub now: the button, the encoder and the trackball are mounted
in the enclosure and reach it on cables. What is left is a Pro Micro on
sockets, four connectors, five passives -- and a lot of free copper.

100 x 42 mm -- 42, not the 40 an earlier draft of this comment claimed. The
enclosure offers a 180 x 44 mm strip once the USB hub takes
the upper half of the bay, and 100 mm is the largest dimension that stays
inside PCBWay's base rate. The extra length is not for the circuit, which
occupies 23% of the board: it is for the wordmark, which the owner asked to be
as large as the board allows.
"""
import sys
from pathlib import Path

import pcbnew

sys.path.insert(0, str(Path(__file__).resolve().parent))

import netlist
from sexpr import Str, dumps, loads

PCB = Path(__file__).resolve().parents[1]
BOARD_FILE = PCB / "cipher2-panel.kicad_pcb"
SYSTEM_FOOTPRINTS = "/usr/share/kicad/footprints"

# KiCad names a net after the sheet its label sits on: a local label "SDA" on
# the root sheet becomes "/SDA". The schematic is the authority, so the board
# adopts its names -- the alternative is 68 parity conflicts saying the same
# thing. The netclass patterns in cipher2-panel.kicad_pro carry the prefix too.
SHEET = "/"

WIDTH, HEIGHT = 100.0, 42.0
THICKNESS = 1.6
EDGE_MARGIN = 3.5            # M3 hole centres, this far from both edges
# The rectangle the wordmark lives in, kept clear of components so the ground
# pour under it stays unbroken: (x0, x1, y0, y1) in mm. A full-width band was
# the first attempt and it was too blunt -- it forbade R2 and R3 their place at
# the top right, which is nowhere near the lettering.
# The ink measures x 9.6..43.5, y 1.1..11.2; this is that plus ~1.5 mm. Wider
# and it swallows H1, the top-left mounting hole, which the lettering never
# comes near. The two glitch bars fall outside it on purpose -- they sit beside
# the block, and test_wordmark.py checks the pour under them directly.
WORDMARK_ZONE = (2.0, 65.0, 16.0, 35.0)

# Placement is verified by test_placement.py, which is what makes these
# numbers safe to edit: change one, run the tests, and any overlap or overhang
# is named before the board is ever rendered.
# Several footprints are not centred on their origin -- the EC11's is its pad
# A, the PIM447's is its header rather than the module body. These numbers
# therefore come from the measured bounding boxes, not from arithmetic on
# nominal sizes.
PLACEMENT = {
    # Rotated 270 deg: the pin rows run horizontally and the USB connector
    # faces the *right* edge, where the enclosure puts the hub. x = 83.5 lands
    # the module's own board end on the outline, so the connector sits in free
    # air with a plug's worth of room in front of it.
    "U1":  (83.5, 21.0, 270),

    # Connectors along the top edge. The trackball and the encoder cable in
    # from the left of the enclosure, so they take the leftmost slots; the
    # button's cable is a switch and an LED and does not care how far it runs.
    "J1":  (9.0, 4.0, 90),       # trackball, 5 way
    "J3":  (25.0, 4.0, 90),      # encoder, 5 way
    "J4":  (52.0, 4.0, 90),      # button, 4 way -- rightmost, its cable exits right
    # The spare header goes to the bottom left rather than the top row: four
    # connectors plus H1 do not fit across 58 mm, and this is the one that has
    # nowhere it needs to be.
    "J2":  (16.0, 37.0, 90),     # spare pins, 6 way -- 37, to leave room
                                 # for its pin names below it

    # Passives tucked under the module's right-hand end, out of the wordmark's
    # way. Nothing here is length-critical: C1 sits 12 mm from J1's power pin,
    # and at 100 kHz over a cabled bus that is not the limiting factor.
    "R1":  (68.0, 35.0, 0),
    "C1":  (75.0, 35.0, 0),
    # R3 west of R2, which is the reverse of their numbering and the point:
    # SCL leaves U1 at x 84.8 and SDA at 87.3, so putting SCL's pull-up west
    # and SDA's east lets each stub run straight out. The other way round they
    # cross, and a crossing here costs two vias for nothing.
    "R3":  (82.0, 35.0, 0),      # SCL pull-up
    "R2":  (89.0, 35.0, 0),      # SDA pull-up -- 89, not 94: H4 starts at 93
    "SJ1": (68.0, 39.0, 0),
}


def footprint_path(spec):
    lib, name = spec.split(":")
    root = str(PCB / "lib" / "cipher2.pretty") if lib == "cipher2" \
        else f"{SYSTEM_FOOTPRINTS}/{lib}.pretty"
    return root, name


def mm(value):
    return pcbnew.FromMM(value)


def point(x, y):
    return pcbnew.VECTOR2I(mm(x), mm(y))


def add_outline(board):
    """Rectangular Edge.Cuts outline, four segments."""
    corners = [(0, 0), (WIDTH, 0), (WIDTH, HEIGHT), (0, HEIGHT)]
    for start, end in zip(corners, corners[1:] + corners[:1]):
        segment = pcbnew.PCB_SHAPE(board)
        segment.SetShape(pcbnew.SHAPE_T_SEGMENT)
        segment.SetStart(point(*start))
        segment.SetEnd(point(*end))
        segment.SetLayer(pcbnew.Edge_Cuts)
        segment.SetWidth(mm(0.1))
        board.Add(segment)


def unconnected_net_name(ref, pad):
    """KiCad's own name for a pin that goes nowhere.

    The schematic gets one of these per no-connect pin whether we ask or not,
    and parity compares names -- so the board has to carry the same ones. No
    prefix: KiCad does not sheet-qualify these.
    """
    return f"unconnected-({ref}-Pad{pad})"


def add_nets(board):
    """Create every net up front; pads are attached to them afterwards."""
    table = {}
    for name in netlist.NETS:
        net = pcbnew.NETINFO_ITEM(board, SHEET + name)
        board.Add(net)
        table[name] = net
    for ref, pad in sorted(netlist.NO_CONNECT):
        net = pcbnew.NETINFO_ITEM(board, unconnected_net_name(ref, pad))
        board.Add(net)
        table[(ref, pad)] = net
    return table


def place_components(board):
    for ref, component in netlist.COMPONENTS.items():
        root, name = footprint_path(component.footprint)
        footprint = pcbnew.FootprintLoad(root, name)
        if footprint is None:
            raise SystemExit(f"footprint not found: {component.footprint}")
        x, y, rotation = PLACEMENT[ref]
        footprint.SetPosition(point(x, y))
        footprint.SetOrientationDegrees(rotation)
        # Without the library nickname the board records a bare footprint
        # name, and parity reports every component as a mismatch against the
        # symbol's fully qualified one.
        footprint.SetFPID(pcbnew.LIB_ID(*component.footprint.split(":")))
        footprint.SetReference(ref)
        footprint.SetValue(component.value)
        footprint.SetDNP(component.dnp)
        if not component.in_bom:
            footprint.SetAttributes(footprint.GetAttributes()
                                    | pcbnew.FP_EXCLUDE_FROM_BOM
                                    | pcbnew.FP_EXCLUDE_FROM_POS_FILES)
        board.Add(footprint)


def connect(board, nets):
    """Attach every pad to its net.

    Iterating the pads rather than calling FindPadByNumber is not a style
    choice: SW_PUSH_6mm has four pads named 1, 1, 2, 2 and the EC11 has two
    named MP. FindPadByNumber returns one of each pair and leaves the other
    floating -- a fault the DRC reports as an unconnected item hundreds of
    lines into a report, if it is read at all.
    """
    wanted = {}
    for net_name, connections in netlist.NETS.items():
        for ref, pin in connections:
            wanted[(ref, str(netlist.pin_number(ref, pin)))] = net_name

    for ref, pad in netlist.NO_CONNECT:
        wanted[(ref, pad)] = (ref, pad)

    attached = set()
    for footprint in board.GetFootprints():
        ref = footprint.GetReference()
        for pad in footprint.Pads():
            key = (ref, pad.GetNumber())
            if key not in wanted:
                continue
            pad.SetNet(nets[wanted[key]])
            attached.add(key)

    missing = set(wanted) - attached
    if missing:
        raise SystemExit(f"pads named in netlist.py but absent from the board: "
                         f"{sorted(missing)}")


def add_mounting_holes(board):
    """Four M3 holes, 3.2 mm finished, EDGE_MARGIN from each corner."""
    for index, (x, y) in enumerate([
        (EDGE_MARGIN, EDGE_MARGIN),
        (WIDTH - EDGE_MARGIN, EDGE_MARGIN),
        (EDGE_MARGIN, HEIGHT - EDGE_MARGIN),
        (WIDTH - EDGE_MARGIN, HEIGHT - EDGE_MARGIN),
    ]):
        hole = pcbnew.FootprintLoad(f"{SYSTEM_FOOTPRINTS}/MountingHole.pretty",
                                    "MountingHole_3.2mm_M3")
        hole.SetPosition(point(x, y))
        hole.SetReference(f"H{index + 1}")
        hole.SetFPID(pcbnew.LIB_ID("MountingHole", "MountingHole_3.2mm_M3"))
        # Board-only: a hole is mechanical, it has no symbol, and saying so is
        # what stops parity from reporting four phantom extra footprints.
        hole.SetAttributes(pcbnew.FP_BOARD_ONLY
                           | pcbnew.FP_EXCLUDE_FROM_BOM
                           | pcbnew.FP_EXCLUDE_FROM_POS_FILES)
        board.Add(hole)




# ---------------------------------------------------------------- routing ---
#
# Every path is written here by hand. There is no autorouter: at this density
# the tracks are short, and a hand-written path can be read and argued with,
# which an autorouter's cannot.
#
# Layer choice is the whole design. Two nets that must cross use different
# layers -- that is the only tool a two-layer board has. As a rule:
#
#   B.Cu  the long hauls that run under U1 and across the top: SDA, SCL,
#         RESET, D14, and the four spare signals dropping into J2.
#   F.Cu  everything descending into the bottom half -- the encoder, the wake
#         button, the LED -- plus the +5V star. These cross the B.Cu lanes
#         freely because they are not on them.
#
# GND is absent on purpose: it is carried by the pours, not by tracks.
#
# Each entry is (points, layer). A net may have several, and they join at the
# pads they share.
# --- Escape lanes ---------------------------------------------------------
#
# Nine signals leave U1's lower pad row and cross the board westward. Each
# takes a horizontal lane on B.Cu, then a via, then drops to its connector on
# F.Cu. Lanes and drops are on different layers, so a drop can pass over any
# lane without touching it -- which is the whole reason for the via.
#
# Lane order is not arbitrary. The westernmost pad takes the lane *closest* to
# the row, and lanes step north as pads step east. A trace leaving a pad then
# only ever passes over lanes belonging to pads further west, whose horizontal
# runs stop short of it. Reverse the order and every escape crosses every lane.
#
# (pad, lane y, drop x, connector pad, direction)
ESCAPES = [
    ("D8", 26.5, 30.08, "J3.3", "N"),    # ENC_B
    ("D7", 25.5, 25.00, "J3.1", "N"),    # ENC_A
    ("D6", 24.5, 21.08, "J2.3", "S"),
    ("D5", 23.5, 52.00, "J4.1", "N"),    # WAKE_BTN
    ("D4", 22.5, 32.62, "J3.4", "N"),    # ENC_SW
    ("D3", 21.5, 14.08, "J1.3", "N"),    # SCL
    ("D2", 20.5, 11.54, "J1.2", "N"),    # SDA
    ("D0", 19.5, 18.54, "J2.2", "S"),
    ("D1", 18.5, 16.00, "J2.1", "S"),
]
ROW_Y = 28.62          # U1's lower pad row, after placement
CONNECTOR_Y = 4.0      # J1, J3, J4 pin row
SPARE_Y = 37.0         # J2 pin row


def escape_routes(pads):
    """Build the nine lane-and-drop paths from ESCAPES."""
    out, vias = {}, []
    for pad, lane, drop_x, target, direction in ESCAPES:
        net = next(n for n, pins in netlist.NETS.items()
                   if ("U1", pad) in pins)
        pad_x = pads[("U1", pad)][0]
        end_y = CONNECTOR_Y if direction == "N" else SPARE_Y
        out[net] = [
            ([(pad_x, ROW_Y), (pad_x, lane), (drop_x, lane)], "B"),
            ([(drop_x, lane), (drop_x, end_y)], "F"),
        ]
        vias.append((drop_x, lane, net))
    return out, vias


ROUTES = {
    # --- Trackball interrupt and the open jumper that could carry it to D14.
    # Neither does anything while SJ1 is open.
    "TB_INT": [([(16.62, 4.0), (16.62, 7.0), (63.0, 7.0)], "B"),
               ([(63.0, 7.0), (63.0, 39.0), (67.35, 39.0)], "F")],
    "D14": [([(74.61, 13.38), (74.61, 17.0), (70.8, 17.0),
              (70.8, 39.0), (68.65, 39.0)], "F")],

    # --- Button LED, through R1. Both legs hop to B.Cu for their run west:
    # F.Cu between x 57 and 70 is the one crowded strip on this board.
    "LED_PWM": [([(69.53, 28.62), (69.53, 30.5), (66.54, 30.5)], "B"),
                ([(66.54, 30.5), (66.54, 35.0)], "F")],
    "LED_A": [([(69.46, 35.0), (69.46, 32.5)], "F"),
              ([(69.46, 32.5), (57.08, 32.5)], "B"),
              ([(57.08, 32.5), (57.08, 4.0)], "F")],

    # --- +5V, three branches off U1's VCC pad.
    #
    # North on B.Cu above the top pad row to J1 and, by a via, down to J2.
    # South on F.Cu through the gap between GND2 and GND1 to the passives.
    # Nothing here is length-critical: the trackball's rail runs on a cable
    # anyway, and C1 is a reservoir, not a filter with a corner frequency.
    "+5V": [([(89.85, 13.38), (89.85, 9.0), (9.0, 9.0), (9.0, 4.0)], "B"),
            ([(26.16, 9.0), (26.16, 37.0)], "F"),
            # Through the lower pad row, between GND2 and GND1. Two 1.7 mm
            # pads on 2.54 mm centres leave 0.42 mm, so that one segment is
            # narrowed to 0.25 mm -- a 0.5 mm power trace does not fit and the
            # DRC says so. Going round the row's west end was the first
            # attempt and runs straight into the LED's corridor.
            ([(89.85, 13.38), (89.85, 26.0), (91.1, 26.0)], "F"),
            ([(91.1, 26.0), (91.1, 32.0)], "F", 0.25),
            ([(91.1, 32.0), (73.53, 32.0)], "F"),
            ([(87.54, 32.0), (87.54, 35.0)], "F"),
            ([(80.54, 32.0), (80.54, 35.0)], "F"),
            ([(73.53, 32.0), (73.53, 35.0)], "F")],

    # --- The pull-ups tap SDA and SCL where those nets pass the passive row.
    # They matter more than they did: the bus leaves the board on a cable now.
    # Pull-up stubs. Each leaves its pad on the side its resistor sits, so the
    # two never meet.
    "SDA": [([(87.31, 28.62), (87.31, 33.2), (90.46, 33.2)], "B"),
            ([(90.46, 33.2), (90.46, 35.0)], "F")],
    "SCL": [([(84.77, 28.62), (84.77, 33.2), (83.46, 33.2)], "B"),
            ([(83.46, 33.2), (83.46, 35.0)], "F")],

    # D10 leaves the *upper* row, so it runs west above everything else.
    "D10": [([(69.53, 13.38), (69.53, 10.0), (23.62, 10.0)], "B"),
            ([(23.62, 10.0), (23.62, 37.0)], "F")],
}

VIAS = [
    (90.46, 33.2, "SDA"),
    (83.46, 33.2, "SCL"),
    (23.62, 10.0, "D10"),
    (63.0, 7.0, "TB_INT"),
    (66.54, 30.5, "LED_PWM"),
    (69.46, 32.5, "LED_A"),
    (57.08, 32.5, "LED_A"),
    (26.16, 9.0, "+5V"),
]

# (x, y) of every layer change. Each must sit on two segments of the same net.

SIGNAL_WIDTH = 0.25
POWER_WIDTH = 0.5
POWER_NETS = ("GND", "+5V")
VIA_DIAMETER, VIA_DRILL = 0.8, 0.4
LAYERS = {"F": pcbnew.F_Cu, "B": pcbnew.B_Cu}


def pad_positions(board):
    out = {}
    for fp in board.GetFootprints():
        for pad in fp.Pads():
            out[(fp.GetReference(), pad.GetNumber())] = (
                pcbnew.ToMM(pad.GetPosition().x), pcbnew.ToMM(pad.GetPosition().y))
    return out


def all_routes(board):
    """ROUTES plus the nine generated escape lanes."""
    generated, _ = escape_routes(pad_positions(board))
    merged = {k: list(v) for k, v in ROUTES.items() if v}
    for net, paths in generated.items():
        merged.setdefault(net, []).extend(paths)
    return merged


def all_vias(board):
    _, generated = escape_routes(pad_positions(board))
    return list(VIAS) + generated


def add_tracks(board, nets):
    """Turn the routes into track segments."""
    for net_name, paths in all_routes(board).items():
        net = nets[net_name]
        width = mm(POWER_WIDTH if net_name in POWER_NETS else SIGNAL_WIDTH)
        for path in paths:
            points, layer = path[0], path[1]
            w = mm(path[2]) if len(path) > 2 else width
            for start, end in zip(points, points[1:]):
                track = pcbnew.PCB_TRACK(board)
                track.SetStart(point(*start))
                track.SetEnd(point(*end))
                track.SetWidth(w)
                track.SetLayer(LAYERS[layer])
                track.SetNet(net)
                board.Add(track)


def add_vias(board, nets):
    for x, y, net_name in all_vias(board):
        via = pcbnew.PCB_VIA(board)
        via.SetPosition(point(x, y))
        via.SetFrontWidth(mm(VIA_DIAMETER))
        via.SetDrill(mm(VIA_DRILL))
        via.SetNet(nets[net_name])
        board.Add(via)



# ------------------------------------------------------------- wordmark ---
#
# The letters are an opening in the solder mask over the ground pour. No copper
# is added: the pour is already there, ENIG gilds it, and cutting the mask away
# exposes it. The gold letters *are* the ground plane -- which is also why no
# floating copper and no DRC argument about it exists.
#
# Font and tracking are the interface's own: DejaVu Sans Mono Bold is what
# gui/src/styles/theme.css names as --font-mono, and 0.16 em is .logo--glitch's
# letter-spacing. KiCad has no tracking control, so each glyph is placed as its
# own text item -- which is what makes the spacing exact rather than close.
#
# What is *not* reproduced is the CSS's band displacement. It slices the
# wordmark horizontally and slides the slices sideways, and that needs glyph
# outlines; KiCad's Python binding returns a text's bounding box, not its
# contours. The two offset bars below stand in for it: bands slid out of the
# word, which is the effect the CSS is after, drawn rather than clipped.
# The wordmark is set in two faces, and the split is deliberate.
#
# Cyberway Riders draws its 2 with a flat top and a straight diagonal, and at
# any size it reads as a Z: the board said CIPHER-Z. The digit therefore comes
# from DejaVu Sans Mono -- which is not an arbitrary substitute but the
# interface's own face, the one gui/src/styles/theme.css names as --font-mono.
# The display face carries the name, the interface's face carries the number.
#
# Mixing faces means the two must be *matched*, not merely placed: same cap
# height, same baseline, a measured gap. None of that can be computed from the
# nominal text size, because a face routinely overshoots its declared metrics.
# align_wordmark() measures the rendered ink and corrects.
WORDMARK_WORD = "CIPHER-"
WORDMARK_DIGIT = "2"
WORDMARK = WORDMARK_WORD + WORDMARK_DIGIT
WORDMARK_FONT = "Cyberway Riders"   # ~/.local/share/fonts/Cyberway Riders.otf
DIGIT_FONT = "DejaVu Sans Mono"     # theme.css's --font-mono
DIGIT_GAP = 2.2                     # mm between the word's ink and the digit's
GLYPH_H, GLYPH_W = 12.2, 8.2
WORDMARK_MID = (33.0, 26.0)         # centre of the block

# Sized and placed against the *ink*, not the text's bounding box. Cyberway
# Riders overshoots its own declared metrics -- its glyphs reach 0.24 mm above
# the box KiCad reports -- and at 7.5 mm centred on y = 6 the tops of the
# letters landed 0.26 mm from the board edge, outside the pour, where they
# would have printed as bare beige substrate instead of gold. Nothing in ERC
# or DRC has an opinion about that. GetEffectiveTextShape() reports the real
# extent, and test_wordmark.py now asserts against it.

# Set as one text item, not one per glyph.
#
# It used to be per glyph, at a fixed advance, to reproduce .logo--glitch's
# 0.16 em tracking. That only works for a monospaced face. Cyberway Riders is
# proportional -- its I is narrow and its H is wide -- and at a fixed advance
# the I floats in the middle of its cell while the H crowds its neighbours.
# The tracking went with the font it came from: DejaVu Sans Mono was the
# interface's face, and 0.16 em was the interface's spacing. Neither applies
# to a display face chosen for its own drawing.
#
# Strokes measure 1.1-1.3 mm here, against a 0.05 mm minimum mask opening and
# a 0.10 mm minimum mask bridge. The tapered tips round off very slightly at
# that scale; that is the typeface, not a defect.

# (x start, x end, y start, y end) in mm -- the displaced bands. They flank the
# block rather than crossing it: at 35 mm the wordmark spans x 8.5..43.5, and
# these sit in the 1 mm of clear pour left at either end.
GLITCH_BARS = [(3.0, 13.0, 13.4, 14.8), (40.0, 52.0, 35.6, 37.0)]


def add_wordmark(board):
    """White silkscreen on the black mask.

    It began as an opening in the solder mask, so the letters were the gilded
    ground plane showing through. That made the wordmark's colour a hostage to
    the surface finish -- silver-grey under HASL, pale gold only under ENIG,
    which PCBWay charges $35 for. On silkscreen the letters are white ink on
    black mask whatever the copper is plated with, so the finish becomes a
    purely functional choice and the cheapest one costs nothing in looks.

    White-on-black also reads harder than gold-on-black, which suits the type.

    Strokes measure 1.1-1.3 mm against a 0.15 mm minimum silkscreen line and a
    0.8 mm minimum character height. Seven times the margin.

    Silkscreen must land on solder mask, never on exposed copper -- ink on bare
    metal flakes. The DRC's silk_over_copper rule enforces it; test_wordmark.py
    checks the same thing from the other side.
    """
    # Nominal placement only. Both items are measured and moved by
    # align_wordmark() once their faces resolve, which happens on load.
    for content, dx in ((WORDMARK_WORD, -6.0), (WORDMARK_DIGIT, 26.0)):
        text = pcbnew.PCB_TEXT(board)
        text.SetText(content)
        text.SetLayer(pcbnew.F_SilkS)
        text.SetTextSize(pcbnew.VECTOR2I(mm(GLYPH_W), mm(GLYPH_H)))
        text.SetTextThickness(mm(GLYPH_H * 0.155))
        text.SetPosition(point(WORDMARK_MID[0] + dx, WORDMARK_MID[1]))
        board.Add(text)

    for x1, x2, y1, y2 in GLITCH_BARS:
        bar = pcbnew.PCB_SHAPE(board)
        bar.SetShape(pcbnew.SHAPE_T_RECT)
        bar.SetStart(point(x1, y1))
        bar.SetEnd(point(x2, y2))
        bar.SetLayer(pcbnew.F_SilkS)
        bar.SetFilled(True)
        bar.SetWidth(0)
        board.Add(bar)


# The physical stackup, which the board did not carry: a board built from
# scratch in pcbnew has no stackup section at all. Recording it does two
# things -- it puts the intended finish in the design file rather than only in
# the README, and it makes the 3D render truthful. Without it KiCad draws
# bare copper as a conventional yellow, which is not a colour any finish
# actually produces.
#
# Leaded HASL: the base option, and the one this board is built for. With the
# wordmark on silkscreen, nothing visible depends on the finish, so there is
# nothing to buy back for $35. Leaded solder also wets better under a hand
# iron than the lead-free kind -- the only real caveat is that the board is
# not RoHS compliant, which matters when selling, not when building one.
STACKUP = [
    ("F.SilkS", "Top Silk Screen", None, None),
    ("F.Paste", "Top Solder Paste", None, None),
    ("F.Mask", "Top Solder Mask", "Black", 0.01),
    ("F.Cu", "copper", None, 0.035),
    ("dielectric 1", "core", None, 1.51),
    ("B.Cu", "copper", None, 0.035),
    ("B.Mask", "Bottom Solder Mask", "Black", 0.01),
    ("B.Paste", "Bottom Solder Paste", None, None),
    ("B.SilkS", "Bottom Silk Screen", None, None),
]
COPPER_FINISH = "HAL SnPb"

# The one DRC warning this board accepts is declared in tools/check_drc.py,
# with its reason. It is not silenced in the project file: KiCad rewrites
# rule_severities wholesale on every run and restores its own defaults.


def set_stackup(path):
    """Write the physical stackup into the saved board."""
    tree = loads(Path(path).read_text(encoding="utf-8"))[0]
    setup = next(n for n in tree if isinstance(n, list) and n[0] == "setup")
    if any(isinstance(n, list) and n[0] == "stackup" for n in setup):
        return
    stackup = ["stackup"]
    for name, kind, color, thickness in STACKUP:
        layer = ["layer", Str(name), ["type", Str(kind)]]
        if color:
            layer.append(["color", Str(color)])
        if thickness is not None:
            layer.append(["thickness", thickness])
        if kind == "core":
            layer += [["material", Str("FR4")], ["epsilon_r", 4.5],
                      ["loss_tangent", 0.02]]
        stackup.append(layer)
    stackup.append(["copper_finish", Str(COPPER_FINISH)])
    stackup.append(["dielectric_constraints", "no"])
    setup.insert(1, stackup)
    Path(path).write_text(dumps(tree) + "\n", encoding="utf-8")


# --- Silkscreen legends ----------------------------------------------------
#
# Every connector pin gets its signal name on the board. This is not polish:
# the cables are Dupont jumpers with no keying, so nothing but the printing
# stops the trackball's 5 V from landing on its ground. The board is the only
# place that knowledge can live where it will still be there in a year.
#
# ref -> (title, y of the pin names, y of the title, text rotation)
CONNECTOR_LEGENDS = {
    "J1": ("TRACKBALL", 8.2, 11.5),
    "J3": ("ENCODER", 8.2, 11.5),
    "J4": ("BUTTON", 8.2, 11.5),
    "J2": ("SPARE", 40.0, None),      # title goes beside it, not below
}
PIN_TEXT_H = 0.9
TITLE_TEXT_H = 1.2


def silk_text(board, text, x, y, height, angle=0):
    item = pcbnew.PCB_TEXT(board)
    item.SetText(text)
    item.SetLayer(pcbnew.F_SilkS)
    item.SetTextSize(pcbnew.VECTOR2I(mm(height * 0.75), mm(height)))
    item.SetTextThickness(mm(height * 0.17))
    item.SetPosition(point(x, y))
    item.SetTextAngleDegrees(angle)
    board.Add(item)


def add_connector_legends(board):
    """Print every connector's pin names, and what each connector is for."""
    import build_symbols
    for ref, (title, pin_y, title_y) in CONNECTOR_LEGENDS.items():
        component = netlist.COMPONENTS[ref]
        names = {pad: label for label, pad, _, _ in
                 build_symbols.SYMBOLS[component.symbol][1]}
        footprint = board.FindFootprintByReference(ref)
        xs = []
        for pad in footprint.Pads():
            x = pcbnew.ToMM(pad.GetPosition().x)
            xs.append(x)
            # Rotated 90 deg: at 2.54 mm pitch there is width for one character
            # between pads and height for four below them.
            silk_text(board, names[pad.GetNumber()], x, pin_y, PIN_TEXT_H, 90)
        centre = (min(xs) + max(xs)) / 2
        if title_y is not None:
            silk_text(board, title, centre, title_y, TITLE_TEXT_H)
        else:
            silk_text(board, title, min(xs) - 5.0, 37.0, TITLE_TEXT_H)

    # The one marking that prevents a destroyed module. U1 is mounted upside
    # down -- see build_footprints.pro_micro -- and a normally seated Pro Micro
    # puts 5 V on the trackball's ground.
    silk_text(board, "PRO MICRO - COMPONENTS DOWN", 78.0, 9.0, 1.1)


def add_fab_marker(board):
    """Tell PCBWay where to put its product number.

    They print one on every board. Removing it costs $1.50; naming a spot for
    it costs nothing -- the marker text "WayWayWay" on the silkscreen is their
    documented convention, and the order form has a "specify a location" option
    that must be ticked as well or they will not look for it.

    Bottom right, in the empty band below SW3: anywhere else and their number
    lands on the wordmark, which is the whole reason for bothering.
    """
    marker = pcbnew.PCB_TEXT(board)
    marker.SetText("WayWayWay")
    marker.SetLayer(pcbnew.F_SilkS)
    marker.SetTextSize(pcbnew.VECTOR2I(mm(0.9), mm(1.0)))
    marker.SetTextThickness(mm(0.15))
    marker.SetPosition(point(90.0, 40.0))
    board.Add(marker)


def align_wordmark(path):
    """Match the digit to the word, then centre the pair on WORDMARK_MID.

    Everything here is measured from GetEffectiveTextShape(), never from the
    declared text size. A display face overshoots its own metrics -- Cyberway
    Riders by 0.24 mm -- so aligning on nominal values leaves the two halves
    visibly off, and no automated check would notice.
    """
    board = pcbnew.LoadBoard(str(path))
    items = {t.GetText(): t for t in board.GetDrawings()
             if isinstance(t, pcbnew.PCB_TEXT) and t.GetLayer() == pcbnew.F_SilkS
             and t.GetText() in (WORDMARK_WORD, WORDMARK_DIGIT)}
    word, digit = items[WORDMARK_WORD], items[WORDMARK_DIGIT]

    # Cap height first: scale the digit until its ink matches the word's.
    wb, db = word.GetEffectiveTextShape().BBox(), digit.GetEffectiveTextShape().BBox()
    scale = wb.GetHeight() / db.GetHeight()
    size = digit.GetTextSize()
    digit.SetTextSize(pcbnew.VECTOR2I(int(size.x * scale), int(size.y * scale)))
    digit.SetTextThickness(int(digit.GetTextThickness() * scale))

    # Then baseline and gap, both against the ink.
    db = digit.GetEffectiveTextShape().BBox()
    digit.SetPosition(pcbnew.VECTOR2I(
        digit.GetPosition().x + (wb.GetRight() + mm(DIGIT_GAP) - db.GetLeft()),
        digit.GetPosition().y + (wb.GetBottom() - db.GetBottom())))

    # Finally recentre the pair, so WORDMARK_MID still means what it says.
    wb, db = word.GetEffectiveTextShape().BBox(), digit.GetEffectiveTextShape().BBox()
    dx = point(*WORDMARK_MID).x - (wb.GetLeft() + db.GetRight()) // 2
    dy = point(*WORDMARK_MID).y - (wb.GetTop() + wb.GetBottom()) // 2
    for item in (word, digit):
        item.SetPosition(pcbnew.VECTOR2I(item.GetPosition().x + dx,
                                         item.GetPosition().y + dy))
    pcbnew.SaveBoard(str(path), board)


def set_wordmark_font(path):
    """Write the font face into the saved board.

    SetUnresolvedFontName does not survive the Python object -- KiCad resolves
    a face when it *reads* a file. So the name goes in afterwards, and the
    board is correct from the next load onward. Without this the wordmark
    silently falls back to KiCad's stroke font, which is legible and wrong.
    """
    tree = loads(Path(path).read_text(encoding="utf-8"))[0]
    patched = 0
    for node in tree:
        if not (isinstance(node, list) and node[0] == "gr_text"):
            continue
        face = {WORDMARK_WORD: WORDMARK_FONT, WORDMARK_DIGIT: DIGIT_FONT}.get(
            str(node[1]))
        if face is None:
            continue
        layer = next(n for n in node if isinstance(n, list) and n[0] == "layer")
        if str(layer[1]) != "F.SilkS":
            continue
        effects = next(n for n in node if isinstance(n, list) and n[0] == "effects")
        font = next(n for n in effects if isinstance(n, list) and n[0] == "font")
        if not any(isinstance(f, list) and f[0] == "face" for f in font):
            font.insert(1, ["face", Str(face)])
            patched += 1
    if patched != 2:
        raise SystemExit(f"wordmark: patched {patched} items, expected 2")
    Path(path).write_text(dumps(tree) + "\n", encoding="utf-8")


ZONE_INSET = 0.3             # pour edge, inside the outline
STITCH_PITCH = 10.0
STITCH_KEEPOUT = 3.0


def add_zones(board, nets):
    """A GND pour on each layer. This is how the fourteen ground pads connect.

    Routing ground as tracks on a board with a switch frame, a button collar
    and three module grounds would cost more copper than the pour and give a
    worse return path. Nothing in ROUTES touches GND for that reason.
    """
    corners = [(ZONE_INSET, ZONE_INSET), (WIDTH - ZONE_INSET, ZONE_INSET),
               (WIDTH - ZONE_INSET, HEIGHT - ZONE_INSET),
               (ZONE_INSET, HEIGHT - ZONE_INSET)]
    for layer in (pcbnew.F_Cu, pcbnew.B_Cu):
        zone = pcbnew.ZONE(board)
        zone.SetLayer(layer)
        zone.SetNet(nets["GND"])
        zone.SetLocalClearance(mm(0.3))
        zone.SetMinThickness(mm(0.2))
        outline = zone.Outline()
        outline.NewOutline()
        for x, y in corners:
            outline.Append(mm(x), mm(y))
        board.Add(zone)


def add_stitching(board, nets):
    """Tie the two pours together, skipping anything already occupied.

    Two mistakes are baked out of this. The grid used to run to WIDTH, which
    is the board edge, so vias landed in the routed outline. And the keepout
    boxes were built as one chained expression -- GetBoundingBox() returns a
    temporary that SWIG frees before Inflate()'s result is used, leaving
    garbage, which is how vias ended up inside the button's 16 mm hole.
    """
    keepout = mm(STITCH_KEEPOUT)
    margin = STITCH_KEEPOUT

    boxes = []
    for footprint in board.GetFootprints():
        box = footprint.GetBoundingBox(False, False)
        box.Inflate(keepout)
        boxes.append(box)

    tracks = list(board.GetTracks())
    placed = 0
    for i in range(1, int(WIDTH // STITCH_PITCH) + 1):
        for j in range(1, int(HEIGHT // STITCH_PITCH) + 1):
            x, y = i * STITCH_PITCH, j * STITCH_PITCH
            if not (margin < x < WIDTH - margin and margin < y < HEIGHT - margin):
                continue
            here = point(x, y)
            if any(box.Contains(here) for box in boxes):
                continue
            if any(track.HitTest(here, int(keepout)) for track in tracks):
                continue
            via = pcbnew.PCB_VIA(board)
            via.SetPosition(here)
            via.SetFrontWidth(mm(VIA_DIAMETER))
            via.SetDrill(mm(VIA_DRILL))
            via.SetNet(nets["GND"])
            board.Add(via)
            placed += 1
    return placed


def build():
    board = pcbnew.BOARD()
    board.GetDesignSettings().SetBoardThickness(mm(THICKNESS))
    nets = add_nets(board)
    add_outline(board)
    place_components(board)
    add_mounting_holes(board)
    connect(board, nets)
    add_tracks(board, nets)
    add_vias(board, nets)
    add_zones(board, nets)
    add_stitching(board, nets)
    add_wordmark(board)
    add_connector_legends(board)
    add_fab_marker(board)
    board.BuildConnectivity()
    return board


def fill_zones(path):
    """Pour the ground planes -- on a board read back from disk, not the one
    just built.

    ZONE_FILLER segfaults on a BOARD constructed in memory: it reaches for a
    project context that only LoadBoard supplies. Saving and reloading costs
    milliseconds and is the difference between a filled pour and fourteen
    unconnected ground pads, since kicad-cli reads the stored fill rather than
    recomputing it.
    """
    board = pcbnew.LoadBoard(str(path))
    board.BuildConnectivity()
    if not pcbnew.ZONE_FILLER(board).Fill(board.Zones()):
        raise SystemExit("zone fill failed")
    pcbnew.SaveBoard(str(path), board)
    return board


def main():
    board = build()
    pcbnew.SaveBoard(str(BOARD_FILE), board)
    board = fill_zones(BOARD_FILE)
    set_wordmark_font(BOARD_FILE)
    align_wordmark(BOARD_FILE)
    set_stackup(BOARD_FILE)
    print(f"wrote {BOARD_FILE} "
          f"({len(board.GetFootprints())} footprints, {board.GetNetCount() - 1} nets, "
          f"{len(board.Zones())} pours)")


if __name__ == "__main__":
    main()
