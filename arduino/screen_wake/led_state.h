/*
  Pure decision logic for the button LED. No Arduino API, no pin access, no
  USB: everything here is a function of integers and time, which is what makes
  it testable on the host with plain g++.
*/
#pragma once

#include <stdint.h>

static const uint8_t  LED_AWAKE     = 24;
static const uint8_t  BREATHE_FLOOR = 2;
static const uint8_t  BREATHE_CEIL  = LED_AWAKE;
static const uint16_t BREATHE_MS    = 4000;
static const uint16_t BLINK_MS      = 125;
static const uint16_t BLACKOUT_MS   = 120;

static const uint8_t  BATT_FLASH_LEVEL   = 200;
static const uint16_t BATT_FLASH_MS      = 60;
static const uint16_t BATT_FLASH_GAP_MS  = 120;
static const uint16_t BATT_PERIOD_MS     = 5000;
static const uint8_t  BATT_LOW_PCT       = 15;
static const uint8_t  BATT_CLEAR_PCT     = 20;

static const uint32_t APP_TIMEOUT_MS = 15000;
static const uint8_t  RX_BUF         = 32;

// Triangle ramp, squared. The eye responds to light logarithmically, so a
// linear ramp reads as a hard stop at each end rather than a breath.
inline uint8_t breatheLevel(uint32_t nowMs) {
  const uint16_t half  = BREATHE_MS / 2;
  const uint16_t phase = nowMs % BREATHE_MS;
  const uint8_t  tri   = (phase < half) ? (phase * 255UL / half)
                                        : ((BREATHE_MS - phase) * 255UL / half);
  const uint8_t  curve = (uint16_t)tri * tri >> 8;
  return BREATHE_FLOOR + ((uint16_t)curve * (BREATHE_CEIL - BREATHE_FLOOR) >> 8);
}

// Hard 4 Hz square wave. Fast and abrupt reads as a fault, where the slow
// smooth breath reads as normal.
inline uint8_t blinkLevel(uint32_t nowMs) {
  return ((nowMs / BLINK_MS) % 2) ? 0 : LED_AWAKE;
}

struct Report {
  bool    valid;
  bool    screenOn;
  uint8_t battery;
};

// Parses one complete line, "S<0|1> B<0..100>". Anything else yields
// valid=false: a garbled line must never be mistaken for fresh news.
inline Report parseReport(const char* line) {
  Report r = {false, false, 0};

  if (line[0] != 'S') {
    return r;
  }
  if (line[1] != '0' && line[1] != '1') {
    return r;
  }
  if (line[2] != ' ' || line[3] != 'B') {
    return r;
  }

  uint16_t value  = 0;
  uint8_t  digits = 0;
  for (uint8_t i = 4; line[i] != '\0'; i++) {
    if (line[i] < '0' || line[i] > '9') {
      return r;
    }
    value = value * 10 + (line[i] - '0');
    if (++digits > 3) {
      return r;
    }
  }
  if (digits == 0 || value > 100) {
    return r;
  }

  r.valid    = true;
  r.screenOn = (line[1] == '1');
  r.battery  = (uint8_t)value;
  return r;
}

// Hysteresis. Without the dead band between the two thresholds, a charge
// sitting on the line would toggle the alert endlessly.
inline bool updateBatteryLow(bool current, uint8_t battery) {
  if (battery < BATT_LOW_PCT) {
    return true;
  }
  if (battery > BATT_CLEAR_PCT) {
    return false;
  }
  return current;
}

// Two brief pulses per period. Returns 0 outside the pulses, so the caller
// can fall through to whatever the base state wanted to show.
inline uint8_t battFlashLevel(uint32_t nowMs) {
  const uint16_t t = nowMs % BATT_PERIOD_MS;
  if (t < BATT_FLASH_MS) {
    return BATT_FLASH_LEVEL;
  }
  const uint16_t second = BATT_FLASH_MS + BATT_FLASH_GAP_MS;
  if (t >= second && t < second + BATT_FLASH_MS) {
    return BATT_FLASH_LEVEL;
  }
  return 0;
}

struct LedInputs {
  bool     usbConfigured;
  bool     appAlive;
  bool     screenOn;
  bool     batteryLow;
  bool     blackout;
  uint32_t nowMs;
};

// The order below is a priority list, not a style choice. Press confirmation
// must be visible whatever else is happening; a dead link outranks any claim
// about the phone; a silent app outranks a screen state we can no longer
// vouch for, which is also why the battery alert is suppressed there.
inline uint8_t ledLevel(const LedInputs& in) {
  if (in.blackout) {
    return 0;
  }
  if (!in.usbConfigured) {
    return 0;
  }
  if (!in.appAlive) {
    return blinkLevel(in.nowMs);
  }
  if (in.batteryLow) {
    const uint8_t flash = battFlashLevel(in.nowMs);
    if (flash) {
      return flash;
    }
  }
  return in.screenOn ? LED_AWAKE : breatheLevel(in.nowMs);
}
