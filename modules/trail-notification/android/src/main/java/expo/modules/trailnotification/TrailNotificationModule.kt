package expo.modules.trailnotification

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

    // Accelerometer stillness for the recorder; see StillnessDetector.
    Function("startStillness") { StillnessDetector.start(context) }
    Function("stopStillness") { StillnessDetector.stop() }
    Function("stillnessSpread") { StillnessDetector.spread() }
  }
}
