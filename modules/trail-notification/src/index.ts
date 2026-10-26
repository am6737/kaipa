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
}

type NativeTrailNotification = {
  start?: (content: TrailNotificationContent) => Promise<void>;
  stop?: () => Promise<void>;
};

const native = Platform.OS === 'android'
  ? requireOptionalNativeModule<NativeTrailNotification>('TrailNotification')
  : null;

/** False off Android, on Expo Go, and on binaries built before this module existed. */
export const hasTrailNotification = !!native?.start;

/** Starts the recording's foreground service, or updates it when already running. */
export async function startTrailNotification(content: TrailNotificationContent): Promise<void> {
  if (native?.start) await native.start(content);
}

export async function stopTrailNotification(): Promise<void> {
  if (native?.stop) await native.stop();
}
