export type GroundQuery = { origin: string; destination: string };

/** Fixed AMap endpoints; no caller-provided coordinates or provider URLs. */
export async function queryGroundTransport(query: GroundQuery, getEnv: (key: string) => string | undefined, request: typeof fetch = fetch) {
  const base = { query, provider: 'amap', retrievedAt: new Date().toISOString(), available: false,
    status: 'not_configured', distanceKm: null as number | null, durationMinutes: null as number | null,
    tollsCny: null as number | null, sourceUrl: 'https://www.amap.com/',
    limitation: '道路路径及耗时是高德估算，不代表实时封路状态、车辆接驳服务、发车时间或已预订。' };
  const key = getEnv('AMAP_WEB_KEY')?.trim();
  if (!key) return base;
  const signal = AbortSignal.timeout(20000);
  const read = async (path: string, params: Record<string, string>) => {
    const response = await request(`https://restapi.amap.com${path}?${new URLSearchParams({ ...params, key })}`, { signal, redirect: 'error' });
    if (!response.ok) throw new Error('amap_request');
    const data = await response.json();
    if (data.status !== '1') throw new Error('amap_response');
    return data;
  };
  try {
    const locate = async (name: string) => {
      const data = await read('/v3/geocode/geo', { address: name });
      // An ambiguous city/POI is not resolved by silently picking the first result.
      if (data.geocodes?.length !== 1 || !/^\d+(?:\.\d+)?,\d+(?:\.\d+)?$/.test(data.geocodes[0].location || '')) return null;
      return data.geocodes[0].location as string;
    };
    const [origin, destination] = await Promise.all([locate(query.origin), locate(query.destination)]);
    if (!origin || !destination) return { ...base, status: 'ambiguous_location' };
    const data = await read('/v3/direction/driving', { origin, destination, extensions: 'base' });
    const path = data.route?.paths?.[0];
    const distance = Number(path?.distance), duration = Number(path?.duration);
    if (!path || !Number.isFinite(distance) || distance <= 0 || !Number.isFinite(duration) || duration <= 0) return { ...base, status: 'empty' };
    const tolls = Number(path.tolls);
    return { ...base, available: true, status: 'results', distanceKm: Math.round(distance / 100) / 10,
      durationMinutes: Math.ceil(duration / 60), tollsCny: Number.isFinite(tolls) && tolls >= 0 ? tolls : null };
  } catch {
    return { ...base, status: 'provider_error' };
  }
}
