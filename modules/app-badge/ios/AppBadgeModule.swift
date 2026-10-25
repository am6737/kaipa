import ExpoModulesCore
import UserNotifications

/// Clears the icon badge and whatever pushes are still sitting in Notification Center.
///
/// APNs sets the badge to an absolute number on every delivery, and the app never runs while it is in the
/// background, so nothing but the app itself can take it back down. Delivered notifications go with it:
/// once the app is open they are stale, and leaving them would show the same items twice.
public class AppBadgeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AppBadge")

    AsyncFunction("clearAll") { (promise: Promise) in
      let center = UNUserNotificationCenter.current()
      center.removeAllDeliveredNotifications()
      center.setBadgeCount(0) { error in
        if let error = error {
          promise.reject("E_BADGE", error.localizedDescription)
        } else {
          promise.resolve(nil)
        }
      }
    }
  }
}
