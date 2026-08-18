/*
  Pure decision logic for the Pimoroni PIM447 trackball. No Wire, no HID, no
  pins -- five raw bytes in, a signed movement and a click state out. That is
  what lets the decoding, the clamping and the colour policy be tested on the
  host, which is where they can go wrong silently.
*/
#pragma once

#include <stdint.h>

static const uint8_t  TRACKBALL_ADDR    = 0x0A;
static const uint16_t TRACKBALL_CHIP_ID = 0xBA11;

static const uint8_t REG_LED_RED   = 0x00;
static const uint8_t REG_LED_GREEN = 0x01;
static const uint8_t REG_LED_BLUE  = 0x02;
static const uint8_t REG_LED_WHITE = 0x03;
static const uint8_t REG_LEFT      = 0x04;  // then right, up, down, switch
static const uint8_t REG_CHIP_ID_L = 0xFA;

static const uint8_t MSK_SWITCH_STATE = 0x80;

// Tuned blind: the module is not in hand yet. The hardware protocol carries a
// step for this one number.
static const int16_t POINTER_GAIN = 3;
static const int16_t POINTER_MAX  = 127;  // the limit Mouse.move imposes

struct BallFrame {
  int16_t dx;      // right - left
  int16_t dy;      // down - up, so positive is down as Mouse.move expects
  // Presses counted since the previous read. Deliberately unused by the
  // sketch: a count says nothing about how long each press lasted, and hold
  // length is what picks the mouse button. It is decoded and tested because
  // that is what proves the state bit is not leaking into the count.
  uint8_t clicks;
  bool    held;  // contact state right now, which drives the click gesture
};

// raw is the five bytes read from REG_LEFT: left, right, up, down, switch.
inline BallFrame decodeFrame(const uint8_t raw[5]) {
  BallFrame f;
  f.dx     = (int16_t)raw[1] - (int16_t)raw[0];
  f.dy     = (int16_t)raw[3] - (int16_t)raw[2];
  f.clicks = (uint8_t)(raw[4] & (uint8_t)~MSK_SWITCH_STATE);
  f.held   = (raw[4] & MSK_SWITCH_STATE) != 0;
  return f;
}

// Scale a raw axis delta into something Mouse.move accepts. The clamp is not
// decoration: a brisk roll overflows a signed char, and the wrapped value
// points the other way.
inline int8_t pointerStep(int16_t raw) {
  int32_t scaled = (int32_t)raw * (int32_t)POINTER_GAIN;
  if (scaled > POINTER_MAX) {
    scaled = POINTER_MAX;
  }
  if (scaled < -POINTER_MAX) {
    scaled = -POINTER_MAX;
  }
  return (int8_t)scaled;
}

// The module has one contact and three gestures hang off it, so something has
// to tell them apart. Movement does.
//
//   move before the threshold  -> drag: the left button goes down and stays
//                                 down until the finger lifts
//   stay still past it         -> right click, sent at once with the finger
//                                 still down, the way a touch interface does
//   let go before it, unmoved  -> left click
//
// A left click can only land on release: until the finger lifts there is
// nothing to tell a short press from a long one still in progress. The cost of
// keeping all three on one contact is that a drag must begin with movement --
// pressing, waiting, then moving gives a right click and a plain pointer move.
static const uint32_t RIGHT_CLICK_MS = 400;

// How far the ball must travel, in raw counts summed over both axes, before a
// hold is read as a drag. A ball is sensitive and a resting finger nudges it,
// so this sits above the jitter rather than at it. Tune it on the bench.
static const int16_t DRAG_THRESHOLD = 6;

enum ClickAction : uint8_t {
  CLICK_NONE = 0,
  CLICK_LEFT,   // a complete click
  CLICK_RIGHT,  // likewise
  DRAG_START,   // hold the left button down
  DRAG_END,     // let it up
};

enum ClickPhase : uint8_t {
  PHASE_IDLE = 0,
  PHASE_PRESSED,     // down, and which gesture it will be is still open
  PHASE_DRAGGING,
  PHASE_RIGHT_SENT,  // decided; nothing further until release
};

struct ClickDetector {
  ClickPhase phase;
  uint32_t   pressedAt;
  int16_t    travel;  // counts banked since the press, both axes, unsigned
};

inline ClickDetector clickInit() {
  ClickDetector d;
  d.phase = PHASE_IDLE;
  d.pressedAt = 0;
  d.travel = 0;
  return d;
}

inline int16_t clickAbsCount(int16_t v) {
  return v < 0 ? (int16_t)-v : v;
}

// Feed the contact state and this poll's movement. Returns at most one action.
inline ClickAction clickFeed(ClickDetector& d, bool held, int16_t dx, int16_t dy,
                             uint32_t nowMs) {
  if (!held) {
    const ClickPhase was = d.phase;
    d.phase = PHASE_IDLE;
    if (was == PHASE_PRESSED) {
      return CLICK_LEFT;
    }
    // Nothing to send after a right click: a left click here would dismiss the
    // context menu it just opened.
    return (was == PHASE_DRAGGING) ? DRAG_END : CLICK_NONE;
  }

  if (d.phase == PHASE_IDLE) {
    d.phase = PHASE_PRESSED;
    d.pressedAt = nowMs;  // both the clock and the travel restart here
    d.travel = 0;
    return CLICK_NONE;
  }
  if (d.phase != PHASE_PRESSED) {
    return CLICK_NONE;  // already decided, and it stays decided
  }

  // Movement outranks the clock: this is what makes a drag possible at all.
  // Counts arrive a few at a time, so they have to be banked rather than
  // judged one sample against the threshold.
  d.travel = (int16_t)(d.travel + clickAbsCount(dx) + clickAbsCount(dy));
  if (d.travel >= DRAG_THRESHOLD) {
    d.phase = PHASE_DRAGGING;
    return DRAG_START;
  }
  if (nowMs - d.pressedAt >= RIGHT_CLICK_MS) {
    d.phase = PHASE_RIGHT_SENT;
    return CLICK_RIGHT;
  }
  return CLICK_NONE;
}

// Called when the sketch loses the module mid-gesture. Without it a failed I2C
// read during a drag would leave the left button down for good.
inline ClickAction clickAbort(ClickDetector& d) {
  const ClickPhase was = d.phase;
  d.phase = PHASE_IDLE;
  return (was == PHASE_DRAGGING) ? DRAG_END : CLICK_NONE;
}

// Capped well below full scale: four LEDs sit under the ball, and the whole
// rig runs off the phone's battery through an unpowered hub.
static const uint8_t LED_FULL   = 64;
static const uint8_t LED_DIMMED = 6;

static const uint8_t BATT_GREEN_PCT = 60;  // green at or above
static const uint8_t BATT_RED_PCT   = 20;  // red at or below

struct Rgbw {
  uint8_t r, g, b, w;
};

// trustworthy is false once the app has gone quiet or the USB link has
// dropped: the percentage we still hold is stale, so the LED says nothing
// rather than asserting a number nobody can vouch for. That outranks the
// screen-off dimming -- dark beats faint.
inline Rgbw batteryColour(uint8_t pct, bool trustworthy, bool screenOn) {
  Rgbw c = {0, 0, 0, 0};
  if (!trustworthy) {
    return c;
  }

  const uint8_t scale = screenOn ? LED_FULL : LED_DIMMED;

  if (pct >= BATT_GREEN_PCT) {
    c.g = scale;
    return c;
  }
  if (pct <= BATT_RED_PCT) {
    c.r = scale;
    return c;
  }

  // Linear crossfade across the band. Both channels lit at once is what makes
  // the middle read as amber.
  const uint16_t span  = (uint16_t)(BATT_GREEN_PCT - BATT_RED_PCT);
  const uint16_t above = (uint16_t)(pct - BATT_RED_PCT);
  c.g = (uint8_t)((uint16_t)scale * above / span);
  c.r = (uint8_t)(scale - c.g);
  return c;
}

// The trackball is read on a timer, not every loop pass. A five-byte I2C
// transaction at 100 kHz costs about 0.75 ms, and doing it every pass would
// drag the whole loop down to roughly 1.3 kHz -- which the pointer would not
// notice, but the encoder shares that loop and would be left with only three
// samples per quadrature transition on a brisk spin. Five milliseconds gives
// 200 pointer updates a second, well above the 125 Hz a common USB mouse
// reports at, and hands the encoder its sampling margin back.
static const uint32_t TRACKBALL_POLL_MS = 5;
