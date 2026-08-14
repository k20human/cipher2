package dev.cipher2.reporter

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** OEM skins that gate autostart — MIUI among them — will only deliver this
 *  once the user grants the permission by hand. There is no code-side
 *  substitute. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            context.startForegroundService(Intent(context, ReporterService::class.java))
        }
    }
}
