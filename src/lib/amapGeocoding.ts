import { supabase, supabaseAnonKey, supabaseUrl } from './supabase';

export interface JourneyLocationValue {
  name: string;
  address: string;
  region: string;
  lng: number;
  lat: number;
  coord: string;
  category?: string;
  /** Only on reverse results: administrative levels, empty outside AMap coverage. */
  province?: string;
  city?: string;
  district?: string;
}

// A city or district a departure can name; `place` is the full 省市区 path.
export interface DepartureRegion {
  name: string;
  parent: string;
  place: string;
}

interface MapSearchResponse {
  results?: JourneyLocationValue[];
  regions?: DepartureRegion[];
  result?: JourneyLocationValue;
  legs?: PlannedLeg[];
  error?: { code?: string };
}

function coordinateLabel(lng: number, lat: number): string {
  const latDir = lat >= 0 ? 'N' : 'S';
  const lngDir = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(5)} ${latDir}  ${Math.abs(lng).toFixed(5)} ${lngDir}`;
}

async function request(body: object, signal?: AbortSignal): Promise<MapSearchResponse> {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('map-search-unauthorized');

  const response = await fetch(`${supabaseUrl}/functions/v1/map-search`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal,
  });
  const payload = await response.json() as MapSearchResponse;
  if (!response.ok) throw new Error(`map-search-${payload.error?.code || response.status}`);
  return payload;
}

export function hasAmapGeocoding(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

export async function searchJourneyLocations(
  query: string,
  language: string,
  proximity?: [number, number],
  signal?: AbortSignal,
): Promise<JourneyLocationValue[]> {
  const payload = await request({ action: 'search', query, language, proximity }, signal);
  return payload.results || [];
}

export async function searchDepartureRegions(query: string, signal?: AbortSignal): Promise<DepartureRegion[]> {
  const payload = await request({ action: 'regions', query }, signal);
  return payload.regions || [];
}

export async function reverseJourneyLocation(
  lng: number,
  lat: number,
  language: string,
  signal?: AbortSignal,
): Promise<JourneyLocationValue> {
  const payload = await request({ action: 'reverse', lng, lat, language }, signal);
  if (!payload.result) throw new Error('map-search-empty-result');
  return payload.result;
}

/** 轨迹所在的「城市 区县」，取中段的一个点反查，不用起点，免得落到住处附近。
 *  高德查不到（国外）或函数还没返回行政区字段时给 null。 */
export async function reverseTrackRegion(coords: [number, number][], signal?: AbortSignal): Promise<string | null> {
  const [lng, lat] = coords[Math.floor(coords.length / 2)] ?? [];
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  const { result } = await request({ action: 'reverse', lng, lat, language: 'zh_cn' }, signal);
  const parts = [result?.city || result?.province, result?.district]
    .filter((part, index, all): part is string => Boolean(part) && all.indexOf(part) === index);
  return parts.length ? parts.join(' ') : null;
}

export function locationFromPoi(region: string, lng: number, lat: number, coord?: string): JourneyLocationValue {
  const resolvedCoord = coord || coordinateLabel(lng, lat);
  return {
    name: region || resolvedCoord,
    address: resolvedCoord,
    region: region || resolvedCoord,
    lng,
    lat,
    coord: resolvedCoord,
  };
}

export interface DirectionRequest {
  id: string;
  mode: 'driving' | 'walking';
  trackAccess?: boolean;
  from: [number, number];
  to: [number, number];
}

export interface PlannedLeg {
  id: string;
  mode: 'driving' | 'walking';
  /** WGS-84 road geometry, or null when this leg has no plan to draw. */
  coordinates: [number, number][] | null;
  /** false = the function never asked AMap for this leg (budget) or the ask
   *  errored, so the null says nothing about whether a road exists. Absent on
   *  a function older than this field, whose nulls were undifferentiated. */
  attempted?: boolean;
  /** Actual provider endpoints before display normalization. */
  actualFrom?: [number, number];
  actualTo?: [number, number];
  distanceMeters?: number;
  durationSeconds?: number;
}

/** The function plans one AMap request per leg, so it takes a bounded batch. */
const DIRECTION_BATCH = 12;

/** Batches are reported through `onLeg` as they land, not at the end: a journey
 *  whose later batch aborts has still paid for the plans already delivered. */
export async function planJourneyDirections(
  legs: DirectionRequest[],
  signal: AbortSignal | undefined,
  onLeg: (leg: PlannedLeg) => void,
): Promise<void> {
  for (let offset = 0; offset < legs.length; offset += DIRECTION_BATCH) {
    const payload = await request({ action: 'direction', legs: legs.slice(offset, offset + DIRECTION_BATCH) }, signal);
    (payload.legs || []).forEach(onLeg);
  }
}
