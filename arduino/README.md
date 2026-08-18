# screen_wake

An illuminated pushbutton that turns an Android phone's screen on (and off), a
rotary encoder that sets its volume, and a trackball that moves a cursor on it.

The Arduino announces itself to the phone as a USB HID device. On the *consumer
control* interface it sends the Power, Volume +/- and Mute keys, which Android
translates into `KEY_POWER`, `KEY_VOLUMEUP`, `KEY_VOLUMEDOWN` and `KEY_MUTE`:
the effect is identical to that of the phone's own physical buttons. As a mouse,
it moves the pointer and clicks.

## Hardware

| Part | Detail |
|---|---|
| Board | ATmega32U4 — see *Boards* below |
| Button | Momentary pushbutton with a built-in LED, 4 wires, 3-6 V LED |
| Encoder | Bare EC11 — 3 pins for the quadrature, 2 for the switch |
| Trackball | Pimoroni PIM447 — I²C, with click and RGBW LED on the bus |
| Link | Android phone → OTG → unpowered USB hub → Arduino |

### Boards

Developed and tested on an **Arduino Leonardo** (`2341:8036`).

The board must have **native USB**, and the sketch's HID library (`HID-Project`
by NicoHood) targets AVR. That leaves the ATmega32U4 family, all
interchangeable here:

| Board | Note |
|---|---|
| Arduino Leonardo | The reference for this project |
| Arduino Micro | Same chip, smaller footprint |
| Pro Micro and clones | Cheapest option; check the 5 V variant, not the 3.3 V/8 MHz one |
| Adafruit ItsyBitsy 32u4, LilyPad USB | Same chip, different form factors |

An **Uno or a Nano cannot work**, whatever the wiring: their USB goes through a
CH340 or FT232 serial bridge, so they are physically unable to present
themselves as a keyboard. No sketch can work around that.

Native-USB boards that are *not* AVR — SAMD (Zero, MKR), RP2040, ESP32-S2 — do
have the USB capability but not `HID-Project`. Moving to one is a port of the
HID layer, not a change of `--fqbn`.

## Wiring

| Pin | Use |
|---|---|
| **D2** | Trackball — SDA, I²C bus |
| **D3** | Trackball — SCL, I²C bus |
| **D4** | Encoder switch (mute) |
| **D5** | Wake button |
| **D7** | Encoder, signal A |
| **D8** | Encoder, signal B |
| **D9** | Button LED, through a **150 Ω** resistor |

Every return goes to **GND**: the button's second contact, the LED cathode, the
encoder's middle pin, its switch's second contact, the trackball's ground. The
trackball also takes **5 V**.

**D2 and D3 are the ATmega32U4's only hardware I²C lines.** The trackball module
occupies them, and exposes its click *and* its four LEDs there — two pins for
both functions. That, and only that, is why the wake button moved from D2 to D5.

D7 and D8 for the encoder are not arbitrary either: once D2 and D3 are taken,
they are the last two pins able to raise an interrupt — D7 through an external
interrupt, D8 through a pin-change interrupt. The firmware polls the pins in a
loop rather than using interrupts; should detents ever be missed, the switch
could be made without touching a single wire.

No input needs a resistor: `INPUT_PULLUP` enables the microcontroller's internal
pull-up, which holds the pin at 5 V when idle. Acting on the control ties the
pin to ground, and the firmware detects that fall to 0 V.

### EC11 rotary encoder

Three pins on one side — the quadrature — and two on the other — the switch. The
**middle** one of the three is the common.

| Pin | To |
|---|---|
| 3-pin side, outer | **D7** |
| 3-pin side, **middle** | **GND** |
| 3-pin side, other outer | **D8** |
| 2-pin side, either | **D4** |
| 2-pin side, the other | **GND** |

**If the rotation comes out backwards**, swap the D7 and D8 wires. That is the
encoder's only wiring hazard, and it is harmless.

The 150 Ω resistor is a safety net. An LED sold as "3-6 V" almost always carries
its own, but in the worst case (no internal resistor, a red LED at 2 V) it caps
the current at 20 mA — the recommended limit for an ATmega32U4 pin.

### Pimoroni PIM447 trackball

An I²C module: the ball moves a cursor on the phone, its contact gives both
mouse buttons, and its RGBW LED shows the battery level.

**The module has a single contact**, and three gestures depend on it.
**Movement** is what tells them apart.

| What you do | What happens |
|---|---|
| You move the ball before `RIGHT_CLICK_MS` | The left button goes down → **drag**, until release |
| You do not move until the threshold | **Right click**, sent at once, finger still down |
| You release before the threshold without moving | **Left click** |

The left click can only fire on release: as long as the finger is down and the
threshold is not reached, nothing distinguishes a short press from a long press
in progress. The right click, on the other hand, fires **as the threshold is
crossed**, the way a touch interface behaves.

**You have to start moving within the delay** to get a drag. Press, wait, then
move gives a right click followed by an ordinary pointer move. That is the price
of fitting three gestures onto one contact.

`DRAG_THRESHOLD` sets the distance to travel before a hold becomes a drag. A
ball is sensitive and a resting finger nudges it: too low, and your right clicks
turn into accidental drags.

| Module pin | To |
|---|---|
| SDA | **D2** |
| SCL | **D3** |
| 5V (or 3V3) | **5V** |
| GND | **GND** |

The module is rated for 3.3 V **and** 5 V: it connects straight to the board, no
level shifter. An onboard microcontroller reads the click and drives the four
LEDs, exposing everything on the bus — **so the trackball costs no pin beyond
the two of the I²C bus**.

The bus runs at 100 kHz, `Wire`'s default. Do not speed it up: the manufacturer
rates the module at 250 kHz maximum.

**What its LED says**

| State | Colour |
|---|---|
| Battery ≥ `BATT_GREEN_PCT` | green |
| Between the two thresholds | amber, by linear fade |
| Battery ≤ `BATT_RED_PCT` | red |
| Screen off | same hue, heavily dimmed |
| App silent **or** USB link down | **off** |

Going dark wins over dimming. When the app falls silent, the percentage the
board holds is minutes old: this build never asserts what it can no longer
answer for, and the same rule silences the button LED's battery alert.

**Without the module**, the identification probe fails at startup and the
trackball is never polled. Everything else — button, encoder, LED, serial link —
works exactly the same. That absence is a test case in its own right, not a
degraded mode.

**`POINTER_GAIN` is the one setting to make on the bench.** It multiplies the
ball's raw displacement. Too low and the cursor crawls; too high and it jumps.
The displacement is clamped to ±127 per report regardless, a bound imposed by
the mouse API.

### Identifying the button's 4 wires with a multimeter

Multimeter on **continuity** (the 🔊 symbol, which makes the meter beep when the
two probes are electrically joined):

1. Test the wires pair by pair **without pressing** the button. None should
   beep.
2. Press the button and test again. The pair that beeps is the **contact**.
   Those two wires go to D5 and GND, either way round.
3. The two remaining wires are the **LED**. Switch the meter to **diode** mode
   (the ▷| symbol) and test them both ways: the direction in which the LED glows
   faintly gives the polarity. The red probe is then on the anode (+, to D9), the
   black one on the cathode (−, to GND).

If step 3 gives nothing, the meter's test voltage is too low for the LED. Power
it carefully instead through a 330 Ω resistor from the board's 5 V, trying both
directions: at that value there is no risk.

## Building and uploading

```sh
arduino-cli compile --fqbn arduino:avr:leonardo screen_wake
arduino-cli upload  --fqbn arduino:avr:leonardo -p /dev/ttyACM0 screen_wake
```

`/dev/ttyACM0` belongs to the `dialout` group. To upload without `sudo`:

```sh
sudo usermod -aG dialout $USER    # then log out and back in
```

Dependencies: the `arduino:avr` core and the `HID-Project` library (NicoHood).

### If the upload fails

```
Error: butterfly_recv(pgm, &c, 1) failed
Error: initialization failed  (rc = -1)
```

An **intermittent** failure, seen once and gone on the second attempt with no
change at all. Re-running the command is usually enough.

The mechanism: to upload, `arduino-cli` opens the port at 1200 baud, which
restarts the board into its Caterina bootloader. That bootloader re-enumerates
as `idProduct=0036` and waits only **8 seconds** before handing back to the
sketch. The error above means avrdude opened the port but received nothing
during that window.

Prime suspect, unconfirmed: ModemManager is running and udev marks the port
`ID_MM_CANDIDATE=1`. Every time the bootloader appears, ModemManager may open it
to send AT commands, which garbles the AVR109 protocol. It is a race, hence the
intermittence. To rule it out for good:

```sh
sudo tee /etc/udev/rules.d/99-arduino-no-modemmanager.rules >/dev/null <<'EOF'
SUBSYSTEM=="usb", ATTR{idVendor}=="2341", ENV{ID_MM_DEVICE_IGNORE}="1"
EOF
sudo udevadm control --reload-rules
```

To watch the sequence live (membership of `adm` is enough, root is not needed):

```sh
journalctl -k --since "5 min ago" | grep -iE "usb|cdc_acm"
```

### Checking that the firmware is running

Without pressing anything, you can confirm the board really exposes the Power
key. The kernel parses the HID descriptor and publishes the codes the device
declares it can emit:

```sh
grep -A6 "Arduino" /proc/bus/input/devices
```

The current firmware exposes **two** devices: a generic entry — the Power,
volume and mute keys — and a `Mouse` entry, added for the trackball.

**The distinguishing criterion changed when the trackball arrived.** Seeing
`Mouse` no longer signals anything wrong: it is now expected. Seeing `Keyboard`
**as well**, on the other hand, betrays the stock factory firmware, which
exposed mouse *and* keyboard while never exposing a single media key. So the
call goes:

| What you see | What is running |
|---|---|
| A generic entry **and** `Mouse` | the current firmware |
| `Mouse` **and** `Keyboard` | the stock factory firmware — the upload did not take |
| A generic entry alone | a firmware predating the trackball |

The check that depends on none of these subtleties remains the best one: the
kernel publishes the codes the device declares it can emit, and `KEY_POWER`
(code 116) must be among them.

## What the LED says

Since the sketch reads the lines sent by the Android app (`led_state.h`,
function `ledLevel()`), the LED no longer reflects the state of the USB bus but
what the app reports. The order below is a priority order, not a list of
independent states: each row masks all the ones that follow.

| Priority | Condition | LED | What it means |
|---|---|---|---|
| 1 | Button or wheel press | Off, 120 ms | The key has just gone out (confirmation) |
| 2 | USB link absent | Off | OTG has dropped, or the rig has lost power |
| 3 | Android app silent | Blinks at 4 Hz | No line received for 15 s, or ever |
| 4 | Low battery reported | Two sharp flashes, every 5 s | Below 15 %, until back above 20 % (hysteresis) |
| 5a | Screen reported on | Steady glow | — |
| 5b | Screen reported off | Slow breathing, ~4 s | — |

The breathing does not peak exactly at the steady glow's level: integer
truncation of the squared triangular ramp (`breatheLevel()` in `led_state.h`)
caps the real peak at 23 when `LED_AWAKE`/`BREATHE_CEIL` are 24 — one PWM step,
invisible to the eye, and never more than that. The more active the screen, the
brighter and steadier the light.

The battery alert (priority 4) overlays state 5 but never a higher state: it
stays silent while the app is silent (priority 3), because a reading that can no
longer be guaranteed fresh must assert nothing about the battery.

Press confirmation is a **blackout** rather than a flash, because a dark gap is
noticeable from any state — including at the top of the breathing cycle or
mid-battery-flash, where a flash would go unnoticed.

Both buttons trigger it — the wake button and the wheel's click — because it
means "a key has just gone out", not "the screen has toggled". **Volume steps
are excluded**: a fast rotation would strobe the LED, and the confirmation would
become background noise rather than a signal.

### The board's TX/RX LEDs are off on purpose

Not through a fault. The Arduino core blinks them on every USB packet; with the
app reporting several times a second, that gives a permanent flicker nobody
reads. `silenceUsbLeds()` switches both pins back to inputs at startup, which
cuts the current through the LEDs without touching anything else.

It is the **direction register** that is changed, not the output: the core keeps
writing the port bits from its USB interrupt, and a pin set as an input ignores
them. It arms them as outputs only once, in `USBDevice.attach()`, which runs
before `setup()` — hence the window to undo its work.

Removing the call in `setup()` is enough to get them back. The board's "L" LED
(pin 13) is not affected.

### Where this information comes from

No longer the USB bus. This section used to describe a correlation between the
bus's suspend state (`USBDevice.isSuspended()`) and the phone's screen —
approximate and not guaranteed. The source is now explicit: the Android app
(`ReporterService`) watches the screen itself (`ACTION_SCREEN_ON` /
`ACTION_SCREEN_OFF` broadcasts) and the battery (`BatteryManager`), and reports
the real state line by line over that same serial port, every 5 s or immediately
on each screen toggle. The line format, the exact cadence and the reasoning
behind each choice are documented in `android/README.md` rather than duplicated
here.

The three functions below are still used in `screen_wake.ino`, but for a
narrower role than before: none of them serves to guess the screen state any
more, since the app now states it explicitly.

| Function | Current role |
|---|---|
| `USBDevice.configured()` | Feeds priority 2 of the table above (USB link present or not); also guards the keep-alive |
| `USBDevice.isSuspended()` | Decides whether `togglePhoneScreen()` must wake the bus before sending the key; same guard as above in the keep-alive |
| `USBDevice.wakeupHost()` | Wakes the bus, called only from `togglePhoneScreen()` |

`wakeupHost()` is only ever called on a real press, never automatically:
triggering it from the keep-alive would wake the phone every five minutes, night
included.

## Tuning points

Three files share the settings: the LED's vocabulary is in
`screen_wake/led_state.h`, the behaviour of the physical inputs in
`screen_wake/controls.h`, and the link's own timings at the top of
`screen_wake/screen_wake.ino`.

In `led_state.h`:

| Constant | Role |
|---|---|
| `LED_AWAKE` | Steady-glow intensity, 0-255. Also caps the breathing and serves as the blink's high level |
| `BREATHE_FLOOR` | Darkest point of the breathing cycle |
| `BREATHE_CEIL` | Nominal breathing ceiling, an alias of `LED_AWAKE` — never reached exactly (see above) |
| `BREATHE_MS` | Duration of one full breathing cycle |
| `BLINK_MS` | Half-period of the 4 Hz blink (app silent) |
| `BLACKOUT_MS` | Duration of the confirmation blackout |
| `APP_TIMEOUT_MS` | Time without a received line before declaring the app silent |
| `BATT_LOW_PCT` / `BATT_CLEAR_PCT` | Low/high thresholds of the battery hysteresis |
| `BATT_PERIOD_MS` | Period of the battery alert's two flashes |
| `BATT_FLASH_LEVEL` / `BATT_FLASH_MS` / `BATT_FLASH_GAP_MS` | Intensity, duration and spacing of each flash |
| `RX_BUF` | Maximum length of a serial line; beyond it, the line is truncated and rejected |

In `controls.h`:

| Constant | Role |
|---|---|
| `DEBOUNCE_MS` | Debounce, shared by both buttons; raise it if one press fires twice |
| `STEPS_PER_DETENT` | Quadrature transitions per detent. **If one detent changes the volume by two steps, set 2 instead of 4** |

In `trackball.h`:

| Constant | Role |
|---|---|
| `POINTER_GAIN` | Multiplier on the ball's displacement. **The only setting that needs the module in hand** |
| `RIGHT_CLICK_MS` | Press duration beyond which the click becomes a right click. Raise it if a hesitant press fires one unintentionally |
| `DRAG_THRESHOLD` | Distance to travel, in raw steps summed over both axes, for a hold to become a drag. Raise it if a resting finger starts accidental drags |
| `POINTER_MAX` | `127`, the bound imposed by `Mouse.move`; do not raise |
| `LED_FULL` | RGBW intensity with the screen on, capped low out of power caution |
| `LED_DIMMED` | RGBW intensity with the screen off |
| `BATT_GREEN_PCT` / `BATT_RED_PCT` | Bounds of the green → red gradient |

In `screen_wake.ino`:

| Constant | Role |
|---|---|
| `KEY_HOLD_MS` | Simulated press duration; stay below 500 ms |
| `RESUME_MS` | Delay after `USBDevice.wakeupHost()` before sending the key, time for the bus to settle |
| `KEEPALIVE_MS` | Interval of the empty HID report (see below) |

`STEPS_PER_DETENT` is the rig's one hardware unknown. Most EC11s emit four
transitions between two detents, some emit two. One turn of the wheel on the
bench settles it in ten seconds.

Volume steps deliberately escape `KEY_HOLD_MS`: holding each key for 60 ms would
cap a rotation at sixteen steps per second, and the firmware would spend that
time in `delay()` missing encoder transitions.

The whole breathing range fits in 22 PWM steps between `BREATHE_FLOOR` and
`LED_AWAKE`. If it looks jerky at the bottom, raise `LED_AWAKE` to give it more
amplitude — at the cost of power draw.

## Checking from a host machine, without the phone

Two tools exercise the firmware without unrolling the whole hardware protocol.

### Host tests: `make -C test test`

```sh
make -C test test
```

Compiles and runs **two** suites with `g++` (`-std=c++17 -Wall -Wextra
-Werror`, see `test/Makefile`), which share the `test/check.h` assertion
harness:

| Suite | Covers |
|---|---|
| `test_led_state.cpp` ← `led_state.h` | LED priorities, battery hysteresis, serial line format |
| `test_controls.cpp` ← `controls.h` | quadrature decoding, detent counting, debounce of both buttons |

Neither touches hardware: pin mapping, PWM, USB enumeration and HID behaviour
can only be verified with the board in hand.

The controls suite was validated by mutation: altering any one of the sixteen
entries in the quadrature table, the detent divider or the debounce window makes
at least one assertion fail. A test that passes just as well with the code as
without it proves nothing, and that table is exactly the kind of place where you
notice too late.

### Replaying the app's lines: `tools/inject.py`

```sh
tools/inject.py 1 87        # one line, screen on, battery 87 %
tools/inject.py --hold 0 14 # the same line every 5 s, until Ctrl-C
tools/inject.py --silent    # opens the port and says nothing
```

Sends to `/dev/ttyACM0` (`--port` to change) exactly the lines `ReporterService`
would send — see `android/README.md` for the real format and cadence — with no
need for the phone or the app. `--silent` reproduces an app killed by the OEM's
power manager: the LED must start blinking at 4 Hz after 15 s, as in the table
above. Requires `pyserial` (`pip install pyserial`) and access to the port (see
the `dialout` note above).

## Known limitations

**Some OEM skins drop OTG after ~10 minutes of inactivity** — measured on MIUI.
The sketch sends an all-zero HID report every 5 minutes: real USB traffic, no
key pressed. How well that counter-measure holds up has not been validated in
the field. If the link drops anyway, look for an OTG option in the phone's
settings, or go back to a powered hub.

**Do not test the button while the Arduino is plugged into a computer.** Once
the sketch is uploaded, the board is an HID device to *any* host: a press will
send the Power key to the computer and put it to sleep or shut it down. Unplug
from the computer before wiring the button.

## If the phone ignores the key

Two fallbacks, to try in this order if `Consumer.press(CONSUMER_POWER)` is not
enough:

1. `System.write(SYSTEM_WAKE_UP)` — HID *Generic Desktop* usage 0x83,
   translated into `KEY_WAKEUP`. Turns the screen on but never off. Needs
   `System.begin()` in `setup()`.
2. `SingleConsumer` instead of `Consumer` — same key, but exposed on a dedicated
   HID interface rather than inside the composite descriptor. Some hosts cope
   better with it.
