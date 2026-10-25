import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

type NativeAppBadge = {
  clearAll?: () => Promise<void>;
};

const native = Platform.OS === 'web' ? null : requireOptionalNativeModule<NativeAppBadge>('AppBadge');

/** False on Expo Go, the web, and binaries built before this module existed. */
export const hasAppBadgeNative = !!native?.clearAll;

/**
 * Clears the icon badge and the app's delivered, non-ongoing notifications.
 * Resolves without doing anything when the binary predates the module.
 */
export async function clearDeliveredNotifications(): Promise<void> {
  if (native?.clearAll) await native.clearAll();
}
