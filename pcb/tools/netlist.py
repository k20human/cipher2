"""The single place where a connection is written down.

The schematic and the board are both generated from this file. Two generators
cannot drift from one source; that, and nothing else, is why this board is
generated rather than drawn.

The board is a hub, not a panel. The button, the encoder and the trackball are
mounted in the enclosure, metres of plastic away from here, and reach the board
on cables. Every one of them is therefore a connector, and the only footprint
still drawn by hand is the Pro Micro's.

Pin names follow each component's own datasheet, never a local convention.
"""
from typing import NamedTuple


class Component(NamedTuple):
    ref: str
    symbol: str        # symbol name inside lib/cipher2.kicad_sym
    footprint: str     # LIBRARY:FOOTPRINT, resolved in lib/PARTS.md
    value: str
    dnp: bool = False     # drawn on the board, deliberately not populated
    in_bom: bool = True   # a part someone could buy -- see SJ1 for the exception


HEADER = "Connector_PinHeader_2.54mm:PinHeader_{}_P2.54mm_Vertical"

# 1206 rather than 0805: Gotronic, where these are being bought, stocks neither
# 150 R nor 100 nF in 0805. 1206 is 3.2 x 1.6 mm against 2.0 x 1.25 -- larger,
# cheaper, in stock, and easier to hand-solder. There is room to spare.
RES = "Resistor_SMD:R_1206_3216Metric"
CAP = "Capacitor_SMD:C_1206_3216Metric"

COMPONENTS = {
    c.ref: c for c in [
        Component("U1", "ProMicro_5V", "cipher2:ProMicro_2x12_P2.54mm", "Pro Micro 5V/16MHz"),
        Component("J1", "Conn_Trackball", HEADER.format("1x05"), "TRACKBALL"),
        Component("J2", "Conn_Spare", HEADER.format("1x06"), "SPARE"),
        Component("J3", "Conn_Encoder", HEADER.format("1x05"), "ENCODER"),
        Component("J4", "Conn_Button", HEADER.format("1x04"), "BUTTON"),
        Component("R1", "R", RES, "150R"),
        Component("R2", "R", RES, "4k7", dnp=True),
        Component("R3", "R", RES, "4k7", dnp=True),
        Component("C1", "C", CAP, "100nF"),
        # Not in the BOM, and KiCad's own footprint says so: a solder jumper is
        # a feature of the copper, not a part anyone orders. dnp records that
        # it ships open.
        Component("SJ1", "SolderJumper_2", "Jumper:SolderJumper-2_P1.3mm_Open_Pad1.0x1.5mm",
                  "OPEN", dnp=True, in_bom=False),
    ]
}

# Physical order, USB connector at the top. The Pro Micro footprint is ours, so
# its pads carry these names rather than numbers: a pad named D2 cannot be
# wired to D3 by a transcription slip, which is the one failure mode that
# survives ERC.
#
# The footprint mirrors these two rows, because this module is mounted upside
# down -- see build_footprints.pro_micro. The netlist does not care: it names
# pads, and the footprint decides where a named pad sits.
PRO_MICRO_ROWS = (
    ["D1", "D0", "GND1", "GND2", "D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9"],
    ["RAW", "GND3", "RST", "VCC", "A3", "A2", "A1", "A0", "D15", "D14", "D16", "D10"],
)

# Connector pinouts mirror the real components, so every cable is straight
# through: pin N on the board goes to pin N on the part.
#
#   J1  trackball  +5V  SDA  SCL  INT  GND     (Pimoroni PIM447 header order)
#   J3  encoder    A    C    B    S1   S2      (EC11: quadrature side, then switch)
#   J4  button     SW   SW   LED+ LED-         (contact pair, then the LED pair)
#   J2  spare      D1   D0   D6   D10  +5V  GND
NETS = {
    "GND": [
        ("U1", "GND1"), ("U1", "GND2"), ("U1", "GND3"),
        ("J1", "5"),                      # trackball ground
        ("J2", "6"),
        ("J3", "2"), ("J3", "5"),         # encoder common, and switch return
        ("J4", "2"), ("J4", "4"),         # button contact return, LED cathode
        ("C1", "2"),
    ],
    "+5V": [
        ("U1", "VCC"), ("J1", "1"), ("J2", "5"), ("C1", "1"),
        ("R2", "1"), ("R3", "1"),
    ],
    "SDA":      [("U1", "D2"), ("J1", "2"), ("R2", "2")],
    "SCL":      [("U1", "D3"), ("J1", "3"), ("R3", "2")],
    "TB_INT":   [("J1", "4"), ("SJ1", "1")],
    "ENC_A":    [("U1", "D7"), ("J3", "1")],
    "ENC_B":    [("U1", "D8"), ("J3", "3")],
    "ENC_SW":   [("U1", "D4"), ("J3", "4")],
    "WAKE_BTN": [("U1", "D5"), ("J4", "1")],
    "LED_PWM":  [("U1", "D9"), ("R1", "1")],
    "LED_A":    [("R1", "2"), ("J4", "3")],
    # SJ1 is open. While it is, D14 is a spare pin like any other; closing it
    # hands D14 to the trackball's interrupt, which carries PCINT3.
    "D14":      [("U1", "D14"), ("SJ1", "2")],
    "D1":       [("U1", "D1"), ("J2", "1")],
    "D0":       [("U1", "D0"), ("J2", "2")],
    "D6":       [("U1", "D6"), ("J2", "3")],
    "D10":      [("U1", "D10"), ("J2", "4")],
}

# Pins that go nowhere, said out loud.
#
# RST joined this list when the reset button went: the board lives inside a
# closed enclosure, so a reset nobody can reach buys nothing. Unplugging the
# USB does the same job from outside.
#
# A pad with no net fails schematic parity, and "nothing was said about it" is
# not a state a board should be able to reach.
NO_CONNECT = {
    ("U1", "RST"),
    ("U1", "D15"), ("U1", "D16"),
    ("U1", "A0"), ("U1", "A1"), ("U1", "A2"), ("U1", "A3"),
    ("U1", "RAW"),
}

# Which net each firmware constant is answerable for. Read by test_pinout.py.
FIRMWARE_NETS = {
    "PIN_BUTTON": "WAKE_BTN",
    "PIN_LED": "LED_PWM",
    "PIN_ENC_A": "ENC_A",
    "PIN_ENC_B": "ENC_B",
    "PIN_ENC_SW": "ENC_SW",
}

# Datasheet pin name -> footprint pad name. Empty on purpose: every footprint
# here either uses plain numbers or, for the Pro Micro, pads named after their
# signals. Nothing needs translating. The seam is kept so that adopting a
# footprint with a different scheme is a one-line change here.
PIN_NUMBERS: dict[str, dict[str, str]] = {}


def pin_number(ref, pin):
    """Datasheet pin name -> footprint pad name. Identity unless mapped above."""
    return PIN_NUMBERS.get(COMPONENTS[ref].symbol, {}).get(pin, pin)
