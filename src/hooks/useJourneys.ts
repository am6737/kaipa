import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { toJourneyPoi } from '../lib/mappers';
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
      photo_uris: poi.photoUris?.filter((u) => !u.startsWith('file://')) || null,
      track_coords: poi.trackCoords || null,
      track_elevation: poi.trackElevation || null,
      track_duration_ms: poi.trackDurationMs || null,
      track_waypoints: poi.trackWaypoints || null,
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
    const row: any = {};
    if (has(patch, 'name')) row.name = patch.name;
    if (has(patch, 'region')) row.region = patch.region;
    if (has(patch, 'desc')) row.desc = patch.desc;
    if (has(patch, 'date')) row.date = patch.date;
    if (has(patch, 'days')) row.days = patch.days;
    if (has(patch, 'plannedDate')) row.planned_date = patch.plannedDate;
    if (has(patch, 'countdown')) row.countdown = patch.countdown;
    if (has(patch, 'dayIndex')) row.day_index = patch.dayIndex;
    if (has(patch, 'totalDays')) row.total_days = patch.totalDays;
    if (has(patch, 'fav')) row.fav = patch.fav;
    if (has(patch, 'tone')) row.tone = patch.tone;
    if (has(patch, 'dist')) row.dist = patch.dist;
    if (has(patch, 'asc')) row.asc_ = patch.asc;
    if (has(patch, 'trackCoords')) row.track_coords = patch.trackCoords ?? null;
    if (has(patch, 'trackElevation')) row.track_elevation = patch.trackElevation ?? null;
    if (has(patch, 'trackDurationMs')) row.track_duration_ms = patch.trackDurationMs ?? null;
    if (has(patch, 'trackWaypoints')) row.track_waypoints = patch.trackWaypoints ?? null;
    if (has(patch, 'photoUris')) row.photo_uris = patch.photoUris?.filter((u) => !u.startsWith('file://')) ?? null;
    if (has(patch, 'trackPublic')) row.track_public = patch.trackPublic;
    if (has(patch, 'routeShowPhotos')) row.route_show_photos = patch.routeShowPhotos;
    if (has(patch, 'routeShowTimeline')) row.route_show_timeline = patch.routeShowTimeline;
    row.updated_at = new Date().toISOString();

    if (Object.keys(row).length > 1) {
      const { error } = await supabase.from('journeys').update(row).eq('id', id);
      if (error) console.warn('[updateJourney] update error:', error.message, 'row:', JSON.stringify(row));
    }

    if (patch.companionList) {
      await supabase.from('companions').delete().eq('journey_id', id);
      if (patch.companionList.length) {
        const companions = patch.companionList.map((c, i) => ({
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

    setJourneys(prev => prev.map(j => j.id === id ? { ...j, ...patch } : j));
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
