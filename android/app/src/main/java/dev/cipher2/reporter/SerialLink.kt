package dev.cipher2.reporter

import android.content.Context
import android.hardware.usb.UsbManager
import android.util.Log
import com.hoho.android.usbserial.driver.UsbSerialPort
import com.hoho.android.usbserial.driver.UsbSerialProber

private const val TAG = "SerialLink"
private const val BAUD = 115200
private const val WRITE_TIMEOUT_MS = 500
private const val ARDUINO_VENDOR_ID = 0x2341

/** Owns the USB connection and nothing else. It knows how to open a port and
 *  push bytes down it; it has never heard of screens or batteries.
 *
 *  Every call here can block for seconds on an unresponsive board, so the
 *  object is built on the main thread and then touched only from
 *  ReporterService's worker. The two fields below are volatile so that
 *  hand-off stays safe by construction, rather than by an argument about
 *  which thread happens to call what today. */
class SerialLink(private val context: Context) {

    @Volatile
    private var port: UsbSerialPort? = null

    val isOpen: Boolean
        get() = port != null

    /** Why the last open() gave up, or null once one succeeded. It is logged
     *  too, but logcat needs a PC and a cable while the board is holding the
     *  phone's only USB port -- so the reason also has to reach the screen in
     *  the operator's hand, which is what ReporterService copies it out for. */
    @Volatile
    var lastError: String? = null
        private set

    /** Never throws: the callers are a heartbeat and a broadcast receiver, for
     *  which an escaping exception would be a crash rather than a retry. The
     *  whole body sits inside the try for that reason -- getSystemService and
     *  findAllDrivers included, since a probe walking a device that vanished
     *  mid-enumeration is exactly the kind of thing that throws. */
    fun open(): Boolean {
        close()
        return try {
            val manager = context.getSystemService(Context.USB_SERVICE) as UsbManager

            val driver = UsbSerialProber.getDefaultProber().findAllDrivers(manager)
                .firstOrNull { it.device.vendorId == ARDUINO_VENDOR_ID }
                ?: return fail("no Arduino found on the bus")

            if (!manager.hasPermission(driver.device)) {
                // The USB_DEVICE_ATTACHED intent filter grants this on plug-in.
                // If we land here the user opened the app before attaching the
                // board.
                return fail("no USB permission yet; replug the board")
            }

            val connection = manager.openDevice(driver.device)
                ?: return fail("openDevice returned null")

            val p = driver.ports[0]
            p.open(connection)
            // Assign as soon as the interface is actually claimed, not after
            // the parameters below also succeed. If setParameters/dtr throws,
            // the catch's close() must find this reference to release the
            // claim -- otherwise the interface leaks with nothing left to
            // close it, and every later open() fails against a claim nobody
            // holds.
            port = p
            p.setParameters(BAUD, 8, UsbSerialPort.STOPBITS_1, UsbSerialPort.PARITY_NONE)
            p.dtr = true
            lastError = null
            Log.i(TAG, "port open")
            true
        } catch (e: Exception) {
            Log.w(TAG, "open failed", e)
            lastError = "open failed: $e"
            close()
            false
        }
    }

    private fun fail(reason: String): Boolean {
        lastError = reason
        Log.w(TAG, reason)
        return false
    }

    fun write(line: String): Boolean {
        val p = port ?: return false
        return try {
            p.write(line.toByteArray(), WRITE_TIMEOUT_MS)
            true
        } catch (e: Exception) {
            // A failed write is how a yanked cable announces itself. Drop the
            // port so the caller's next open() starts from a clean slate.
            Log.w(TAG, "write failed, dropping port", e)
            close()
            false
        }
    }

    fun close() {
        try {
            port?.close()
        } catch (_: Exception) {
        }
        port = null
    }
}
