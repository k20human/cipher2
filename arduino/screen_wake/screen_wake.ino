/*
  cyberdeck / screen_wake

  A momentary button on an ATmega32U4 board (Arduino Leonardo / Pro Micro).
  The board enumerates on the phone as a USB HID consumer-control device and
  sends the Power key. Android maps that to KEY_POWER, which carries the WAKE
  flag in the default key layout, so a press behaves like the phone's own
  power button: screen on if off, off if on.

  The companion Android app reports the phone's screen and battery over the
  serial port; the LED shows what it says. All decision logic lives in
  led_state.h, which builds on the host and is tested there.

  A rotary encoder rides alongside: turning it steps the phone's volume,
  pressing it mutes. Both are the same Consumer keys the wake button uses.

  A Pimoroni PIM447 trackball hangs off the I2C bus. The ball moves a pointer,
  and its single contact carries three gestures: a short press is a left click,
  a hold is a right click, and pressing then rolling is a drag. Its RGBW ring
  shows the battery level. Its chip ID is the presence test, so a rig without
  one behaves unchanged.

  Wiring (every button and encoder input uses the internal pull-up, no
  external resistor):
    button contact   -> D5 and GND
    LED anode        -> D9 via 150 ohm
    LED cathode      -> GND
    encoder A        -> D7
    encoder common   -> GND
    encoder B        -> D8
    encoder switch   -> D4 and GND
    trackball SDA    -> D2
    trackball SCL    -> D3
    trackball power  -> 5V and GND

  D2 and D3 carry the ATmega32U4's only hardware I2C bus, which is why the
  wake button lives on D5 rather than where it started.

  Build and upload:
    arduino-cli compile --fqbn arduino:avr:leonardo screen_wake
    arduino-cli upload  --fqbn arduino:avr:leonardo -p /dev/ttyACM0 screen_wake
*/

#include <HID-Project.h>
#include <Wire.h>

#include "controls.h"
#include "led_state.h"
#include "trackball.h"

static const uint8_t PIN_BUTTON = 5;
static const uint8_t PIN_LED    = 9;  // must stay on a PWM pin
static const uint8_t PIN_ENC_A  = 7;  // INT6, if polling ever proves too slow
static const uint8_t PIN_ENC_B  = 8;  // PCINT4, likewise
static const uint8_t PIN_ENC_SW = 4;

static const uint16_t KEY_HOLD_MS = 60;  // far below Android's 500 ms long-press
static const uint16_t RESUME_MS   = 50;  // settling time after a remote wakeup

// Some OEM skins drop the OTG link after roughly ten minutes without traffic
// (measured on MIUI). An
// all-zero HID report presses nothing and keeps the bus from going idle. The
// app's own chatter covers this too, but only while the app is alive.
static const uint32_t KEEPALIVE_MS = 300000UL;

static Debounce wakeButton;
static Debounce encoderButton;
static Encoder  encoder;

static uint32_t lastTrafficMs  = 0;
static uint32_t blackoutStart  = 0;
static bool     blackoutActive = false;

static char     rxLine[RX_BUF];
static uint8_t  rxLen        = 0;
static uint32_t lastReportMs = 0;
static bool     everHeard    = false;
static bool     screenOn     = false;
static bool     batteryLow   = false;
static uint8_t  batteryPct   = 0;

static bool     trackballPresent = false;
static Rgbw     lastColour       = {0, 0, 0, 0};
static uint32_t lastTrackballMs  = 0;
static ClickDetector ballClick;

// Held briefly so the host sees a deliberate tap rather than a glitch, but far
// short of Android's long-press threshold.
static void sendKey(ConsumerKeycode key) {
  // A suspended bus swallows reports. Reopen the link first, then send the key.
  if (USBDevice.isSuspended()) {
    USBDevice.wakeupHost();
    delay(RESUME_MS);
  }
  Consumer.press(key);
  delay(KEY_HOLD_MS);
  Consumer.release(key);
}

// Volume steps arrive as fast as the knob turns, so they skip the hold above:
// 60 ms of delay per detent would cap a turn at sixteen steps a second and,
// worse, the loop would sit in delay() missing encoder transitions.
static void sendVolumeStep(bool up) {
  Consumer.write(up ? MEDIA_VOLUME_UP : MEDIA_VOLUME_DOWN);
}

static void confirmWithBlackout() {
  blackoutStart = millis();  // sendKey() blocks, so re-read the clock
  blackoutActive = true;
  lastTrafficMs = blackoutStart;
}

static void pollButtons(uint32_t now) {
  if (debouncePressed(wakeButton, digitalRead(PIN_BUTTON), now)) {
    sendKey(CONSUMER_POWER);
    confirmWithBlackout();
  }
  if (debouncePressed(encoderButton, digitalRead(PIN_ENC_SW), now)) {
    sendKey(MEDIA_VOLUME_MUTE);
    confirmWithBlackout();
  }
}

// No blackout on a volume step: a fast turn would strobe the LED, and the
// confirmation means "a key went out", not "every key went out".
static void pollEncoder() {
  const int8_t detents =
      encoderFeed(encoder, digitalRead(PIN_ENC_A), digitalRead(PIN_ENC_B));
  if (detents > 0) {
    sendVolumeStep(true);
  } else if (detents < 0) {
    sendVolumeStep(false);
  }
}

static void pollSerial(uint32_t now) {
  while (Serial.available()) {
    const char c = Serial.read();
    if (c == '\n' || c == '\r') {
      if (rxLen) {
        rxLine[rxLen] = '\0';
        const Report r = parseReport(rxLine);
        if (r.valid) {
          screenOn     = r.screenOn;
          batteryLow   = updateBatteryLow(batteryLow, r.battery);
          batteryPct   = r.battery;
          lastReportMs = now;
          everHeard    = true;
        }
        rxLen = 0;
      }
      continue;
    }
    // Drop the overflow rather than wrap: a truncated line fails to parse,
    // which is the outcome we want for anything this long.
    if (rxLen < RX_BUF - 1) {
      rxLine[rxLen++] = c;
    }
  }
}

static void serviceKeepalive(uint32_t now) {
  if (now - lastTrafficMs < KEEPALIVE_MS) {
    return;
  }
  lastTrafficMs = now;

  // Nothing to keep alive on a suspended or absent link. Resuming it here
  // would light the phone up unprompted, which is the opposite of the point.
  if (!USBDevice.configured() || USBDevice.isSuspended()) {
    return;
  }
  Consumer.releaseAll();
}

// Reading the chip ID is the presence test. Everything trackball-related is
// skipped when it fails, so the rig works unchanged with no module attached --
// which is how it ships today.
static bool trackballProbe() {
  Wire.beginTransmission(TRACKBALL_ADDR);
  Wire.write(REG_CHIP_ID_L);
  if (Wire.endTransmission() != 0) {
    return false;
  }
  if (Wire.requestFrom((uint8_t)TRACKBALL_ADDR, (uint8_t)2) != 2) {
    return false;
  }
  const uint8_t lo = (uint8_t)Wire.read();
  const uint8_t hi = (uint8_t)Wire.read();
  return (uint16_t)(((uint16_t)hi << 8) | lo) == TRACKBALL_CHIP_ID;
}

// Written only when the colour actually changes: the gradient moves with the
// battery, which is to say almost never, and an I2C write every loop pass
// would saturate the bus for nothing.
static void writeTrackballLed(const Rgbw& c) {
  if (c.r == lastColour.r && c.g == lastColour.g &&
      c.b == lastColour.b && c.w == lastColour.w) {
    return;
  }
  Wire.beginTransmission(TRACKBALL_ADDR);
  Wire.write(REG_LED_RED);
  Wire.write(c.r);
  Wire.write(c.g);
  Wire.write(c.b);
  Wire.write(c.w);
  if (Wire.endTransmission() == 0) {
    lastColour = c;
  }
}

// No blackout on the button LED for any of these: clicking is frequent while
// pointing, and the confirmation would become a strobe rather than a signal.
static void applyClickAction(ClickAction action) {
  switch (action) {
    case CLICK_LEFT:
      Mouse.click(MOUSE_LEFT);
      break;
    case CLICK_RIGHT:
      Mouse.click(MOUSE_RIGHT);
      break;
    case DRAG_START:
      Mouse.press(MOUSE_LEFT);
      break;
    case DRAG_END:
      Mouse.release(MOUSE_LEFT);
      break;
    case CLICK_NONE:
      break;
  }
}

static void pollTrackball(uint32_t now) {
  if (!trackballPresent) {
    return;
  }
  if (now - lastTrackballMs < TRACKBALL_POLL_MS) {
    return;  // see TRACKBALL_POLL_MS: this read would otherwise starve the encoder
  }
  lastTrackballMs = now;

  // Aborting on a failed read is not tidiness: losing the module mid-drag
  // would otherwise leave the left button held down for good.
  Wire.beginTransmission(TRACKBALL_ADDR);
  Wire.write(REG_LEFT);
  if (Wire.endTransmission() != 0) {
    applyClickAction(clickAbort(ballClick));
    return;
  }
  if (Wire.requestFrom((uint8_t)TRACKBALL_ADDR, (uint8_t)5) != 5) {
    applyClickAction(clickAbort(ballClick));
    return;  // a module that went quiet must not move the pointer at random
  }

  uint8_t raw[5];
  for (uint8_t i = 0; i < 5; i++) {
    raw[i] = (uint8_t)Wire.read();
  }
  const BallFrame f = decodeFrame(raw);

  // Settle the gesture before the movement goes out, so a drag grabs from
  // where the button went down rather than a few counts further along.
  applyClickAction(clickFeed(ballClick, f.held, f.dx, f.dy, now));

  const int8_t mx = pointerStep(f.dx);
  const int8_t my = pointerStep(f.dy);
  if (mx != 0 || my != 0) {
    Mouse.move(mx, my);  // silence when still, or the bus floods at loop rate
  }
}

static void updateTrackballLed(bool usbConfigured, bool appAlive) {
  if (!trackballPresent) {
    return;
  }
  writeTrackballLed(batteryColour(batteryPct, usbConfigured && appAlive, screenOn));
}

static void updateLed(uint32_t now) {
  if (blackoutActive && now - blackoutStart >= BLACKOUT_MS) {
    blackoutActive = false;
  }

  LedInputs in;
  in.usbConfigured = USBDevice.configured();
  in.appAlive      = everHeard && (now - lastReportMs < APP_TIMEOUT_MS);
  in.screenOn      = screenOn;
  in.batteryLow    = batteryLow;
  in.blackout      = blackoutActive;
  in.nowMs         = now;

  updateTrackballLed(in.usbConfigured, in.appAlive);
  analogWrite(PIN_LED, ledLevel(in));
}

// The core hangs the TX and RX LEDs off the USB interrupt and pulses them on
// every packet. With the app reporting several times a second that is a
// constant flicker, and this rig lives behind a phone rather than on a bench.
//
// Both sit on pins no header exposes, so pinMode() cannot reach them. Only the
// direction register matters: the core keeps writing the port bits from its
// interrupt handler and an input pin ignores them. It arms these two as
// outputs in USBDevice.attach(), which the core runs before setup(), and never
// again -- so undoing it here holds.
//
// PB0 doubles as the SPI slave-select line. Nothing here uses SPI; a future
// device on that bus would have to take the pin back.
static void silenceUsbLeds() {
  DDRD &= (uint8_t)~(1 << 5);  // TX
  DDRB &= (uint8_t)~(1 << 0);  // RX
}

void setup() {
  pinMode(PIN_BUTTON, INPUT_PULLUP);
  pinMode(PIN_ENC_SW, INPUT_PULLUP);
  pinMode(PIN_ENC_A, INPUT_PULLUP);
  pinMode(PIN_ENC_B, INPUT_PULLUP);
  pinMode(PIN_LED, OUTPUT);
  Serial.begin(115200);
  silenceUsbLeds();
  Consumer.begin();
  Mouse.begin();
  Wire.begin();  // default 100 kHz; the module is rated for 250 kHz at most
  trackballPresent = trackballProbe();

  // Seed from the pins as they actually are. Assuming a resting state would
  // make the first poll look like movement and nudge the volume at power-up.
  const uint32_t now = millis();
  wakeButton = debounceInit(digitalRead(PIN_BUTTON), now);
  encoderButton = debounceInit(digitalRead(PIN_ENC_SW), now);
  encoder = encoderInit(digitalRead(PIN_ENC_A), digitalRead(PIN_ENC_B));
  ballClick = clickInit();
  lastTrafficMs = now;
}

void loop() {
  // Each stage reads the clock itself. pollButtons() blocks while it sends a
  // key, so a timestamp captured once up here would reach updateLed() older
  // than the blackout it is meant to time -- and the unsigned subtraction
  // would wrap rather than go negative, cancelling the blackout outright.
  //
  // The encoder is sampled first because it is the only input with no state
  // machine of its own to survive a missed sample: a dropped transition is a
  // lost detent, where a dropped button sample is simply read again next pass.
  pollEncoder();
  pollTrackball(millis());
  pollButtons(millis());
  pollSerial(millis());
  serviceKeepalive(millis());
  updateLed(millis());
}
