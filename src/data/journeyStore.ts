// journeyStore.ts — per-journey 行程 state: manual checkmarks (id → done) + any
// user-added custom rows. A module-level store with a subscribe/bump hook so the
// inline 行程 digest and the full-screen timeline stay in sync — checking a row in
// one updates the other live. Session-local (resets on reload), mirroring the
// prototype's `window.kpJStore` / `useJStore`.
import { useEffect, useState } from 'react';
import { TLRow } from './timeline';

interface Entry {
  checks: Record<string, boolean>;
  items: TLRow[];
  init: boolean;
}

const store: { data: Record<string, Entry>; subs: Set<() => void> } = { data: {}, subs: new Set() };
let seq = 0;

export interface JStore {
  ensureInit: (defaults: Record<string, boolean>) => void;
  isDone: (id: string) => boolean;
  toggle: (id: string) => void;
  items: () => TLRow[];
  add: (it: Omit<TLRow, 'id'>) => void;
  remove: (id: string) => void;
}

export function useJStore(jid?: string): JStore {
  const [, bump] = useState(0);
  useEffect(() => {
    const fn = () => bump((x) => x + 1);
    store.subs.add(fn);
    return () => {
      store.subs.delete(fn);
    };
  }, []);

  const key = jid || 'default';
  const ent = (): Entry => (store.data[key] = store.data[key] || { checks: {}, items: [], init: false });
  const emit = () => store.subs.forEach((f) => f());

  return {
    ensureInit(defaults) {
      const e = ent();
      if (e.init) return;
      Object.keys(defaults).forEach((id) => {
        if (!(id in e.checks)) e.checks[id] = !!defaults[id];
      });
      e.init = true;
    },
    isDone: (id) => !!ent().checks[id],
    toggle: (id) => {
      const e = ent();
      e.checks[id] = !e.checks[id];
      emit();
    },
    items: () => ent().items,
    add: (it) => {
      const e = ent();
      e.items.push({ id: 'c' + ++seq + '-' + Date.now(), ...it } as TLRow);
      emit();
    },
    remove: (id) => {
      const e = ent();
      e.items = e.items.filter((x) => x.id !== id);
      delete e.checks[id];
      emit();
    },
  };
}
