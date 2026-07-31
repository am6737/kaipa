// inspoStore.ts — session-local inspiration media attached to a journey.
// Users can collect reference photos and videos here; data lives for the app session only.
// the section fills with the trip's real moments instead. Holds the picked
// assets' local URIs (from expo-image-picker), not placeholders. Module-level
// store + subscribe/bump, keyed by journey id, so the inline card and the full-
// bleed overlay stay in sync and the picks survive closing / reopening the card
// (resets on reload). Uses a small module-local store + subscription pattern.
import { useEffect, useState } from 'react';

export interface InspoMedia {
  id: string;
  uri: string;
  kind: 'image' | 'video' | 'livePhoto';
  thumbnail?: string;
  duration?: number;
  pairedVideoUri?: string;
  caption?: string;
}

const store: { data: Record<string, InspoMedia[]>; subs: Set<() => void> } = { data: {}, subs: new Set() };
let seq = 0;

export interface InspoStore {
  media: InspoMedia[];
  add: (m: Omit<InspoMedia, 'id'>) => void;
  remove: (id: string) => void;
}

export function useInspo(jid?: string): InspoStore {
  const [, bump] = useState(0);
  useEffect(() => {
    const fn = () => bump((x) => x + 1);
    store.subs.add(fn);
    return () => {
      store.subs.delete(fn);
    };
  }, []);

  const key = jid || 'default';
  const emit = () => store.subs.forEach((f) => f());

  return {
    media: store.data[key] || [],
    add: (m) => {
      const arr = (store.data[key] = store.data[key] || []);
      arr.push({ id: 'm' + ++seq, ...m });
      emit();
    },
    remove: (id) => {
      const arr = store.data[key];
      if (!arr) return;
      store.data[key] = arr.filter((x) => x.id !== id);
      emit();
    },
  };
}
