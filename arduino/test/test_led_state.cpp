#include "led_state.h"

#include "check.h"

static void test_breathe_stays_within_bounds() {
  for (uint32_t t = 0; t < BREATHE_MS * 3; t++) {
    uint8_t v = breatheLevel(t);
    CHECK(v >= BREATHE_FLOOR);
    CHECK(v <= BREATHE_CEIL);
  }
}

static void test_breathe_is_darkest_at_cycle_start() {
  CHECK(breatheLevel(0) == BREATHE_FLOOR);
  CHECK(breatheLevel(BREATHE_MS) == BREATHE_FLOOR);
}

static void test_breathe_peaks_at_mid_cycle() {
  uint8_t peak = breatheLevel(BREATHE_MS / 2);
  CHECK(peak > breatheLevel(0));
  CHECK(peak > breatheLevel(BREATHE_MS / 4));
  CHECK(peak <= BREATHE_CEIL);
}

static void test_blink_alternates_at_four_hertz() {
  CHECK(blinkLevel(0) == LED_AWAKE);
  CHECK(blinkLevel(BLINK_MS - 1) == LED_AWAKE);
  CHECK(blinkLevel(BLINK_MS) == 0);
  CHECK(blinkLevel(2 * BLINK_MS) == LED_AWAKE);
}

static void test_parse_accepts_well_formed_lines() {
  Report r = parseReport("S1 B87");
  CHECK(r.valid);
  CHECK(r.screenOn);
  CHECK(r.battery == 87);

  r = parseReport("S0 B14");
  CHECK(r.valid);
  CHECK(!r.screenOn);
  CHECK(r.battery == 14);
}

static void test_parse_accepts_boundary_battery_values() {
  Report r = parseReport("S1 B0");
  CHECK(r.valid);
  CHECK(r.battery == 0);

  r = parseReport("S1 B100");
  CHECK(r.valid);
  CHECK(r.battery == 100);
}

static void test_parse_rejects_malformed_lines() {
  CHECK(!parseReport("").valid);
  CHECK(!parseReport("garbage").valid);
  CHECK(!parseReport("S1").valid);          // battery field missing
  CHECK(!parseReport("S2 B50").valid);      // screen flag out of range
  CHECK(!parseReport("S1 B101").valid);     // battery out of range
  CHECK(!parseReport("S1 B").valid);        // no digits
  CHECK(!parseReport("X1 B50").valid);      // wrong leading key
  CHECK(!parseReport("S1 C50").valid);      // wrong second key
}

static void test_parse_rejects_bad_digit_runs() {
  // Trailing garbage after a digit that already parsed: the loop must keep
  // checking every character, not stop at the first one it likes.
  CHECK(!parseReport("S1 B5x").valid);

  // Four digits, the ordinary typo. Both the count guard and the >100 test
  // would catch this one.
  CHECK(!parseReport("S1 B1234").valid);

  // Only the count guard catches this one, which is the whole reason it
  // exists: value is a uint16_t, and 65636 wraps to exactly 100. Without the
  // guard this parses as a valid, plausible 100 % reading.
  CHECK(!parseReport("S1 B65636").valid);
}

static void test_battery_alert_arms_below_threshold() {
  CHECK(updateBatteryLow(false, 14));
  CHECK(updateBatteryLow(false, 0));
  CHECK(!updateBatteryLow(false, 15));
  CHECK(!updateBatteryLow(false, 90));
}

static void test_battery_alert_holds_through_the_dead_band() {
  // Once armed it stays armed until clearly recovered, so a charge hovering
  // around the threshold does not make the alert stutter.
  CHECK(updateBatteryLow(true, 16));
  CHECK(updateBatteryLow(true, 20));
  CHECK(!updateBatteryLow(true, 21));
}

static void test_battery_flash_is_two_pulses_then_rest() {
  CHECK(battFlashLevel(0) == BATT_FLASH_LEVEL);
  CHECK(battFlashLevel(BATT_FLASH_MS - 1) == BATT_FLASH_LEVEL);
  CHECK(battFlashLevel(BATT_FLASH_MS) == 0);                      // gap
  CHECK(battFlashLevel(BATT_FLASH_MS + BATT_FLASH_GAP_MS) == BATT_FLASH_LEVEL);
  CHECK(battFlashLevel(2 * BATT_FLASH_MS + BATT_FLASH_GAP_MS) == 0);
  CHECK(battFlashLevel(BATT_PERIOD_MS - 1) == 0);                 // long rest
  CHECK(battFlashLevel(BATT_PERIOD_MS) == BATT_FLASH_LEVEL);      // next cycle
}

static LedInputs baseInputs() {
  LedInputs in;
  in.usbConfigured = true;
  in.appAlive      = true;
  in.screenOn      = true;
  in.batteryLow    = false;
  in.blackout      = false;
  in.nowMs         = 0;
  return in;
}

static void test_link_down_wins_over_everything() {
  LedInputs in = baseInputs();
  in.usbConfigured = false;
  in.batteryLow    = true;
  CHECK(ledLevel(in) == 0);

  // USB link down must also beat app silence (at nowMs where blinkLevel
  // would return non-zero, so the wrong ordering fails loudly).
  in = baseInputs();
  in.usbConfigured = false;
  in.appAlive      = false;
  in.nowMs         = 0;  // blinkLevel(0) == LED_AWAKE, so wrong order shows up
  CHECK(ledLevel(in) == 0);
}

static void test_silent_app_blinks_and_suppresses_battery() {
  LedInputs in = baseInputs();
  in.appAlive   = false;
  in.batteryLow = true;      // stale, so it must not be shown
  in.nowMs      = 0;
  CHECK(ledLevel(in) == LED_AWAKE);
  in.nowMs = BLINK_MS;
  CHECK(ledLevel(in) == 0);
}

static void test_screen_states() {
  LedInputs in = baseInputs();
  in.screenOn = true;
  CHECK(ledLevel(in) == LED_AWAKE);

  in.screenOn = false;
  in.nowMs    = BREATHE_MS / 2;
  CHECK(ledLevel(in) == breatheLevel(BREATHE_MS / 2));
}

static void test_battery_flash_overlays_the_base_state() {
  LedInputs in = baseInputs();
  in.batteryLow = true;
  in.nowMs      = 0;                        // inside the first pulse
  CHECK(ledLevel(in) == BATT_FLASH_LEVEL);

  in.nowMs = BATT_FLASH_MS;                 // in the gap, base shows through
  CHECK(ledLevel(in) == LED_AWAKE);
}

static void test_blackout_beats_the_battery_flash() {
  LedInputs in = baseInputs();
  in.batteryLow = true;
  in.blackout   = true;
  in.nowMs      = 0;                        // would otherwise be a pulse
  CHECK(ledLevel(in) == 0);
}

static void test_blackout_beats_the_silent_app_blink() {
  // Press confirmation outranks the fault blink too, not just the battery
  // overlay. At nowMs = 0 blinkLevel returns LED_AWAKE, so swapping the two
  // branches turns this into 24 instead of quietly agreeing with 0.
  LedInputs in = baseInputs();
  in.blackout = true;
  in.appAlive = false;
  in.nowMs    = 0;
  CHECK(ledLevel(in) == 0);
}

int main() {
  test_breathe_stays_within_bounds();
  test_breathe_is_darkest_at_cycle_start();
  test_breathe_peaks_at_mid_cycle();
  test_blink_alternates_at_four_hertz();
  test_parse_accepts_well_formed_lines();
  test_parse_accepts_boundary_battery_values();
  test_parse_rejects_malformed_lines();
  test_parse_rejects_bad_digit_runs();
  test_battery_alert_arms_below_threshold();
  test_battery_alert_holds_through_the_dead_band();
  test_battery_flash_is_two_pulses_then_rest();
  test_link_down_wins_over_everything();
  test_silent_app_blinks_and_suppresses_battery();
  test_screen_states();
  test_battery_flash_overlays_the_base_state();
  test_blackout_beats_the_battery_flash();
  test_blackout_beats_the_silent_app_blink();

  return report();
}
