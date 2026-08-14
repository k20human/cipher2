package dev.cipher2.reporter

import org.junit.Assert.assertEquals
import org.junit.Test

class ProtocolTest {

    @Test
    fun `formats screen on`() {
        assertEquals("S1 B87\n", Protocol.line(screenOn = true, batteryPct = 87))
    }

    @Test
    fun `formats screen off`() {
        assertEquals("S0 B14\n", Protocol.line(screenOn = false, batteryPct = 14))
    }

    @Test
    fun `clamps battery above range`() {
        assertEquals("S1 B100\n", Protocol.line(screenOn = true, batteryPct = 140))
    }

    @Test
    fun `clamps battery below range`() {
        // Any negative input is clamped rather than sent: the board would
        // reject "B-1" outright. Unknown levels never get this far -- they are
        // filtered in ReporterService, which keeps the last credible reading
        // instead of letting BatteryManager's Integer.MIN_VALUE sentinel clamp
        // down to a false 0 %.
        assertEquals("S1 B0\n", Protocol.line(screenOn = true, batteryPct = -1))
    }
}
