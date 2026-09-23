declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (req: Request) => Response | Promise<Response>): void };

// @ts-ignore Deno npm specifier
import { createClient } from 'npm:@supabase/supabase-js@2.108.1';
import { gcj02ToWgs84, wgs84ToGcj02 } from './coordinates.ts';
import { parseDirectionLegs, planAll } from './direction.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const AMAP_API = 'https://restapi.amap.com/v3';
// Buckets are per feature, not just per user: a journey open asks for one plan
// per leg, and those used to share a single budget with the place search and
// reverse geocoding that happen in the same minute. The tail of the itinerary
// chain was what got cut, and the client read that as "no road here".
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 60;
const requestsByBucket = new Map<string, { startedAt: number; count: number }>();

type AmapPoi = {
  name?: string;
  address?: string | string[];
  location?: string;
  type?: string;
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
  category?: string;
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

function withinRateLimit(bucket: string) {
  const now = Date.now();
  if (requestsByBucket.size > 2_000) {
    for (const [id, entry] of requestsByBucket) {
      if (now - entry.startedAt >= RATE_WINDOW_MS) requestsByBucket.delete(id);
    }
  }
  const current = requestsByBucket.get(bucket);
  if (!current || now - current.startedAt >= RATE_WINDOW_MS) {
    requestsByBucket.set(bucket, { startedAt: now, count: 1 });
    return true;
  }
  current.count += 1;
  return current.count <= RATE_LIMIT;
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
    category: text(poi.type) || undefined,
  };
}

async function amap(path: string, params: URLSearchParams) {
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
    if (!withinRateLimit(`${user.id}:http`)) return json({ error: { code: 'rate_limited' } }, 429);

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

    if (body.action === 'direction') {
      const legs = parseDirectionLegs(body.legs);
      if (!legs.length) return json({ error: { code: 'invalid_legs' } }, 400);
      // Each uncached leg is a separate AMap request, so those are what the
      // per-user planning budget pays for.
      return json({ legs: await planAll(legs, amap, () => withinRateLimit(`${user.id}:direction`)) });
    }

    return json({ error: { code: 'invalid_action' } }, 400);
  } catch (error) {
    console.error('[map-search]', error);
    return json({ error: { code: 'map_search_failed' } }, 500);
  }
});
