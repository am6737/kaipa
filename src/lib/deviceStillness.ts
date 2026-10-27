// deviceStillness.ts — whether the phone itself is lying still, from the
// accelerometer. GPS alone can't tell standing still from walking slowly:
// indoors and under cover the fixes wander 10–30 m with the phone on a table.
// The accelerometer can, so while it says still the recorder holds the
// position and draws nothing.
//
// Android measures it natively in the trail-notification module: expo-sensors
// there stops listening as soon as the screen locks, which is when a walk
// records. iOS keeps expo-sensors' feed while the app runs in the background.
//
// Fails open: no sensor (an older binary, a device without one) or no recent
// samples means "don't know", and the recorder falls back to filtering GPS alone.
import { Platform } from 'react-native';
import { nativeStillness } from '../../modules/trail-notification';

type AccelerometerModule = typeof import('expo-sensors').Accelerometer;

let Accelerometer: AccelerometerModule | null = null;
if (Platform.OS !== 'web') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    Accelerometer = (require('expo-sensors') as typeof import('expo-sensors')).Accelerometer;
  } catch {
    Accelerometer = null;
  }
}

const SAMPLE_MS = 100;
// Still means this long without the phone being moved.
const WINDOW_MS = 4_000;
// Spread of |a| relative to its mean. A phone on a table reads under 0.005, one
// held in a hand while standing up to about 0.03, one in a hand, pocket or
// pack while walking 0.1 and more.
const STILL_SPREAD = 0.04;
// Samples older than this are stale: the sensor stopped.
const STALE_MS = 1_500;

let subscription: { remove(): void } | null = null;
let users = 0;
let samples: { t: number; m: number }[] = [];

function onSample({ x, y, z }: { x: number; y: number; z: number }) {
  const t = Date.now();
  samples.push({ t, m: Math.hypot(x, y, z) });
  while (samples.length && samples[0].t < t - WINDOW_MS) samples.shift();
}

/** Ref-counted; the returned function stops this user's interest. */
export function watchDeviceStillness(): () => void {
  users += 1;
  if (nativeStillness) {
    let native = false;
    try {
      native = nativeStillness.start();
    } catch {
      native = false;
    }
    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      users = Math.max(0, users - 1);
      if (native) nativeStillness?.stop();
    };
  }
  if (users === 1 && Accelerometer) {
    try {
      Accelerometer.setUpdateInterval(SAMPLE_MS);
      subscription = Accelerometer.addListener(onSample);
    } catch {
      subscription = null;
    }
  }
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    users = Math.max(0, users - 1);
    if (users === 0) {
      subscription?.remove();
      subscription = null;
      samples = [];
    }
  };
}

/** True when the phone has not moved for the whole window, null when unknown. */
export function isDeviceStill(now = Date.now()): boolean | null {
  if (nativeStillness) {
    try {
      const spread = nativeStillness.spread();
      return spread == null ? null : spread < STILL_SPREAD;
    } catch {
      return null;
    }
  }
  if (!samples.length || now - samples[samples.length - 1].t > STALE_MS) return null;
  // Needs most of a full window, or a phone just put down would count as still.
  if (samples[0].t > now - WINDOW_MS * 0.9 || samples.length < (WINDOW_MS / SAMPLE_MS) * 0.6) return null;
  let sum = 0;
  for (const sample of samples) sum += sample.m;
  const mean = sum / samples.length;
  if (!(mean > 0)) return null;
  let squares = 0;
  for (const sample of samples) squares += (sample.m - mean) ** 2;
  return Math.sqrt(squares / samples.length) / mean < STILL_SPREAD;
}
