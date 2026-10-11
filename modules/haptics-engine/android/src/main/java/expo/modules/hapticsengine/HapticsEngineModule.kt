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
 */
class HapticsEngineModule : Module() {
  private enum class Level { FINE, COARSE, BOUNDARY, COMMIT }

  override fun definition() = ModuleDefinition {
    Name("HapticsEngine")

    Function("isSupported") {
      hasVibrator() || contentView()?.isHapticFeedbackEnabled == true
    }

    AsyncFunction("tick") { level: String ->
      fire(if (level == "coarse") Level.COARSE else Level.FINE)
    }

    AsyncFunction("boundary") {
      fire(Level.BOUNDARY)
    }

    AsyncFunction("commit") {
      fire(Level.COMMIT)
    }
  }

  private fun fire(level: Level) {
    if (segmentTick(level)) return
    if (primitiveTick(level)) return
    legacyTick(level)
  }

  /**
   * Android 13/14 detent semantics, plus the 12+ confirm/reject events. Always preferred over the raw
   * vibrator because `performHapticFeedback` is the path that honours the system haptics toggle.
   */
  private fun segmentTick(level: Level): Boolean {
    val view = contentView() ?: return false
    if (!view.isHapticFeedbackEnabled) return false
    val constant = when (level) {
      // SEGMENT_* are 33/34; below them a fine detent is better served by a device primitive.
      Level.FINE -> if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) null else constantOrNull("SEGMENT_FREQUENT_TICK")
      Level.COARSE -> if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) null
        else constantOrNull("SEGMENT_TICK") ?: constantOrNull("SEGMENT_FREQUENT_TICK")
      // Reaching the end of the ruler is a refusal to go further; stopping under the finger is a completion.
      Level.BOUNDARY -> if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) null else constantOrNull("REJECT")
      Level.COMMIT -> if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) null else constantOrNull("CONFIRM")
    } ?: return false
    return view.performHapticFeedback(constant)
  }

  /** Android 10+: use the primitive this device's motor is tuned for, scaled down for fine detents. */
  private fun primitiveTick(level: Level): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return false
    val vibrator = vibrator() ?: return false
    if (!vibrator.hasVibrator()) return false
    val (name, scale) = when (level) {
      Level.FINE -> "PRIMITIVE_TICK" to 0.45f
      Level.COARSE -> "PRIMITIVE_CLICK" to 0.8f
      Level.BOUNDARY -> "PRIMITIVE_HEAVY_CLICK" to 1.0f
      Level.COMMIT -> "PRIMITIVE_CLICK" to 1.0f
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
   * Oldest devices: `CLOCK_TICK` is what the framework's own `NumberPicker` uses, so fine and coarse
   * land on the same effect there. Better than silence, and the value readout still carries the rest.
   */
  private fun legacyTick(level: Level) {
    val view = contentView() ?: return
    val constant = when (level) {
      Level.FINE, Level.COARSE -> HapticFeedbackConstants.CLOCK_TICK
      else -> HapticFeedbackConstants.CONTEXT_CLICK
    }
    view.performHapticFeedback(constant)
  }

  private fun contentView(): View? = appContext.currentActivity?.findViewById<View>(android.R.id.content)

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
