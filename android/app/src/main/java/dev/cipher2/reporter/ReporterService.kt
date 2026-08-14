package dev.cipher2.reporter

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.os.PowerManager
import android.os.SystemClock
import android.util.Log

private const val TAG = "ReporterService"
private const val CHANNEL_ID = "reporter"
private const val NOTIFICATION_ID = 1
private const val HEARTBEAT_MS = 5_000L
private const val RECONNECT_MS = 3_000L

/** Stand-in until BatteryManager answers for the first time. Any value above
 *  the board's BATT_CLEAR_PCT (20) is equally safe -- the board's only use for
 *  the number is the low-battery threshold -- so the choice is about what a
 *  human reading the wire should see: a midpoint that is obviously a
 *  placeholder. 100 would announce a full charge we have not measured, 0 would
 *  be the very bug this guards against. */
private const val BATTERY_UNKNOWN_PCT = 50

/** Decides what to say and when. A foreground service because ACTION_SCREEN_ON
 *  and ACTION_SCREEN_OFF cannot be declared in the manifest since API 26: they
 *  need a living component to register them, and a background service would
 *  be killed within minutes. */
class ReporterService : Service() {

    /** What MainActivity draws. Plain volatile fields rather than a binding:
     *  the activity is a read-only diagnostic, both live in the same process,
     *  and a Binder would be more machinery than four fields deserve. Written
     *  by the worker thread, except at start-up and shutdown where onCreate
     *  and onDestroy set them from the main one; read from the main thread. */
    companion object {
        @Volatile
        var running = false
            private set

        /** Connection state in plain words: "port open", or why open() gave
         *  up. The likeliest silent failure -- USB permission never granted,
         *  so open() returns false every 3 s forever -- is invisible
         *  otherwise. */
        @Volatile
        var linkState = "service stopped"
            private set

        /** The last line the board actually received, null until one lands. */
        @Volatile
        var lastLine: String? = null
            private set

        /** SystemClock.elapsedRealtime() when [lastLine] was written. The
         *  screen and battery rarely change, so the line's text alone cannot
         *  tell a live heartbeat from a frozen one -- its age can. */
        @Volatile
        var lastLineAt = 0L
            private set
    }

    private lateinit var link: SerialLink

    /** Every serial call happens here, never on the main thread. open() goes
     *  through two USB control transfers, and usb-serial-for-android gives
     *  each one a 5 s timeout: a board that accepts the interface claim but
     *  answers no control request -- a Leonardo re-enumerating after a
     *  reprogram, which the design lists as a supported recovery path -- blocks
     *  the caller for ten seconds. On the main thread that is an ANR, and an
     *  ANR'd foreground service is precisely what an aggressive OEM power
     *  manager kills, so the failure would attack the property this whole
     *  service exists to protect. */
    private lateinit var worker: HandlerThread
    private lateinit var handler: Handler

    /** Written by onReceive on the main thread, read by report() on the
     *  worker. */
    @Volatile
    private var screenOn = true

    private val screenReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            screenOn = when (intent.action) {
                Intent.ACTION_SCREEN_ON -> true
                Intent.ACTION_SCREEN_OFF -> false
                else -> return
            }
            // Hand the work to the worker and return: onReceive runs on the
            // main thread, where a blocked serial write is a broadcast ANR.
            // Posting, not reporting inline, and posting a one-shot that
            // schedules nothing -- heartbeat below stays the only scheduler,
            // so a screen toggle can never seed a second chain of beats. The
            // report still leaves promptly: the worker's queue is empty
            // between beats.
            handler.post(screenReport)
        }
    }

    private val screenReport = Runnable { report() }

    private val heartbeat = object : Runnable {
        override fun run() {
            val ok = report()
            // Exactly one pending callback at a time: this replaces itself,
            // it never adds a second, independent chain. Faster cadence while
            // disconnected, back to the normal beat as soon as a report lands.
            handler.postDelayed(this, if (ok) HEARTBEAT_MS else RECONNECT_MS)
        }
    }

    override fun onCreate() {
        super.onCreate()
        link = SerialLink(this)
        running = true
        linkState = "starting"

        val power = getSystemService(Context.POWER_SERVICE) as PowerManager
        screenOn = power.isInteractive

        worker = HandlerThread("reporter-serial").apply { start() }
        handler = Handler(worker.looper)

        registerReceiver(screenReceiver, IntentFilter().apply {
            addAction(Intent.ACTION_SCREEN_ON)
            addAction(Intent.ACTION_SCREEN_OFF)
        })

        startForeground(NOTIFICATION_ID, buildNotification())
        handler.post(heartbeat)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = START_STICKY

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        running = false
        linkState = "service stopped"
        handler.removeCallbacksAndMessages(null)
        try {
            unregisterReceiver(screenReceiver)
        } catch (_: Exception) {
        }
        // Close on the thread that opened it, behind whatever report may still
        // be in flight, rather than racing it from here. quitSafely lets that
        // last message run and then ends the loop; quit() would discard it.
        handler.post { link.close() }
        worker.quitSafely()
        super.onDestroy()
    }

    /** Last reading the platform actually stood behind. getIntProperty returns
     *  Integer.MIN_VALUE when BATTERY_PROPERTY_CAPACITY is unsupported or the
     *  driver is not ready, and clamping that to 0 would tell the board the
     *  phone is critically low -- an alert its hysteresis then holds until a
     *  reading above 20 % arrives. Repeating the last credible number is the
     *  only honest answer to "I don't know". */
    private var lastGoodBatteryPct = BATTERY_UNKNOWN_PCT

    private fun batteryPct(): Int {
        val bm = getSystemService(Context.BATTERY_SERVICE) as BatteryManager
        val pct = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
        if (pct in 0..100) {
            lastGoodBatteryPct = pct
        }
        return lastGoodBatteryPct
    }

    /** Returns whether the line made it out. Runs on the worker thread only,
     *  and never schedules anything itself -- that is entirely heartbeat's
     *  job, so exactly one delayed callback is ever pending, whether this call
     *  came from the beat or from a screen event. */
    private fun report(): Boolean {
        if (!link.isOpen && !link.open()) {
            linkState = link.lastError ?: "port closed"
            return false
        }
        val line = Protocol.line(screenOn, batteryPct())
        if (!link.write(line)) {
            Log.w(TAG, "write failed; will retry on the next beat")
            linkState = "write failed -- board unplugged?"
            return false
        }
        lastLine = line.trimEnd('\n')
        lastLineAt = SystemClock.elapsedRealtime()
        linkState = "port open"
        return true
    }

    private fun buildNotification(): Notification {
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "Reporter", NotificationManager.IMPORTANCE_LOW)
        )
        val open = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE
        )
        return Notification.Builder(this, CHANNEL_ID)
            .setContentTitle("Cyberdeck Reporter")
            .setContentText("Reporting screen and battery to the board")
            .setSmallIcon(android.R.drawable.stat_sys_data_bluetooth)
            .setContentIntent(open)
            .setOngoing(true)
            .build()
    }
}
