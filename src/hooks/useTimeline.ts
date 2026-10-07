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

  // Only a brand-new day uses this now: renaming and removing a day move their
  // group rows through their own RPC, where the day's rows move with them.
  const persistGroup = async (name: string, deleted: boolean) => {
    if (!journeyId || !userId || !name.trim()) return;
    const { error } = await supabase
      .from('timeline_groups')
      .upsert({
        journey_id: journeyId,
        user_id: userId,
        name: name.trim(),
        deleted,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'journey_id,name' });
    if (error) throw error;
  };

  const isDone = (id: string) => state.rows.find(r => r.id === id)?.checked ?? false;

  const toggle = async (id: string) => {
    const current = isDone(id);
    const { error } = await supabase.from('timeline_rows').update({ checked: !current }).eq('id', id);
    // Nothing calls this today — the share poster only reads `checked` — but it
    // must not take the cache along with a write the server refused.
    if (error) throw error;
    setState(key, (s) => ({ ...s, rows: s.rows.map(r => r.id === id ? { ...r, checked: !current } : r) }));
  };

  // The keys present in this object are the columns journey_save_timeline_item()
  // writes; a missing key keeps whatever is stored, so a media-only patch cannot
  // blank the title.
  const itemFields = (item: Partial<Omit<TLRow, 'id'>>) => {
    const fields: Record<string, unknown> = {};
    if (item.title !== undefined) fields.title = item.title;
    if (item.day !== undefined) fields.day = item.day;
    if (item.kind !== undefined) fields.kind = item.kind ?? 'activity';
    if ('media' in item) fields.media = item.media ?? null;
    if ('timeStart' in item) fields.timeStart = item.timeStart ?? null;
    if ('timeEnd' in item) fields.timeEnd = item.timeEnd ?? null;
    if ('location' in item) fields.location = item.location ?? null;
    if ('transport' in item) fields.transport = item.transport ?? null;
    return fields;
  };

  const add = async (item: Omit<TLRow, 'id'>): Promise<string | undefined> => {
    if (!journeyId || !userId) return undefined;
    const id = 'c_' + Math.random().toString(36).slice(2, 10);
    const sortOrder = Math.max(-1, ...state.rows.map((row) => row.sortOrder ?? -1)) + 1;
    const optimistic: TLRow = { ...item, id, sortOrder };
    setState(key, (s) => ({
      ...s,
      rows: [...s.rows, optimistic],
      knownGroups: item.day && !s.knownGroups.includes(item.day) ? [...s.knownGroups, item.day] : s.knownGroups,
      removedGroups: item.day ? s.removedGroups.filter((group) => group !== item.day) : s.removedGroups,
    }));
    try {
      const { data, error } = await supabase.rpc('journey_save_timeline_item', {
      p_id: id,
      p_journey_id: journeyId,
      p_is_new: true,
      p_fields: { ...itemFields(item), sortOrder },
      });
      if (error) throw error;
      const saved = toTLRow(data);
      setState(key, (s) => ({ ...s, rows: s.rows.map((row) => row.id === id ? saved : row) }));
      return id;
    } catch (error) {
      setState(key, (s) => ({ ...s, rows: s.rows.filter((row) => row.id !== id) }));
      throw error;
    }
  };

  const update = async (id: string, patch: Partial<Omit<TLRow, 'id'>>) => {
    if (!journeyId) return;
    const previous = state.rows.find((row) => row.id === id);
    if (!previous) throw new Error('Timeline item is no longer available');
    const optimistic = { ...previous, ...patch };
    setState(key, (s) => ({
      ...s,
      rows: s.rows.map((row) => row.id === id ? optimistic : row),
      knownGroups: optimistic.day && !s.knownGroups.includes(optimistic.day) ? [...s.knownGroups, optimistic.day] : s.knownGroups,
      removedGroups: optimistic.day ? s.removedGroups.filter((group) => group !== optimistic.day) : s.removedGroups,
    }));
    try {
      const { data, error } = await supabase.rpc('journey_save_timeline_item', {
      p_id: id,
      p_journey_id: journeyId,
      p_is_new: false,
      p_fields: itemFields(patch),
      });
      if (error) throw error;
      const saved = toTLRow(data);
      setState(key, (s) => ({ ...s, rows: s.rows.map((row) => row.id === id ? saved : row) }));
    } catch (error) {
      setState(key, (s) => ({ ...s, rows: s.rows.map((row) => row.id === id ? previous : row) }));
      throw error;
    }
  };

  // The server goes first and the row leaves the cache only once it is really
  // gone: a delete that loses the journey's row lock used to drop the row from
  // the list anyway, so the item came back on the next open and the failure was
  // invisible in between.
  const remove = async (id: string) => {
    const { error } = await supabase.from('timeline_rows').delete().eq('id', id);
    if (error) throw error;
    setState(key, (s) => ({ ...s, rows: s.rows.filter(r => r.id !== id) }));
  };

  const removeGroup = async (day: string) => {
    if (!journeyId || !userId) return;
    // One call, so the rows and the group move together. As two transactions this
    // queued twice behind the journey's row lock — the lock save_journey_version
    // holds while it rebuilds the snapshot — and left a window where the rows were
    // gone while the group still said otherwise.
    const { error } = await supabase.rpc('journey_remove_timeline_group', {
      p_journey_id: journeyId,
      p_day: day,
    });
    if (error) throw error;
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
    // Let the failure reach the caller: the catch that used to live here only
    // warned, so a day that was never created looked like nothing happened.
    await persistGroup(next, false);
    setState(key, (s) => ({
      ...s,
      knownGroups: s.knownGroups.includes(next) ? s.knownGroups : [...s.knownGroups, next],
      removedGroups: s.removedGroups.filter((group) => group !== next),
    }));
  };

  const renameGroup = async (from: string, to: string) => {
    const next = to.trim();
    if (!from || !next || from === next || !journeyId || !userId) return;
    // One call: the rows, both group rows and the day's route end move together,
    // instead of three round trips that each took the journey's row lock and
    // could stop half-way.
    const { error } = await supabase.rpc('journey_rename_timeline_group', {
      p_journey_id: journeyId,
      p_from: from,
      p_to: next,
    });
    if (error) throw error;
    // The row keeps its route end server-side; the cache moves its copy so the
    // map keeps framing the day without a refetch.
    const route = state.groupRoutes[from];
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

  const reorderGroups = async (orderedNames: string[]) => {
    if (!journeyId || !userId) return;
    const previous = state.knownGroups;
    const next = [...orderedNames];
    setState(key, (s) => ({ ...s, knownGroups: next }));
    try {
      const results = await Promise.all(next.map((name, sortOrder) =>
        supabase.from('timeline_groups').update({ sort_order: sortOrder, updated_at: new Date().toISOString() })
          .eq('journey_id', journeyId).eq('name', name),
      ));
      const failed = results.find((result) => result.error);
      if (failed?.error) throw failed.error;
    } catch (error) {
      setState(key, (s) => ({ ...s, knownGroups: previous }));
      throw error;
    }
  };

  const reorder = async (day: string, ids: string[]) => {
    if (!journeyId || !userId || preview) throw new Error('Timeline is not editable');
    const previous = new Map(getState(key).rows.filter((row) => row.day === day).map((row) => [row.id, row.sortOrder]));
    if (ids.length !== previous.size || new Set(ids).size !== ids.length || ids.some((id) => !previous.has(id))) {
      throw new Error('Timeline group changed; try again');
    }
    const positions = new Map(ids.map((id, index) => [id, index]));
    setState(key, (s) => ({ ...s, rows: s.rows.map((row) => positions.has(row.id) ? { ...row, sortOrder: positions.get(row.id)! } : row) }));
    try {
      const { data, error } = await supabase.rpc('journey_reorder_timeline_items', {
        p_journey_id: journeyId, p_day: day, p_ids: ids,
      });
      if (error) throw error;
      const saved = new Map((data as any[]).map((row) => [row.id, row.sort_order as number]));
      setState(key, (s) => ({ ...s, rows: s.rows.map((row) => saved.has(row.id) ? { ...row, sortOrder: saved.get(row.id)! } : row) }));
    } catch (error) {
      // Restore only the order: a simultaneous media/title edit must survive.
      setState(key, (s) => ({ ...s, rows: s.rows.map((row) => previous.has(row.id) ? { ...row, sortOrder: previous.get(row.id) } : row) }));
      throw error;
    }
  };

  return { rows: state.rows, knownGroups: state.knownGroups, removedGroups: state.removedGroups, loading: preview ? false : loading, isDone, toggle, add, update, remove, removeGroup, renameGroup, addGroup, reorder, reorderGroups };
}
