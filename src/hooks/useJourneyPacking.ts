import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Companion, Poi } from '../data/pois';
import {
  buildPackingListViews,
  companionId,
  type JourneyPackingItem,
  type JourneyPackingItemInput,
  type JourneyPackingList,
  type JourneyPackingListKind,
  type JourneyPackingSnapshot,
} from '../data/journeyPacking';
import { supabase } from '../lib/supabase';

const keyFor = (journeyId: string) => `kaipa_journey_packing_v1:${journeyId}`;
const makeId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;

const mapList = (row: any): JourneyPackingList => ({
  id: row.id,
  journeyId: row.journey_id,
  kind: row.kind,
  ownerCompanionId: row.owner_companion_id ?? undefined,
  createdBy: row.created_by,
});

const mapItem = (row: any): JourneyPackingItem => ({
  id: row.id,
  listId: row.list_id,
  sourceType: row.source_type,
  sourceGearItemId: row.source_gear_item_id ?? undefined,
  name: row.name,
  categoryName: row.category_name ?? undefined,
  categoryColor: row.category_color ?? undefined,
  quantity: row.quantity ?? 1,
  weightKg: row.weight_kg == null ? undefined : Number(row.weight_kg),
  note: row.note ?? undefined,
  packed: row.packed ?? false,
  carrierCompanionId: row.carrier_companion_id ?? undefined,
  sortOrder: row.sort_order ?? 0,
});

function resolvedCompanions(journey: Poi): Companion[] {
  const companions = journey.companionList ?? [];
  return companions.length ? companions : [{ id: -1, ini: '我', name: '我', color: '#8E8E93', self: true, host: true }];
}

export function useJourneyPacking({ journey, userId }: { journey: Poi; userId: string }) {
  const companions = useMemo(() => resolvedCompanions(journey), [journey]);
  const currentCompanion = useMemo(() => companions.find((companion) => companion.userId === userId || companion.self) ?? companions[0], [companions, userId]);
  const currentCompanionId = useMemo(() => {
    const index = companions.indexOf(currentCompanion);
    return companionId(currentCompanion, Math.max(0, index));
  }, [companions, currentCompanion]);
  const [snapshot, setSnapshot] = useState<JourneyPackingSnapshot>({ lists: [], items: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [localMode, setLocalMode] = useState(false);
  const [error, setError] = useState<Error | undefined>();

  const readLocal = useCallback(async () => {
    const raw = await AsyncStorage.getItem(keyFor(journey.id));
    if (!raw) return { lists: [], items: [] } as JourneyPackingSnapshot;
    try { return JSON.parse(raw) as JourneyPackingSnapshot; } catch { return { lists: [], items: [] }; }
  }, [journey.id]);

  const writeLocal = useCallback(async (next: JourneyPackingSnapshot) => {
    setSnapshot(next);
    await AsyncStorage.setItem(keyFor(journey.id), JSON.stringify(next));
  }, [journey.id]);

  const fetchPacking = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    const listRes = await supabase.from('journey_packing_lists').select('*').eq('journey_id', journey.id).order('created_at');
    if (listRes.error) {
      setLocalMode(true);
      setSnapshot(await readLocal());
      setLoading(false);
      return;
    }
    setLocalMode(false);
    const lists = (listRes.data ?? []).map(mapList);
    const itemRes = lists.length
      ? await supabase.from('journey_packing_items').select('*').in('list_id', lists.map((list) => list.id)).order('sort_order')
      : { data: [], error: null };
    if (itemRes.error) {
      setError(new Error(itemRes.error.message));
      setLoading(false);
      return;
    }
    setSnapshot({ lists, items: (itemRes.data ?? []).map(mapItem) });
    setLoading(false);
  }, [journey.id, readLocal]);

  useEffect(() => { void fetchPacking(); }, [fetchPacking]);

  useEffect(() => {
    if (localMode) return;
    const channel = supabase
      .channel(`journey-packing:${journey.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'journey_packing_lists', filter: `journey_id=eq.${journey.id}` }, () => { void fetchPacking(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'journey_packing_items' }, () => { void fetchPacking(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [fetchPacking, journey.id, localMode]);

  const views = useMemo(() => buildPackingListViews(journey.id, snapshot.lists, snapshot.items, companions), [companions, journey.id, snapshot.items, snapshot.lists]);

  const ensureList = useCallback(async (kind: JourneyPackingListKind, ownerCompanionId?: number): Promise<JourneyPackingList> => {
    const existing = snapshot.lists.find((list) => list.kind === kind && (kind === 'shared' || list.ownerCompanionId === ownerCompanionId));
    if (existing) return existing;
    if (localMode) {
      const list: JourneyPackingList = { id: makeId('jpl'), journeyId: journey.id, kind, ownerCompanionId: kind === 'personal' ? ownerCompanionId : undefined, createdBy: userId };
      await writeLocal({ ...snapshot, lists: [...snapshot.lists, list] });
      return list;
    }
    if (kind === 'personal' && (ownerCompanionId == null || ownerCompanionId <= 0)) throw new Error('A synced participant is required');
    const result = await supabase.from('journey_packing_lists').insert({
      journey_id: journey.id,
      kind,
      owner_companion_id: kind === 'personal' ? ownerCompanionId : null,
      created_by: userId,
    }).select('*').single();
    if (result.error) {
      let retryQuery = supabase.from('journey_packing_lists').select('*').eq('journey_id', journey.id).eq('kind', kind);
      if (kind === 'personal') retryQuery = retryQuery.eq('owner_companion_id', ownerCompanionId as number);
      const retry = await retryQuery.maybeSingle();
      if (retry.data) return mapList(retry.data);
      throw result.error;
    }
    return mapList(result.data);
  }, [journey.id, localMode, snapshot, userId, writeLocal]);

  const addItems = useCallback(async (kind: JourneyPackingListKind, ownerCompanionId: number | undefined, inputs: JourneyPackingItemInput[]) => {
    if (!inputs.length) return;
    setSaving(true);
    try {
      const list = await ensureList(kind, ownerCompanionId);
      if (localMode) {
        const newItems = inputs.map((input, index): JourneyPackingItem => ({
          id: makeId('jpi'), listId: list.id, sourceType: input.sourceType,
          sourceGearItemId: input.sourceGearItemId, name: input.name,
          categoryName: input.categoryName, categoryColor: input.categoryColor,
          quantity: input.quantity ?? 1, weightKg: input.weightKg, note: input.note,
          packed: false, sortOrder: snapshot.items.filter((item) => item.listId === list.id).length + index,
        }));
        const baseLists = snapshot.lists.some((row) => row.id === list.id) ? snapshot.lists : [...snapshot.lists, list];
        await writeLocal({ lists: baseLists, items: [...snapshot.items, ...newItems] });
        return;
      }
      const offset = snapshot.items.filter((item) => item.listId === list.id).length;
      const result = await supabase.from('journey_packing_items').insert(inputs.map((input, index) => ({
        list_id: list.id,
        source_type: input.sourceType,
        source_gear_item_id: input.sourceGearItemId ?? null,
        name: input.name,
        category_name: input.categoryName ?? null,
        category_color: input.categoryColor ?? null,
        quantity: input.quantity ?? 1,
        weight_kg: input.weightKg ?? null,
        note: input.note ?? null,
        sort_order: offset + index,
      })));
      if (result.error) throw result.error;
      await fetchPacking();
    } finally { setSaving(false); }
  }, [ensureList, fetchPacking, localMode, snapshot, writeLocal]);

  const updateItem = useCallback(async (itemId: string, patch: Partial<Pick<JourneyPackingItem, 'name' | 'quantity' | 'weightKg' | 'note' | 'packed' | 'carrierCompanionId'>>) => {
    if (localMode) {
      await writeLocal({ ...snapshot, items: snapshot.items.map((item) => item.id === itemId ? { ...item, ...patch } : item) });
      return;
    }
    const row: Record<string, unknown> = {};
    if (patch.name != null) row.name = patch.name;
    if (patch.quantity != null) row.quantity = patch.quantity;
    if (patch.weightKg !== undefined) row.weight_kg = patch.weightKg ?? null;
    if (patch.note !== undefined) row.note = patch.note ?? null;
    if (patch.packed != null) row.packed = patch.packed;
    if (Object.prototype.hasOwnProperty.call(patch, 'carrierCompanionId')) row.carrier_companion_id = patch.carrierCompanionId ?? null;
    const result = await supabase.from('journey_packing_items').update(row).eq('id', itemId);
    if (result.error) throw result.error;
    setSnapshot((current) => ({ ...current, items: current.items.map((item) => item.id === itemId ? { ...item, ...patch } : item) }));
  }, [localMode, snapshot, writeLocal]);

  const remindCompanion = useCallback(async (targetCompanionId: number, remainingCount: number) => {
    if (localMode || targetCompanionId <= 0) return false;
    const result = await supabase.rpc('send_journey_packing_reminder', {
      target_companion_id: targetCompanionId,
      remaining_count: remainingCount,
    });
    return !result.error;
  }, [localMode]);

  const deleteItem = useCallback(async (itemId: string) => {
    if (localMode) {
      await writeLocal({ ...snapshot, items: snapshot.items.filter((item) => item.id !== itemId) });
      return;
    }
    const result = await supabase.from('journey_packing_items').delete().eq('id', itemId);
    if (result.error) throw result.error;
    setSnapshot((current) => ({ ...current, items: current.items.filter((item) => item.id !== itemId) }));
  }, [localMode, snapshot, writeLocal]);

  return {
    companions,
    currentCompanion,
    currentCompanionId,
    views,
    lists: snapshot.lists,
    items: snapshot.items,
    loading,
    saving,
    localMode,
    error,
    addItems,
    updateItem,
    deleteItem,
    remindCompanion,
    refetch: fetchPacking,
  };
}

export type JourneyPackingController = ReturnType<typeof useJourneyPacking>;
