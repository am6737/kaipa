package expo.modules.trailnotification

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat

/** What the shade shows for the recording. Strings arrive already translated from JS. */
data class TrailNotificationContent(
  val title: String,
  val text: String,
  /** Wall-clock ms at which the moving time was zero; the header counts up from it. Null while paused. */
  val chronometerBase: Long?,
  val subText: String?,
  val channelName: String,
)

/**
 * Keeps the process, and with it the JS location listener, alive with the screen off while a 徒步记录 runs,
 * and shows the walk's time, distance and climb in the shade the way Komoot and AllTrails do.
 *
 * The time ticks natively through the notification chronometer, so JS only posts an update when the
 * distance, climb or status changes; JS timers are throttled once the screen is off.
 */
class TrailRecordingService : Service() {
  companion object {
    private const val TAG = "TrailRecordingService"
    private const val CHANNEL_ID = "kaipa_trail_recording"
    const val NOTIFICATION_ID = 7301

    @Volatile var content: TrailNotificationContent? = null
    @Volatile var running = false

    fun start(context: Context) {
      val intent = Intent(context, TrailRecordingService::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent)
      else context.startService(intent)
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, TrailRecordingService::class.java))
    }

    fun refresh(context: Context) {
      if (!running) return
      val value = content ?: return
      val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      ensureChannel(context, manager, value.channelName)
      manager.notify(NOTIFICATION_ID, build(context, value))
    }

    private fun ensureChannel(context: Context, manager: NotificationManager, name: String) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
      val existing = manager.getNotificationChannel(CHANNEL_ID)
      if (existing != null && existing.name == name) return
      // Low importance: in the shade and the status bar, never a sound or a heads-up.
      val channel = NotificationChannel(CHANNEL_ID, name, NotificationManager.IMPORTANCE_LOW).apply {
        setShowBadge(false)
      }
      manager.createNotificationChannel(channel)
    }

    private fun build(context: Context, value: TrailNotificationContent): Notification {
      val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
      }
      val tap = launch?.let {
        PendingIntent.getActivity(context, 0, it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
      }
      val builder = NotificationCompat.Builder(context, CHANNEL_ID)
        .setSmallIcon(R.drawable.kaipa_trail_notification)
        .setContentTitle(value.title)
        .setContentText(value.text)
        .setSubText(value.subText)
        .setContentIntent(tap)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setSilent(true)
        .setCategory(NotificationCompat.CATEGORY_WORKOUT)
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        .setPriority(NotificationCompat.PRIORITY_LOW)
        .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
      val base = value.chronometerBase
      if (base != null) {
        builder.setWhen(base).setShowWhen(true).setUsesChronometer(true)
      } else {
        builder.setShowWhen(false).setUsesChronometer(false)
      }
      return builder.build()
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val value = content
    if (value == null) {
      stopSelf()
      return START_NOT_STICKY
    }
    val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
    ensureChannel(this, manager, value.channelName)
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        startForeground(NOTIFICATION_ID, build(this, value), ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
      } else {
        startForeground(NOTIFICATION_ID, build(this, value))
      }
      running = true
    } catch (cause: Exception) {
      // Location permission withdrawn, or Android 12+ refusing a start from the background.
      Log.w(TAG, "startForeground failed", cause)
      running = false
      stopSelf()
    }
    // A process the system killed has lost its JS recorder; the app resumes the walk on next launch,
    // so the service must not come back on its own and claim to be recording.
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    running = false
    super.onDestroy()
  }
}
