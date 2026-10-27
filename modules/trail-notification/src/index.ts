import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

export interface TrailNotificationContent {
  title: string;
  text: string;
  /** Wall-clock ms at which the moving time was zero; the shade counts up from it. Null while paused. */
  chronometerBase: number | null;
  /** Small header text beside the app name, e.g. a GPS warning. */
  subText?: string;
  /** The channel's name in system settings. */
  channelName: string;
  /** The same walk split into fields, for the iOS Live Activity (lock screen and Dynamic Island). */
  live: TrailLiveContent;
}

export interface TrailLiveContent {
  /** Route name, or 自由记录. */
  name: string;
  /** 记录中 / 已暂停. */
  status: string;
  paused: boolean;
  /** Formatted moving time; shown as is while paused, the running clock counts from chronometerBase. */
  time: string;
  /** e.g. "3.21 km". */
  distance: string;
  ascent: string;
  descent: string;
  /** GPS warning, or empty. */
  warning: string;
}

type NativeTrailNotification = {
  start?: (content: TrailNotificationContent) => Promise<void>;
  stop?: () => Promise<void>;
  startStillness?: () => boolean;
  stopStillness?: () => void;
  stillnessSpread?: () => number | null;
};

const native = Platform.OS === 'android'
  ? requireOptionalNativeModule<NativeTrailNotification>('TrailNotification')
  : null;

// iOS: an ActivityKit Live Activity drawn by the TrailLiveActivity widget extension (targets/).
const nativeLive = Platform.OS === 'ios'
  ? requireOptionalNativeModule<NativeTrailNotification>('TrailLiveActivity')
  : null;

/** The Android foreground service. False off Android, on Expo Go, and on binaries built before this module existed. */
export const hasTrailNotification = !!native?.start;

/** The iOS Live Activity. False off iOS, on Expo Go, and on binaries built before it existed. */
export const hasTrailLiveActivity = !!nativeLive?.start;

/** Starts the recording's foreground service or Live Activity, or updates it when already running. */
export async function startTrailNotification(content: TrailNotificationContent): Promise<void> {
  if (native?.start) await native.start(content);
  if (nativeLive?.start) await nativeLive.start(content);
}

export async function stopTrailNotification(): Promise<void> {
  if (native?.stop) await native.stop();
  if (nativeLive?.stop) await nativeLive.stop();
}

/**
 * Android: accelerometer stillness measured natively, so it keeps going with
 * the screen locked (expo-sensors stops then). Null off Android and on
 * binaries built before it existed.
 */
export const nativeStillness = native?.startStillness && native.stopStillness && native.stillnessSpread
  ? {
    start: () => native.startStillness!(),
    stop: () => native.stopStillness!(),
    /** Spread of |a| over the last 4 s relative to its mean; null when there is no recent full window. */
    spread: () => native.stillnessSpread!() ?? null,
  }
  : null;
