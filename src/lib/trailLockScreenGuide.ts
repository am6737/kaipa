// trailLockScreenGuide.ts — Android only. The recording card is a plain
// ongoing notification, and many skins (ColorOS, HyperOS, OriginOS) keep it
// off the lock screen until the user turns on the app's 锁屏/横幅 switches. No
// app may flip those itself, and some live outside the public notification
// APIs, so after the first recording starts we explain once and open the page.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { hasTrailNotification, openTrailNotificationSettings } from '../../modules/trail-notification';

const SEEN_KEY = 'kaipa.trail.lockScreenGuide.v1';

export async function shouldShowLockScreenGuide(): Promise<boolean> {
  if (Platform.OS !== 'android' || !hasTrailNotification) return false;
  try {
    return (await AsyncStorage.getItem(SEEN_KEY)) == null;
  } catch {
    return false;
  }
}

export function dismissLockScreenGuide(openSettings: boolean) {
  void AsyncStorage.setItem(SEEN_KEY, '1').catch(() => undefined);
  if (openSettings) void openTrailNotificationSettings().catch((cause) => console.warn('[trail] notification settings failed:', cause));
}
