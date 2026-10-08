import { useCallback, useEffect, useState } from 'react';
import { resourceUsageChanged } from '../lib/resourceClient';
import { supabase } from '../lib/supabase';
import { toGearCat, toGearItem, toGearSet } from '../lib/mappers';
import { ensureCloudGearMedia, removeMedia } from '../lib/storage';
import type { GearCat, GearItem, GearSet, GearSetOverride } from '../data/gear';

export function useGear(userId: string | undefined) {
  const [cats, setCats] = useState<GearCat[]>([]);
  const [items, setItems] = useState<GearItem[]>([]);
  const [sets, setSets] = useState<GearSet[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!userId) return;

    const [catRes, itemRes] = await Promise.all([
      supabase.from('gear_categories').select('*').eq('user_id', userId).order('created_at'),
      supabase.from('gear_items').select('*').eq('user_id', userId).order('created_at'),
    ]);

    let setRes = await supabase
      .from('gear_sets')
      .select('*, gear_set_items(item_id, qty, status)')
      .eq('user_id', userId)
      .order('created_at');

    // Some existing Supabase projects may not have run gear-packing-migration.sql yet.
    // In that case selecting the new per-set override columns (qty/status) fails,
    // which used to make all packing sets appear empty/missing. Fall back to the
    // original relation shape so existing set membership still renders.
    if (setRes.error) {
      console.warn('[Gear] Failed to load set overrides; retrying without qty/status', setRes.error.message);
      setRes = await supabase
        .from('gear_sets')
        .select('*, gear_set_items(item_id)')
        .eq('user_id', userId)
        .order('created_at');
    }

    const dbCats = (catRes.data ?? []).map(toGearCat);
    const dbItems = (itemRes.data ?? []).map(toGearItem);
    const itemMap = new Map(dbItems.map(i => [i.id!, i.name]));

    const dbSets = (setRes.data ?? []).map((s: any) => {
      const links = s.gear_set_items ?? [];
      const itemNames = links.map((link: any) => itemMap.get(link.item_id)).filter(Boolean) as string[];
      const overrides: Record<string, GearSetOverride> = {};
      links.forEach((link: any) => {
        const key = String(link.item_id);
        if (link.qty != null || link.status != null) overrides[key] = { ...(link.qty != null ? { qty: link.qty } : {}), ...(link.status != null ? { status: link.status } : {}) };
      });
      return toGearSet(s, itemNames, overrides);
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
    const { data, error } = await supabase.from('gear_categories')
      .insert({ user_id: userId, name: cat.name, color: cat.color })
      .select().single();
    if (error) throw error;
    if (data) setCats(prev => [...prev, toGearCat(data)]);
  };

  const updateCat = async (id: string, patch: Partial<GearCat>) => {
    const row: any = {};
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.color !== undefined) row.color = patch.color;
    if (Object.keys(row).length) {
      const {error} = await supabase.from('gear_categories').update(row).eq('id', id);
      if (error) throw error;
      setCats(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));
    }
  };

  const deleteCat = async (id: string) => {
    const {error} = await supabase.from('gear_categories').delete().eq('id', id);
    if (error) throw error;
    setCats(prev => prev.filter(c => c.id !== id));
    setItems(prev => prev.map(item => item.cat === id ? { ...item, cat: 'uncat' } : item));
  };

  // ── Item CRUD ─────────────────────────────────────────────────────────────
  const addItem = async (item: Omit<GearItem, 'id'>) => {
    if (!userId) return;
    const photos = await ensureCloudGearMedia(item.photos, userId, `gear-new-${Date.now()}`);
    const { data, error } = await supabase.from('gear_items')
      .insert({
        user_id: userId,
        name: item.name,
        cat_id: item.cat === 'uncat' ? null : item.cat,
        weight: item.w,
        price: item.p,
        qty: item.qty ?? 1,
        photo_uris: photos ?? null,
        attrs: item.attrs ?? null,
        note: item.note ?? null,
        status: item.status ?? 'packed',
      })
      .select().single();
    if (error) {
      // Only a confirmed SQL rejection proves that no row was committed. A
      // lost response is reconciled by reference-aware orphan maintenance.
      if (/^[0-9A-Z]{5}$/.test(error.code)) await removeMedia((photos || []).filter(uri => !item.photos?.includes(uri))).catch(()=>{});
      throw error;
    }
    if (data) {
      const saved = toGearItem(data);
      setItems(prev => [...prev, saved]);
      resourceUsageChanged();
      return saved;
    }
  };

  const updateItem = async (id: number, patch: Partial<GearItem>) => {
    if (!userId) return;
    const previous = items.find((item) => item.id === id);
    const cloudPhotos = patch.photos !== undefined
      ? await ensureCloudGearMedia(patch.photos, userId, `gear-${id}`, previous?.photos)
      : undefined;
    const resolvedPatch = cloudPhotos !== undefined ? { ...patch, photos: cloudPhotos } : patch;
    const row: any = {};
    if (resolvedPatch.name !== undefined) row.name = resolvedPatch.name;
    if (resolvedPatch.cat !== undefined) row.cat_id = resolvedPatch.cat === 'uncat' ? null : resolvedPatch.cat;
    if (resolvedPatch.w !== undefined) row.weight = resolvedPatch.w;
    if (resolvedPatch.p !== undefined) row.price = resolvedPatch.p;
    if (resolvedPatch.qty !== undefined) row.qty = resolvedPatch.qty;
    if (resolvedPatch.photos !== undefined) row.photo_uris = resolvedPatch.photos;
    if (resolvedPatch.attrs !== undefined) row.attrs = resolvedPatch.attrs;
    if (resolvedPatch.note !== undefined) row.note = resolvedPatch.note;
    if (resolvedPatch.status !== undefined) row.status = resolvedPatch.status;
    if (Object.keys(row).length) {
      const { error } = await supabase.from('gear_items').update(row).eq('id', id).select('id').single();
      if (error) { if (/^[0-9A-Z]{5}$/.test(error.code)) await removeMedia((cloudPhotos || []).filter(uri => !previous?.photos?.includes(uri))).catch(()=>{}); throw error; }
      const saved = previous ? { ...previous, ...resolvedPatch } : undefined;
      setItems(prev => prev.map(i => i.id === id ? { ...i, ...resolvedPatch } : i));
      // Let reference-aware maintenance collect detached pictures. A photo
      // may still be used by another item, journey or historical snapshot.
      resourceUsageChanged();
      return saved;
    }
  };

  const deleteItem = async (id: number) => {
    const {error} = await supabase.from('gear_items').delete().eq('id', id);
    if (error) throw error;
    setItems(prev => prev.filter(i => i.id !== id));
    resourceUsageChanged();
  };

  // ── Set CRUD ──────────────────────────────────────────────────────────────
  const addSet = async (name: string, itemIds: number[], overrides: Record<string, GearSetOverride> = {}, description?: string) => {
    if (!userId) return;
    const {data,error} = await supabase.rpc('save_resource_gear_set',{p_id:null,p_name:name,p_description:description ?? null,p_items:itemIds.map(id=>({id,qty:overrides[String(id)]?.qty ?? null,status:overrides[String(id)]?.status ?? null}))});
    if (error) throw error;
    if (!data) throw new Error('装备套装保存失败');
    resourceUsageChanged();
    const itemMap = new Map(items.map(i => [i.id!, i.name]));
    const itemNames = itemIds.map(id => itemMap.get(id)).filter(Boolean) as string[];
    setSets(prev => [...prev, toGearSet(data, itemNames, overrides)]);
  };

  const updateSet = async (id: string, name: string, itemIds: number[], overrides: Record<string, GearSetOverride> = {}, description?: string) => {
    const {error} = await supabase.rpc('save_resource_gear_set',{p_id:id,p_name:name,p_description:description ?? null,p_items:itemIds.map(itemId=>({id:itemId,qty:overrides[String(itemId)]?.qty ?? null,status:overrides[String(itemId)]?.status ?? null}))});
    if (error) throw error;
    resourceUsageChanged();
    const itemMap = new Map(items.map(i => [i.id!, i.name]));
    const itemNames = itemIds.map(iid => itemMap.get(iid)).filter(Boolean) as string[];
    setSets(prev => prev.map(s => s.id === id ? { ...s, name, description, items: itemNames, overrides } : s));
  };

  const deleteSet = async (id: string) => {
    const {error} = await supabase.from('gear_sets').delete().eq('id', id);
    if (error) throw error;
    resourceUsageChanged();
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
