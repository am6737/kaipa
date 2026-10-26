// TrailContext.tsx — whether the 徒步导航 page is up, and the bridge from the
// recorder singleton (src/lib/trailRecorder.ts) to React. Kept out of
// NavContext: the recorder emits on every GPS fix, and NavContext rebuilding
// that often would re-render every screen.
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { useData } from '../data/DataContext';
import type { TrackDraft } from '../hooks/useTracks';
import type { Track } from '../data/tracks';
import {
  clearTrail,
  getTrailSnapshot,
  restoreTrail,
  subscribeTrail,
  type TrailRouteRef,
  type TrailSession,
  type TrailSnapshot,
} from '../lib/trailRecorder';
import { elevationProfile } from '../lib/trailGeo';
import { getTrailGuide, setTrailGuideLanguage, subscribeTrailGuide, type TrailGuideState } from '../lib/trailGuide';
import { useI18n } from '../i18n';

const PENDING_KEY = 'kaipa.trail.pendingSaves.v1';

export type TrailSaveResult = { status: 'saved'; track: Track } | { status: 'queued' };

interface TrailValue {
  open: boolean;
  /** The route the page was opened for, before a recording exists. */
  plannedRoute: TrailRouteRef | null;
  /**
   * Opens the page. With a recording already running the page shows that one;
   * the caller learns so from the return value and can tell the user.
   */
  openTrail: (route?: TrailRouteRef | null) => 'opened' | 'busy';
  closeTrail: () => void;
  saveTrail: (name: string) => Promise<TrailSaveResult>;
  /** Recordings finished offline, waiting to reach the server. */
  pendingSaves: number;
}

const TrailContext = createContext<TrailValue | null>(null);

export function useTrailSnapshot(): TrailSnapshot {
  return useSyncExternalStore(subscribeTrail, getTrailSnapshot, getTrailSnapshot);
}

export function useTrailGuide(): TrailGuideState {
  return useSyncExternalStore(subscribeTrailGuide, getTrailGuide, getTrailGuide);
}

export function useTrail(): TrailValue {
  const value = useContext(TrailContext);
  if (!value) throw new Error('useTrail requires TrailProvider');
  return value;
}

/** Joins the pause segments into one line, the shape the track library stores. */
export function trailToDraft(session: TrailSession, name: string): TrackDraft {
  const points = session.segments.flat();
  return {
    name,
    coords: points.map(([lng, lat]) => [lng, lat] as [number, number]),
    elevation: elevationProfile(session.segments),
    durationMs: session.activeMs,
    distM: Math.round(session.totals.distM),
    ascM: Math.round(session.totals.ascM),
    pointCount: points.length,
    startedAt: new Date(session.startedAt).toISOString(),
  };
}

async function readPending(): Promise<TrackDraft[]> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_KEY);
    return raw ? JSON.parse(raw) as TrackDraft[] : [];
  } catch {
    return [];
  }
}

export function TrailProvider({ children }: { children: React.ReactNode }) {
  const data = useData();
  const { resolved } = useI18n();
  const [open, setOpen] = useState(false);
  const [plannedRoute, setPlannedRoute] = useState<TrailRouteRef | null>(null);
  const [pendingSaves, setPendingSaves] = useState(0);
  const flushing = useRef(false);
  const createTrack = data.createTrack;

  useEffect(() => setTrailGuideLanguage(resolved), [resolved]);

  const flushPending = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    try {
      const pending = await readPending();
      const left: TrackDraft[] = [];
      for (const draft of pending) {
        if (left.length || !(await createTrack(draft))) left.push(draft);
      }
      if (left.length) await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(left));
      else await AsyncStorage.removeItem(PENDING_KEY);
      setPendingSaves(left.length);
    } finally {
      flushing.current = false;
    }
  }, [createTrack]);

  useEffect(() => {
    void restoreTrail().then(() => {
      // Back from a kill mid-walk, or with a summary never saved: put the
      // walker straight back on it.
      if (getTrailSnapshot().session) setOpen(true);
    });
    void flushPending();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void flushPending();
    });
    return () => subscription.remove();
  }, [flushPending]);

  const openTrail = useCallback((route?: TrailRouteRef | null) => {
    const { session } = getTrailSnapshot();
    setOpen(true);
    if (session) return session.route?.id === route?.id || route === undefined ? 'opened' : 'busy';
    setPlannedRoute(route ?? null);
    return 'opened';
  }, []);

  const closeTrail = useCallback(() => {
    setOpen(false);
    if (!getTrailSnapshot().session) setPlannedRoute(null);
  }, []);

  const saveTrail = useCallback(async (name: string): Promise<TrailSaveResult> => {
    const { session } = getTrailSnapshot();
    if (!session) throw new Error('no recording');
    const draft = trailToDraft(session, name);
    const track = await createTrack(draft);
    if (!track) {
      // Offline at the summit: keep it on the device and send it later.
      const pending = await readPending();
      await AsyncStorage.setItem(PENDING_KEY, JSON.stringify([...pending, draft]));
      setPendingSaves(pending.length + 1);
    }
    await clearTrail();
    setPlannedRoute(null);
    setOpen(false);
    return track ? { status: 'saved', track } : { status: 'queued' };
  }, [createTrack]);

  const value = useMemo(
    () => ({ open, plannedRoute, openTrail, closeTrail, saveTrail, pendingSaves }),
    [open, plannedRoute, openTrail, closeTrail, saveTrail, pendingSaves],
  );
  return <TrailContext.Provider value={value}>{children}</TrailContext.Provider>;
}
