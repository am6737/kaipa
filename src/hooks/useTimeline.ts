import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { toTLRow } from '../lib/mappers';
import type { TLRow, TimelineGroupRoute } from '../data/timeline';

interface TLState {
  rows: TLRow[];
  knownGroups: string[];
  removedGroups: string[];
  groupRoutes: Record<string, TimelineGroupRoute | undefined>;
}

const cache = new Map<string, TLState>();
const listeners = new Map<string, Set<() => void>>();
const refreshers = new Map<string, Set<() => Promise<void>>>();

export async function refetchJourneyTimeline(journeyId: string) {
  await Promise.all([...(refreshers.get(journeyId) ?? [])].map((refresh) => refresh()));
}

function getState(key: string): TLState {
  if (!cache.has(key)) cache.set(key, { rows: [], knownGroups: [], removedGroups: [], groupRoutes: {} });
  return cache.get(key)!;
}

function setState(key: string, updater: (prev: TLState) => TLState) {
  cache.set(key, updater(getState(key)));
  listeners.get(key)?.forEach((fn) => fn());
}

const inFlight = new Map<string, Promise<void>>();

// One journey is usually mounted by two hooks at the same time — the detail
// card and the screen that frames the map around it. Sharing the request and
// the cache write keeps a single open to one round trip and one state update,
// instead of re-rendering every geometry memo twice.
function loadJourneyTimeline(journeyId: string) {
  const pending = inFlight.get(journeyId);
  if (pending) return pending;
  const request = (async () => {
    try {
      const [rowsResult, groupsResult] = await Promise.all([
        supabase.from('timeline_rows').select('*').eq('journey_id', journeyId).order('sort_order'),
        supabase.from('timeline_groups').select('*').eq('journey_id', journeyId).order('sort_order'),
      ]);
      if (rowsResult.error) console.warn('[useTimeline] row fetch failed:', rowsResult.error.message);
      if (groupsResult.error) console.warn('[useTimeline] group fetch failed:', groupsResult.error.message);
      if (!rowsResult.data) return;
      const mapped = rowsResult.data.map(toTLRow);
      setState(journeyId, (prev) => {
        const groupRows = groupsResult.data;
        const activeGroups = groupRows
          ? groupRows.filter((group) => !group.deleted).map((group) => group.name).filter(Boolean)
          : prev.knownGroups;
        const removedGroups = groupRows
          ? groupRows.filter((group) => group.deleted).map((group) => group.name).filter(Boolean)
          : prev.removedGroups;
        const fromRows = mapped.map((r) => r.day).filter(Boolean);
        const groupRoutes: Record<string, TimelineGroupRoute | undefined> = {};
        groupRows?.forEach((group) => {
          if (group.deleted || group.route_end_meters == null || group.route_end_lng == null || group.route_end_lat == null) return;
          groupRoutes[group.name] = {
            routeId: group.route_id ?? undefined,
            endDistanceMeters: Number(group.route_end_meters),
            longitude: Number(group.route_end_lng),
            latitude: Number(group.route_end_lat),
            trackPointIndex: Number(group.route_end_track_index ?? 0),
            trackPointFraction: Number(group.route_end_track_fraction ?? 0),
            source: group.route_end_source === 'waypoint' || group.route_end_source === 'distance' ? group.route_end_source : 'map',
            locationName: group.route_location_name ?? undefined,
          };
        });
        return { rows: mapped, knownGroups: [...new Set([...activeGroups, ...fromRows])], removedGroups, groupRoutes };
      });
    } finally {
      inFlight.delete(journeyId);
    }
  })();
  inFlight.set(journeyId, request);
  return request;
}

export function useTimeline(
  journeyId: string | undefined,
  userId: string | undefined,
  preview?: { rows: Record<string, unknown>[]; groups: Record<string, unknown>[] },
) {
  const key = journeyId || '';
  const [, bump] = useState(0);
  const rerender = useCallback(() => bump((n) => n + 1), []);

  useEffect(() => {
    if (!key) return;
    let subs = listeners.get(key);
    if (!subs) { subs = new Set(); listeners.set(key, subs); }
    subs.add(rerender);
    return () => { subs!.delete(rerender); };
  }, [key, rerender]);

  const [loading, setLoading] = useState(true);

  const previewState = useMemo<TLState | undefined>(() => {
    if (!preview) return undefined;
    const rows = preview.rows.map(toTLRow);
    const activeGroups = preview.groups.filter((group: any) => !group.deleted).map((group: any) => group.name).filter(Boolean);
    const removedGroups = preview.groups.filter((group: any) => group.deleted).map((group: any) => group.name).filter(Boolean);
    const groupRoutes: Record<string, TimelineGroupRoute | undefined> = {};
    preview.groups.forEach((group: any) => {
      if (group.deleted || group.route_end_meters == null || group.route_end_lng == null || group.route_end_lat == null) return;
      groupRoutes[group.name] = {
        routeId: group.route_id ?? undefined,
        endDistanceMeters: Number(group.route_end_meters),
        longitude: Number(group.route_end_lng),
        latitude: Number(group.route_end_lat),
        trackPointIndex: Number(group.route_end_track_index ?? 0),
        trackPointFraction: Number(group.route_end_track_fraction ?? 0),
        source: group.route_end_source === 'waypoint' || group.route_end_source === 'distance' ? group.route_end_source : 'map',
        locationName: group.route_location_name ?? undefined,
      };
    });
    const fromRows = rows.map((row) => row.day).filter(Boolean);
    return { rows, knownGroups: [...new Set([...activeGroups, ...fromRows])], removedGroups, groupRoutes };
  }, [preview]);

  const fetchRows = useCallback(async () => {
    if (preview) {
      setLoading(false);
      return;
    }
    if (!journeyId || !userId) return;
    await loadJourneyTimeline(journeyId);
    setLoading(false);
  }, [journeyId, userId, preview]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  useEffect(() => {
    if (!key || preview) return;
    let journeyRefreshers = refreshers.get(key);
    if (!journeyRefreshers) {
      journeyRefreshers = new Set();
      refreshers.set(key, journeyRefreshers);
    }
    journeyRefreshers.add(fetchRows);
    return () => {
      journeyRefreshers!.delete(fetchRows);
      if (!journeyRefreshers!.size) refreshers.delete(key);
    };
  }, [fetchRows, key, preview]);

  const state = previewState ?? getState(key);

  const persistGroup = async (name: string, deleted: boolean, route?: TimelineGroupRoute | null) => {
    if (!journeyId || !userId || !name.trim()) return;
    const row: Record<string, unknown> = {
      journey_id: journeyId,
      user_id: userId,
      name: name.trim(),
      deleted,
      updated_at: new Date().toISOString(),
    };
    if (route !== undefined) {
      // A manual pick happens on the track the editor shows, so it belongs to
      // that track; the caller says which one, and null means the journey's own.
      row.route_id = route?.routeId ?? null;
      row.route_end_meters = route?.endDistanceMeters ?? null;
      row.route_end_lng = route?.longitude ?? null;
      row.route_end_lat = route?.latitude ?? null;
      row.route_end_track_index = route?.trackPointIndex ?? null;
      row.route_end_track_fraction = route?.trackPointFraction ?? null;
      row.route_end_source = route?.source ?? null;
      row.route_location_name = route?.locationName ?? null;
    }
    const { error } = await supabase
      .from('timeline_groups')
      .upsert(row, { onConflict: 'journey_id,name' });
    if (error) throw error;
  };

  const isDone = (id: string) => state.rows.find(r => r.id === id)?.checked ?? false;

  const toggle = async (id: string) => {
    const current = isDone(id);
    await supabase.from('timeline_rows').update({ checked: !current }).eq('id', id);
    setState(key, (s) => ({ ...s, rows: s.rows.map(r => r.id === id ? { ...r, checked: !current } : r) }));
  };

  const add = async (item: Omit<TLRow, 'id'>) => {
    if (!journeyId || !userId) return;
    const id = 'c_' + Math.random().toString(36).slice(2, 10);
    const row = {
      id,
      journey_id: journeyId,
      user_id: userId,
      title: item.title,
      day: item.day,
      media: item.media ?? null,
      time_mins: item.timeStart ?? null,
      time_end_mins: item.timeEnd ?? null,
      is_synth: false,
      is_custom: true,
      checked: false,
      item_kind: item.kind ?? 'activity',
      location: item.location ?? null,
      transport: item.transport ?? null,
      sort_order: state.rows.length,
    };
    await supabase.from('timeline_rows').insert(row);
    await persistGroup(item.day, false);
    setState(key, (s) => ({
      ...s,
      rows: [...s.rows, toTLRow(row)],
      knownGroups: item.day && !s.knownGroups.includes(item.day) ? [...s.knownGroups, item.day] : s.knownGroups,
      removedGroups: item.day ? s.removedGroups.filter((group) => group !== item.day) : s.removedGroups,
    }));
  };

  const update = async (id: string, patch: Partial<Omit<TLRow, 'id'>>) => {
    const dbPatch: Record<string, unknown> = {};
    if (patch.title !== undefined) dbPatch.title = patch.title;
    if (patch.day !== undefined) dbPatch.day = patch.day;
    if (patch.media !== undefined) dbPatch.media = patch.media ?? null;
    if ('timeStart' in patch) dbPatch.time_mins = patch.timeStart ?? null;
    if ('timeEnd' in patch) dbPatch.time_end_mins = patch.timeEnd ?? null;
    if (patch.kind !== undefined) dbPatch.item_kind = patch.kind ?? 'activity';
    if ('location' in patch) dbPatch.location = patch.location ?? null;
    if (patch.transport !== undefined) dbPatch.transport = patch.transport ?? null;
    await supabase.from('timeline_rows').update(dbPatch).eq('id', id);
    if (patch.day) await persistGroup(patch.day, false);
    setState(key, (s) => ({
      ...s,
      rows: s.rows.map(r => r.id === id ? { ...r, ...patch } : r),
      knownGroups: patch.day && !s.knownGroups.includes(patch.day) ? [...s.knownGroups, patch.day] : s.knownGroups,
      removedGroups: patch.day ? s.removedGroups.filter((group) => group !== patch.day) : s.removedGroups,
    }));
  };

  const remove = async (id: string) => {
    await supabase.from('timeline_rows').delete().eq('id', id);
    setState(key, (s) => ({ ...s, rows: s.rows.filter(r => r.id !== id) }));
  };

  const removeGroup = async (day: string) => {
    const ids = state.rows.filter(r => r.day === day).map(r => r.id);
    if (ids.length) {
      await supabase.from('timeline_rows').delete().in('id', ids);
    }
    await persistGroup(day, true);
    setState(key, (s) => ({
      rows: s.rows.filter(r => r.day !== day),
      knownGroups: s.knownGroups.filter(g => g !== day),
      removedGroups: s.removedGroups.includes(day) ? s.removedGroups : [...s.removedGroups, day],
      groupRoutes: Object.fromEntries(Object.entries(s.groupRoutes).filter(([name]) => name !== day)),
    }));
  };

  const addGroup = async (day: string) => {
    const next = day.trim();
    if (!next) return;
    try {
      await persistGroup(next, false);
      setState(key, (s) => ({
        ...s,
        knownGroups: s.knownGroups.includes(next) ? s.knownGroups : [...s.knownGroups, next],
        removedGroups: s.removedGroups.filter((group) => group !== next),
      }));
    } catch (error) {
      console.warn('[useTimeline] group save failed:', error);
    }
  };

  const renameGroup = async (from: string, to: string) => {
    const next = to.trim();
    if (!from || !next || from === next || !journeyId || !userId) return;
    await supabase
      .from('timeline_rows')
      .update({ day: next })
      .eq('journey_id', journeyId)
      .eq('user_id', userId)
      .eq('day', from);
    const route = state.groupRoutes[from];
    await Promise.all([persistGroup(from, true), persistGroup(next, false, route)]);
    setState(key, (s) => {
      const known = s.knownGroups.map((g) => (g === from ? next : g)).filter((g, i, arr) => g && arr.indexOf(g) === i);
      const groupRoutes = { ...s.groupRoutes };
      delete groupRoutes[from];
      if (route) groupRoutes[next] = route;
      return {
        rows: s.rows.map(r => r.day === from ? { ...r, day: next } : r),
        knownGroups: known.includes(next) ? known : [...known, next],
        removedGroups: [...new Set([...s.removedGroups.filter((group) => group !== next), from])],
        groupRoutes,
      };
    });
  };

  return { rows: state.rows, knownGroups: state.knownGroups, removedGroups: state.removedGroups, loading: preview ? false : loading, isDone, toggle, add, update, remove, removeGroup, renameGroup, addGroup };
}
