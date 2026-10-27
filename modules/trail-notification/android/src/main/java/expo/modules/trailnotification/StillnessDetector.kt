package expo.modules.trailnotification

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.SystemClock
import kotlin.math.sqrt

/**
 * Whether the phone itself lies still, from the accelerometer, for the trail recorder: GPS indoors
 * wanders tens of metres with the phone on a table, and only the phone's own motion tells that
 * apart from walking slowly.
 *
 * Lives here rather than in expo-sensors because expo-sensors stops listening whenever the activity
 * leaves the foreground, which on Android includes the screen locking: exactly when a walk records.
 * The listener is the application's, and the recording's foreground service and wake lock keep it fed.
 */
object StillnessDetector : SensorEventListener {
  private const val SAMPLE_US = 100_000
  // Still means this long without the phone being moved.
  private const val WINDOW_MS = 4_000L
  // Samples older than this are stale: the sensor stopped.
  private const val STALE_MS = 1_500L
  private const val CAPACITY = 256

  private val times = LongArray(CAPACITY)
  private val magnitudes = DoubleArray(CAPACITY)
  private var head = 0
  private var count = 0
  private var users = 0
  private var manager: SensorManager? = null

  /** Ref-counted; false when the phone has no accelerometer. */
  @Synchronized
  fun start(context: Context): Boolean {
    val sensors = manager ?: (context.applicationContext.getSystemService(Context.SENSOR_SERVICE) as SensorManager)
    val sensor = sensors.getDefaultSensor(Sensor.TYPE_ACCELEROMETER) ?: return false
    if (users == 0) {
      count = 0
      sensors.registerListener(this, sensor, SAMPLE_US)
    }
    manager = sensors
    users += 1
    return true
  }

  @Synchronized
  fun stop() {
    if (users == 0) return
    users -= 1
    if (users == 0) {
      manager?.unregisterListener(this)
      count = 0
    }
  }

  @Synchronized
  override fun onSensorChanged(event: SensorEvent) {
    val (x, y, z) = Triple(event.values[0].toDouble(), event.values[1].toDouble(), event.values[2].toDouble())
    times[head] = SystemClock.elapsedRealtime()
    magnitudes[head] = sqrt(x * x + y * y + z * z)
    head = (head + 1) % CAPACITY
    if (count < CAPACITY) count += 1
  }

  override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit

  /**
   * The spread of |a| over the last window relative to its mean, or null when there is not a
   * recent, nearly full window to judge (sensor stopped, just started).
   */
  @Synchronized
  fun spread(): Double? {
    if (count == 0) return null
    val now = SystemClock.elapsedRealtime()
    val newest = (head - 1 + CAPACITY) % CAPACITY
    if (now - times[newest] > STALE_MS) return null
    var n = 0
    var sum = 0.0
    var oldest = now
    for (i in 0 until count) {
      val index = (newest - i + CAPACITY) % CAPACITY
      if (now - times[index] > WINDOW_MS) break
      sum += magnitudes[index]
      oldest = times[index]
      n += 1
    }
    if (n < (WINDOW_MS / (SAMPLE_US / 1000)) * 0.6 || now - oldest < WINDOW_MS * 0.9) return null
    val mean = sum / n
    if (mean <= 0) return null
    var squares = 0.0
    for (i in 0 until n) {
      val index = (newest - i + CAPACITY) % CAPACITY
      val d = magnitudes[index] - mean
      squares += d * d
    }
    return sqrt(squares / n) / mean
  }
}
