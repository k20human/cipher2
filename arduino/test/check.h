/*
  Minimal assertion harness shared by the host test suites. No framework: the
  whole point of these tests is that they build and run anywhere g++ does, with
  no dependency to install before the firmware can be trusted.
*/
#pragma once

#include <cstdio>

static int failures = 0;

#define CHECK(cond)                                              \
  do {                                                           \
    if (!(cond)) {                                               \
      printf("FAIL %s:%d  %s\n", __FILE__, __LINE__, #cond);     \
      failures++;                                                \
    }                                                            \
  } while (0)

// Call as `return report();` at the end of main.
static int report() {
  if (failures) {
    printf("%d assertion(s) failed\n", failures);
    return 1;
  }
  printf("all tests passed\n");
  return 0;
}
