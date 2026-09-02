declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (req: Request) => Response | Promise<Response>): void };

// @ts-ignore Deno npm specifier
import { createClient } from 'npm:@supabase/supabase-js@2.108.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const AMAP_API = 'https://restapi.amap.com/v3';
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 60;
const requestsByUser = new Map<string, { startedAt: number; count: number }>();

type Coordinate = [number, number];
type AmapPoi = {
  name?: string;
  address?: string | string[];
  location?: string;
  pname?: string | string[];
  cityname?: string | string[];
  adname?: string | string[];
};
type JourneyLocationValue = {
  name: string;
  address: string;
  region: string;
  lng: number;
  lat: number;
  coord: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function env(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function bearerToken(req: Request) {
  const [scheme, token] = (req.headers.get('authorization') || '').split(' ');
  return scheme?.toLowerCase() === 'bearer' ? token : '';
}

function withinRateLimit(userId: string) {
  const now = Date.now();
  if (requestsByUser.size > 1_000) {
    for (const [id, entry] of requestsByUser) {
      if (now - entry.startedAt >= RATE_WINDOW_MS) requestsByUser.delete(id);
    }
  }
  const current = requestsByUser.get(userId);
  if (!current || now - current.startedAt >= RATE_WINDOW_MS) {
    requestsByUser.set(userId, { startedAt: now, count: 1 });
    return true;
  }
  current.count += 1;
  return current.count <= RATE_LIMIT;
}

const PI = Math.PI;
const AXIS = 6378245;
const ECCENTRICITY = 0.006693421622965943;

function insideChina([lng, lat]: Coordinate) {
  return lng >= 72.004 && lng <= 137.8347 && lat >= 0.8293 && lat <= 55.8271;
}

function latitudeOffset(lng: number, lat: number) {
  let value = -100 + 2 * lng + 3 * lat + 0.2 * lat * lat + 0.1 * lng * lat + 0.2 * Math.sqrt(Math.abs(lng));
  value += ((20 * Math.sin(6 * lng * PI) + 20 * Math.sin(2 * lng * PI)) * 2) / 3;
  value += ((20 * Math.sin(lat * PI) + 40 * Math.sin((lat / 3) * PI)) * 2) / 3;
  value += ((160 * Math.sin((lat / 12) * PI) + 320 * Math.sin((lat * PI) / 30)) * 2) / 3;
  return value;
}

function longitudeOffset(lng: number, lat: number) {
  let value = 300 + lng + 2 * lat + 0.1 * lng * lng + 0.1 * lng * lat + 0.1 * Math.sqrt(Math.abs(lng));
  value += ((20 * Math.sin(6 * lng * PI) + 20 * Math.sin(2 * lng * PI)) * 2) / 3;
  value += ((20 * Math.sin(lng * PI) + 40 * Math.sin((lng / 3) * PI)) * 2) / 3;
  value += ((150 * Math.sin((lng / 12) * PI) + 300 * Math.sin((lng / 30) * PI)) * 2) / 3;
  return value;
}

function wgs84ToGcj02(coordinate: Coordinate): Coordinate {
  if (!insideChina(coordinate)) return coordinate;
  const [lng, lat] = coordinate;
  let dLat = latitudeOffset(lng - 105, lat - 35);
  let dLng = longitudeOffset(lng - 105, lat - 35);
  const radLat = (lat / 180) * PI;
  let magic = Math.sin(radLat);
  magic = 1 - ECCENTRICITY * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180) / (((AXIS * (1 - ECCENTRICITY)) / (magic * sqrtMagic)) * PI);
  dLng = (dLng * 180) / ((AXIS / sqrtMagic) * Math.cos(radLat) * PI);
  return [lng + dLng, lat + dLat];
}

function gcj02ToWgs84(coordinate: Coordinate): Coordinate {
  if (!insideChina(coordinate)) return coordinate;
  let estimate = coordinate;
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const converted = wgs84ToGcj02(estimate);
    estimate = [estimate[0] + coordinate[0] - converted[0], estimate[1] + coordinate[1] - converted[1]];
  }
  return estimate;
}

function text(value?: string | string[]) {
  return Array.isArray(value) ? value.filter(Boolean).join('') : value || '';
}

function uniqueRegion(parts: Array<string | undefined>) {
  return parts.filter((part, index, values): part is string => Boolean(part) && values.indexOf(part) === index).join(' · ');
}

function coordinateLabel(lng: number, lat: number) {
  const latDir = lat >= 0 ? 'N' : 'S';
  const lngDir = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(5)} ${latDir}  ${Math.abs(lng).toFixed(5)} ${lngDir}`;
}

function poiToLocation(poi: AmapPoi): JourneyLocationValue | null {
  const [gcjLng, gcjLat] = (poi.location || '').split(',').map(Number);
  if (!Number.isFinite(gcjLng) || !Number.isFinite(gcjLat)) return null;
  const [lng, lat] = gcj02ToWgs84([gcjLng, gcjLat]);
  const name = poi.name || coordinateLabel(lng, lat);
  const parent = uniqueRegion([text(poi.pname), text(poi.cityname), text(poi.adname)]);
  const address = uniqueRegion([parent, text(poi.address)]) || coordinateLabel(lng, lat);
  return {
    name,
    address,
    region: uniqueRegion([name, text(poi.cityname) || text(poi.adname)]) || name,
    lng,
    lat,
    coord: coordinateLabel(lng, lat),
  };
}

async function amap(path: 'place/text' | 'geocode/regeo', params: URLSearchParams) {
  params.set('key', env('AMAP_WEB_KEY'));
  const response = await fetch(`${AMAP_API}/${path}?${params.toString()}`);
  if (!response.ok) throw new Error(`AMap HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.status !== '1') throw new Error(`AMap ${payload.info || 'failed'}`);
  return payload;
}

function validCoordinate(lng: unknown, lat: unknown): boolean {
  return typeof lng === 'number' && Number.isFinite(lng) && lng >= -180 && lng <= 180
    && typeof lat === 'number' && Number.isFinite(lat) && lat >= -90 && lat <= 90;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: { code: 'method_not_allowed' } }, 405);

  try {
    const token = bearerToken(req);
    if (!token) return json({ error: { code: 'unauthorized' } }, 401);
    const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error } = await admin.auth.getUser(token);
    if (error || !user) return json({ error: { code: 'unauthorized' } }, 401);
    if (!withinRateLimit(user.id)) return json({ error: { code: 'rate_limited' } }, 429);

    const body = await req.json();
    const language = typeof body.language === 'string' && body.language.startsWith('en') ? 'en' : 'zh_cn';

    if (body.action === 'search') {
      const query = typeof body.query === 'string' ? body.query.trim() : '';
      if (!query || query.length > 100) return json({ error: { code: 'invalid_query' } }, 400);
      const params = new URLSearchParams({
        keywords: query,
        offset: '8',
        page: '1',
        extensions: 'base',
        citylimit: 'false',
        language,
      });
      if (Array.isArray(body.proximity) && validCoordinate(body.proximity[0], body.proximity[1])) {
        const [lng, lat] = wgs84ToGcj02([body.proximity[0], body.proximity[1]]);
        params.set('location', `${lng},${lat}`);
        params.set('sortrule', 'distance');
      }
      const payload = await amap('place/text', params);
      const results = (payload.pois || []).map(poiToLocation).filter(Boolean);
      return json({ results });
    }

    if (body.action === 'reverse') {
      if (!validCoordinate(body.lng, body.lat)) return json({ error: { code: 'invalid_coordinate' } }, 400);
      const [gcjLng, gcjLat] = wgs84ToGcj02([body.lng, body.lat]);
      const params = new URLSearchParams({
        location: `${gcjLng},${gcjLat}`,
        extensions: 'base',
        radius: '1000',
        language,
      });
      const payload = await amap('geocode/regeo', params);
      const component = payload.regeocode?.addressComponent;
      const city = Array.isArray(component?.city) ? component.city[0] : component?.city;
      const name = component?.township || component?.district || city || component?.province || coordinateLabel(body.lng, body.lat);
      const address = payload.regeocode?.formatted_address || coordinateLabel(body.lng, body.lat);
      return json({ result: {
        name,
        address,
        region: uniqueRegion([city || component?.province, name]) || name,
        lng: body.lng,
        lat: body.lat,
        coord: coordinateLabel(body.lng, body.lat),
      } });
    }

    return json({ error: { code: 'invalid_action' } }, 400);
  } catch (error) {
    console.error('[map-search]', error);
    return json({ error: { code: 'map_search_failed' } }, 500);
  }
});
