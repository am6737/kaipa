import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';
import { journeyDayOrdinal } from '../../lib/journeyDays';

const cachedGroups = new Map<string, string>();

function availableGroup(saved: string | undefined, groups: string[]): string | undefined {
  if (saved == null || saved === '') return saved;
  const ordinal = journeyDayOrdinal(saved);
  return groups.find((group) => group === saved)
    ?? groups.find((group) => ordinal != null && journeyDayOrdinal(group) === ordinal);
}

/** The last add destination takes priority over the currently viewed day. */
export function useLastAddedGroup(storageKey: string, initialDay: string | undefined, defaultDay: string, groups: string[], editing: boolean) {
  const [day, setDay] = useState(() => editing
    ? initialDay ?? defaultDay
    : availableGroup(cachedGroups.get(storageKey), groups) ?? initialDay ?? defaultDay);
  const changed = useRef(false);
  const groupsRef = useRef(groups);
  groupsRef.current = groups;

  useEffect(() => {
    if (editing) return;
    let active = true;
    AsyncStorage.getItem(storageKey).then((saved) => {
      if (!active || changed.current || saved == null) return;
      cachedGroups.set(storageKey, saved);
      const restored = availableGroup(saved, groupsRef.current);
      if (restored != null) setDay(restored);
    }).catch(() => {});
    return () => { active = false; };
  }, [storageKey, initialDay, editing]);

  const remember = (value: string) => {
    changed.current = true;
    if (editing) return;
    cachedGroups.set(storageKey, value);
    void AsyncStorage.setItem(storageKey, value).catch(() => {});
  };

  const selectDay = (value: string) => {
    setDay(value);
    remember(value);
  };

  return { day, selectDay, remember };
}
