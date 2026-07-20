import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { toTLRow } from '../lib/mappers';
import type { TLRow } from '../data/timeline';

interface TLState {
  rows: TLRow[];
  knownGroups: string[];
}

const cache = new Map<string, TLState>();
const listeners = new Map<string, Set<() => void>>();

function getState(key: string): TLState {
  if (!cache.has(key)) cache.set(key, { rows: [], knownGroups: [] });
  return cache.get(key)!;
}

function setState(key: string, updater: (prev: TLState) => TLState) {
  cache.set(key, updater(getState(key)));
  listeners.get(key)?.forEach((fn) => fn());
}

export function useTimeline(journeyId: string | undefined, userId: string | undefined) {
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

  const fetchRows = useCallback(async () => {
    if (!journeyId || !userId) return;
    const { data } = await supabase
      .from('timeline_rows')
      .select('*')
      .eq('journey_id', journeyId)
      .order('sort_order');
    if (data) {
      const mapped = data.map(toTLRow);
      setState(key, (prev) => {
        const fromRows = mapped.map((r) => r.day).filter(Boolean);
        const merged = [...new Set([...prev.knownGroups, ...fromRows])];
        return { rows: mapped, knownGroups: merged };
      });
    }
    setLoading(false);
  }, [journeyId, userId, key]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const state = getState(key);

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
      sort_order: state.rows.length,
    };
    await supabase.from('timeline_rows').insert(row);
    setState(key, (s) => ({
      rows: [...s.rows, toTLRow(row)],
      knownGroups: item.day && !s.knownGroups.includes(item.day) ? [...s.knownGroups, item.day] : s.knownGroups,
    }));
  };

  const update = async (id: string, patch: Partial<Omit<TLRow, 'id'>>) => {
    const dbPatch: Record<string, unknown> = {};
    if (patch.title !== undefined) dbPatch.title = patch.title;
    if (patch.day !== undefined) dbPatch.day = patch.day;
    if (patch.media !== undefined) dbPatch.media = patch.media ?? null;
    if (patch.timeStart !== undefined) dbPatch.time_mins = patch.timeStart ?? null;
    if (patch.timeEnd !== undefined) dbPatch.time_end_mins = patch.timeEnd ?? null;
    await supabase.from('timeline_rows').update(dbPatch).eq('id', id);
    setState(key, (s) => ({
      ...s,
      rows: s.rows.map(r => r.id === id ? { ...r, ...patch } : r),
      knownGroups: patch.day && !s.knownGroups.includes(patch.day) ? [...s.knownGroups, patch.day] : s.knownGroups,
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
    setState(key, (s) => ({
      rows: s.rows.filter(r => r.day !== day),
      knownGroups: s.knownGroups.filter(g => g !== day),
    }));
  };

  const addGroup = (day: string) => {
    const next = day.trim();
    if (!next) return;
    setState(key, (s) => s.knownGroups.includes(next) ? s : { ...s, knownGroups: [...s.knownGroups, next] });
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
    setState(key, (s) => {
      const known = s.knownGroups.map((g) => (g === from ? next : g)).filter((g, i, arr) => g && arr.indexOf(g) === i);
      return {
        rows: s.rows.map(r => r.day === from ? { ...r, day: next } : r),
        knownGroups: known.includes(next) ? known : [...known, next],
      };
    });
  };

  return { rows: state.rows, knownGroups: state.knownGroups, loading, isDone, toggle, add, update, remove, removeGroup, renameGroup, addGroup };
}
