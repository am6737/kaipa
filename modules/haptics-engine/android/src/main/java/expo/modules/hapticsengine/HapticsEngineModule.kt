package expo.modules.hapticsengine

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.view.HapticFeedbackConstants
import android.view.View
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Detent feedback for rulers and wheels.
 *
 * `expo-haptics` routes every Android impact/selection call through one canned
 * `createWaveform([0, 50], [0, 30])` burst, so detents fired closer than 50 ms restart each other and
 * the motor never stops: a buzz with no clicks. This module asks the framework or the device's own
 * vibration primitives for a short click instead, and degrades when a device has neither.
 *
 * Three events, no soft tier to pad the notch with. A tickmark is one click, and a fling passes a hundred
 * of them per second, so the notch has to be the shortest thing this cascade can find: mass belongs to the
 * limit and the settle, which answer the user rather than mark travel.
 */
class HapticsEngineModule : Module() {
  private enum class Event { NOTCH, BOUNDARY, COMMIT }

  override fun definition() = ModuleDefinition {
    Name("HapticsEngine")

    // Capability only, and without touching the activity: this runs once at JS load, where a null
    // `currentActivity` would otherwise downgrade every device to the weaker `expo-haptics` path.
    Function("isSupported") {
      hasVibrator()
    }

    AsyncFunction("detent") {
      fire(Event.NOTCH)
    }

    AsyncFunction("boundary") {
      fire(Event.BOUNDARY)
    }

    AsyncFunction("commit") {
      fire(Event.COMMIT)
    }
  }

  private fun fire(event: Event) {
    if (!hapticsEnabled()) return
    if (frameworkEvent(event)) return
    if (primitiveEvent(event)) return
    legacyEvent(event)
  }

  /**
   * The framework's own picker events. Preferred over the raw vibrator because `performHapticFeedback` is
   * the path that honours the system haptics toggle and each OEM's tuning of these named effects.
   *
   * `SEGMENT_TICK` is Android 14's ruler segment, `VIRTUAL_KEY` is the nav-bar click and `CLOCK_TICK` what
   * `NumberPicker` fires per row. All three are short: a fling crosses a hundred tickmarks a second, and a
   * canned burst with mass in it restarts before it lands, which is a buzz no intensity can rescue.
   */
  private fun frameworkEvent(event: Event): Boolean {
    val view = contentView() ?: return false
    val constant = when (event) {
      Event.NOTCH -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) constantOrNull("SEGMENT_TICK")
        ?: HapticFeedbackConstants.VIRTUAL_KEY else HapticFeedbackConstants.VIRTUAL_KEY
      // Reaching the end of the ruler is a refusal to go further; stopping under the finger is a completion.
      Event.BOUNDARY -> if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) null else constantOrNull("REJECT")
      Event.COMMIT -> if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) null else constantOrNull("CONFIRM")
    } ?: return false
    return view.performHapticFeedback(constant)
  }

  /** Android 10+: the primitive this device's motor is tuned for. */
  private fun primitiveEvent(event: Event): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return false
    val vibrator = vibrator() ?: return false
    if (!vibrator.hasVibrator()) return false
    val (name, scale) = when (event) {
      Event.NOTCH -> "PRIMITIVE_CLICK" to 1.0f
      Event.BOUNDARY -> "PRIMITIVE_HEAVY_CLICK" to 1.0f
      Event.COMMIT -> "PRIMITIVE_CLICK" to 1.0f
    }
    val primitive = primitiveId(name) ?: return false
    return try {
      if (!vibrator.areAllPrimitivesSupported(primitive)) return false
      val effect = VibrationEffect.startComposition().addPrimitive(primitive, scale).compose()
      vibrator.vibrate(effect)
      true
    } catch (error: Throwable) {
      false
    }
  }

  /**
   * Oldest devices: `CLOCK_TICK` is what the framework's own `NumberPicker` uses, so a notch and a limit
   * share two canned events there. Better than silence, and the readout still carries the fine value.
   */
  private fun legacyEvent(event: Event) {
    val view = contentView() ?: return
    val constant = if (event == Event.NOTCH) HapticFeedbackConstants.CLOCK_TICK else HapticFeedbackConstants.CONTEXT_CLICK
    view.performHapticFeedback(constant)
  }

  private fun contentView(): View? = appContext.currentActivity?.findViewById<View>(android.R.id.content)

  // `performHapticFeedback` honours the system haptics toggle on its own; the raw vibrator does not, so the
  // fallback has to be gated the same way or a disabled setting leaks one buzz per notch.
  private fun hapticsEnabled(): Boolean = contentView()?.isHapticFeedbackEnabled ?: true

  private fun vibrator(): Vibrator? {
    val context = appContext.reactContext ?: return null
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      (context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
    } else {
      @Suppress("DEPRECATION")
      context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
    }
  }

  private fun hasVibrator(): Boolean = vibrator()?.hasVibrator() == true

  // Field names are spread across API levels, so resolve them at runtime rather than pinning a check per constant.
  private fun constantOrNull(name: String): Int? = try {
    HapticFeedbackConstants::class.java.getDeclaredField(name).getInt(null)
  } catch (error: Throwable) {
    null
  }

  private fun primitiveId(name: String): Int? = try {
    Class.forName("android.os.VibrationEffect\$Composition").getDeclaredField(name).getInt(null)
  } catch (error: Throwable) {
    null
  }
}
