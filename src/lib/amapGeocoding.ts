import { supabase, supabaseAnonKey, supabaseUrl } from './supabase';

export interface JourneyLocationValue {
  name: string;
  address: string;
  region: string;
  lng: number;
  lat: number;
  coord: string;
}

interface MapSearchResponse {
  results?: JourneyLocationValue[];
  result?: JourneyLocationValue;
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
