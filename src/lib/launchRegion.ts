import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

// The province the discover map opens on: the one the last launch located the
// user in. Read synchronously so the first render already uses it — opening on
// 全国 and fitting to the province once the fix arrives was a second camera
// move, and a pin swap, landing in the middle of the launch.

const NATIONAL = '全国';
const KEY = 'kaipa.discover-launch-region.v1';
const file = () => new File(Paths.document, `${KEY}.txt`);

let cached: string | undefined;

function read(): string {
  try {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(KEY) || NATIONAL;
    const stored = file();
    return stored.exists ? stored.textSync().trim() || NATIONAL : NATIONAL;
  } catch {
    return NATIONAL;
  }
}

/** The region this launch opened on; stable for the whole session. */
export function launchRegion(): string {
  if (cached === undefined) cached = read();
  return cached;
}

/** Remembers where the user was located, for the next launch. */
export function rememberLaunchRegion(region: string | null) {
  const value = region ?? NATIONAL;
  try {
    if (Platform.OS === 'web') {
      globalThis.localStorage?.setItem(KEY, value);
      return;
    }
    file().write(value);
  } catch {
    // Next launch opens on the national view, as it did before.
  }
}
