// offlineMaps.ts — AMap offline city packages, so the base map still draws in
// the mountains with no signal. Android only: MapKit has no offline API. Once a
// city is downloaded the AMap view uses it on its own; nothing else changes.
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { amapModule, ensureAmapReady } from './amapSdk';

type OfflineManager = typeof import('expo-gaode-map')['ExpoGaodeMapOfflineModule'];
type OfflineMapInfo = Awaited<ReturnType<OfflineManager['getAvailableCities']>>[number];

function manager(): OfflineManager | null {
  if (Platform.OS !== 'android') return null;
  const module = amapModule();
  if (!module || !ensureAmapReady(module)) return null;
  return module.ExpoGaodeMapOfflineModule ?? null;
}

export function offlineMapsAvailable(): boolean {
  return manager() != null;
}

/** AMap's own city list, for downloading before a trip. */
export function openOfflineMapManager() {
  void manager()?.openOfflineMapUI().catch(() => undefined);
}

let citiesPromise: Promise<OfflineMapInfo[]> | null = null;

function availableCities(offline: OfflineManager): Promise<OfflineMapInfo[]> {
  if (!citiesPromise) {
    citiesPromise = offline.getAvailableCities().catch((error) => {
      citiesPromise = null;
      throw error;
    });
  }
  return citiesPromise;
}

// AMap names cities in full ("甘孜藏族自治州"); the catalog uses the short form.
const SUFFIX = /(市|地区|盟|林区|特别行政区|((土家族|藏族|羌族|彝族|苗族|侗族|布依族|傣族|白族|哈尼族|壮族|回族|蒙古族|朝鲜族|景颇族|傈僳族|黎族|哈萨克|柯尔克孜|蒙古)*自治州))$/;

function shortName(name: string) {
  return name.replace(SUFFIX, '');
}

/** The offline package for a catalog region such as "四川 · 甘孜", most specific part first. */
export function matchOfflineCity(cities: OfflineMapInfo[], region: string): OfflineMapInfo | null {
  const parts = region.split(/[·,，/\s]+/).map((part) => part.trim()).filter(Boolean).reverse();
  for (const part of parts) {
    const key = shortName(part);
    if (!key) continue;
    const hit = cities.find((city) => shortName(city.cityName) === key)
      ?? cities.find((city) => city.cityName.startsWith(key));
    if (hit) return hit;
  }
  return null;
}

export type OfflineCityState =
  | { status: 'unavailable' }
  | { status: 'unknown' }
  | { status: 'idle' | 'downloading' | 'downloaded' | 'failed'; city: OfflineMapInfo; progress: number };

/** The offline package covering a region, with live download progress. */
export function useOfflineCity(region: string | undefined) {
  const [state, setState] = useState<OfflineCityState>(() => (offlineMapsAvailable() ? { status: 'unknown' } : { status: 'unavailable' }));

  useEffect(() => {
    const offline = manager();
    if (!offline || !region) return;
    let cancelled = false;
    void (async () => {
      try {
        const city = matchOfflineCity(await availableCities(offline), region);
        if (!city || cancelled) return;
        const current = await offline.getMapStatus(city.cityCode).catch(() => city);
        if (cancelled) return;
        const status = current.status === 'downloaded' && !current.hasUpdate ? 'downloaded'
          : current.status === 'downloading' || current.status === 'unzipping' ? 'downloading'
          : current.status === 'failed' ? 'failed' : 'idle';
        setState({ status, city: { ...city, ...current }, progress: current.progress ?? 0 });
      } catch {
        // No list without network; the manager entry still works later.
      }
    })();
    const subscriptions = [
      offline.addDownloadProgressListener((event) => {
        setState((prev) => ('city' in prev && prev.city.cityCode === event.cityCode
          ? { ...prev, status: event.status === 'downloaded' ? 'downloaded' : 'downloading', progress: event.progress }
          : prev));
      }),
      offline.addDownloadCompleteListener((event) => {
        setState((prev) => ('city' in prev && prev.city.cityCode === event.cityCode
          ? { ...prev, status: event.success ? 'downloaded' : 'failed', progress: event.success ? 100 : prev.progress }
          : prev));
      }),
      offline.addDownloadErrorListener((event) => {
        setState((prev) => ('city' in prev && prev.city.cityCode === event.cityCode ? { ...prev, status: 'failed' } : prev));
      }),
    ];
    return () => {
      cancelled = true;
      subscriptions.forEach((subscription) => subscription.remove());
    };
  }, [region]);

  const download = useCallback(async () => {
    const offline = manager();
    if (!offline || !('city' in state)) return;
    setState({ ...state, status: 'downloading', progress: state.status === 'failed' ? 0 : state.progress });
    try {
      // The size is shown before the tap, so mobile data is the walker's call.
      await offline.startDownload({ cityCode: state.city.cityCode, allowCellular: true });
    } catch {
      setState({ ...state, status: 'failed' });
    }
  }, [state]);

  return { state, download, openManager: openOfflineMapManager };
}
