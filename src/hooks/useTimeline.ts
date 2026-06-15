import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { toTLRow } from '../lib/mappers';
import type { TLRow } from '../data/timeline';

export function useTimeline(journeyId: string | undefined, userId: string | undefined) {
  const [rows, setRows] = useState<TLRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRows = useCallback(async () => {
    if (!journeyId || !userId) return;
    const { data } = await supabase
      .from('timeline_rows')
      .select('*')
      .eq('journey_id', journeyId)
      .order('sort_order');
    if (data) setRows(data.map(toTLRow));
    setLoading(false);
  }, [journeyId, userId]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const isDone = (id: string) => rows.find(r => r.id === id)?.checked ?? false;

  const toggle = async (id: string) => {
    const current = isDone(id);
    await supabase.from('timeline_rows').update({ checked: !current }).eq('id', id);
    setRows(prev => prev.map(r => r.id === id ? { ...r, checked: !current } : r));
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
      is_synth: false,
      is_custom: true,
      checked: false,
      sort_order: rows.length,
    };
    await supabase.from('timeline_rows').insert(row);
    setRows(prev => [...prev, toTLRow(row)]);
  };

  const remove = async (id: string) => {
    await supabase.from('timeline_rows').delete().eq('id', id);
    setRows(prev => prev.filter(r => r.id !== id));
  };

  return { rows, loading, isDone, toggle, add, remove };
}
