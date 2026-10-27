// TrailContext.tsx — whether the 徒步导航 page is up, and the bridge from the
// recorder singleton (src/lib/trailRecorder.ts) to React. Kept out of
// NavContext: the recorder emits on every GPS fix, and NavContext rebuilding
// that often would re-render every screen.
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AppState, Linking } from 'react-native';
import { useData } from '../data/DataContext';
import type { TrackDraft } from '../hooks/useTracks';
import type { Track, TrackWaypoint } from '../data/tracks';
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
import { distanceMeters } from '../lib/routeSegments';
import { uploadTrackPhoto } from '../lib/storage';
import { isLocalTrailPhoto, sweepTrailPhotos } from '../lib/trailMarkPhotos';
import { getTrailGuide, setTrailGuideLanguage, subscribeTrailGuide, type TrailGuideState } from '../lib/trailGuide';
import { useI18n } from '../i18n';

const PENDING_KEY = 'kaipa.trail.pendingSaves.v1';

/** `<bundle id>://trail`, opened by a tap on the iOS Live Activity (targets/trail-activity) or the Android recording notification. */
function isTrailLink(url: string | null): boolean {
  return !!url && /^[a-z0-9.+-]+:\/\/trail(?:[/?#]|$)/i.test(url);
}

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

/**
 * Each mark's distance along the joined line, in metres, in mark order. The
 * saved track places waypoints by distance along that line, pause gaps
 * included, so the detail page and the track agree.
 */
export function trailMarkDistances(session: TrailSession): number[] {
  const marks = session.marks ?? [];
  if (!marks.length) return [];
  const points = session.segments.flat();
  const order = marks.map((mark, index) => ({ at: Math.min(mark.pointIndex, Math.max(0, points.length - 1)), index })).sort((a, b) => a.at - b.at);
  const result = new Array<number>(marks.length).fill(0);
  let meters = 0;
  let cursor = 0;
  for (const { at, index } of order) {
    for (; cursor < at; cursor += 1) meters += distanceMeters([points[cursor][0], points[cursor][1]], [points[cursor + 1][0], points[cursor + 1][1]]);
    result[index] = meters;
  }
  return result;
}

/** Joins the pause segments into one line, the shape the track library stores. */
export function trailToDraft(session: TrailSession, name: string, markName: (n: number) => string): TrackDraft {
  const points = session.segments.flat();
  const coords = points.map(([lng, lat]) => [lng, lat] as [number, number]);
  // Marks become the track's waypoints, placed by distance along the joined
  // line, which is how the library positions them when it draws the track.
  // They keep the order they were marked in, so 标注点 N matches the map.
  const along = trailMarkDistances(session);
  const waypoints: TrackWaypoint[] = (session.marks ?? []).map((mark, index) => ({
    name: mark.name ?? markName(index + 1),
    km: Math.round(along[index]) / 1000,
    lng: mark.lng,
    lat: mark.lat,
    ...(mark.alt != null ? { ele: Math.round(mark.alt) } : {}),
    at: new Date(mark.at).toISOString(),
    ...(mark.photo ? { photo: mark.photo } : {}),
  }));
  return {
    name,
    coords,
    elevation: elevationProfile(session.segments),
    durationMs: session.activeMs,
    distM: Math.round(session.totals.distM),
    ascM: Math.round(session.totals.ascM),
    pointCount: points.length,
    startedAt: new Date(session.startedAt).toISOString(),
    ...(waypoints.length ? { waypoints } : {}),
  };
}

/**
 * Sends the draft's photos up and points its waypoints at them. Null while
 * any is still only on the phone: the track waits for all of them rather than
 * reaching the server with a photo nobody else can open.
 */
async function withUploadedPhotos(draft: TrackDraft, userId: string): Promise<TrackDraft | null> {
  if (!draft.waypoints?.some((waypoint) => isLocalTrailPhoto(waypoint.photo))) return draft;
  const waypoints: TrackWaypoint[] = [];
  for (const waypoint of draft.waypoints) {
    if (!isLocalTrailPhoto(waypoint.photo)) {
      waypoints.push(waypoint);
      continue;
    }
    try {
      waypoints.push({ ...waypoint, photo: await uploadTrackPhoto(waypoint.photo, userId) });
    } catch (cause) {
      console.warn('[trail] photo upload failed:', cause);
      return null;
    }
  }
  return { ...draft, waypoints };
}

async function createWithPhotos(draft: TrackDraft, userId: string, createTrack: (draft: TrackDraft) => Promise<Track | null>): Promise<Track | null> {
  const uploaded = await withUploadedPhotos(draft, userId);
  return uploaded ? createTrack(uploaded) : null;
}

/** Photos still referred to by the recording or a queued save. */
function photosInUse(pending: TrackDraft[]): (string | undefined)[] {
  return [
    ...(getTrailSnapshot().session?.marks ?? []).map((mark) => mark.photo),
    ...pending.flatMap((draft) => (draft.waypoints ?? []).map((waypoint) => waypoint.photo)),
  ];
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
  const { resolved, t } = useI18n();
  const [open, setOpen] = useState(false);
  const [plannedRoute, setPlannedRoute] = useState<TrailRouteRef | null>(null);
  const [pendingSaves, setPendingSaves] = useState(0);
  const flushing = useRef(false);
  const createTrack = data.createTrack;
  const userId = data.userId;

  useEffect(() => setTrailGuideLanguage(resolved), [resolved]);

  const flushPending = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    try {
      const pending = await readPending();
      const left: TrackDraft[] = [];
      for (const draft of pending) {
        if (left.length || !(await createWithPhotos(draft, userId, createTrack))) left.push(draft);
      }
      if (left.length) await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(left));
      else await AsyncStorage.removeItem(PENDING_KEY);
      setPendingSaves(left.length);
      // Wait for the recording to be read back before deciding what is unused.
      await restoreTrail();
      sweepTrailPhotos(photosInUse(left));
    } finally {
      flushing.current = false;
    }
  }, [createTrack, userId]);

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

  // A cold launch from the link already reopens the page above (restoreTrail); this covers a warm one.
  useEffect(() => {
    const subscription = Linking.addEventListener('url', ({ url }) => {
      if (isTrailLink(url) && getTrailSnapshot().session) setOpen(true);
    });
    return () => subscription.remove();
  }, []);

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
    const draft = trailToDraft(session, name, (n) => t('trail.mark.defaultName', { n }));
    const track = await createWithPhotos(draft, userId, createTrack);
    if (!track) {
      // Offline at the summit: keep it on the device and send it later.
      const pending = await readPending();
      await AsyncStorage.setItem(PENDING_KEY, JSON.stringify([...pending, draft]));
      setPendingSaves(pending.length + 1);
    }
    await clearTrail();
    if (track) sweepTrailPhotos(photosInUse(await readPending()));
    setPlannedRoute(null);
    setOpen(false);
    return track ? { status: 'saved', track } : { status: 'queued' };
  }, [createTrack, t, userId]);

  const value = useMemo(
    () => ({ open, plannedRoute, openTrail, closeTrail, saveTrail, pendingSaves }),
    [open, plannedRoute, openTrail, closeTrail, saveTrail, pendingSaves],
  );
  return <TrailContext.Provider value={value}>{children}</TrailContext.Provider>;
}
