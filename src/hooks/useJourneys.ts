import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { toJourneyPoi } from '../lib/mappers';
import type { Poi, JourneyStatus } from '../data/pois';

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
      status: poi.status || 'planning',
      date: poi.date || null,
      days: poi.days || null,
      planned_date: poi.plannedDate || null,
      countdown: poi.countdown || null,
      day_index: poi.dayIndex || null,
      total_days: poi.totalDays || null,
      fav: poi.fav || false,
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
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.region !== undefined) row.region = patch.region;
    if (patch.desc !== undefined) row.desc = patch.desc;
    if (patch.status !== undefined) row.status = patch.status;
    if (patch.date !== undefined) row.date = patch.date;
    if (patch.days !== undefined) row.days = patch.days;
    if (patch.plannedDate !== undefined) row.planned_date = patch.plannedDate;
    if (patch.countdown !== undefined) row.countdown = patch.countdown;
    if (patch.dayIndex !== undefined) row.day_index = patch.dayIndex;
    if (patch.totalDays !== undefined) row.total_days = patch.totalDays;
    if (patch.fav !== undefined) row.fav = patch.fav;
    if (patch.tone !== undefined) row.tone = patch.tone;
    if (patch.dist !== undefined) row.dist = patch.dist;
    if (patch.asc !== undefined) row.asc_ = patch.asc;
    if (patch.trackCoords !== undefined) row.track_coords = patch.trackCoords;
    if (patch.trackElevation !== undefined) row.track_elevation = patch.trackElevation;
    if (patch.trackDurationMs !== undefined) row.track_duration_ms = patch.trackDurationMs;
    if (patch.trackWaypoints !== undefined) row.track_waypoints = patch.trackWaypoints;
    if (patch.photoUris !== undefined) row.photo_uris = patch.photoUris;
    row.updated_at = new Date().toISOString();

    if (Object.keys(row).length > 1) {
      await supabase.from('journeys').update(row).eq('id', id);
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
