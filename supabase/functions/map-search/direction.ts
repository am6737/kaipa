import { gcj02ToWgs84, wgs84ToGcj02, type Coordinate } from './coordinates.ts';

export type DirectionMode = 'driving' | 'walking';

export interface DirectionRequest {
  id: string;
  mode: DirectionMode;
  from: Coordinate;
  to: Coordinate;
}

export interface PlannedLeg {
  id: string;
  mode: DirectionMode;
  /** WGS-84 road geometry, or null when there is no plan to draw. */
  coordinates: Coordinate[] | null;
  /** false = AMap was never asked (the caller's budget ran out) or the ask
   *  errored, so the null carries no information and the client may ask again
   *  on the next open. true + null is AMap's verdict: there is no route here. */
  attempted: boolean;
}

export type AmapRequest = (path: string, params: URLSearchParams) => Promise<any>;

// Two itinerary stops a few hundred metres apart plan to the same road, and a
// journey is re-opened far more often than it is edited, so the plan is cached
// per coordinate pair rather than per journey.
const DIRECTION_TTL_MS = 12 * 60 * 60 * 1000;
const DIRECTION_CACHE_LIMIT = 600;
const directionCache = new Map<string, { storedAt: number; leg: PlannedLeg }>();
// One journey opens with every leg it needs; AMap's personal keys cap
// requests-per-second well below that, so the legs go out in small waves.
export const DIRECTION_MAX_LEGS = 12;
const DIRECTION_CONCURRENCY = 3;
// A planned leg arrives as one point per road turn. The map draws the line a
// few hundred pixels wide, so the tail of a long leg carries no extra shape.
export const DIRECTION_MAX_POINTS = 220;

export function directionKey(leg: DirectionRequest) {
  const point = ([lng, lat]: Coordinate) => `${lng.toFixed(5)},${lat.toFixed(5)}`;
  return `${leg.mode}:${point(leg.from)}:${point(leg.to)}`;
}

export function parseAmapPolyline(value: unknown): Coordinate[] {
  if (typeof value !== 'string' || !value) return [];
  const points: Coordinate[] = [];
  for (const pair of value.split(';')) {
    const [lng, lat] = pair.split(',').map(Number);
    if (Number.isFinite(lng) && Number.isFinite(lat) && Math.abs(lng) <= 180 && Math.abs(lat) <= 90) {
      points.push([lng, lat]);
    }
  }
  return points;
}

export function downsample(coordinates: Coordinate[], max: number): Coordinate[] {
  if (coordinates.length <= max) return coordinates;
  const stride = (coordinates.length - 1) / (max - 1);
  const sampled = [coordinates[0]];
  for (let index = 1; index < max - 1; index += 1) {
    sampled.push(coordinates[Math.round(index * stride)]);
  }
  sampled.push(coordinates[coordinates.length - 1]);
  return sampled;
}

export async function planDirection(leg: DirectionRequest, amap: AmapRequest): Promise<PlannedLeg> {
  const [originLng, originLat] = wgs84ToGcj02(leg.from);
  const [destLng, destLat] = wgs84ToGcj02(leg.to);
  const params = new URLSearchParams({
    origin: `${originLng},${originLat}`,
    destination: `${destLng},${destLat}`,
    extensions: 'all',
  });
  // Bus and shuttle legs plan as driving: the map is showing how the stops
  // connect, not which line to board, and transit needs a city id per request.
  const payload = await amap(`direction/${leg.mode}`, params);
  const steps = payload?.route?.paths?.[0]?.steps;
  const gcjPoints = (Array.isArray(steps) ? steps : []).flatMap((step: { polyline?: unknown }) => parseAmapPolyline(step?.polyline));
  if (gcjPoints.length < 2) return { id: leg.id, mode: leg.mode, coordinates: null, attempted: true };
  // AMap answers in GCJ-02; the itinerary and the map layer speak WGS-84.
  return { id: leg.id, mode: leg.mode, coordinates: downsample(gcjPoints, DIRECTION_MAX_POINTS).map(gcj02ToWgs84), attempted: true };
}

export function parseDirectionLegs(value: unknown): DirectionRequest[] {
  if (!Array.isArray(value)) return [];
  const legs: DirectionRequest[] = [];
  for (const raw of value.slice(0, DIRECTION_MAX_LEGS)) {
    const from = Array.isArray(raw?.from) ? raw.from : null;
    const to = Array.isArray(raw?.to) ? raw.to : null;
    if (!from || !to || !validCoordinate(from[0], from[1]) || !validCoordinate(to[0], to[1])) continue;
    legs.push({
      id: typeof raw.id === 'string' ? raw.id.slice(0, 160) : `leg-${legs.length}`,
      mode: raw.mode === 'walking' ? 'walking' : 'driving',
      from: [from[0], from[1]],
      to: [to[0], to[1]],
    });
  }
  return legs;
}

function validCoordinate(lng: unknown, lat: unknown): boolean {
  return typeof lng === 'number' && Number.isFinite(lng) && lng >= -180 && lng <= 180
    && typeof lat === 'number' && Number.isFinite(lat) && lat >= -90 && lat <= 90;
}

/**
 * Plan every leg, spending `consumeBudget()` on each leg that is not already
 * cached. A leg never comes back blank: it either carries a plan, or answers
 * `attempted: false` so the client knows the gap was ours to fill and not a
 * verdict from AMap.
 */
export async function planAll(
  legs: DirectionRequest[],
  amap: AmapRequest,
  consumeBudget: () => boolean = () => true,
): Promise<PlannedLeg[]> {
  const results = new Map<string, PlannedLeg>();
  const pending = legs.filter((leg) => {
    const cached = readDirectionCache(directionKey(leg));
    if (cached) results.set(leg.id, { ...cached, id: leg.id });
    return !cached;
  });
  for (let offset = 0; offset < pending.length; offset += DIRECTION_CONCURRENCY) {
    const queue = pending.slice(offset, offset + DIRECTION_CONCURRENCY);
    const wave = queue.filter((leg) => {
      if (consumeBudget()) return true;
      results.set(leg.id, { id: leg.id, mode: leg.mode, coordinates: null, attempted: false });
      return false;
    });
    if (!wave.length) continue;
    const planned = await Promise.all(wave.map(async (leg) => {
      try {
        return await planDirection(leg, amap);
      } catch (error) {
        console.warn('[map-search] direction failed', leg.mode, error);
        // A quota or network error is a question that was never answered, not a
        // statement that no road exists between these two places.
        return { id: leg.id, mode: leg.mode, coordinates: null, attempted: false } satisfies PlannedLeg;
      }
    }));
    planned.forEach((leg, index) => {
      // Only a real plan is cached. A negative answer lives 12 hours and is
      // shared by every device, so caching one would keep a leg straight for
      // everyone long after whatever made it fail went away.
      if (leg.attempted && leg.coordinates?.length) writeDirectionCache(directionKey(wave[index]), leg);
      results.set(leg.id, leg);
    });
  }
  return legs.map((leg) => results.get(leg.id) ?? { id: leg.id, mode: leg.mode, coordinates: null, attempted: false });
}

export function readDirectionCache(key: string): PlannedLeg | undefined {
  const entry = directionCache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.storedAt >= DIRECTION_TTL_MS) {
    directionCache.delete(key);
    return undefined;
  }
  return entry.leg;
}

export function writeDirectionCache(key: string, leg: PlannedLeg) {
  if (directionCache.size >= DIRECTION_CACHE_LIMIT) {
    const oldest = directionCache.keys().next().value;
    if (oldest !== undefined) directionCache.delete(oldest);
  }
  directionCache.set(key, { storedAt: Date.now(), leg });
}

export function clearDirectionCacheForTests() {
  directionCache.clear();
}
