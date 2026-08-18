CXXFLAGS = -std=c++17 -Wall -Wextra -Werror -I../screen_wake

.PHONY: test clean

test: test_led_state test_controls test_trackball
	./test_led_state
	./test_controls
	./test_trackball

test_led_state: test_led_state.cpp check.h ../screen_wake/led_state.h
	$(CXX) $(CXXFLAGS) -o $@ $<

test_controls: test_controls.cpp check.h ../screen_wake/controls.h
	$(CXX) $(CXXFLAGS) -o $@ $<

test_trackball: test_trackball.cpp check.h ../screen_wake/trackball.h
	$(CXX) $(CXXFLAGS) -o $@ $<

clean:
	rm -f test_led_state test_controls test_trackball
