package dev.cipher2.reporter

import android.app.Activity
import android.content.Intent
import android.graphics.Typeface
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.Gravity
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

private const val REFRESH_MS = 500L

/** Diagnostic screen. Built in code rather than XML: it has three widgets and
 *  no design to speak of.
 *
 *  It polls rather than listens because the whole point is to keep working
 *  when the service is not: a callback the service never sends would look
 *  exactly like a service that has nothing to say. */
class MainActivity : Activity() {

    private lateinit var statusView: TextView
    private val handler = Handler(Looper.getMainLooper())

    private val refresh = object : Runnable {
        override fun run() {
            statusView.text = statusText()
            handler.postDelayed(this, REFRESH_MS)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        statusView = TextView(this).apply {
            typeface = Typeface.MONOSPACE
            textSize = 16f
        }

        val start = Button(this).apply {
            text = "Start reporting"
            setOnClickListener {
                startForegroundService(Intent(this@MainActivity, ReporterService::class.java))
            }
        }

        val stop = Button(this).apply {
            text = "Stop reporting"
            setOnClickListener {
                stopService(Intent(this@MainActivity, ReporterService::class.java))
            }
        }

        setContentView(LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(48, 48, 48, 48)
            addView(statusView)
            addView(start)
            addView(stop)
        })
    }

    // Only while visible: a diagnostic screen nobody is looking at has no
    // business waking up twice a second.
    override fun onResume() {
        super.onResume()
        handler.post(refresh)
    }

    override fun onPause() {
        super.onPause()
        handler.removeCallbacks(refresh)
    }

    private fun statusText(): String {
        val service = if (ReporterService.running) "running" else "stopped"
        val line = ReporterService.lastLine
        val last = if (line == null) {
            "(none yet)"
        } else {
            val ageS = (SystemClock.elapsedRealtime() - ReporterService.lastLineAt) / 1000
            "$line   ${ageS}s ago"
        }
        return """
            service   : $service
            link      : ${ReporterService.linkState}
            last line : $last
        """.trimIndent()
    }
}
