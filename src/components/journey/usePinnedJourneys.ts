import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';

const STORAGE_KEY = '@kaipa/journeys/pinned-v1';

export function usePinnedJourneys() {
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() => new Set());
  const changedRef = useRef(false);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (!active || changedRef.current || !raw) return;
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setPinnedIds(new Set(parsed.filter((id): id is string => typeof id === 'string')));
      } catch {}
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  const setPinned = useCallback((ids: string[], pinned: boolean) => {
    changedRef.current = true;
    setPinnedIds((current) => {
      const next = new Set(current);
      ids.forEach((id) => pinned ? next.add(id) : next.delete(id));
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([...next])).catch(() => {});
      return next;
    });
  }, []);

  return { pinnedIds, setPinned };
}
