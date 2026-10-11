import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { requireNativeModule } from 'expo-modules-core';

export type DetentLevel = 'fine' | 'coarse';

export interface DetentFeedback {
  /** Warm the actuator ahead of a gesture so the first detent is not a cold start. */
  prepare(): void;
  detent(level: DetentLevel): void;
  boundary(): void;
  commit(): void;
}

type NativeEngine = {
  isSupported?: () => boolean;
  prepare?: () => Promise<void>;
  tick?: (level: DetentLevel) => Promise<void>;
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

/** `expo-haptics` still beats the previous implementation: selection ticks on iOS, framework detents on Android. */
const fallback: DetentFeedback = {
  prepare() {},
  detent(level) {
    if (Platform.OS === 'android') {
      run(Haptics.performAndroidHapticsAsync(
        level === 'coarse' ? Haptics.AndroidHaptics.Segment_Tick : Haptics.AndroidHaptics.Segment_Frequent_Tick,
      ));
      return;
    }
    if (level === 'coarse') {
      run(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid));
      return;
    }
    run(Haptics.selectionAsync());
  },
  boundary() {
    if (Platform.OS === 'android') {
      run(Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Context_Click));
      return;
    }
    run(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));
  },
  commit() {
    if (Platform.OS === 'android') {
      run(Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Confirm));
      return;
    }
    run(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
  },
};

const noop: DetentFeedback = {
  prepare() {},
  detent() {},
  boundary() {},
  commit() {},
};

export const detentFeedback: DetentFeedback = Platform.OS === 'web' ? noop : engine ? {
  prepare() {
    if (engine.prepare) run(engine.prepare());
  },
  detent(level) {
    if (engine.tick) run(engine.tick(level));
    else fallback.detent(level);
  },
  boundary() {
    if (engine.boundary) run(engine.boundary());
    else fallback.boundary();
  },
  commit() {
    if (engine.commit) run(engine.commit());
    else fallback.commit();
  },
} : fallback;
