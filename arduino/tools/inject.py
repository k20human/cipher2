#!/usr/bin/env python3
"""Feed the board the lines the Android app will send, so the LED vocabulary
can be exercised from this PC without a phone.

  ./inject.py 1 87        one line, screen on, battery 87
  ./inject.py --hold 0 14 same line every 5 s until interrupted
  ./inject.py --silent    open the port and say nothing (app-death rehearsal)
"""
import argparse
import sys
import time

import serial

PORT = "/dev/ttyACM0"
BAUD = 115200


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("screen", nargs="?", choices=["0", "1"])
    p.add_argument("battery", nargs="?", type=int)
    p.add_argument("--hold", action="store_true", help="repeat every 5 s")
    p.add_argument("--silent", action="store_true", help="send nothing")
    p.add_argument("--port", default=PORT)
    args = p.parse_args()

    # Warned about, never rejected: feeding the board an out-of-range value is
    # a legitimate way to test its parser. But an operator running the LED
    # protocol deserves to know why the LED did not budge, rather than blaming
    # the wiring.
    if args.battery is not None and not 0 <= args.battery <= 100:
        print(
            f"warning: battery {args.battery} is outside 0..100 -- the board "
            "will reject this line and the LED will not change",
            file=sys.stderr,
        )

    with serial.Serial(args.port, BAUD, timeout=1) as ser:
        time.sleep(0.2)  # the CDC port needs a moment after opening
        if args.silent:
            print("port open, sending nothing -- expect a 4 Hz blink after 15 s")
            while True:
                time.sleep(1)
        if args.screen is None or args.battery is None:
            p.error("screen and battery are required unless --silent is given")
        line = f"S{args.screen} B{args.battery}\n"
        while True:
            ser.write(line.encode())
            print(f"sent {line!r}")
            if not args.hold:
                return 0
            time.sleep(5)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print()
