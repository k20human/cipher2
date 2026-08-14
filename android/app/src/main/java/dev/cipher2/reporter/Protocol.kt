package dev.cipher2.reporter

/** The wire format the board parses. Kept text so it can be read off any
 *  serial terminal when something goes wrong. */
object Protocol {

    fun line(screenOn: Boolean, batteryPct: Int): String {
        val screen = if (screenOn) 1 else 0
        // Belt and braces, not policy. What to say when the level is unknown
        // is decided in ReporterService, which knows what the board makes of
        // the number; this only keeps something the board would reject
        // outright off the wire.
        val battery = batteryPct.coerceIn(0, 100)
        return "S$screen B$battery\n"
    }
}
