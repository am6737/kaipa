import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

// The last data the server handed us, kept on the device so the app opens
// with it when there is no network. It is only ever a fallback: every hook
// still fetches on mount and overwrites it the moment a request succeeds.
//
// Native keeps one file per entry: journeys and tracks carry whole GPS
// tracks, and Android's AsyncStorage cannot read back a row over ~2 MB.
const PREFIX = 'kaipa.offline.v1:';
const WRITE_DELAY_MS = 400;
const storeAsFiles = Platform.OS !== 'web';

const keyFor = (scope: string, name: string) => `${PREFIX}${scope}:${name}`;
const cacheDir = () => new Directory(Paths.document, 'offline-cache');
const fileFor = (key: string) => new File(cacheDir(), `${key.replace(/[^A-Za-z0-9._-]/g, '_')}.json`);

export async function readOfflineCache<T>(scope: string, name: string): Promise<T | undefined> {
  const key = keyFor(scope, name);
  try {
    let raw: string | null;
    if (storeAsFiles) {
      const file = fileFor(key);
      raw = file.exists ? await file.text() : null;
    } else {
      raw = await AsyncStorage.getItem(key);
    }
    return raw == null ? undefined : JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

async function persist(key: string, value: unknown) {
  const raw = JSON.stringify(value);
  if (!storeAsFiles) return AsyncStorage.setItem(key, raw);
  cacheDir().create({ intermediates: true, idempotent: true });
  fileFor(key).write(raw);
}

const pendingWrites = new Map<string, ReturnType<typeof setTimeout>>();

export function writeOfflineCache(scope: string, name: string, value: unknown) {
  const key = keyFor(scope, name);
  const pending = pendingWrites.get(key);
  if (pending) clearTimeout(pending);
  pendingWrites.set(key, setTimeout(() => {
    pendingWrites.delete(key);
    persist(key, value).catch(() => {});
  }, WRITE_DELAY_MS));
}

// Signing out must not leave one account's journeys readable by the next.
export async function clearOfflineCache() {
  pendingWrites.forEach(clearTimeout);
  pendingWrites.clear();
  try {
    if (storeAsFiles) {
      const dir = cacheDir();
      if (dir.exists) dir.delete();
      return;
    }
    const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(PREFIX));
    if (keys.length) await AsyncStorage.multiRemove(keys);
  } catch {
    // A stale cache only matters if this account never signs in again here.
  }
}

/**
 * `useState` that is seeded from, and mirrored to, the offline cache.
 *
 * The cached value only lands while the hook has not set anything itself, so
 * a fetch that beats the AsyncStorage read is never rolled back. `hydrated`
 * flips once either source has filled the state, which is what callers should
 * stop showing a spinner on.
 */
export function useOfflineState<T>(scope: string | undefined, name: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const [hydrated, setHydrated] = useState(false);
  const touched = useRef(false);

  useEffect(() => {
    if (!scope) return;
    let active = true;
    void readOfflineCache<T>(scope, name).then((cached) => {
      if (!active || touched.current || cached === undefined) return;
      setValue(cached);
      setHydrated(true);
    });
    return () => { active = false; };
  }, [scope, name]);

  useEffect(() => {
    if (scope && touched.current) writeOfflineCache(scope, name, value);
  }, [scope, name, value]);

  const set = useCallback((next: T | ((prev: T) => T)) => {
    touched.current = true;
    setHydrated(true);
    setValue(next);
  }, []);

  return [value, set, hydrated] as const;
}
