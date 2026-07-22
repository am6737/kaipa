import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';

export type GearListSortMode = 'created' | 'weight' | 'value' | 'name';

const SORT_MODES: GearListSortMode[] = ['created', 'weight', 'value', 'name'];

function isSortMode(value: string): value is GearListSortMode {
  return SORT_MODES.includes(value as GearListSortMode);
}

export function usePersistedSort(storageKey: string) {
  const [sort, setSortState] = useState<GearListSortMode>('created');
  const changedRef = useRef(false);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(storageKey).then((saved) => {
      if (active && !changedRef.current && saved && isSortMode(saved)) setSortState(saved);
    }).catch(() => {});
    return () => { active = false; };
  }, [storageKey]);

  const setSort = useCallback((next: GearListSortMode) => {
    changedRef.current = true;
    setSortState(next);
    AsyncStorage.setItem(storageKey, next).catch(() => {});
  }, [storageKey]);

  return [sort, setSort] as const;
}
