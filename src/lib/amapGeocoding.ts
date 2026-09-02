import { gcj02ToWgs84, wgs84ToGcj02 } from './coordinates';

const AMAP_WEB_KEY = (process.env.EXPO_PUBLIC_AMAP_WEB_KEY || '').trim();
const AMAP_API = 'https://restapi.amap.com/v3';

export interface JourneyLocationValue {
  name: string;
  address: string;
  region: string;
  lng: number;
  lat: number;
  coord: string;
}

interface AmapPoi {
  name?: string;
  address?: string | string[];
  location?: string;
  pname?: string | string[];
  cityname?: string | string[];
  adname?: string | string[];
}

interface AmapResponse<T> {
  status?: string;
  info?: string;
  pois?: AmapPoi[];
  regeocode?: T;
}

function coordinateLabel(lng: number, lat: number): string {
  const latDir = lat >= 0 ? 'N' : 'S';
  const lngDir = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(5)} ${latDir}  ${Math.abs(lng).toFixed(5)} ${lngDir}`;
}

function parseLocation(value?: string): [number, number] | null {
  const [lng, lat] = (value || '').split(',').map(Number);
  return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null;
}

function uniqueRegion(parts: Array<string | undefined>): string {
  return parts.filter((part, index, values): part is string => Boolean(part) && values.indexOf(part) === index).join(' · ');
}

function text(value?: string | string[]): string {
  return Array.isArray(value) ? value.filter(Boolean).join('') : value || '';
}

function poiToLocation(poi: AmapPoi): JourneyLocationValue | null {
  const gcj = parseLocation(poi.location);
  if (!gcj) return null;
  const [lng, lat] = gcj02ToWgs84(gcj);
  const name = poi.name || coordinateLabel(lng, lat);
  const addressText = Array.isArray(poi.address) ? poi.address.join('') : poi.address || '';
  const parent = uniqueRegion([text(poi.pname), text(poi.cityname), text(poi.adname)]);
  return {
    name,
    address: uniqueRegion([parent, addressText]) || coordinateLabel(lng, lat),
    region: uniqueRegion([name, text(poi.cityname) || text(poi.adname)]) || name,
    lng,
    lat,
    coord: coordinateLabel(lng, lat),
  };
}

async function request<T>(path: string, params: URLSearchParams, signal?: AbortSignal): Promise<AmapResponse<T>> {
  if (!AMAP_WEB_KEY) throw new Error('amap-key-missing');
  params.set('key', AMAP_WEB_KEY);
  const response = await fetch(`${AMAP_API}/${path}?${params.toString()}`, { signal });
  if (!response.ok) throw new Error(`amap-geocoding-${response.status}`);
  const payload = await response.json() as AmapResponse<T>;
  if (payload.status !== '1') throw new Error(`amap-geocoding-${payload.info || 'failed'}`);
  return payload;
}

export function hasAmapGeocoding(): boolean {
  return !!AMAP_WEB_KEY;
}

export async function searchJourneyLocations(
  query: string,
  language: string,
  proximity?: [number, number],
  signal?: AbortSignal,
): Promise<JourneyLocationValue[]> {
  const params = new URLSearchParams({
    keywords: query,
    offset: '8',
    page: '1',
    extensions: 'base',
    citylimit: 'false',
    language: language.startsWith('en') ? 'en' : 'zh_cn',
  });
  if (proximity) {
    const [lng, lat] = wgs84ToGcj02(proximity);
    params.set('location', `${lng},${lat}`);
    params.set('sortrule', 'distance');
  }
  const payload = await request<never>('place/text', params, signal);
  return (payload.pois || []).map(poiToLocation).filter((value): value is JourneyLocationValue => Boolean(value));
}

export async function reverseJourneyLocation(
  lng: number,
  lat: number,
  language: string,
  signal?: AbortSignal,
): Promise<JourneyLocationValue> {
  const gcj = wgs84ToGcj02([lng, lat]);
  const params = new URLSearchParams({
    location: `${gcj[0]},${gcj[1]}`,
    extensions: 'base',
    radius: '1000',
    language: language.startsWith('en') ? 'en' : 'zh_cn',
  });
  type Regeocode = {
    formatted_address?: string;
    addressComponent?: { province?: string; city?: string | string[]; district?: string; township?: string };
  };
  const payload = await request<Regeocode>('geocode/regeo', params, signal);
  const result = payload.regeocode;
  const component = result?.addressComponent;
  const city = Array.isArray(component?.city) ? component?.city[0] : component?.city;
  const name = component?.township || component?.district || city || component?.province || coordinateLabel(lng, lat);
  const address = result?.formatted_address || coordinateLabel(lng, lat);
  return {
    name,
    address,
    region: uniqueRegion([city || component?.province, name]) || name,
    lng,
    lat,
    coord: coordinateLabel(lng, lat),
  };
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
