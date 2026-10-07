import { useCallback, useEffect, useState } from 'react';
import { parseRouteWeather, routeWeatherUrl, type RouteWeatherForecast } from '../lib/routeWeather';
const cache = new Map<string, RouteWeatherForecast>();
const CACHE_MS = 15 * 60 * 1000;
export function useRouteWeather(lng: number, lat: number, enabled = true) {
  const [forecast, setForecast] = useState<RouteWeatherForecast | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const retry = useCallback(() => setRevision((n) => n + 1), []);
  useEffect(() => {
    if (!enabled) { setLoading(false); setFailed(false); setForecast(null); return; }
    let active = true;
    const controller = new AbortController();
    setForecast(null); setFailed(false); setLoading(true);
    let url: string;
    try { url = routeWeatherUrl(lng, lat); } catch { setLoading(false); setFailed(true); return; }
    const saved = cache.get(url);
    if (saved && Date.now() - Date.parse(saved.fetchedAt) < CACHE_MS) {
      setForecast(saved); setLoading(false); return;
    }
    const timeout = setTimeout(() => controller.abort(), 12000);
    void (async () => {
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error('Weather unavailable');
        const next = parseRouteWeather(await response.json());
        if (!active) return;
        if (cache.size > 100) cache.clear();
        cache.set(url, next); setForecast(next);
      } catch { if (active) setFailed(true); }
      finally { clearTimeout(timeout); if (active) setLoading(false); }
    })();
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [lng, lat, revision, enabled]);
  return { forecast, loading, failed, retry };
}
