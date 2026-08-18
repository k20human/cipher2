#include "controls.h"

#include "check.h"

// One detent walks the quadrature cycle 00 -> 10 -> 11 -> 01 -> 00.
// Reversing that order walks it the other way.
static const bool FWD_A[4] = {true, true, false, false};
static const bool FWD_B[4] = {false, true, true, false};

static void test_one_detent_forward_emits_exactly_one_step() {
  Encoder e = encoderInit(false, false);
  CHECK(encoderFeed(e, true, false) == 0);
  CHECK(encoderFeed(e, true, true) == 0);
  CHECK(encoderFeed(e, false, true) == 0);
  CHECK(encoderFeed(e, false, false) == 1);
}

static void test_one_detent_backward_emits_exactly_one_step() {
  Encoder e = encoderInit(false, false);
  CHECK(encoderFeed(e, false, true) == 0);
  CHECK(encoderFeed(e, true, true) == 0);
  CHECK(encoderFeed(e, true, false) == 0);
  CHECK(encoderFeed(e, false, false) == -1);
}

static void test_three_detents_emit_three_steps() {
  Encoder e = encoderInit(false, false);
  int steps = 0;
  for (int i = 0; i < 3 * STEPS_PER_DETENT; i++) {
    steps += encoderFeed(e, FWD_A[i % 4], FWD_B[i % 4]);
  }
  CHECK(steps == 3);
}

static void test_repeated_identical_samples_emit_nothing() {
  // The sketch polls thousands of times per second, so a still encoder must
  // stay silent -- and it must do so whichever of the four states it happens
  // to be resting in, not just the one the tests start from.
  const bool REST_A[4] = {false, false, true, true};
  const bool REST_B[4] = {false, true, false, true};

  for (int s = 0; s < 4; s++) {
    Encoder e = encoderInit(REST_A[s], REST_B[s]);
    for (int i = 0; i < 4 * STEPS_PER_DETENT; i++) {
      CHECK(encoderFeed(e, REST_A[s], REST_B[s]) == 0);
    }
  }
}

static void test_impossible_transitions_never_accumulate_a_detent() {
  // Both lines changing between two samples cannot happen on a real encoder,
  // so it is noise. Counting it would move the volume in a random direction.
  //
  // Feeding it once proves nothing: a single miscount sits below the detent
  // threshold, so the call still returns 0 and a one-shot test passes even
  // when the noise is being banked. Feed enough to fill several detents.
  Encoder e = encoderInit(false, false);
  for (int i = 0; i < 4 * STEPS_PER_DETENT; i++) {
    const bool both = (i % 2) == 0;  // alternates 00 <-> 11
    CHECK(encoderFeed(e, both, both) == 0);
  }

  Encoder f = encoderInit(false, true);
  for (int i = 0; i < 4 * STEPS_PER_DETENT; i++) {
    const bool a = (i % 2) == 0;  // alternates 10 <-> 01
    CHECK(encoderFeed(f, a, !a) == 0);
  }
}

static void test_partial_turn_then_reversal_emits_nothing() {
  // Nudging the knob without reaching a detent, then letting it settle back,
  // must not change the volume.
  Encoder e = encoderInit(false, false);
  CHECK(encoderFeed(e, true, false) == 0);
  CHECK(encoderFeed(e, true, true) == 0);
  CHECK(encoderFeed(e, true, false) == 0);
  CHECK(encoderFeed(e, false, false) == 0);
}

static void test_clean_press_reports_once() {
  Debounce d = debounceInit(true, 0);
  CHECK(!debouncePressed(d, false, 0));
  CHECK(!debouncePressed(d, false, DEBOUNCE_MS - 1));
  CHECK(debouncePressed(d, false, DEBOUNCE_MS));
  CHECK(!debouncePressed(d, false, DEBOUNCE_MS + 500));
}

static void test_bounce_within_the_window_reports_nothing() {
  Debounce d = debounceInit(true, 0);
  CHECK(!debouncePressed(d, false, 0));
  CHECK(!debouncePressed(d, true, 5));
  CHECK(!debouncePressed(d, false, 10));
  CHECK(!debouncePressed(d, true, 15));
  CHECK(!debouncePressed(d, false, 20));
  CHECK(!debouncePressed(d, false, 20 + DEBOUNCE_MS - 1));
  CHECK(debouncePressed(d, false, 20 + DEBOUNCE_MS));
}

static void test_release_is_not_a_press() {
  Debounce d = debounceInit(true, 0);
  debouncePressed(d, false, 0);
  CHECK(debouncePressed(d, false, DEBOUNCE_MS));
  CHECK(!debouncePressed(d, true, DEBOUNCE_MS + 1));
  CHECK(!debouncePressed(d, true, DEBOUNCE_MS * 3));
}

static void test_second_press_reports_again() {
  Debounce d = debounceInit(true, 0);
  debouncePressed(d, false, 0);
  CHECK(debouncePressed(d, false, DEBOUNCE_MS));
  debouncePressed(d, true, 100);
  debouncePressed(d, true, 100 + DEBOUNCE_MS);
  debouncePressed(d, false, 200);
  CHECK(debouncePressed(d, false, 200 + DEBOUNCE_MS));
}

static void test_millis_rollover_does_not_break_debounce() {
  // millis() wraps after 49 days. Unsigned subtraction must carry the elapsed
  // time across the wrap rather than produce a huge number.
  const uint32_t nearMax = 0xFFFFFFFFu - 10;
  Debounce d = debounceInit(true, nearMax);
  CHECK(!debouncePressed(d, false, nearMax));
  CHECK(debouncePressed(d, false, nearMax + DEBOUNCE_MS));
}

int main() {
  test_one_detent_forward_emits_exactly_one_step();
  test_one_detent_backward_emits_exactly_one_step();
  test_three_detents_emit_three_steps();
  test_repeated_identical_samples_emit_nothing();
  test_impossible_transitions_never_accumulate_a_detent();
  test_partial_turn_then_reversal_emits_nothing();
  test_clean_press_reports_once();
  test_bounce_within_the_window_reports_nothing();
  test_release_is_not_a_press();
  test_second_press_reports_again();
  test_millis_rollover_does_not_break_debounce();

  return report();
}
