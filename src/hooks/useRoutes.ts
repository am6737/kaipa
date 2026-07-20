import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { toRoutePoi } from '../lib/mappers';
import type { Poi } from '../data/pois';

const has = (obj: object, key: keyof Poi) => Object.prototype.hasOwnProperty.call(obj, key);

function routePatchToRow(patch: Partial<Poi>) {
  const row: any = {};
  if (has(patch, 'name')) row.name = patch.name;
  if (has(patch, 'region')) row.region = patch.region;
  if (has(patch, 'coord')) row.coord = patch.coord;
  if (has(patch, 'lng')) row.lng = patch.lng;
  if (has(patch, 'lat')) row.lat = patch.lat;
  if (has(patch, 'dist')) row.dist = patch.dist;
  if (has(patch, 'asc')) row.asc_ = patch.asc;
  if (has(patch, 'diff')) row.diff = patch.diff;
  if (has(patch, 'rating')) row.rating = patch.rating;
  if (has(patch, 'reviews')) row.reviews = patch.reviews;
  if (has(patch, 'tone')) row.tone = patch.tone;
  if (has(patch, 'desc')) row.desc = patch.desc;
  if (has(patch, 'trackCoords')) row.track_coords = patch.trackCoords ?? null;
  if (has(patch, 'trackElevation')) row.track_elevation = patch.trackElevation ?? null;
  if (has(patch, 'trackDurationMs')) row.track_duration_ms = patch.trackDurationMs ?? null;
  if (has(patch, 'trackWaypoints')) row.track_waypoints = patch.trackWaypoints ?? null;
  if (has(patch, 'photoUris')) row.photo_uris = patch.photoUris?.filter((u) => !u.startsWith('file://')) ?? null;
  return row;
}

export function useRoutes() {
  const [routes, setRoutes] = useState<Poi[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('routes')
      .select('*')
      .order('created_at');
    if (error) console.warn('[useRoutes] fetch error:', error.message);
    if (data) setRoutes(data.map((r: any) => toRoutePoi({ ...r, asc: r.asc_ })));
    setLoading(false);
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  const updateRoute = async (id: string, patch: Partial<Poi>) => {
    const row = routePatchToRow(patch);
    if (!Object.keys(row).length) return;

    const { error } = await supabase.from('routes').update(row).eq('id', id);
    if (error) {
      console.warn('[updateRoute] update error:', error.message, 'row:', JSON.stringify(row));
      return;
    }

    setRoutes((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  return { routes, loading, updateRoute, refetch };
}
