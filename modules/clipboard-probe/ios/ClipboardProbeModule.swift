import ExpoModulesCore
import UIKit

/// Reads the pasteboard only as far as iOS lets us without the "Allow Paste" banner.
///
/// `expo-clipboard` exposes no `changeCount` and no pattern detection, so the JS scan could only ask
/// `getStringAsync`, and on iOS 16+ that prompts for every resume where any app has put text on the
/// pasteboard. `changeCount` and `detectPatterns` are the two non-invasive observations Apple allows:
/// neither returns content, so neither is treated as a read. Nothing here may ever touch `string`,
/// `strings`, `url`, `urls`, or the detected *values* — the moment it does, the banner is back.
public class ClipboardProbeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ClipboardProbe")

    // Increments on every pasteboard write, including when a reactivation notices another app changed it.
    Function("changeCount") { () -> Int in
      UIPasteboard.general.changeCount
    }

    AsyncFunction("detectLink") { (promise: Promise) in
      let pasteboard = UIPasteboard.general
      guard pasteboard.hasStrings else {
        promise.resolve(false)
        return
      }
      // The deployment target is iOS 16.4, so the iOS 15 key-path API is always there. `links` matches
      // text that *contains* a URL, which is what shop share text is; `probableWebURL` only matches text
      // that is a single URL and is asked alongside it for a bare link copied from Safari.
      let links: PartialKeyPath<UIPasteboard.DetectedValues> = \UIPasteboard.DetectedValues.links
      let webURL: PartialKeyPath<UIPasteboard.DetectedValues> = \UIPasteboard.DetectedValues.probableWebURL
      pasteboard.detectPatterns(for: [links, webURL]) { result in
        switch result {
        case .success(let detected):
          promise.resolve(detected.contains(links) || detected.contains(webURL))
        case .failure:
          // An error means "no link": it only skips this scan, never crashes it.
          promise.resolve(false)
        }
      }
    }.runOnQueue(.main)
  }
}
