#!/data/data/com.termux/files/usr/bin/sh
# Opens the deck after boot. Two things had to be got right here, and both were
# found the hard way on the device.
#
# First, the background start. Android 10+ refuses to let a background process
# raise an activity, and the boot log said so outright: "Background activity
# start ... isBgStartWhitelisted: false". Lifting it takes an extra permission
# granted to Termux, which OEM skins name differently — on MIUI it is "display
# pop-up windows while running in the background". The log then reads "allowed
# because SYSTEM_ALERT_WINDOW permission is granted". Without it this script
# runs and nothing appears.
#
# Second, the target. A plain VIEW intent on http://localhost:8080 is ambiguous
# once the PWA is installed: Chrome and the WebAPK both claim it, Android shows
# the chooser, and at boot — screen off — nobody answers it. Naming the
# component skips resolution entirely.
#
# WEBAPK_PKG is the package, and it is empty on purpose: Chrome mints the name
# from a hash of the manifest, so it belongs to one install and is re-minted
# whenever the manifest changes. Read yours with:
#   adb shell pm list packages | grep webapk
# Left empty, this falls back to the ambiguous open, which still works once you
# have answered the chooser with "always" — the same thing that happens if the
# name goes stale, so a missing or outdated name costs a chooser rather than a
# broken launch.
#
# The activity is the transparent launcher, and it has to be that one. The
# shell declares two MAIN activities and neither resolves — naming
# H2OOpaqueMainActivity got "aInfo is null for resolve intent" in the log and
# fell straight through to the fallback. Ask the system which activity handles
# the URL inside the package and it answers H2OTransparentLauncherActivity:
#   adb shell cmd package resolve-activity -a android.intent.action.VIEW \
#     -d http://localhost:8080/index.html <package>
# It wants the action and the data as well as the component, being a launcher
# for a VIEW rather than an entry point of its own.
WEBAPK_PKG=""
WEBAPK_ACT="org.chromium.webapk.shell_apk.h2o.H2OTransparentLauncherActivity"
URL="http://localhost:8080/index.html"

# The wait gives the server time to listen. Opening the URL before it answers
# would show an error page that nothing would then reload.
sleep 12

# One caveat measured on the device and not fixable from here: with the screen
# off — which is how a phone comes back from a reboot — the launcher starts and
# finishes immediately, leaving an empty task. Nothing raises a window on a
# sleeping screen. Enable "stay awake while charging" in the developer options
# if the deck lives plugged in; otherwise the deck is one tap away, its server
# already running.
if [ -n "$WEBAPK_PKG" ] && am start -n "$WEBAPK_PKG/$WEBAPK_ACT" \
     -a android.intent.action.VIEW -d "$URL" >/dev/null 2>&1; then
  exit 0
fi
termux-open-url "$URL"
