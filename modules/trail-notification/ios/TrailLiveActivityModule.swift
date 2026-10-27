import ActivityKit
import ExpoModulesCore

struct TrailLivePayload: Record {
  @Field var name: String = ""
  @Field var status: String = ""
  @Field var paused: Bool = false
  @Field var time: String = ""
  @Field var distance: String = ""
  @Field var ascent: String = ""
  @Field var descent: String = ""
  @Field var distanceLabel: String = ""
  @Field var ascentLabel: String = ""
  @Field var descentLabel: String = ""
  @Field var warning: String = ""
}

/// Same payload the Android service gets; iOS reads the clock base and the split-out `live` fields.
struct TrailLiveActivityPayload: Record {
  @Field var chronometerBase: Double? = nil
  @Field var live: TrailLivePayload = TrailLivePayload()

  var state: TrailActivityAttributes.ContentState {
    TrailActivityAttributes.ContentState(
      name: live.name,
      status: live.status,
      paused: live.paused,
      startedAt: chronometerBase.map { Date(timeIntervalSince1970: $0 / 1000) },
      time: live.time,
      distance: live.distance,
      ascent: live.ascent,
      descent: live.descent,
      distanceLabel: live.distanceLabel,
      ascentLabel: live.ascentLabel,
      descentLabel: live.descentLabel,
      warning: live.warning
    )
  }
}

/**
 * The 徒步记录 on the lock screen and in the Dynamic Island, the iOS counterpart of the Android
 * shade notification. The clock ticks in the widget from `startedAt`, so JS only updates the
 * activity when the distance, climb or status changes.
 *
 * A Live Activity can only be started while the app is in the foreground; a recording always starts
 * on screen, and later updates arrive from the background location feed. An activity left over from
 * a killed process is picked up again instead of starting a second one.
 */
public class TrailLiveActivityModule: Module {
  public func definition() -> ModuleDefinition {
    Name("TrailLiveActivity")

    AsyncFunction("start") { (payload: TrailLiveActivityPayload) async in
      await TrailLiveActivityModule.show(payload.state)
    }

    AsyncFunction("stop") { () async in
      for activity in Activity<TrailActivityAttributes>.activities {
        await activity.end(nil, dismissalPolicy: .immediate)
      }
    }
  }

  private static func show(_ state: TrailActivityAttributes.ContentState) async {
    let content = ActivityContent(state: state, staleDate: nil)
    let live = Activity<TrailActivityAttributes>.activities.filter {
      $0.activityState == .active || $0.activityState == .stale
    }
    if let activity = live.first {
      for extra in live.dropFirst() {
        await extra.end(nil, dismissalPolicy: .immediate)
      }
      await activity.update(content)
      return
    }
    // Turned off for the app in Settings: record without it.
    guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
    do {
      _ = try Activity.request(attributes: TrailActivityAttributes(), content: content, pushType: nil)
    } catch {
      // Requested from the background, or the system's limit on activities reached.
      NSLog("[TrailLiveActivity] request failed: %@", error.localizedDescription)
    }
  }
}
