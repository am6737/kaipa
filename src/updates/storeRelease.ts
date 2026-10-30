import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

const BUNDLE_ID = 'com.hitosea.letsgo';
const PLAY_URL = `https://play.google.com/store/apps/details?id=${BUNDLE_ID}`;
const IOS_FALLBACK_URL = 'https://apps.apple.com/cn/app/id6810481520';

export type StoreRelease = { version: string; url: string };

function validVersion(value: string | undefined): value is string {
  return Boolean(value && /^\d+(?:\.\d+)*$/.test(value));
}

export function isNewerRelease(remote: string, local: string) {
  if (!validVersion(remote) || !validVersion(local)) return false;
  const a = remote.split('.').map(Number);
  const b = local.split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  }
  return false;
}

export async function lookupStoreRelease(): Promise<StoreRelease | null> {
  if (Platform.OS === 'ios') {
    const response = await fetch(`https://itunes.apple.com/lookup?bundleId=${BUNDLE_ID}&country=cn`);
    if (!response.ok) throw new Error(`App Store lookup failed: ${response.status}`);
    const payload = await response.json() as { results?: Array<{ version?: string; trackViewUrl?: string }> };
    const release = payload.results?.[0];
    return validVersion(release?.version)
      ? { version: release.version, url: release.trackViewUrl || IOS_FALLBACK_URL }
      : null;
  }
  if (Platform.OS === 'android') {
    const response = await fetch(`${PLAY_URL}&hl=en&gl=US`);
    if (!response.ok) throw new Error(`Google Play lookup failed: ${response.status}`);
    const html = await response.text();
    const match = html.match(/(?:softwareVersion|\"softwareVersion\")\s*[:=]\s*\"([^\"]+)\"/) ||
      html.match(/Current Version[^<]{0,100}<[^>]*>\s*([^<\s]+)/i) ||
      html.match(/当前版本[^<]{0,100}<[^>]*>\s*([^<\s]+)/i);
    return validVersion(match?.[1]) ? { version: match[1], url: PLAY_URL } : null;
  }
  return null;
}

const PROMPTED_KEY = 'kaipa.storeRelease.prompted.v1';

/**
 * Launch-time App Store check. Resolves to a newer release only the first time
 * it is seen, recording its version so each store version prompts at most once.
 * Android is left to the manual check in 关于: scraping the Play page is too
 * fragile to run on every launch.
 */
export async function unpromptedStoreRelease(): Promise<StoreRelease | null> {
  if (Platform.OS !== 'ios' || __DEV__) return null;
  const installed = Constants.expoConfig?.version;
  if (!validVersion(installed)) return null;
  const release = await lookupStoreRelease();
  if (!release || !isNewerRelease(release.version, installed)) return null;
  if (await AsyncStorage.getItem(PROMPTED_KEY) === release.version) return null;
  await AsyncStorage.setItem(PROMPTED_KEY, release.version);
  return release;
}
