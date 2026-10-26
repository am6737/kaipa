// deviceStillness.ts — whether the phone itself is lying still, from the
// accelerometer. GPS alone can't tell standing still from walking slowly:
// indoors and under cover the fixes wander 10–30 m with the phone on a table.
// The accelerometer can, so while it says still the recorder holds the
// position and draws nothing.
//
// Fails open: no sensor (an older binary, a device without one) or no recent
// samples (Android stops the sensor while the app is in the background) means
// "don't know", and the recorder falls back to filtering GPS alone.
import { Platform } from 'react-native';

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
// held in a still hand about 0.01, one in a hand or pocket while walking 0.1+.
const STILL_SPREAD = 0.02;
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
