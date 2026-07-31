import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { toJourneyPoi } from '../lib/mappers';
import { ensureCloudMedia } from '../lib/storage';
import type { Poi } from '../data/pois';

const has = (obj: object, key: keyof Poi) => Object.prototype.hasOwnProperty.call(obj, key);

export function useJourneys(userId: string | undefined) {
  const [journeys, setJourneys] = useState<Poi[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchJourneys = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from('journeys')
      .select(`
        *,
        companions ( id, ini, name, role, color, tone, trips, is_host, is_self, sort_order )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) console.warn('[useJourneys] fetch error:', error.message);
    if (data) setJourneys(data.map((j: any) => toJourneyPoi({ ...j, asc: j.asc_ })));
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetchJourneys(); }, [fetchJourneys]);

  const createJourney = async (poi: Partial<Poi>) => {
    if (!userId) return null;
    const id = poi.id || 'j_' + Math.random().toString(36).slice(2, 10);
    const photoUris = await ensureCloudMedia(poi.photoUris, userId, id);
    const row = {
      id,
      user_id: userId,
      route_id: poi.routeId || null,
      name: poi.name || '',
      region: poi.region || '',
      coord: poi.coord || '',
      lng: poi.lng || 0,
      lat: poi.lat || 0,
      dist: poi.dist || '',
      asc_: poi.asc || '',
      diff: poi.diff || null,
      tone: poi.tone || 'forest',
      desc: poi.desc || null,
      date: poi.date || null,
      days: poi.days || null,
      planned_date: poi.plannedDate || null,
      countdown: poi.countdown || null,
      day_index: poi.dayIndex || null,
      total_days: poi.totalDays || null,
      fav: poi.fav || false,
      track_public: poi.trackPublic || false,
      route_show_photos: poi.routeShowPhotos ?? true,
      route_show_timeline: poi.routeShowTimeline ?? true,
      photo_uris: photoUris ?? null,
      track_coords: poi.trackCoords || null,
      track_elevation: poi.trackElevation || null,
      track_duration_ms: poi.trackDurationMs || null,
      track_waypoints: poi.trackWaypoints || null,
      track_file_url: poi.trackFileUrl || null,
      track_file_name: poi.trackFileName || null,
    };
    const { data, error } = await supabase.from('journeys').insert(row).select().single();
    if (error) { console.warn('createJourney error:', error.message); return null; }

    if (poi.companionList?.length) {
      const companions = poi.companionList.map((c, i) => ({
        journey_id: id,
        ini: c.ini,
        name: c.name,
        role: c.role || null,
        color: c.color,
        tone: c.tone || null,
        trips: c.trips || null,
        is_host: c.host || false,
        is_self: c.self || false,
        sort_order: i,
      }));
      await supabase.from('companions').insert(companions);
    }

    const newPoi = toJourneyPoi({ ...data, companions: poi.companionList || [] });
    setJourneys(prev => [newPoi, ...prev]);
    return newPoi;
  };

  const updateJourney = async (id: string, patch: Partial<Poi>) => {
    if (!userId) return;
    const photoUris = has(patch, 'photoUris')
      ? await ensureCloudMedia(patch.photoUris, userId, id)
      : undefined;
    const resolvedPatch = has(patch, 'photoUris') ? { ...patch, photoUris } : patch;
    const row: any = {};
    if (has(resolvedPatch, 'name')) row.name = resolvedPatch.name;
    if (has(resolvedPatch, 'region')) row.region = resolvedPatch.region;
    if (has(resolvedPatch, 'coord')) row.coord = resolvedPatch.coord;
    if (has(resolvedPatch, 'lng')) row.lng = resolvedPatch.lng;
    if (has(resolvedPatch, 'lat')) row.lat = resolvedPatch.lat;
    if (has(resolvedPatch, 'desc')) row.desc = resolvedPatch.desc;
    if (has(resolvedPatch, 'date')) row.date = resolvedPatch.date;
    if (has(resolvedPatch, 'days')) row.days = resolvedPatch.days;
    if (has(resolvedPatch, 'plannedDate')) row.planned_date = resolvedPatch.plannedDate;
    if (has(resolvedPatch, 'countdown')) row.countdown = resolvedPatch.countdown;
    if (has(resolvedPatch, 'dayIndex')) row.day_index = resolvedPatch.dayIndex;
    if (has(resolvedPatch, 'totalDays')) row.total_days = resolvedPatch.totalDays;
    if (has(resolvedPatch, 'fav')) row.fav = resolvedPatch.fav;
    if (has(resolvedPatch, 'tone')) row.tone = resolvedPatch.tone;
    if (has(resolvedPatch, 'dist')) row.dist = resolvedPatch.dist;
    if (has(resolvedPatch, 'asc')) row.asc_ = resolvedPatch.asc;
    if (has(resolvedPatch, 'trackCoords')) row.track_coords = resolvedPatch.trackCoords ?? null;
    if (has(resolvedPatch, 'trackElevation')) row.track_elevation = resolvedPatch.trackElevation ?? null;
    if (has(resolvedPatch, 'trackDurationMs')) row.track_duration_ms = resolvedPatch.trackDurationMs ?? null;
    if (has(resolvedPatch, 'trackWaypoints')) row.track_waypoints = resolvedPatch.trackWaypoints ?? null;
    if (has(resolvedPatch, 'trackFileUrl')) row.track_file_url = resolvedPatch.trackFileUrl ?? null;
    if (has(resolvedPatch, 'trackFileName')) row.track_file_name = resolvedPatch.trackFileName ?? null;
    if (has(resolvedPatch, 'photoUris')) row.photo_uris = resolvedPatch.photoUris ?? null;
    if (has(resolvedPatch, 'trackPublic')) row.track_public = resolvedPatch.trackPublic;
    if (has(resolvedPatch, 'routeShowPhotos')) row.route_show_photos = resolvedPatch.routeShowPhotos;
    if (has(resolvedPatch, 'routeShowTimeline')) row.route_show_timeline = resolvedPatch.routeShowTimeline;
    row.updated_at = new Date().toISOString();

    if (Object.keys(row).length > 1) {
      const { error } = await supabase.from('journeys').update(row).eq('id', id);
      if (error) console.warn('[updateJourney] update error:', error.message, 'row:', JSON.stringify(row));
    }

    if (resolvedPatch.companionList) {
      await supabase.from('companions').delete().eq('journey_id', id);
      if (resolvedPatch.companionList.length) {
        const companions = resolvedPatch.companionList.map((c, i) => ({
          journey_id: id,
          ini: c.ini,
          name: c.name,
          role: c.role || null,
          color: c.color,
          tone: c.tone || null,
          trips: c.trips || null,
          is_host: c.host || false,
          is_self: c.self || false,
          sort_order: i,
        }));
        await supabase.from('companions').insert(companions);
      }
    }

    setJourneys(prev => prev.map(j => j.id === id ? { ...j, ...resolvedPatch } : j));
  };
  const deleteJourney = async (id: string) => {
    await supabase.from('journeys').delete().eq('id', id);
    setJourneys(prev => prev.filter(j => j.id !== id));
  };

  const toggleFav = async (id: string, current: boolean) => {
    await supabase.from('journeys').update({ fav: !current }).eq('id', id);
    setJourneys(prev => prev.map(j => j.id === id ? { ...j, fav: !current } : j));
  };

  return { journeys, loading, createJourney, updateJourney, deleteJourney, toggleFav, refetch: fetchJourneys };
}
