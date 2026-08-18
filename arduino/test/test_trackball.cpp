#include "trackball.h"

#include "check.h"

// Registers 0x04..0x08 in order: left, right, up, down, switch.
static void test_decode_pure_horizontal() {
  const uint8_t right[5] = {0, 5, 0, 0, 0};
  CHECK(decodeFrame(right).dx == 5);
  CHECK(decodeFrame(right).dy == 0);

  const uint8_t left[5] = {5, 0, 0, 0, 0};
  CHECK(decodeFrame(left).dx == -5);
  CHECK(decodeFrame(left).dy == 0);
}

static void test_decode_pure_vertical() {
  // Down is positive y, matching what Mouse.move expects.
  const uint8_t down[5] = {0, 0, 0, 7, 0};
  CHECK(decodeFrame(down).dy == 7);
  CHECK(decodeFrame(down).dx == 0);

  const uint8_t up[5] = {0, 0, 7, 0, 0};
  CHECK(decodeFrame(up).dy == -7);
  CHECK(decodeFrame(up).dx == 0);
}

static void test_decode_takes_the_difference_not_the_larger() {
  // Both counters of an axis can be non-zero in one sample: the ball wobbled.
  // Reporting the difference is the whole job; reporting either raw counter
  // would move the pointer for movement that cancelled out.
  const uint8_t both[5] = {2, 5, 1, 4, 0};
  CHECK(decodeFrame(both).dx == 3);
  CHECK(decodeFrame(both).dy == 3);

  const uint8_t cancelled[5] = {4, 4, 6, 6, 0};
  CHECK(decodeFrame(cancelled).dx == 0);
  CHECK(decodeFrame(cancelled).dy == 0);
}

static void test_decode_full_scale_counters_do_not_wrap() {
  // Each counter is a byte; the difference needs a wider signed type.
  const uint8_t maxPos[5] = {0, 255, 0, 255, 0};
  CHECK(decodeFrame(maxPos).dx == 255);
  CHECK(decodeFrame(maxPos).dy == 255);

  const uint8_t maxNeg[5] = {255, 0, 255, 0, 0};
  CHECK(decodeFrame(maxNeg).dx == -255);
  CHECK(decodeFrame(maxNeg).dy == -255);
}

static void test_decode_splits_the_switch_byte() {
  // Bit 7 is the current contact state; the low bits count presses since the
  // last read. Mixing them up would click on every poll while held down.
  const uint8_t heldWithClicks[5] = {0, 0, 0, 0, 0x83};
  CHECK(decodeFrame(heldWithClicks).clicks == 3);
  CHECK(decodeFrame(heldWithClicks).held);

  const uint8_t clicksOnly[5] = {0, 0, 0, 0, 0x03};
  CHECK(decodeFrame(clicksOnly).clicks == 3);
  CHECK(!decodeFrame(clicksOnly).held);

  const uint8_t heldOnly[5] = {0, 0, 0, 0, 0x80};
  CHECK(decodeFrame(heldOnly).clicks == 0);
  CHECK(decodeFrame(heldOnly).held);
}

static void test_pointer_step_applies_gain() {
  CHECK(pointerStep(0) == 0);
  CHECK(pointerStep(2) == 2 * POINTER_GAIN);
  CHECK(pointerStep(-2) == -2 * POINTER_GAIN);
}

static void test_pointer_step_clamps_both_ways() {
  // Mouse.move takes a signed char. A brisk roll exceeds it, and an unclamped
  // cast would send the pointer the wrong way instead of merely far.
  CHECK(pointerStep(255) == POINTER_MAX);
  CHECK(pointerStep(-255) == -POINTER_MAX);
  CHECK(pointerStep(1000) == POINTER_MAX);
  CHECK(pointerStep(-1000) == -POINTER_MAX);
}

static void test_pointer_step_just_below_the_clamp_is_untouched() {
  const int16_t justUnder = POINTER_MAX / POINTER_GAIN;
  CHECK(pointerStep(justUnder) == justUnder * POINTER_GAIN);
  CHECK(pointerStep(justUnder) < POINTER_MAX);
}

static void test_colour_is_dark_when_the_reading_is_stale() {
  // The app has gone quiet or the link is down, so the percentage we hold is
  // whatever it was minutes ago. This rig never asserts what it can no longer
  // vouch for -- the same rule that silences the button LED's battery alert.
  for (int pct = 0; pct <= 100; pct += 10) {
    const Rgbw c = batteryColour((uint8_t)pct, false, true);
    CHECK(c.r == 0);
    CHECK(c.g == 0);
    CHECK(c.b == 0);
    CHECK(c.w == 0);
  }
}

static void test_stale_beats_dimmed() {
  // Both conditions can hold at once: screen off AND app silent. Showing
  // nothing outranks showing faintly something we cannot vouch for.
  const Rgbw c = batteryColour(80, false, false);
  CHECK(c.r == 0);
  CHECK(c.g == 0);
}

static void test_colour_is_green_when_full() {
  const Rgbw c = batteryColour(BATT_GREEN_PCT, true, true);
  CHECK(c.g == LED_FULL);
  CHECK(c.r == 0);

  const Rgbw over = batteryColour(100, true, true);
  CHECK(over.g == LED_FULL);
  CHECK(over.r == 0);
}

static void test_colour_is_red_when_empty() {
  const Rgbw c = batteryColour(BATT_RED_PCT, true, true);
  CHECK(c.r == LED_FULL);
  CHECK(c.g == 0);

  const Rgbw under = batteryColour(0, true, true);
  CHECK(under.r == LED_FULL);
  CHECK(under.g == 0);
}

static void test_colour_is_amber_between_the_thresholds() {
  // Amber means both channels lit at once. Asserting only that it differs
  // from green would pass on an implementation that jumped straight to red.
  const uint8_t mid = (uint8_t)((BATT_GREEN_PCT + BATT_RED_PCT) / 2);
  const Rgbw c = batteryColour(mid, true, true);
  CHECK(c.r > 0);
  CHECK(c.g > 0);
  CHECK(c.r < LED_FULL);
  CHECK(c.g < LED_FULL);
}

static void test_colour_leans_green_nearer_the_top() {
  // The midpoint is the one place an inverted crossfade looks identical to a
  // correct one -- both channels land on half scale either way. Sample
  // off-centre, or the inversion goes unnoticed.
  const uint8_t nearGreen = (uint8_t)(BATT_GREEN_PCT - 10);
  const Rgbw hi = batteryColour(nearGreen, true, true);
  CHECK(hi.g > hi.r);

  const uint8_t nearRed = (uint8_t)(BATT_RED_PCT + 10);
  const Rgbw lo = batteryColour(nearRed, true, true);
  CHECK(lo.r > lo.g);
}

static void test_thresholds_are_ordered() {
  // Swapping the two by typo would empty the band and make every reading jump
  // straight from green to red with no amber in between.
  CHECK(BATT_RED_PCT < BATT_GREEN_PCT);
}

static void test_screen_off_dims_without_changing_the_hue() {
  // Compared against the lit value, not merely against LED_DIMMED: a version
  // that ignored screenOn entirely would still sit under LED_FULL.
  const Rgbw lit = batteryColour(100, true, true);
  const Rgbw dim = batteryColour(100, true, false);
  CHECK(dim.g < lit.g);
  CHECK(dim.g == LED_DIMMED);
  CHECK(dim.r == 0);
}

static void test_blue_and_white_stay_dark() {
  // Two of the four channels are unused. Lighting them would wash the hue out
  // and cost current for nothing.
  for (int pct = 0; pct <= 100; pct += 5) {
    const Rgbw on = batteryColour((uint8_t)pct, true, true);
    CHECK(on.b == 0);
    CHECK(on.w == 0);
    const Rgbw off = batteryColour((uint8_t)pct, true, false);
    CHECK(off.b == 0);
    CHECK(off.w == 0);
  }
}

// The contact carries three gestures, and movement is what separates them:
// move before the threshold and it is a drag, stay still and it is a right
// click, let go early and it is a left click.
static const int16_t STILL = 0;

static void test_short_press_is_a_left_click_on_release() {
  ClickDetector d = clickInit();
  CHECK(clickFeed(d, true, STILL, STILL, 0) == CLICK_NONE);
  CHECK(clickFeed(d, true, STILL, STILL, 80) == CLICK_NONE);
  CHECK(clickFeed(d, false, STILL, STILL, 90) == CLICK_LEFT);
}

static void test_holding_still_gives_a_right_click_at_the_threshold() {
  ClickDetector d = clickInit();
  clickFeed(d, true, STILL, STILL, 0);
  CHECK(clickFeed(d, true, STILL, STILL, RIGHT_CLICK_MS - 1) == CLICK_NONE);
  CHECK(clickFeed(d, true, STILL, STILL, RIGHT_CLICK_MS) == CLICK_RIGHT);
}

static void test_right_click_fires_exactly_once() {
  ClickDetector d = clickInit();
  clickFeed(d, true, STILL, STILL, 0);
  int rights = 0;
  for (uint32_t t = 1; t < RIGHT_CLICK_MS * 5; t++) {
    if (clickFeed(d, true, STILL, STILL, t) == CLICK_RIGHT) {
      rights++;
    }
  }
  CHECK(rights == 1);
}

static void test_release_after_a_right_click_adds_nothing() {
  ClickDetector d = clickInit();
  clickFeed(d, true, STILL, STILL, 0);
  CHECK(clickFeed(d, true, STILL, STILL, RIGHT_CLICK_MS) == CLICK_RIGHT);
  CHECK(clickFeed(d, false, STILL, STILL, RIGHT_CLICK_MS + 50) == CLICK_NONE);
}

static void test_moving_before_the_threshold_starts_a_drag() {
  ClickDetector d = clickInit();
  clickFeed(d, true, STILL, STILL, 0);
  CHECK(clickFeed(d, true, DRAG_THRESHOLD, 0, 10) == DRAG_START);
}

static void test_drag_starts_once_and_then_stays_quiet() {
  // The pointer keeps moving through Mouse.move; the detector has nothing
  // further to say until the finger lifts.
  ClickDetector d = clickInit();
  clickFeed(d, true, STILL, STILL, 0);
  CHECK(clickFeed(d, true, DRAG_THRESHOLD, 0, 10) == DRAG_START);
  for (uint32_t t = 15; t < RIGHT_CLICK_MS * 3; t += 5) {
    CHECK(clickFeed(d, true, 3, 3, t) == CLICK_NONE);
  }
}

static void test_releasing_a_drag_lifts_the_button() {
  ClickDetector d = clickInit();
  clickFeed(d, true, STILL, STILL, 0);
  clickFeed(d, true, DRAG_THRESHOLD, 0, 10);
  CHECK(clickFeed(d, false, STILL, STILL, 500) == DRAG_END);
  CHECK(clickFeed(d, false, STILL, STILL, 600) == CLICK_NONE);
}

static void test_a_drag_never_also_reports_a_click() {
  // Dragging past the right-click threshold must not fire one on the way, and
  // the release must not add a left click behind the drag.
  ClickDetector d = clickInit();
  clickFeed(d, true, STILL, STILL, 0);
  clickFeed(d, true, DRAG_THRESHOLD, 0, 10);
  for (uint32_t t = 15; t < RIGHT_CLICK_MS * 2; t += 5) {
    CHECK(clickFeed(d, true, 2, 0, t) == CLICK_NONE);
  }
  CHECK(clickFeed(d, false, STILL, STILL, RIGHT_CLICK_MS * 2) == DRAG_END);
}

static void test_movement_accumulates_across_polls() {
  // A trackball reports a few counts per poll, not a whole threshold at once.
  // Reading only the current sample would make a slow drag impossible.
  ClickDetector d = clickInit();
  clickFeed(d, true, STILL, STILL, 0);
  const int16_t step = 1;
  ClickAction last = CLICK_NONE;
  for (int16_t i = 0; i < DRAG_THRESHOLD; i++) {
    last = clickFeed(d, true, step, 0, (uint32_t)(10 + i));
  }
  CHECK(last == DRAG_START);
}

static void test_movement_counts_in_both_directions() {
  // Rolling left or up reports negative counts. Without an absolute value they
  // would cancel the positive ones and a diagonal drag would never start.
  ClickDetector d = clickInit();
  clickFeed(d, true, STILL, STILL, 0);
  CHECK(clickFeed(d, true, (int16_t)-DRAG_THRESHOLD, 0, 10) == DRAG_START);

  ClickDetector e = clickInit();
  clickFeed(e, true, STILL, STILL, 0);
  CHECK(clickFeed(e, true, 0, (int16_t)-DRAG_THRESHOLD, 10) == DRAG_START);
}

static void test_jitter_below_the_threshold_still_gives_a_right_click() {
  // A finger resting on a sensitive ball nudges it. That must not be read as
  // the start of a drag.
  ClickDetector d = clickInit();
  clickFeed(d, true, STILL, STILL, 0);
  CHECK(clickFeed(d, true, 1, 0, 50) == CLICK_NONE);
  CHECK(clickFeed(d, true, 0, 1, 100) == CLICK_NONE);
  CHECK(clickFeed(d, true, STILL, STILL, RIGHT_CLICK_MS) == CLICK_RIGHT);
}

static void test_movement_wins_when_both_conditions_land_together() {
  // Start moving just before the clock runs out and both become true on the
  // same poll. Movement must decide, or a drag begun late turns into a context
  // menu. Checking the clock first would look correct in every other test.
  ClickDetector d = clickInit();
  clickFeed(d, true, STILL, STILL, 0);
  CHECK(clickFeed(d, true, DRAG_THRESHOLD, 0, RIGHT_CLICK_MS) == DRAG_START);
}

static void test_movement_after_a_right_click_does_not_start_a_drag() {
  // The gesture is already decided. Moving now is ordinary pointer movement.
  ClickDetector d = clickInit();
  clickFeed(d, true, STILL, STILL, 0);
  CHECK(clickFeed(d, true, STILL, STILL, RIGHT_CLICK_MS) == CLICK_RIGHT);
  CHECK(clickFeed(d, true, DRAG_THRESHOLD * 4, 0, RIGHT_CLICK_MS + 50) == CLICK_NONE);
}

static void test_travel_resets_between_presses() {
  // Movement banked under one press must not carry into the next, or a second
  // press would jump straight to a drag on the first nudge.
  ClickDetector d = clickInit();
  clickFeed(d, true, STILL, STILL, 0);
  clickFeed(d, true, (int16_t)(DRAG_THRESHOLD - 1), 0, 10);
  clickFeed(d, false, STILL, STILL, 20);

  clickFeed(d, true, STILL, STILL, 100);
  CHECK(clickFeed(d, true, 1, 0, 110) == CLICK_NONE);
}

static void test_a_right_click_does_not_poison_the_next_press() {
  ClickDetector d = clickInit();
  clickFeed(d, true, STILL, STILL, 0);
  CHECK(clickFeed(d, true, STILL, STILL, RIGHT_CLICK_MS) == CLICK_RIGHT);
  clickFeed(d, false, STILL, STILL, RIGHT_CLICK_MS + 50);

  clickFeed(d, true, STILL, STILL, RIGHT_CLICK_MS * 3);
  // Poll mid-press and early: a clock left over from the first press would
  // already be past the threshold here.
  CHECK(clickFeed(d, true, STILL, STILL, RIGHT_CLICK_MS * 3 + 50) == CLICK_NONE);
  CHECK(clickFeed(d, false, STILL, STILL, RIGHT_CLICK_MS * 3 + 50) == CLICK_LEFT);
}

static void test_untouched_reports_nothing() {
  ClickDetector d = clickInit();
  for (uint32_t t = 0; t < 1000; t += 5) {
    CHECK(clickFeed(d, false, 5, 5, t) == CLICK_NONE);
  }
}

static void test_abort_lifts_a_drag_and_nothing_else() {
  // If the I2C read fails mid-drag the sketch stops feeding the detector, and
  // the left button would stay down for good. Abort is the way out.
  ClickDetector dragging = clickInit();
  clickFeed(dragging, true, STILL, STILL, 0);
  clickFeed(dragging, true, DRAG_THRESHOLD, 0, 10);
  CHECK(clickAbort(dragging) == DRAG_END);
  CHECK(clickAbort(dragging) == CLICK_NONE);

  ClickDetector idle = clickInit();
  CHECK(clickAbort(idle) == CLICK_NONE);

  ClickDetector pressed = clickInit();
  clickFeed(pressed, true, STILL, STILL, 0);
  CHECK(clickAbort(pressed) == CLICK_NONE);  // no button was down, so none to lift
}

static void test_millis_rollover_during_a_press() {
  const uint32_t nearMax = 0xFFFFFFFFu - 100;
  ClickDetector d = clickInit();
  clickFeed(d, true, STILL, STILL, nearMax);
  CHECK(clickFeed(d, true, STILL, STILL, nearMax + 50) == CLICK_NONE);
  CHECK(clickFeed(d, true, STILL, STILL, nearMax + RIGHT_CLICK_MS) == CLICK_RIGHT);
}

int main() {
  test_decode_pure_horizontal();
  test_decode_pure_vertical();
  test_decode_takes_the_difference_not_the_larger();
  test_decode_full_scale_counters_do_not_wrap();
  test_decode_splits_the_switch_byte();
  test_pointer_step_applies_gain();
  test_pointer_step_clamps_both_ways();
  test_pointer_step_just_below_the_clamp_is_untouched();
  test_colour_is_dark_when_the_reading_is_stale();
  test_stale_beats_dimmed();
  test_colour_is_green_when_full();
  test_colour_is_red_when_empty();
  test_colour_is_amber_between_the_thresholds();
  test_colour_leans_green_nearer_the_top();
  test_thresholds_are_ordered();
  test_screen_off_dims_without_changing_the_hue();
  test_blue_and_white_stay_dark();
  test_short_press_is_a_left_click_on_release();
  test_holding_still_gives_a_right_click_at_the_threshold();
  test_right_click_fires_exactly_once();
  test_release_after_a_right_click_adds_nothing();
  test_moving_before_the_threshold_starts_a_drag();
  test_drag_starts_once_and_then_stays_quiet();
  test_releasing_a_drag_lifts_the_button();
  test_a_drag_never_also_reports_a_click();
  test_movement_accumulates_across_polls();
  test_movement_counts_in_both_directions();
  test_jitter_below_the_threshold_still_gives_a_right_click();
  test_movement_wins_when_both_conditions_land_together();
  test_movement_after_a_right_click_does_not_start_a_drag();
  test_travel_resets_between_presses();
  test_a_right_click_does_not_poison_the_next_press();
  test_untouched_reports_nothing();
  test_abort_lifts_a_drag_and_nothing_else();
  test_millis_rollover_during_a_press();

  return report();
}
