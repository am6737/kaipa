import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

// The province the discover map opens on: the region the user last picked, else
// the one the last launch located the user in. Read synchronously so the first render already uses it — opening on
// 全国 and fitting to the province once the fix arrives was a second camera
// move, and a pin swap, landing in the middle of the launch.

const NATIONAL = '全国';
const KEY = 'kaipa.discover-launch-region.v1';
const PICKED_KEY = 'kaipa.discover-picked-region.v1';
const file = (key: string) => new File(Paths.document, `${key}.txt`);

function load(key: string): string | null {
  try {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(key) || null;
    const stored = file(key);
    return stored.exists ? stored.textSync().trim() || null : null;
  } catch {
    return null;
  }
}

function save(key: string, value: string) {
  try {
    if (Platform.OS === 'web') globalThis.localStorage?.setItem(key, value);
    else file(key).write(value);
  } catch {
    // Next launch opens on the national view, as it did before.
  }
}

let cached: string | undefined;
let pickedAtLaunch: boolean | undefined;

function read() {
  const picked = load(PICKED_KEY);
  pickedAtLaunch = picked !== null;
  cached = picked ?? load(KEY) ?? NATIONAL;
}

/** The region this launch opened on; stable for the whole session. */
export function launchRegion(): string {
  if (cached === undefined) read();
  return cached!;
}

/** True when this launch opened on a region the user picked, which locating must not replace. */
export function launchRegionPicked(): boolean {
  if (pickedAtLaunch === undefined) read();
  return pickedAtLaunch!;
}

/** Remembers where the user was located, for the next launch. */
export function rememberLaunchRegion(region: string | null) {
  save(KEY, region ?? NATIONAL);
}

/** Remembers a region the user chose by hand; the next launch opens on it. */
export function rememberPickedRegion(region: string) {
  save(PICKED_KEY, region);
}
