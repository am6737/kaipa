import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { requireNativeModule } from 'expo-modules-core';

export interface DetentFeedback {
  /** Warm the actuator ahead of a gesture so the first detent is not a cold start. */
  prepare(): void;
  /** One notch passed. There is deliberately no level: a ruler has one click, and its density is the tuning knob. */
  detent(): void;
  boundary(): void;
  commit(): void;
}

type NativeEngine = {
  isSupported?: () => boolean;
  prepare?: () => Promise<void>;
  detent?: () => Promise<void>;
  boundary?: () => Promise<void>;
  commit?: () => Promise<void>;
};

const run = (promise: Promise<unknown>) => { void promise.catch(() => {}); };

function loadEngine(): NativeEngine | null {
  if (Platform.OS === 'web') return null;
  try {
    const engine = requireNativeModule('HapticsEngine') as NativeEngine;
    return engine.isSupported?.() === false ? null : engine;
  } catch {
    // A binary older than the module, or a runtime without an actuator.
    return null;
  }
}

const engine = loadEngine();

/**
 * Older binary or Expo Go: the same three events, expressed in what `expo-haptics` exposes. `Rigid` and
 * `Virtual_Key` are the firmest short clicks either platform offers, so a notch is still a click and not a
 * canned 50 ms thud even when the native module is missing from the binary.
 */
const fallback: DetentFeedback = {
  prepare() {},
  detent() {
    if (Platform.OS === 'android') {
      run(Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Virtual_Key));
      return;
    }
    run(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid));
  },
  boundary() {
    if (Platform.OS === 'android') {
      run(Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Reject));
      return;
    }
    run(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
  },
  commit() {
    if (Platform.OS === 'android') {
      run(Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Confirm));
      return;
    }
    run(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
  },
};

const noop: DetentFeedback = {
  prepare() {},
  detent() {},
  boundary() {},
  commit() {},
};

/**
 * One click per actuator recovery, whatever the caller reports.
 *
 * A wheel hands over one row at a time, so its events are already spaced. A ruler hands over a float
 * offset, so `Math.round` walks back and forth over one boundary while the list settles, and a fling can
 * cross a hundred tickmarks in a second. Both cases turn the same short click into a continuous buzz.
 * Below this spacing the ruler is moving faster than any actuator can restart, and the train is meant to
 * merge into a roll the way a hard flick on a wheel does.
 */
const MIN_SPACING_MS = 30;
let lastDetentAt = 0;

function throttled(detent: () => void): () => void {
  return () => {
    const now = Date.now();
    if (now - lastDetentAt < MIN_SPACING_MS) return;
    lastDetentAt = now;
    detent();
  };
}

const playDetent = throttled(() => {
  if (engine?.detent) run(engine.detent());
  else fallback.detent();
});

export const detentFeedback: DetentFeedback = Platform.OS === 'web' ? noop : {
  prepare() {
    if (engine?.prepare) run(engine.prepare());
  },
  detent: playDetent,
  boundary() {
    if (engine?.boundary) run(engine.boundary());
    else fallback.boundary();
  },
  commit() {
    if (engine?.commit) run(engine.commit());
    else fallback.commit();
  },
};
