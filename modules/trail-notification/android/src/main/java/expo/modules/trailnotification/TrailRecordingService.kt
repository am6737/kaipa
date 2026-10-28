package expo.modules.trailnotification

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.os.SystemClock
import android.util.Log
import android.view.View
import android.widget.RemoteViews
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat

/** What the shade shows for the recording. Strings arrive already translated from JS. */
data class TrailNotificationContent(
  val title: String,
  val text: String,
  /** Wall-clock ms at which the moving time was zero; the header counts up from it. Null while paused. */
  val chronometerBase: Long?,
  val subText: String?,
  val channelName: String,
  /** The same walk split into fields, for the custom card; null from JS that predates it. */
  val live: TrailLiveFields?,
)

/** The card's fields, as JS sends them for the iOS Live Activity. */
data class TrailLiveFields(
  val name: String,
  val status: String,
  val paused: Boolean,
  /** Formatted moving time, shown while paused; empty while recording, when the chronometer counts. */
  val time: String,
  val distance: String,
  val ascent: String,
  val descent: String,
  val distanceLabel: String,
  val ascentLabel: String,
  val descentLabel: String,
  /** GPS warning, or empty. */
  val warning: String,
)

/**
 * Keeps the process, and with it the JS location listener, alive with the screen off while a 徒步记录 runs,
 * and shows the walk's time, distance and climb in the shade the way Komoot and AllTrails do.
 *
 * The time ticks natively through the notification chronometer, so JS only posts an update when the
 * distance, climb or status changes; JS timers are throttled once the screen is off.
 *
 * While the walk is recording (not paused) it also holds a partial wake lock. A foreground service
 * keeps the process alive but not the CPU awake: with the screen off the phone sleeps between GPS
 * wake-ups, AMap's 2 s location loop stalls, and the track comes back as a few points joined by
 * straight lines.
 */
class TrailRecordingService : Service() {
  companion object {
    private const val TAG = "TrailRecordingService"
    // A channel's importance is fixed once created, so raising it needs a new id; the old one is deleted.
    const val CHANNEL_ID = "kaipa_trail_recording_v2"
    private const val LEGACY_CHANNEL_ID = "kaipa_trail_recording"
    const val NOTIFICATION_ID = 7301
    private const val EXTRA_REQUEST_PROMOTED_ONGOING = "android.requestPromotedOngoing"

    // Renewed on every notification update; only a walk that never moves for this long lets it lapse.
    private const val WAKE_LOCK_TIMEOUT_MS = 12 * 60 * 60 * 1000L

    @Volatile var content: TrailNotificationContent? = null
    @Volatile var running = false
    private var wakeLock: PowerManager.WakeLock? = null

    /** Holds the CPU awake while recording; the chronometer runs only then. */
    @Synchronized
    fun syncWakeLock(context: Context, recording: Boolean) {
      if (recording) {
        val lock = wakeLock ?: (context.applicationContext.getSystemService(Context.POWER_SERVICE) as PowerManager)
          .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "kaipa:trail-recording")
          .apply { setReferenceCounted(false) }
          .also { wakeLock = it }
        lock.acquire(WAKE_LOCK_TIMEOUT_MS)
      } else {
        wakeLock?.takeIf { it.isHeld }?.release()
        wakeLock = null
      }
    }

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
      syncWakeLock(context, value.chronometerBase != null)
    }

    private fun ensureChannel(context: Context, manager: NotificationManager, name: String) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
      if (manager.getNotificationChannel(LEGACY_CHANNEL_ID) != null) runCatching { manager.deleteNotificationChannel(LEGACY_CHANNEL_ID) }
      val existing = manager.getNotificationChannel(CHANNEL_ID)
      if (existing != null && existing.name == name) return
      // Default importance with the sound and vibration stripped. A low-importance channel counts as a
      // "silent" notification, and Android 11+ hides those from the lock screen by default ("Hide silent
      // notifications"), as many OEM skins do; default importance shows the card there like iOS's Live
      // Activity. Default never peeks as a heads-up, and setSilent/setOnlyAlertOnce keep updates quiet.
      val channel = NotificationChannel(CHANNEL_ID, name, NotificationManager.IMPORTANCE_DEFAULT).apply {
        setShowBadge(false)
        setSound(null, null)
        enableVibration(false)
        enableLights(false)
        lockscreenVisibility = Notification.VISIBILITY_PUBLIC
      }
      manager.createNotificationChannel(channel)
    }

    private fun build(context: Context, value: TrailNotificationContent): Notification {
      // `<package>://trail` as a VIEW intent, so React Native's Linking hands it to TrailContext, which opens
      // the 徒步导航 page (the iOS Live Activity uses the same link). The intent is explicit, so it needs no
      // intent filter.
      val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
        action = Intent.ACTION_VIEW
        data = Uri.parse("${context.packageName}://trail")
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
      }
      val tap = launch?.let {
        PendingIntent.getActivity(context, 0, it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
      }
      val builder = NotificationCompat.Builder(context, CHANNEL_ID)
        .setSmallIcon(R.drawable.kaipa_trail_notification)
        .setContentTitle(value.title)
        .setContentText(value.text)
        .setContentIntent(tap)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setSilent(true)
        .setCategory(NotificationCompat.CATEGORY_WORKOUT)
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        .setPriority(NotificationCompat.PRIORITY_DEFAULT)
        .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
      val base = value.chronometerBase
      val live = value.live
      if (live != null && !promotable(context)) {
        // Our own layout, close to the iOS Live Activity: the time large, the three numbers in columns.
        // The system still draws the header (icon and app name) around it, and the title and text above
        // stay for accessibility and for lock screens that redact custom views.
        builder
          .setStyle(NotificationCompat.DecoratedCustomViewStyle())
          .setCustomContentView(card(context, R.layout.kaipa_trail_notification_small, live, base))
          .setCustomBigContentView(card(context, R.layout.kaipa_trail_notification_big, live, base))
          .setShowWhen(false)
          .setUsesChronometer(false)
        return builder.build()
      }
      // Android 16 Live Update: a chip in the status bar (the clock while recording) and the card pinned
      // high on the lock screen and in the shade. A custom view would disqualify it, so this path keeps
      // the standard layout. Set as the raw extra (Notification.EXTRA_REQUEST_PROMOTED_ONGOING) so it
      // builds on any androidx.core; needs POST_PROMOTED_NOTIFICATIONS in the manifest.
      builder.setSubText(value.subText)
      builder.extras.putBoolean(EXTRA_REQUEST_PROMOTED_ONGOING, true)
      if (base != null) {
        builder.setWhen(base).setShowWhen(true).setUsesChronometer(true)
      } else {
        builder.setShowWhen(false).setUsesChronometer(false)
      }
      return builder.build()
    }

    /**
     * Whether the system will show the card as an Android 16 Live Update: the OS supports it and the user
     * has not turned it off for the app. Looked up by reflection so the module builds against older SDKs.
     */
    private fun promotable(context: Context): Boolean {
      if (Build.VERSION.SDK_INT < 36) return false
      val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      return runCatching {
        NotificationManager::class.java.getMethod("canPostPromotedNotifications").invoke(manager) as Boolean
      }.getOrDefault(false)
    }

    private fun card(context: Context, layout: Int, live: TrailLiveFields, base: Long?): RemoteViews {
      val views = RemoteViews(context.packageName, layout)
      if (base != null && !live.paused) {
        // Chronometer counts from an elapsedRealtime base; ours is wall-clock.
        val elapsedBase = SystemClock.elapsedRealtime() - (System.currentTimeMillis() - base)
        views.setChronometer(R.id.trail_clock, elapsedBase, null, true)
        views.setViewVisibility(R.id.trail_clock, View.VISIBLE)
        views.setViewVisibility(R.id.trail_time, View.GONE)
      } else {
        views.setChronometer(R.id.trail_clock, SystemClock.elapsedRealtime(), null, false)
        views.setViewVisibility(R.id.trail_clock, View.GONE)
        views.setViewVisibility(R.id.trail_time, View.VISIBLE)
        views.setTextViewText(R.id.trail_time, live.time)
      }
      views.setTextViewText(R.id.trail_status, live.warning.ifEmpty { live.status })
      if (live.warning.isNotEmpty()) {
        views.setTextColor(R.id.trail_status, ContextCompat.getColor(context, R.color.kaipa_trail_warning))
      }
      if (layout == R.layout.kaipa_trail_notification_small) {
        views.setTextViewText(R.id.trail_stats, "${live.distance}   ↑ ${live.ascent}   ↓ ${live.descent}")
      } else {
        views.setTextViewText(R.id.trail_name, live.name)
        views.setImageViewResource(R.id.trail_badge, if (live.paused) R.drawable.kaipa_trail_pause else R.drawable.kaipa_trail_notification)
        views.setInt(R.id.trail_badge, "setBackgroundResource", if (live.paused) R.drawable.kaipa_trail_badge_paused else R.drawable.kaipa_trail_badge)
        views.setTextViewText(R.id.trail_distance, live.distance)
        views.setTextViewText(R.id.trail_ascent, live.ascent)
        views.setTextViewText(R.id.trail_descent, live.descent)
        views.setTextViewText(R.id.trail_distance_label, live.distanceLabel)
        views.setTextViewText(R.id.trail_ascent_label, live.ascentLabel)
        views.setTextViewText(R.id.trail_descent_label, live.descentLabel)
      }
      return views
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
      syncWakeLock(this, value.chronometerBase != null)
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
    syncWakeLock(this, false)
    super.onDestroy()
  }
}
