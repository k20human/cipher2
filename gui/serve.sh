#!/bin/sh
# Launch the GUI server. Run this from Termux on the phone, or locally to test.
exec python3 "$(dirname "$0")/tools/serve.py" "${1:-8080}"
