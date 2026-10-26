import ActivityKit
import SwiftUI
import WidgetKit

// The 徒步记录 Live Activity: moving time, distance and climb on the lock screen and in the Dynamic
// Island, like the Android shade card. Every string arrives translated from JS; the clock ticks here
// from `startedAt`, so the app only updates the activity when the numbers change.

@main
struct TrailActivityBundle: WidgetBundle {
  var body: some Widget {
    TrailLiveActivity()
  }
}

private let trailColor = Color("trail")

/// `<app bundle id>://trail`: iOS registers the app's bundle id as a URL scheme, and this extension's id
/// is the app's plus `.trailactivity`, so dev and release builds each open themselves. The app opens the
/// 徒步导航 page on it (TrailContext).
private let trailURL: URL? = {
  let own = Bundle.main.bundleIdentifier ?? ""
  let suffix = ".trailactivity"
  guard own.hasSuffix(suffix) else { return nil }
  return URL(string: "\(own.dropLast(suffix.count))://trail")
}()

/// The moving time: counting up while recording, frozen while paused.
private struct TrailClock: View {
  let state: TrailActivityAttributes.ContentState

  var body: some View {
    if let start = state.startedAt, !state.paused {
      Text(timerInterval: start...Date.distantFuture, countsDown: false)
        .monospacedDigit()
    } else {
      Text(state.time)
        .monospacedDigit()
    }
  }
}

private struct TrailMark: View {
  let state: TrailActivityAttributes.ContentState

  var body: some View {
    Image(systemName: state.paused ? "pause.fill" : "figure.hiking")
      .foregroundStyle(state.paused ? Color.secondary : trailColor)
  }
}

private struct TrailClimb: View {
  let state: TrailActivityAttributes.ContentState

  var body: some View {
    Text("↑ \(state.ascent)   ↓ \(state.descent)")
      .monospacedDigit()
      .foregroundStyle(.secondary)
      .lineLimit(1)
  }
}

private struct TrailLockScreenView: View {
  let state: TrailActivityAttributes.ContentState

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(spacing: 6) {
        TrailMark(state: state)
          .font(.subheadline.weight(.semibold))
        Text(state.name)
          .font(.subheadline.weight(.semibold))
          .lineLimit(1)
        Spacer(minLength: 8)
        Text(state.warning.isEmpty ? state.status : state.warning)
          .font(.caption.weight(.medium))
          .foregroundStyle(state.warning.isEmpty ? Color.secondary : Color.orange)
          .lineLimit(1)
      }
      HStack(alignment: .lastTextBaseline) {
        TrailClock(state: state)
          .font(.system(size: 34, weight: .bold, design: .rounded))
          .foregroundStyle(state.paused ? Color.secondary : Color.primary)
          .lineLimit(1)
          .minimumScaleFactor(0.7)
        Spacer(minLength: 8)
        VStack(alignment: .trailing, spacing: 2) {
          Text(state.distance)
            .font(.title3.weight(.bold))
            .monospacedDigit()
            .lineLimit(1)
          TrailClimb(state: state)
            .font(.caption)
        }
      }
    }
    .padding(16)
  }
}

struct TrailLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: TrailActivityAttributes.self) { context in
      TrailLockScreenView(state: context.state)
        .activitySystemActionForegroundColor(trailColor)
        .widgetURL(trailURL)
    } dynamicIsland: { context in
      let state = context.state
      return DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          HStack(spacing: 6) {
            TrailMark(state: state)
            Text(state.status)
              .lineLimit(1)
          }
          .font(.caption.weight(.semibold))
          .padding(.leading, 4)
        }
        DynamicIslandExpandedRegion(.trailing) {
          Text(state.distance)
            .font(.headline)
            .monospacedDigit()
            .lineLimit(1)
            .padding(.trailing, 4)
        }
        DynamicIslandExpandedRegion(.bottom) {
          VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .lastTextBaseline) {
              TrailClock(state: state)
                .font(.system(size: 30, weight: .bold, design: .rounded))
                .lineLimit(1)
              Spacer(minLength: 8)
              TrailClimb(state: state)
                .font(.caption)
            }
            Text(state.warning.isEmpty ? state.name : state.warning)
              .font(.caption)
              .foregroundStyle(state.warning.isEmpty ? Color.secondary : Color.orange)
              .lineLimit(1)
          }
          .padding(.horizontal, 4)
        }
      } compactLeading: {
        HStack(spacing: 4) {
          TrailMark(state: state)
          Text(state.distance)
            .monospacedDigit()
            .lineLimit(1)
        }
        .font(.caption.weight(.semibold))
      } compactTrailing: {
        // A timer Text reserves room for its longest value; pin the width so the island stays tight.
        TrailClock(state: state)
          .font(.caption.weight(.semibold))
          .foregroundStyle(state.paused ? Color.secondary : trailColor)
          .multilineTextAlignment(.trailing)
          .frame(maxWidth: 56, alignment: .trailing)
      } minimal: {
        TrailMark(state: state)
      }
      .keylineTint(trailColor)
      .widgetURL(trailURL)
    }
  }
}
