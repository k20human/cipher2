#!/data/data/com.termux/files/usr/bin/sh
# Puts the boot scripts where Termux:Boot reads them. Run once, from Termux:
#   sh ~/cyberdeck-gui/tools/boot/install.sh
#
# Deliberately reads from the deck's own directory rather than from /sdcard:
# Termux is not guaranteed read access to shared storage — on the reference
# device (MIUI) it was granted WRITE_EXTERNAL_STORAGE and refused
# READ_EXTERNAL_STORAGE, so a script sitting in /sdcard/Download could not be
# read at all, while the deck's own files, in Termux's private home, always
# can be.
set -e
here=$(dirname "$0")
mkdir -p "$HOME/.termux/boot"
cp "$here/10-deck-server.sh" "$here/20-deck-launch.sh" "$HOME/.termux/boot/"
chmod +x "$HOME/.termux/boot/"*.sh
echo "in place:"
ls -l "$HOME/.termux/boot/"
echo
echo "Termux:Boot must have been opened once by hand before it will run these."
