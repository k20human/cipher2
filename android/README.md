# cyberdeck-reporter

Companion app for the `arduino/screen_wake` rig: it tells the board what the
phone is doing (screen on or off, battery level), so the button's LED can show
it. The protocol is one-way — the app talks, the board listens — the opposite
direction from the Power key the button sends to the phone.

## What each component does

| File | Role |
|---|---|
| `ReporterService` | The real work. A *foreground* service that listens for `ACTION_SCREEN_ON`/`ACTION_SCREEN_OFF`, polls the battery and writes one line every 5 s to the serial port. |
| `MainActivity` | Diagnostic screen: service state, link state, last line sent and its age, plus the two **Start reporting** / **Stop reporting** buttons. Holds no serial connection of its own. |
| `BootReceiver` | Restarts the service at boot (`BOOT_COMPLETED`), provided the OEM allows it — see below. |
| `SerialLink` | Opens the USB serial port and writes bytes to it. Has never heard of screens or batteries: `ReporterService` carries all the domain knowledge. |
| `Protocol` | Formats a line. A pure function, no Android dependency. |

`ReporterService` runs in the *foreground* (with a permanent notification)
because `ACTION_SCREEN_ON`/`ACTION_SCREEN_OFF` can no longer be declared in the
manifest since API 26: only a live component can register them dynamically, and
an ordinary (non-foreground) service would be killed by the system within
minutes. The permanent notification is the price of that constraint, not a
comfort choice.

## The protocol it sends

One text line per event, formatted by `Protocol.line()`:

```
S<0|1> B<0..100>\n
```

| Field | Meaning |
|---|---|
| `S0` / `S1` | Screen off / on |
| `B<pct>` | Battery in %, clamped to [0, 100] by `Protocol.line` — a guard so no number the firmware would reject ever goes on the wire, not the "unknown level" policy (see below) |

Cadence:

- **Every 5 s** (`HEARTBEAT_MS`): an unconditional heartbeat, screen on or off.
- **Immediately** on each screen transition (`ACTION_SCREEN_ON` /
  `ACTION_SCREEN_OFF`), without waiting for the next heartbeat.

That heartbeat carries a double load: it transmits the current state, and its
absence is the board's only way of knowing the app has died. 15 s of silence
(`APP_TIMEOUT_MS` in `arduino/screen_wake/led_state.h`) puts the LED into its
4 Hz fault blink.

The battery is polled at heartbeat time
(`BatteryManager.getIntProperty(BATTERY_PROPERTY_CAPACITY)`), not watched by a
second receiver: a change in percentage therefore takes up to 5 s to be
reported rather than being instant. Accepted, because the only consumer of that
value on the board side is a threshold alert (`BATT_LOW_PCT`/`BATT_CLEAR_PCT`),
not a real-time display.

### When the level is unknown

`getIntProperty` does not return -1 on failure but `Integer.MIN_VALUE`. Clamped,
that gives `B0`: the board reads it as a critical battery, arms its alert and —
through hysteresis — holds it until it receives a value above 20 %. A failed
reading would therefore raise a lasting false alarm on a perfectly charged
phone.

So `ReporterService` keeps the **last credible value** (the one within `0..100`)
and repeats it until it gets a better one. Before any valid reading it announces
50 %: any value above `BATT_CLEAR_PCT` would be just as safe, but 50 reads as
the placeholder it is — 100 would assert a full charge that was never measured,
and 0 would be exactly the fault being avoided here. In practice that 50 only
goes on the wire if the very first reading fails, the first heartbeat happening
as early as `onCreate`.

If the port is not open at heartbeat time (board unplugged, USB permission not
granted yet), that same heartbeat reschedules itself 3 s later
(`RECONNECT_MS`) instead of the usual 5 s — never in addition to the normal
heartbeat: exactly one callback is pending at any moment, including right after
a screen toggle, which triggers an immediate report but reschedules nothing
itself. The 5 s rhythm resumes as soon as a report succeeds.

### Where all this runs

Everything touching the serial port runs on a dedicated `HandlerThread`
(`reporter-serial`), never on the main thread. `SerialLink.open()` chains two
USB control transfers, and the library grants them **5 s each** (the 500 ms
`WRITE_TIMEOUT_MS` covers data writes only): a board that accepts the interface
claim but answers no control request — the exact state of a 32U4 board
re-enumerating after an upload — blocks the caller for ten seconds. On the main
thread that is an ANR; and an app in ANR is precisely what an aggressive OEM
power manager kills, so the failure would attack the very property this service
exists to defend.

`onReceive` stays on the main thread, but does only two things there: note the
screen state (a `@Volatile` field) and post the report to the worker. The posted
report is a single-use `Runnable` that reschedules nothing — the heartbeat
remains the only scheduler, so a screen toggle cannot start a second chain of
heartbeats. Since both share the same queue, they never run in parallel:
`SerialLink` needs no lock.

On shutdown, `onDestroy` removes the pending heartbeat, posts the port close to
the worker, then calls `quitSafely()` — so the close happens on the thread that
opened the port, behind any report still in flight, instead of racing it from
the main thread.

## Diagnostic screen

`MainActivity` shows three lines, refreshed twice a second while the screen is
visible:

```
service   : running
link      : port open
last line : S1 B87   2s ago
```

| Line | What it says |
|---|---|
| `service` | `running` as soon as `ReporterService.onCreate` has run, `stopped` otherwise |
| `link` | `port open`, or the exact reason for the last failure to open: `no USB permission yet; replug the board`, `no Arduino found on the bus`, `openDevice returned null`, `write failed -- board unplugged?` |
| `last line` | The last line actually written to the port, and how long ago |

The age of the last line is what tells a live heartbeat from a frozen one: the
screen and the battery rarely change, so the text of the line itself does not
move.

The most likely silent failure — USB permission never granted, so `open()`
failing every 3 s indefinitely — reads straight off this screen. Before, it left
only a warning in `logcat`, out of reach on a phone whose single USB port is
taken by the board.

The activity **polls** these values rather than subscribing to them: a dead
service sends no notification, and the absence of a notification would look
exactly like a service with nothing to say.

## Required OEM settings

Tested on MIUI, but the problem is not specific to it: OEM Android skins —
MIUI, One UI, EMUI, ColorOS and others — routinely stop apps of this kind,
foreground service or not. No endurance measurement has been made here, so no
delay is claimed. What is certain: without the three settings below,
`BootReceiver` never receives `BOOT_COMPLETED`. None of them can be set from
code — the OEM treats them as explicit user choices.

The menu paths below are MIUI's; other skins have equivalents under similar
names.

| Setting | Path | Why |
|---|---|---|
| **Autostart** | Settings → Apps → Cyberdeck Reporter → Autostart | Without it, the OEM blocks the `BOOT_COMPLETED` broadcast to `BootReceiver` — the service never restarts after a reboot, even with correct code. |
| **Battery saver: No restrictions** | Same screen | The OEM has its own power manager, independent of Android's: even a foreground service with a visible notification can be stopped if the app stays in the default restricted profile. |
| **Lock the recents thumbnail** | Recents screen → drag the app's thumbnail down → padlock icon | Prevents the "swipe to close" gesture in recents, which bypasses Android's normal lifecycle and kills the service without going through `onDestroy()`. |

## Building and installing

```bash
export JAVA_HOME=/path/to/jdk-21          # see below
cd android
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

`-r` reinstalls over an existing version without wiping data — useful when
iterating, so the OEM settings above are not lost on every install.

The SDK location goes in `android/local.properties`, which is not tracked:

```properties
sdk.dir=/path/to/Android/Sdk
```

### Which JDK actually works

`JAVA_HOME` must point at a **JDK 21** (Temurin 21 was used here). A Java 25
JDK does not work: Gradle 8.14's bundled Kotlin DSL compiler raises
`IllegalArgumentException: 25.0.3` in `JavaVersion.parse` as early as `gradle
wrapper`, before the Android plugin is even consulted. This matters in practice
because JetBrains IDEs ship a JBR that may well be Java 25, and pointing
`JAVA_HOME` at it is the obvious mistake. JDK 21 compiles the project with no
adjustment.

### A note on `buildToolsVersion`

`app/build.gradle.kts` pins `buildToolsVersion = "35.0.1"`. That setting does
**not** align the version of aapt2 (the resource compiler) used by the build
with the one in the SDK's `build-tools/35.0.1/` directory. AGP resolves its own
packaging aapt2 as a Maven dependency
(`com.android.tools.build:aapt2:<AGP version>-<build number>`), locked to the
AGP version, never read from an SDK `build-tools/` directory — behaviour
confirmed by inspecting the AGP 8.7.3 jar itself (class `Aapt2FromMaven`, which
builds the Maven coordinate from its own plugin version and a build number
embedded in `aapt2_version.properties`, without ever referencing
`buildToolsVersion`).

What the pin actually does, and all it does: without it, AGP falls back to its
default build-tools version and installs it into the local SDK silently, if the
licence has already been accepted — observed on this project, where an unpinned
build installed `build-tools 34.0.0` unasked. Pinning a version that is already
present removes that automatic install cycle. It is a guard on the state of the
local SDK, not an aapt2 alignment.

## Wireless debugging

The rig occupies the phone's only USB port during verification: there is no way
to plug an `adb` cable in at the same time. Android 11's wireless debugging lets
you follow the logs without unplugging the rig.

```bash
adb pair <ip>:<port>        # code shown on the phone
adb connect <ip>:<port>
adb logcat -s ReporterService SerialLink
```

The phone shows the IP, the port and the pairing code under Settings →
Developer options → Wireless debugging. Phone and workstation must be on the
same Wi-Fi network.

## Tests

Only `Protocol` is covered by JVM tests (`ProtocolTest`, 4 cases: screen on,
screen off, clamp high, clamp low) — it is the module's only class with no
dependency on the Android framework. `SerialLink`, `ReporterService` and
`BootReceiver` touch USB, system broadcasts or the OEM lifecycle: they can only
be verified with the phone and the board in hand, rig plugged in, the OEM
settings above applied, watching the LED (priority table in
`arduino/README.md`).

```bash
./gradlew test
```
