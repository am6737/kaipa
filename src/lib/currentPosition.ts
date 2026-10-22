import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { amapModule, ensureAmapReady } from './amapSdk';
import { gcj02ToWgs84 } from './coordinates';

// One-shot "where am I" for the locate button, the place picker, route
// navigation and the agent. Callers handle the permission prompt themselves.
//
// expo-location on Android is Google's fused provider and nothing else. Phones
// without Play services (most new Huawei/Honor, and ROMs that ship it disabled)
// get an error or no callback at all, and with Play services its Wi-Fi/cell
// lookup cannot reach Google's backend from mainland China, so a balanced
// request indoors often comes back empty. Android therefore asks AMap's own
// location SDK (already in the binary for the map) alongside the system
// provider, and takes whichever answers first.

export type CurrentPosition = {
  /** WGS84, like every other coordinate the app stores. */
  lng: number;
  lat: number;
  accuracy: number | null;
  heading?: number;
  timestamp: number;
  /** City-level place names, when the provider resolved them for free. */
  place?: { region?: string; city?: string; district?: string };
};

export type CurrentPositionFailure = 'services_disabled' | 'timeout' | 'unavailable';

export class CurrentPositionError extends Error {
  constructor(readonly code: CurrentPositionFailure, message: string = code) {
    super(message);
    this.name = 'CurrentPositionError';
  }
}

// Native location calls have no cancellation API; a late result is ignored.
function within<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new CurrentPositionError('timeout')), timeoutMs);
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

function firstFix(attempts: Promise<CurrentPosition>[]): Promise<CurrentPosition> {
  return new Promise((resolve, reject) => {
    let pending = attempts.length;
    for (const attempt of attempts) {
      attempt.then(resolve, (error) => {
        pending -= 1;
        if (pending === 0) reject(error);
      });
    }
  });
}

async function locationServicesEnabled(): Promise<boolean> {
  // A check that never answers is not evidence the switch is off; let the
  // requests themselves fail if it is.
  const enabled = await within(Location.hasServicesEnabledAsync(), 3_000).catch(() => true);
  if (enabled || Platform.OS !== 'android') return enabled;
  try {
    // Play services' "turn on location" dialog. It rejects straight away on
    // phones without Play services, and waits on the user otherwise.
    await within(Location.enableNetworkProviderAsync(), 30_000);
  } catch {
    return false;
  }
  return within(Location.hasServicesEnabledAsync(), 3_000).catch(() => true);
}

async function amapPosition(): Promise<CurrentPosition> {
  const module = amapModule();
  if (!module || !ensureAmapReady(module)) throw new CurrentPositionError('unavailable', 'AMap location is unavailable');
  const fix = await module.ExpoGaodeMapModule.getCurrentLocation();
  const raw: [number, number] = [fix.longitude, fix.latitude];
  if (!Number.isFinite(raw[0]) || !Number.isFinite(raw[1])) throw new CurrentPositionError('unavailable', 'AMap returned no coordinate');
  // AMap answers in GCJ-02 inside mainland China and WGS84 outside it.
  const { coordType } = fix as { coordType?: 'GCJ02' | 'WGS84' };
  const [lng, lat] = coordType === 'WGS84' ? raw : gcj02ToWgs84(raw);
  const region = 'province' in fix ? fix.province || undefined : undefined;
  const city = 'city' in fix ? fix.city || undefined : undefined;
  const district = 'district' in fix ? fix.district || undefined : undefined;
  return {
    lng,
    lat,
    accuracy: Number.isFinite(fix.accuracy) ? fix.accuracy : null,
    // AMap reports 0 when it has no bearing.
    heading: fix.heading > 0 ? fix.heading : undefined,
    timestamp: fix.timestamp || Date.now(),
    ...(region || city || district ? { place: { region, city, district } } : {}),
  };
}

function fromSystem(position: Location.LocationObject): CurrentPosition {
  const heading = position.coords.heading;
  return {
    lng: position.coords.longitude,
    lat: position.coords.latitude,
    accuracy: position.coords.accuracy,
    heading: heading != null && heading >= 0 ? heading : undefined,
    timestamp: position.timestamp,
  };
}

async function systemPosition(): Promise<CurrentPosition> {
  // A recent cached fix answers at once while the GPS is still acquiring.
  const cached = await within(
    Location.getLastKnownPositionAsync({ maxAge: 120_000, requiredAccuracy: 5_000 }),
    2_000,
  ).catch(() => null);
  if (cached) return fromSystem(cached);
  try {
    return fromSystem(await within(
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced, mayShowUserSettingsDialog: true }),
      6_000,
    ));
  } catch {
    // Balanced leans on Wi-Fi and cell lookups; High turns the GPS on.
    return fromSystem(await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }));
  }
}

export async function getCurrentPosition(timeoutMs = 15_000): Promise<CurrentPosition> {
  if (!await locationServicesEnabled()) throw new CurrentPositionError('services_disabled');
  const attempts = [systemPosition()];
  if (Platform.OS === 'android' && amapModule()) attempts.push(amapPosition());
  try {
    return await within(firstFix(attempts), timeoutMs);
  } catch (error) {
    if (error instanceof CurrentPositionError) throw error;
    throw new CurrentPositionError('unavailable', error instanceof Error ? error.message : String(error));
  }
}
