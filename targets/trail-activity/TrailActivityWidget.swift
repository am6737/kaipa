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
private let cardColor = Color("card")

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

/// The activity badge: a filled circle with the hiker, grey with a pause glyph while paused.
private struct TrailMark: View {
  let state: TrailActivityAttributes.ContentState
  var size: CGFloat = 22

  var body: some View {
    Image(systemName: state.paused ? "pause.fill" : "figure.hiking")
      .font(.system(size: size * 0.55, weight: .bold))
      .foregroundStyle(.white)
      .frame(width: size, height: size)
      .background(Circle().fill(state.paused ? Color.gray : trailColor))
  }
}

/// 记录中 / 已暂停, or the GPS warning in orange.
private struct TrailStatus: View {
  let state: TrailActivityAttributes.ContentState

  var body: some View {
    Text(state.warning.isEmpty ? state.status : state.warning)
      .foregroundStyle(state.warning.isEmpty ? Color.secondary : Color.orange)
      .lineLimit(1)
  }
}

/// One number with its caption under it, centred in its third of the row.
private struct TrailStat: View {
  let value: String
  let label: String

  var body: some View {
    VStack(spacing: 2) {
      Text(value)
        .font(.system(.headline, design: .rounded).weight(.semibold))
        .monospacedDigit()
        .lineLimit(1)
        .minimumScaleFactor(0.7)
      Text(label)
        .font(.caption2)
        .foregroundStyle(.secondary)
        .lineLimit(1)
    }
    .frame(maxWidth: .infinity)
  }
}

/// Distance, ascent and descent in three even columns; the gaps between them carry the separation.
private struct TrailStats: View {
  let state: TrailActivityAttributes.ContentState

  var body: some View {
    HStack(spacing: 0) {
      TrailStat(value: state.distance, label: state.distanceLabel)
      TrailStat(value: state.ascent, label: state.ascentLabel)
      TrailStat(value: state.descent, label: state.descentLabel)
    }
  }
}

private struct TrailLockScreenView: View {
  let state: TrailActivityAttributes.ContentState

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      HStack(spacing: 8) {
        TrailMark(state: state)
        Text(state.name)
          .font(.subheadline.weight(.semibold))
          .lineLimit(1)
        Spacer(minLength: 8)
        TrailStatus(state: state)
          .font(.caption.weight(.medium))
      }
      TrailClock(state: state)
        .font(.system(size: 46, weight: .semibold, design: .rounded))
        .foregroundStyle(state.paused ? Color.secondary : Color.primary)
        .lineLimit(1)
        .minimumScaleFactor(0.7)
        .padding(.top, 8)
      TrailStats(state: state)
        .padding(.top, 10)
    }
    .padding(.horizontal, 18)
    .padding(.vertical, 16)
  }
}

struct TrailLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: TrailActivityAttributes.self) { context in
      TrailLockScreenView(state: context.state)
        .activityBackgroundTint(cardColor)
        .activitySystemActionForegroundColor(trailColor)
        .widgetURL(trailURL)
    } dynamicIsland: { context in
      let state = context.state
      return DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          HStack(spacing: 6) {
            TrailMark(state: state, size: 18)
            Text(state.name)
              .lineLimit(1)
          }
          .font(.caption.weight(.semibold))
          .padding(.leading, 4)
        }
        DynamicIslandExpandedRegion(.trailing) {
          TrailStatus(state: state)
            .font(.caption.weight(.medium))
            .padding(.trailing, 4)
        }
        DynamicIslandExpandedRegion(.bottom) {
          VStack(alignment: .leading, spacing: 6) {
            TrailClock(state: state)
              .font(.system(size: 34, weight: .semibold, design: .rounded))
              .foregroundStyle(state.paused ? Color.secondary : Color.primary)
              .lineLimit(1)
            TrailStats(state: state)
          }
          .padding(.horizontal, 4)
        }
      } compactLeading: {
        HStack(spacing: 4) {
          TrailMark(state: state, size: 18)
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
        TrailMark(state: state, size: 18)
      }
      .keylineTint(trailColor)
      .widgetURL(trailURL)
    }
  }
}
