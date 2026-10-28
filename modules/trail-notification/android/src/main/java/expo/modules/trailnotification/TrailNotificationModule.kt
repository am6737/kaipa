package expo.modules.trailnotification

import android.app.NotificationManager
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class TrailNotificationPayload : Record {
  @Field val title: String = ""
  @Field val text: String = ""
  @Field val chronometerBase: Double? = null
  @Field val subText: String? = null
  @Field val channelName: String = ""
  @Field val live: TrailLivePayload? = null
}

class TrailLivePayload : Record {
  @Field val name: String = ""
  @Field val status: String = ""
  @Field val paused: Boolean = false
  @Field val time: String = ""
  @Field val distance: String = ""
  @Field val ascent: String = ""
  @Field val descent: String = ""
  @Field val distanceLabel: String = ""
  @Field val ascentLabel: String = ""
  @Field val descentLabel: String = ""
  @Field val warning: String = ""
}

class TrailNotificationModule : Module() {
  private val context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private fun TrailNotificationPayload.toContent() = TrailNotificationContent(
    title = title,
    text = text,
    chronometerBase = chronometerBase?.toLong(),
    subText = subText?.takeIf { it.isNotEmpty() },
    channelName = channelName,
    live = live?.let {
      TrailLiveFields(
        name = it.name,
        status = it.status,
        paused = it.paused,
        time = it.time,
        distance = it.distance,
        ascent = it.ascent,
        descent = it.descent,
        distanceLabel = it.distanceLabel,
        ascentLabel = it.ascentLabel,
        descentLabel = it.descentLabel,
        warning = it.warning,
      )
    },
  )

  override fun definition() = ModuleDefinition {
    Name("TrailNotification")

    AsyncFunction("start") { payload: TrailNotificationPayload ->
      TrailRecordingService.content = payload.toContent()
      if (TrailRecordingService.running) TrailRecordingService.refresh(context)
      else TrailRecordingService.start(context)
    }

    AsyncFunction("stop") {
      TrailRecordingService.content = null
      TrailRecordingService.stop(context)
    }

    // What the user has allowed for the recording card. OEM skins (ColorOS 横幅/锁屏, HyperOS 锁屏通知) keep
    // some of their switches outside these APIs, so a clean answer here does not prove the lock screen shows it.
    Function("notificationStatus") {
      val manager = context.getSystemService(android.content.Context.NOTIFICATION_SERVICE) as NotificationManager
      val channel = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) manager.getNotificationChannel(TrailRecordingService.CHANNEL_ID) else null
      mapOf(
        "enabled" to manager.areNotificationsEnabled(),
        "importance" to channel?.importance,
        "lockscreenVisibility" to channel?.lockscreenVisibility,
      )
    }

    // The app's own notification page, where the 锁屏/横幅 switches live; the app details page where it is missing.
    Function("openNotificationSettings") {
      val ctx = context
      val notifications = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
        .putExtra(Settings.EXTRA_APP_PACKAGE, ctx.packageName)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      val details = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${ctx.packageName}"))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      try {
        ctx.startActivity(notifications)
      } catch (_: Exception) {
        ctx.startActivity(details)
      }
    }

    // Accelerometer stillness for the recorder; see StillnessDetector.
    Function("startStillness") { StillnessDetector.start(context) }
    Function("stopStillness") { StillnessDetector.stop() }
    Function("stillnessSpread") { StillnessDetector.spread() }
  }
}
