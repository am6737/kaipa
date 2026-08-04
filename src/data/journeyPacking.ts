import type { Companion } from './pois';

export type JourneyPackingListKind = 'personal' | 'shared';
export type JourneyPackingSourceType = 'gear' | 'gearSet' | 'recommendedTemplate' | 'custom';

export interface JourneyPackingList {
  id: string;
  journeyId: string;
  kind: JourneyPackingListKind;
  ownerCompanionId?: number;
  createdBy: string;
}

export interface JourneyPackingItem {
  id: string;
  listId: string;
  sourceType: JourneyPackingSourceType;
  sourceGearItemId?: number;
  name: string;
  categoryName?: string;
  categoryColor?: string;
  quantity: number;
  weightKg?: number;
  note?: string;
  packed: boolean;
  carrierCompanionId?: number;
  sortOrder: number;
}

export interface JourneyPackingSnapshot {
  lists: JourneyPackingList[];
  items: JourneyPackingItem[];
}

export interface JourneyPackingItemInput {
  sourceType: JourneyPackingSourceType;
  sourceGearItemId?: number;
  name: string;
  categoryName?: string;
  categoryColor?: string;
  quantity?: number;
  weightKg?: number;
  note?: string;
}

export interface JourneyPackingListView {
  key: string;
  kind: JourneyPackingListKind;
  ownerCompanionId?: number;
  companion?: Companion;
  list?: JourneyPackingList;
  items: JourneyPackingItem[];
  packedCount: number;
  pendingCount: number;
  progress: number;
}

export function companionId(companion: Companion, index: number): number {
  return companion.id ?? -(index + 1);
}

export function buildPackingListViews(
  journeyId: string,
  lists: JourneyPackingList[],
  items: JourneyPackingItem[],
  companions: Companion[],
): JourneyPackingListView[] {
  const sharedList = lists.find((list) => list.kind === 'shared');
  const sharedItems = sharedList ? items.filter((item) => item.listId === sharedList.id) : [];
  const views: JourneyPackingListView[] = companions.map((companion, index) => {
    const ownerCompanionId = companionId(companion, index);
    const list = lists.find((candidate) => candidate.kind === 'personal' && candidate.ownerCompanionId === ownerCompanionId);
    const listItems = list ? items.filter((item) => item.listId === list.id) : [];
    const packedCount = listItems.filter((item) => item.packed).length;
    return {
      key: `personal:${ownerCompanionId}`,
      kind: 'personal',
      ownerCompanionId,
      companion,
      list,
      items: listItems,
      packedCount,
      pendingCount: listItems.length - packedCount,
      progress: listItems.length ? Math.round((packedCount / listItems.length) * 100) : 0,
    };
  });
  const sharedPacked = sharedItems.filter((item) => item.packed).length;
  views.splice(Math.min(1, views.length), 0, {
    key: `shared:${journeyId}`,
    kind: 'shared',
    list: sharedList,
    items: sharedItems,
    packedCount: sharedPacked,
    pendingCount: sharedItems.length - sharedPacked,
    progress: sharedItems.length ? Math.round((sharedPacked / sharedItems.length) * 100) : 0,
  });
  return views;
}
