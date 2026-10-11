import ExpoModulesCore
import UIKit

/// Detent feedback for rulers and wheels, built on the event the Clock app's countdown wheel uses.
///
/// Generators are created once and re-armed after every event: `prepare()` only helps when the Taptic
/// Engine gets it ahead of the trigger, and `expo-haptics` builds a fresh generator per call, which makes
/// every detent pay a cold motor start — that is what reads as weak rather than crisp.
///
/// One tickmark is one event, spaced by the actuator rather than by the scroll callback — see the JS facade.
///
/// `rigid` at full intensity is the firmest short event UIKit offers: it has almost no decay, so a fast
/// flick stays a train of separate clicks instead of smearing into the buzz a heavier style produces.
/// Weight belongs to the two events that answer the user rather than mark travel, which is why the limit
/// and the settle are notifications.
public class HapticsEngineModule: Module {
  private let notch = UIImpactFeedbackGenerator(style: .rigid)
  private let signal = UINotificationFeedbackGenerator()

  public func definition() -> ModuleDefinition {
    Name("HapticsEngine")

    Function("isSupported") { () -> Bool in
      #if targetEnvironment(simulator)
      return false
      #else
      return true
      #endif
    }

    AsyncFunction("prepare") {
      self.notch.prepare()
      self.signal.prepare()
    }.runOnQueue(.main)

    AsyncFunction("detent") {
      self.notch.impactOccurred(intensity: 1.0)
      self.notch.prepare()
    }.runOnQueue(.main)

    AsyncFunction("boundary") {
      self.ring(.error)
    }.runOnQueue(.main)

    AsyncFunction("commit") {
      self.ring(.success)
    }.runOnQueue(.main)
  }

  private func ring(_ type: UINotificationFeedbackGenerator.FeedbackType) {
    signal.notificationOccurred(type)
    signal.prepare()
  }
}
