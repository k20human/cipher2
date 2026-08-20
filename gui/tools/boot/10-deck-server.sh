#!/data/data/com.termux/files/usr/bin/sh
# Executed by Termux:Boot at device boot. Copy into ~/.termux/boot/ with
# tools/boot/install.sh, which is where Termux:Boot looks.
#
# termux-wake-lock comes first and is not optional: without it Android puts
# the process to sleep as soon as the screen goes off, and the deck answers
# nothing when the screen comes back. The lock keeps the CPU alive; it does
# not keep the screen on.
termux-wake-lock
exec "$HOME/cyberdeck-gui/serve.sh" 8080
