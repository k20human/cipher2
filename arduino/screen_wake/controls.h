/*
  Pure decision logic for the physical controls: turning raw pin samples into
  discrete input events. No Arduino API, no pin access, no USB -- everything
  here is a function of booleans, integers and time, which is what makes it
  testable on the host with plain g++.

  Two primitives live here because both buttons on this rig need the same
  debounce, and duplicating that block was the alternative.
*/
#pragma once

#include <stdint.h>

// Every button on this rig is wired to ground and read with the internal
// pull-up, so a press reads LOW.
static const uint32_t DEBOUNCE_MS = 30;

// An EC11 usually emits four quadrature transitions between detents; some
// emit two. If one click of the knob moves the volume by more than one step,
// this is the number to change.
static const int8_t STEPS_PER_DETENT = 4;

// ---------------------------------------------------------------- debounce

struct Debounce {
  bool     stable;      // the level we have accepted as settled
  bool     lastRead;    // the level of the previous sample
  uint32_t lastEdgeMs;  // when the raw sample last changed
};

inline Debounce debounceInit(bool high, uint32_t nowMs) {
  Debounce d;
  d.stable = high;
  d.lastRead = high;
  d.lastEdgeMs = nowMs;
  return d;
}

// Feed one raw sample. Returns true exactly once per press, at the moment the
// low level has held still for DEBOUNCE_MS. Releases return false: callers
// want the press edge, and reporting both would make every caller filter.
inline bool debouncePressed(Debounce& d, bool high, uint32_t nowMs) {
  if (high != d.lastRead) {
    d.lastRead = high;
    d.lastEdgeMs = nowMs;
    return false;
  }
  if (high == d.stable || nowMs - d.lastEdgeMs < DEBOUNCE_MS) {
    return false;
  }
  d.stable = high;
  return !high;
}

// --------------------------------------------------------------- quadrature

struct Encoder {
  uint8_t prevState;    // last AB pair, 0..3
  int8_t  accumulated;  // transitions banked since the last whole detent
};

inline Encoder encoderInit(bool a, bool b) {
  Encoder e;
  e.prevState = (uint8_t)((a ? 2 : 0) | (b ? 1 : 0));
  e.accumulated = 0;
  return e;
}

// Indexed by (previous AB << 2) | current AB. The zeros on the diagonal are
// samples where nothing moved; the zeros where both bits flip are transitions
// a real encoder cannot make, so they are noise and are dropped rather than
// counted in whichever direction the arithmetic happened to favour.
static const int8_t QUADRATURE[16] = {
   0, -1,  1,  0,
   1,  0,  0, -1,
  -1,  0,  0,  1,
   0,  1, -1,  0
};

// Feed one sampled pin pair. Returns -1, 0 or +1 whole detents. Sub-detent
// movement is banked, so nudging the knob without reaching a click -- or
// reaching one and coming back -- changes nothing.
inline int8_t encoderFeed(Encoder& e, bool a, bool b) {
  const uint8_t curr = (uint8_t)((a ? 2 : 0) | (b ? 1 : 0));
  const int8_t step = QUADRATURE[(e.prevState << 2) | curr];
  e.prevState = curr;

  if (step == 0) {
    return 0;
  }
  e.accumulated = (int8_t)(e.accumulated + step);

  if (e.accumulated >= STEPS_PER_DETENT) {
    e.accumulated = (int8_t)(e.accumulated - STEPS_PER_DETENT);
    return 1;
  }
  if (e.accumulated <= -STEPS_PER_DETENT) {
    e.accumulated = (int8_t)(e.accumulated + STEPS_PER_DETENT);
    return -1;
  }
  return 0;
}
