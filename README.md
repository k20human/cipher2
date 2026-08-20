# cyberdeck

A handheld cyberdeck built around an Android phone: a lit pushbutton wakes its
screen, a rotary encoder sets the volume, a trackball moves a cursor, and the
phone's home screen is replaced by **CIPHER-2**, a landscape HUD served by the
phone to itself.

Three subsystems, each in its own directory, each with its own README.

```
                    USB HID (Power, volume, mute, mouse)
        ┌──────────────────────────────────────────────────┐
        │                                                  ▼
  ┌───────────┐                                    ┌───────────────┐
  │  Arduino  │                                    │    Android    │
  │  32U4     │◄───────────────────────────────────│    phone      │
  └───────────┘   USB serial "S<0|1> B<0..100>"    └───────────────┘
     button                (screen, battery)          │         ▲
     encoder                                          │ HTTP    │
     trackball                                        ▼ on 127.0.0.1
     button LED                                    ┌───────────────┐
                                                   │  CIPHER-2 PWA │
                                                   │  + Python API │
                                                   └───────────────┘
```

The board and the phone talk over one USB cable, in both directions at once but
for unrelated purposes:

- **Board → phone**, as a USB HID device: the Power key wakes and sleeps the
  screen, the volume and mute keys follow the encoder, and mouse reports follow
  the trackball. To the phone this is indistinguishable from its own buttons.
- **Phone → board**, as a USB serial device: the companion app reports screen
  state and battery level, one line every 5 seconds, so the button's LED can
  show them. Silence is information too — 15 s without a line and the LED starts
  blinking.

The interface never touches the network. Both the file server and the status
API listen on `127.0.0.1` only, and the page holds no language model and makes
no outbound request.

## Subsystems

| Directory | What it is | Read |
|---|---|---|
| `arduino/` | The `screen_wake` sketch: wake button, EC11 encoder, PIM447 trackball, button LED driven by what the phone reports. Host-side test suites in `arduino/test/`. | [arduino/README.md](arduino/README.md) |
| `android/` | `cyberdeck-reporter`, the companion app: watches the screen and the battery, writes them to the serial port, restarts at boot. | [android/README.md](android/README.md) |
| `gui/` | `CIPHER-2`, the deck's home screen: a PWA served from the phone by a small Python server that also exposes `GET /api/status`. | [gui/README.md](gui/README.md) |

## Hardware

Developed and tested on an Arduino Leonardo driving an Android phone over USB
OTG. The board must have native USB — an Uno or a Nano cannot work — and the
alternatives are listed in [arduino/README.md](arduino/README.md#boards). The
phone side needs Termux and Termux:API, both from F-Droid.

## Quick start

Each subsystem stands on its own; none of them needs the other two to be
verified.

```sh
# Arduino — host test suites, no board required
make -C arduino/test test

# Arduino — build and upload
arduino-cli compile --fqbn arduino:avr:leonardo arduino/screen_wake
arduino-cli upload  --fqbn arduino:avr:leonardo -p /dev/ttyACM0 arduino/screen_wake

# GUI — test suite, no phone required (needs node and python3)
node --test "gui/test/**/*.js"

# GUI — serve locally
gui/serve.sh

# Android — unit tests (needs JDK 21 and the Android SDK)
cd android && ./gradlew test
```

The Arduino sketch can be exercised without the phone: `arduino/tools/inject.py`
replays exactly the lines the Android app would send, including the silence that
puts the LED into its fault blink.

## Licence

MIT — see [LICENSE](LICENSE).
