import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useOfflineState } from '../lib/offlineCache';
import { toRoutePoi } from '../lib/mappers';
import { ensureCloudMedia } from '../lib/storage';
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
  if (has(patch, 'photoUris')) row.photo_uris = patch.photoUris ?? null;
  return row;
}

export function useRoutes(userId: string | undefined) {
  const [routes, setRoutes, cached] = useOfflineState<Poi[]>(userId, 'routes', []);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    setLoading(true);
    const [{ data, error }, favorites] = await Promise.all([supabase
      .from('routes')
      .select('*')
      .order('created_at'), userId
        ? supabase.from('route_favorites').select('route_id').eq('user_id', userId)
        : Promise.resolve({ data: [], error: null } as any)]);
    if (error) console.warn('[useRoutes] fetch error:', error.message);
    if (favorites.error) console.warn('[useRoutes] favorites fetch error:', favorites.error.message);
    const ids = new Set<string>((favorites.data ?? []).map((r: any) => r.route_id));
    if (data) setRoutes(data.map((r: any) => ({ ...toRoutePoi({ ...r, asc: r.asc_ }), fav: ids.has(r.id) })));
    setLoading(false);
  }, [userId]);

  useEffect(() => { refetch(); }, [refetch]);

  const updateRoute = async (id: string, patch: Partial<Poi>) => {
    const photoUris = has(patch, 'photoUris') && userId
      ? await ensureCloudMedia(patch.photoUris, userId, `route-${id}`)
      : patch.photoUris;
    const resolvedPatch = has(patch, 'photoUris') ? { ...patch, photoUris } : patch;
    const row = routePatchToRow(resolvedPatch);
    if (!Object.keys(row).length) return;

    const { error } = await supabase.from('routes').update(row).eq('id', id);
    if (error) {
      console.warn('[updateRoute] update error:', error.message, 'row:', JSON.stringify(row));
      return;
    }

    setRoutes((prev) => prev.map((p) => (p.id === id ? { ...p, ...resolvedPatch } : p)));
  };

  const toggleFavorite = async (id: string, current: boolean) => {
    if (!userId) return;
    const next = !current;
    const query = next
      ? supabase.from('route_favorites').upsert({ user_id: userId, route_id: id })
      : supabase.from('route_favorites').delete().eq('user_id', userId).eq('route_id', id);
    const { error } = await query;
    if (error) {
      console.warn('[useRoutes] favorite update error:', error.message);
      return;
    }
    setRoutes((prev) => prev.map((p) => (p.id === id ? { ...p, fav: next } : p)));
  };

  return { routes, loading: loading && !cached, updateRoute, toggleFavorite, refetch };
}
