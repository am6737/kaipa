import ExpoModulesCore
import UIKit

/// Detent feedback driven by intensity, which `expo-haptics` does not expose.
///
/// Generators are created once and re-armed after every event: `prepare()` only helps when the
/// Taptic Engine gets it ahead of the trigger, and `expo-haptics` builds a fresh generator per call,
/// which makes every detent pay a cold motor start.
public class HapticsEngineModule: Module {
  private let fine = UISelectionFeedbackGenerator()
  private let coarse = UIImpactFeedbackGenerator(style: .rigid)
  private let boundary = UIImpactFeedbackGenerator(style: .heavy)
  private let commit = UIImpactFeedbackGenerator(style: .medium)

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
      self.arm()
    }.runOnQueue(.main)

    AsyncFunction("tick") { (level: String) in
      if level == "coarse" {
        self.play(self.coarse, 0.7)
      } else {
        self.play(self.fine)
      }
    }.runOnQueue(.main)

    AsyncFunction("boundary") {
      self.play(self.boundary, 0.85)
    }.runOnQueue(.main)

    AsyncFunction("commit") {
      self.play(self.commit, 0.75)
    }.runOnQueue(.main)
  }

  private func arm() {
    fine.prepare()
    coarse.prepare()
    boundary.prepare()
    commit.prepare()
  }

  private func play(_ generator: UIImpactFeedbackGenerator, _ intensity: CGFloat) {
    generator.impactOccurred(intensity: intensity)
    generator.prepare()
  }

  private func play(_ generator: UISelectionFeedbackGenerator) {
    generator.selectionChanged()
    generator.prepare()
  }
}
