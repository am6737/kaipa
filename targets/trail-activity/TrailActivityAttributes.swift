import ActivityKit
import Foundation

// KEEP IN SYNC with modules/trail-notification/ios/TrailActivityAttributes.swift. ActivityKit matches the app's
// activity to the widget extension's view by this type's name and its Codable shape, so both copies
// must have the same name and fields.
struct TrailActivityAttributes: ActivityAttributes {
  struct ContentState: Codable, Hashable {
    var name: String
    var status: String
    var paused: Bool
    /// When the moving time was zero; the clock counts up from it. Nil while paused.
    var startedAt: Date?
    /// The banked moving time, shown while paused.
    var time: String
    var distance: String
    var ascent: String
    var descent: String
    /// Captions under the three numbers, e.g. 里程 / 爬升 / 下降.
    var distanceLabel: String
    var ascentLabel: String
    var descentLabel: String
    var warning: String
  }
}
