import { Platform } from 'react-native';

export type AmapModule = typeof import('expo-gaode-map');

let amap: AmapModule | null = null;
let amapInitialized = false;

if (Platform.OS === 'android') {
  try {
    // Lazy loading keeps Expo Go usable when the AMap native module is absent.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    amap = require('expo-gaode-map') as AmapModule;
  } catch {
    amap = null;
  }
}

/** The AMap module on Android, or null when the binary does not carry it. */
export function amapModule(): AmapModule | null {
  return amap;
}

/** Shared by the map and the location client: both refuse to run before this. */
export function ensureAmapReady(module: AmapModule): boolean {
  if (amapInitialized) return true;
  try {
    module.ExpoGaodeMapModule.setPrivacyConfig({
      hasShow: true,
      hasContainsPrivacy: true,
      hasAgree: true,
      privacyVersion: '2026-09-02',
    });
    // The config plugin writes the build-only key to AndroidManifest.xml.
    module.ExpoGaodeMapModule.initSDK({});
    amapInitialized = true;
    return true;
  } catch {
    return false;
  }
}
