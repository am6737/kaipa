package expo.modules.appbadge

import android.app.Notification
import android.app.NotificationManager
import android.content.Context
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Dismisses the app's delivered notifications so the launcher badge goes with them.
 *
 * Stock Android, Samsung and MIUI draw the badge from the notifications still in the shade, so setting a
 * number does nothing there: the badge only clears once those notifications are gone. Ongoing and
 * foreground-service notifications are left alone; they are not messages, and cancelling them would
 * break whatever posted them. Vendor launchers that keep their own count (Huawei, Honor, vivo, OPPO) are
 * reset from JS through DooPush.
 */
class AppBadgeModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AppBadge")

    AsyncFunction("clearAll") {
      val context = appContext.reactContext ?: return@AsyncFunction
      val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      val keep = Notification.FLAG_ONGOING_EVENT or Notification.FLAG_FOREGROUND_SERVICE
      for (sbn in nm.activeNotifications) {
        if ((sbn.notification.flags and keep) != 0) continue
        nm.cancel(sbn.tag, sbn.id)
      }
    }
  }
}
