const MAPBOX_TOKEN = (process.env.EXPO_PUBLIC_MAPBOX_TOKEN || '').trim();
const GEOCODING_BASE = 'https://api.mapbox.com/search/geocode/v6';

export interface JourneyLocationValue {
  name: string;
  address: string;
  region: string;
  lng: number;
  lat: number;
  coord: string;
}

interface MapboxFeature {
  geometry?: { coordinates?: number[] };
  properties?: {
    name?: string;
    name_preferred?: string;
    full_address?: string;
    place_formatted?: string;
    coordinates?: { longitude?: number; latitude?: number };
    context?: Record<string, { name?: string }>;
  };
}

function coordinateLabel(lng: number, lat: number): string {
  const latDir = lat >= 0 ? 'N' : 'S';
  const lngDir = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(5)} ${latDir}  ${Math.abs(lng).toFixed(5)} ${lngDir}`;
}

function contextName(feature: MapboxFeature): string {
  const context = feature.properties?.context;
  return (
    context?.place?.name ||
    context?.locality?.name ||
    context?.district?.name ||
    context?.region?.name ||
    ''
  );
}

function toLocation(feature: MapboxFeature, fallback: [number, number]): JourneyLocationValue {
  const props = feature.properties || {};
  const geometry = feature.geometry?.coordinates;
  const lng = Number(props.coordinates?.longitude ?? geometry?.[0] ?? fallback[0]);
  const lat = Number(props.coordinates?.latitude ?? geometry?.[1] ?? fallback[1]);
  const name = props.name_preferred || props.name || props.full_address || coordinateLabel(lng, lat);
  const parent = contextName(feature);
  const address = props.full_address || props.place_formatted || parent || coordinateLabel(lng, lat);
  const regionParts = [name, parent].filter((part, index, parts) => part && parts.indexOf(part) === index);
  return {
    name,
    address,
    region: regionParts.slice(0, 2).join(' · ') || name,
    lng,
    lat,
    coord: coordinateLabel(lng, lat),
  };
}

async function requestFeatures(url: string, signal?: AbortSignal): Promise<MapboxFeature[]> {
  if (!MAPBOX_TOKEN) throw new Error('mapbox-token-missing');
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`mapbox-geocoding-${response.status}`);
  const json = (await response.json()) as { features?: MapboxFeature[] };
  return json.features || [];
}

export function hasMapboxGeocoding(): boolean {
  return !!MAPBOX_TOKEN;
}

export async function searchJourneyLocations(
  query: string,
  language: string,
  proximity?: [number, number],
  signal?: AbortSignal,
): Promise<JourneyLocationValue[]> {
  const params = new URLSearchParams({
    q: query,
    access_token: MAPBOX_TOKEN,
    autocomplete: 'true',
    permanent: 'true',
    limit: '8',
    language,
    types: 'country,region,postcode,district,place,locality,neighborhood,street,address',
  });
  if (proximity) params.set('proximity', `${proximity[0]},${proximity[1]}`);
  const features = await requestFeatures(`${GEOCODING_BASE}/forward?${params.toString()}`, signal);
  return features.map((feature) => toLocation(feature, proximity || [0, 0]));
}

export async function reverseJourneyLocation(
  lng: number,
  lat: number,
  language: string,
  signal?: AbortSignal,
): Promise<JourneyLocationValue> {
  const params = new URLSearchParams({
    longitude: String(lng),
    latitude: String(lat),
    access_token: MAPBOX_TOKEN,
    permanent: 'true',
    language,
    limit: '1',
  });
  const features = await requestFeatures(`${GEOCODING_BASE}/reverse?${params.toString()}`, signal);
  if (!features[0]) {
    const coord = coordinateLabel(lng, lat);
    return { name: coord, address: coord, region: coord, lng, lat, coord };
  }
  return toLocation(features[0], [lng, lat]);
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
