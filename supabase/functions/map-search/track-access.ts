import type { Coordinate } from './coordinates.ts';

export const ACCESS_ENDPOINT_METERS = 50;
export function metersBetween(a: Coordinate, b: Coordinate): number {
  const rad = Math.PI / 180;
  const h = Math.sin((b[1] - a[1]) * rad / 2) ** 2
    + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin((b[0] - a[0]) * rad / 2) ** 2;
  return 12_742_000 * Math.asin(Math.min(1, Math.sqrt(h)));
}
export function reachesAccess(from: Coordinate, to: Coordinate, actualFrom?: Coordinate, actualTo?: Coordinate) {
  return Boolean(actualFrom && actualTo && metersBetween(from, actualFrom) <= ACCESS_ENDPOINT_METERS
    && metersBetween(to, actualTo) <= ACCESS_ENDPOINT_METERS);
}
export type AccessRoad = { coordinates: Coordinate[]; distanceMeters: number; actualFrom: Coordinate; actualTo: Coordinate };
export type AccessRouter = (from: Coordinate, to: Coordinate) => Promise<AccessRoad | null>;

/** BRouter hiking uses OSM in WGS-84. Request only short trail access roads. */
export async function routeTrackAccess(from: Coordinate, to: Coordinate, endpoint = 'https://brouter.de/brouter'): Promise<AccessRoad | null> {
  if (metersBetween(from, to) > 10_000) return null;
  const url = new URL(endpoint);
  url.search = new URLSearchParams({ lonlats: `${from.join(',')}|${to.join(',')}`, profile: 'hiking-mountain', alternativeidx: '0', format: 'geojson' }).toString();
  const response = await fetch(url, { signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error(`Access router HTTP ${response.status}`);
  return parseAccessRoad(await response.json(), from, to);
}
export function parseAccessRoad(payload: any, from: Coordinate, to: Coordinate): AccessRoad | null {
  const feature = payload?.features?.find((item: any) => item?.geometry?.type === 'LineString');
  const raw = feature?.geometry?.coordinates;
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > 50_000) return null;
  if (raw.some((p: any) => !Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1])
    || Math.abs(p[0]) > 180 || Math.abs(p[1]) > 90)) return null;
  const coordinates: Coordinate[] = raw.map((p: number[]) => [p[0], p[1]]);
  const actualFrom = coordinates[0], actualTo = coordinates[coordinates.length - 1];
  if (!reachesAccess(from, to, actualFrom, actualTo)) return null;
  let distanceMeters = 0;
  for (let i = 1; i < coordinates.length; i++) distanceMeters += metersBetween(coordinates[i - 1], coordinates[i]);
  if (distanceMeters > 50_000) return null;
  // Only normalize after validating the actual provider positions.
  coordinates[0] = from;
  coordinates[coordinates.length - 1] = to;
  return { coordinates, distanceMeters, actualFrom, actualTo };
}
