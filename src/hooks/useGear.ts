import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { toGearCat, toGearItem, toGearSet } from '../lib/mappers';
import type { GearCat, GearItem, GearSet } from '../data/gear';

export function useGear(userId: string | undefined) {
  const [cats, setCats] = useState<GearCat[]>([]);
  const [items, setItems] = useState<GearItem[]>([]);
  const [sets, setSets] = useState<GearSet[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!userId) return;

    const [catRes, itemRes, setRes] = await Promise.all([
      supabase.from('gear_categories').select('*').order('builtin', { ascending: false }).order('created_at'),
      supabase.from('gear_items').select('*').eq('user_id', userId).order('created_at'),
      supabase.from('gear_sets').select('*, gear_set_items(item_id)').eq('user_id', userId).order('created_at'),
    ]);

    const dbCats = (catRes.data ?? []).map(toGearCat);
    const dbItems = (itemRes.data ?? []).map(toGearItem);
    const itemMap = new Map(dbItems.map(i => [i.id!, i.name]));

    const dbSets = (setRes.data ?? []).map((s: any) => {
      const itemNames = (s.gear_set_items ?? [])
        .map((link: any) => itemMap.get(link.item_id))
        .filter(Boolean) as string[];
      return toGearSet(s, itemNames);
    });

    setCats(dbCats);
    setItems(dbItems);
    setSets(dbSets);
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Category CRUD ─────────────────────────────────────────────────────────
  const addCat = async (cat: Omit<GearCat, 'id' | 'builtin'>) => {
    if (!userId) return;
    const { data } = await supabase.from('gear_categories')
      .insert({ user_id: userId, name: cat.name, color: cat.color })
      .select().single();
    if (data) setCats(prev => [...prev, toGearCat(data)]);
  };

  const updateCat = async (id: string, patch: Partial<GearCat>) => {
    const row: any = {};
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.color !== undefined) row.color = patch.color;
    if (Object.keys(row).length) {
      await supabase.from('gear_categories').update(row).eq('id', id);
      setCats(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));
    }
  };

  const deleteCat = async (id: string) => {
    await supabase.from('gear_categories').delete().eq('id', id);
    setCats(prev => prev.filter(c => c.id !== id));
  };

  // ── Item CRUD ─────────────────────────────────────────────────────────────
  const addItem = async (item: Omit<GearItem, 'id'>) => {
    if (!userId) return;
    const { data } = await supabase.from('gear_items')
      .insert({
        user_id: userId,
        name: item.name,
        cat_id: item.cat,
        weight: item.w,
        price: item.p,
        qty: item.qty ?? 1,
        attrs: item.attrs ?? null,
        note: item.note ?? null,
      })
      .select().single();
    if (data) setItems(prev => [...prev, toGearItem(data)]);
  };

  const updateItem = async (id: number, patch: Partial<GearItem>) => {
    const row: any = {};
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.cat !== undefined) row.cat_id = patch.cat;
    if (patch.w !== undefined) row.weight = patch.w;
    if (patch.p !== undefined) row.price = patch.p;
    if (patch.qty !== undefined) row.qty = patch.qty;
    if (patch.attrs !== undefined) row.attrs = patch.attrs;
    if (patch.note !== undefined) row.note = patch.note;
    if (Object.keys(row).length) {
      await supabase.from('gear_items').update(row).eq('id', id);
      setItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i));
    }
  };

  const deleteItem = async (id: number) => {
    await supabase.from('gear_items').delete().eq('id', id);
    setItems(prev => prev.filter(i => i.id !== id));
  };

  // ── Set CRUD ──────────────────────────────────────────────────────────────
  const addSet = async (name: string, itemIds: number[]) => {
    if (!userId) return;
    const { data } = await supabase.from('gear_sets')
      .insert({ user_id: userId, name })
      .select().single();
    if (!data) return;
    if (itemIds.length) {
      await supabase.from('gear_set_items')
        .insert(itemIds.map(item_id => ({ set_id: data.id, item_id })));
    }
    const itemMap = new Map(items.map(i => [i.id!, i.name]));
    const itemNames = itemIds.map(id => itemMap.get(id)).filter(Boolean) as string[];
    setSets(prev => [...prev, toGearSet(data, itemNames)]);
  };

  const updateSet = async (id: string, name: string, itemIds: number[]) => {
    await supabase.from('gear_sets').update({ name }).eq('id', id);
    await supabase.from('gear_set_items').delete().eq('set_id', id);
    if (itemIds.length) {
      await supabase.from('gear_set_items')
        .insert(itemIds.map(item_id => ({ set_id: id, item_id })));
    }
    const itemMap = new Map(items.map(i => [i.id!, i.name]));
    const itemNames = itemIds.map(iid => itemMap.get(iid)).filter(Boolean) as string[];
    setSets(prev => prev.map(s => s.id === id ? { ...s, name, items: itemNames } : s));
  };

  const deleteSet = async (id: string) => {
    await supabase.from('gear_sets').delete().eq('id', id);
    setSets(prev => prev.filter(s => s.id !== id));
  };

  return {
    cats, items, sets, loading,
    addCat, updateCat, deleteCat,
    addItem, updateItem, deleteItem,
    addSet, updateSet, deleteSet,
    refetch: fetchAll,
  };
}
