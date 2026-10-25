// trailRecorder.ts — the one live 徒步记录 on this device.
//
// A recording outlives the page that started it: the walker minimises the
// navigation page, locks the phone, and the app may be suspended or killed and
// relaunched. So the recorder is a module singleton, not React state, and every
// accepted point is written to AsyncStorage before anyone is told about it.
//
// Where fixes come from:
// - iOS, and Android phones without AMap in the binary: expo-location's
//   background location task (expo-task-manager). iOS keeps it running after
//   the screen locks with only while-in-use permission (blue status pill);
//   Android runs it as a foreground service with a notification.
// - Android with AMap: AMap's own continuous location. expo-location on
//   Android is Google's fused provider only, which most new Huawei/Honor phones
//   don't have (see currentPosition.ts). AMap's foreground service keeps the
//   process, and with it this JS listener, alive with the screen off.
// - A build without expo-task-manager (an older binary that got this code
//   over the air) falls back to a foreground watch: it records while the app
//   is open and says so on the page.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { AppState, Platform } from 'react-native';
import { amapModule, ensureAmapReady } from './amapSdk';
import { gcj02ToWgs84 } from './coordinates';
import type { Coordinate } from './routeSegments';
import {
  addPoint,
  EMPTY_TOTALS,
  judgeFix,
  toTrailPoint,
  type TrailFix,
  type TrailPoint,
  type TrailTotals,
} from './trailGeo';

type TaskManagerModule = typeof import('expo-task-manager');

let TaskManager: TaskManagerModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  TaskManager = require('expo-task-manager') as TaskManagerModule;
} catch {
  TaskManager = null;
}

const TASK_NAME = 'kaipa-trail-recording';
const META_KEY = 'kaipa.trail.session.v1';
const CHUNK_KEY = (index: number) => `kaipa.trail.points.v1.${index}`;
const CHUNK_SIZE = 200;
// No fix for this long while recording means the sky is blocked or GPS is off.
const SIGNAL_LOST_MS = 30_000;

/** The planned line a recording follows, when it follows one. */
export interface TrailRouteRef {
  kind: 'route' | 'track';
  id: string;
  name: string;
  coords: Coordinate[];
  elevation?: { km: number; ele: number }[];
  waypoints?: { name: string; km: number }[];
  /** Walked from the route's recorded finish. */
  reversed?: boolean;
}

export type TrailStatus = 'recording' | 'paused' | 'finished';

export interface TrailSession {
  id: string;
  status: TrailStatus;
  route: TrailRouteRef | null;
  startedAt: number;
  /** Moving time banked before the current run of recording. */
  activeMs: number;
  /** When the current run of recording began; null while paused or finished. */
  resumedAt: number | null;
  endedAt: number | null;
  /** Each pause starts a new segment, so a bus ride between them isn't drawn as a walk. */
  segments: TrailPoint[][];
  totals: TrailTotals;
  climbRef: number | null;
  /** Whether fixes keep coming with the screen off. */
  background: boolean;
}

export type GpsState = 'off' | 'searching' | 'good' | 'weak';

export interface TrailSnapshot {
  session: TrailSession | null;
  /** The latest fix, kept even when it was too rough to extend the track. */
  fix: TrailFix | null;
  gps: GpsState;
  /** Set when starting failed; the page shows it next to the start button. */
  error: TrailStartError | null;
}

export type TrailStartError = 'permission' | 'services_disabled' | 'unavailable';

interface StoredMeta extends Omit<TrailSession, 'segments'> {
  /** Flat index at which each segment begins. */
  segmentStarts: number[];
  pointCount: number;
}

let session: TrailSession | null = null;
let fix: TrailFix | null = null;
let gps: GpsState = 'off';
let error: TrailStartError | null = null;
let snapshot: TrailSnapshot = { session, fix, gps, error };
const listeners = new Set<() => void>();

let restored = false;
let restoring: Promise<void> | null = null;
/** Flat point count already written to storage, by chunk. */
let persistedChunks = new Set<number>();
let persistQueue: Promise<void> = Promise.resolve();
let signalTimer: ReturnType<typeof setTimeout> | null = null;

function emit() {
  snapshot = { session, fix, gps, error };
  listeners.forEach((listener) => listener());
}

export function subscribeTrail(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getTrailSnapshot(): TrailSnapshot {
  return snapshot;
}

/** Moving time so far, counting the run in progress. */
export function trailMovingMs(value: TrailSession | null, now = Date.now()): number {
  if (!value) return 0;
  return value.activeMs + (value.resumedAt != null ? Math.max(0, now - value.resumedAt) : 0);
}

export function trailBackgroundSupported(): boolean {
  return Platform.OS === 'android' ? !!amapModule() || !!TaskManager : !!TaskManager;
}

// ─── persistence ────────────────────────────────────────────────────────────

function flatPoints(value: TrailSession): TrailPoint[] {
  return value.segments.flat();
}

function persist(force = false): Promise<void> {
  const current = session;
  persistQueue = persistQueue.then(async () => {
    if (!current) {
      const keys = (await AsyncStorage.getAllKeys()).filter((key) => key === META_KEY || key.startsWith('kaipa.trail.points.v1.'));
      if (keys.length) await AsyncStorage.multiRemove(keys);
      persistedChunks = new Set();
      return;
    }
    const points = flatPoints(current);
    const segmentStarts: number[] = [];
    let offset = 0;
    for (const segment of current.segments) {
      segmentStarts.push(offset);
      offset += segment.length;
    }
    const { segments: _segments, ...rest } = current;
    const meta: StoredMeta = { ...rest, segmentStarts, pointCount: points.length };
    const lastChunk = Math.max(0, Math.ceil(points.length / CHUNK_SIZE) - 1);
    const writes: [string, string][] = [[META_KEY, JSON.stringify(meta)]];
    for (let chunk = 0; chunk <= lastChunk; chunk += 1) {
      // Sealed chunks never change; only the open one is rewritten.
      if (!force && persistedChunks.has(chunk) && chunk !== lastChunk) continue;
      writes.push([CHUNK_KEY(chunk), JSON.stringify(points.slice(chunk * CHUNK_SIZE, (chunk + 1) * CHUNK_SIZE))]);
      persistedChunks.add(chunk);
    }
    await AsyncStorage.multiSet(writes);
  }).catch((cause) => console.warn('[trailRecorder] persist failed:', cause));
  return persistQueue;
}

async function readStored(): Promise<TrailSession | null> {
  const raw = await AsyncStorage.getItem(META_KEY);
  if (!raw) return null;
  const meta = JSON.parse(raw) as StoredMeta;
  const chunkCount = Math.ceil(meta.pointCount / CHUNK_SIZE);
  const entries = chunkCount ? await AsyncStorage.multiGet(Array.from({ length: chunkCount }, (_, index) => CHUNK_KEY(index))) : [];
  const points: TrailPoint[] = entries.flatMap(([, value]) => (value ? JSON.parse(value) as TrailPoint[] : []));
  const segments = meta.segmentStarts.map((start, index) => points.slice(start, meta.segmentStarts[index + 1] ?? points.length));
  const { segmentStarts: _starts, pointCount: _count, ...rest } = meta;
  persistedChunks = new Set(Array.from({ length: chunkCount }, (_, index) => index));
  return { ...rest, segments: segments.length ? segments : [[]] };
}

/** Loads a recording left by a previous launch and picks its location feed back up. */
export function restoreTrail(): Promise<void> {
  if (restored) return Promise.resolve();
  restoring ??= (async () => {
    try {
      const stored = await readStored();
      if (stored && !session) {
        session = stored;
        if (stored.status === 'recording') {
          gps = 'searching';
          await startRecordingSource().catch(() => {
            // The feed can't restart (permission revoked, killed service).
            // Bank the time so far and leave it paused for the walker to decide.
            pauseInMemory();
          });
        }
        emit();
      }
    } catch (cause) {
      console.warn('[trailRecorder] restore failed:', cause);
    } finally {
      restored = true;
    }
  })();
  return restoring;
}

// ─── ingesting fixes ────────────────────────────────────────────────────────

function armSignalTimer() {
  if (signalTimer) clearTimeout(signalTimer);
  signalTimer = setTimeout(() => {
    if (session?.status === 'recording' || previewCount > 0) {
      gps = fix ? 'weak' : 'searching';
      emit();
    }
  }, SIGNAL_LOST_MS);
}

let lastPersistAt = 0;

function ingest(fixes: TrailFix[]) {
  if (!fixes.length) return;
  const ordered = [...fixes].sort((a, b) => a.t - b.t);
  let added = false;
  for (const next of ordered) {
    if (fix && next.t < fix.t) continue;
    fix = next;
    if (session?.status !== 'recording') continue;
    const segment = session.segments[session.segments.length - 1];
    const last = segment[segment.length - 1] ?? null;
    if (judgeFix(next, last) !== 'accept') continue;
    const point = toTrailPoint(next);
    const { totals, climbRef } = addPoint(session.totals, session.climbRef, last, point);
    segment.push(point);
    session = { ...session, totals, climbRef };
    added = true;
  }
  const latest = ordered[ordered.length - 1];
  gps = latest.acc != null && latest.acc > 40 ? 'weak' : 'good';
  armSignalTimer();
  emit();
  // Writing on every fix would hammer storage; every few seconds loses at
  // most that much if the process dies, and backgrounding flushes at once.
  if (added && Date.now() - lastPersistAt > 5_000) {
    lastPersistAt = Date.now();
    void persist();
  }
}

function fromExpo(location: Location.LocationObject): TrailFix {
  const { coords } = location;
  return {
    lng: coords.longitude,
    lat: coords.latitude,
    alt: coords.altitude ?? undefined,
    acc: coords.accuracy ?? undefined,
    heading: coords.heading != null && coords.heading >= 0 ? coords.heading : undefined,
    speed: coords.speed != null && coords.speed >= 0 ? coords.speed : undefined,
    t: location.timestamp,
  };
}

function fromAmap(raw: any): TrailFix | null {
  const lng = Number(raw?.longitude);
  const lat = Number(raw?.latitude);
  if (!Number.isFinite(lng) || !Number.isFinite(lat) || (lng === 0 && lat === 0)) return null;
  // AMap answers in GCJ-02 inside mainland China and WGS84 outside it.
  const [wLng, wLat] = raw.coordType === 'WGS84' ? [lng, lat] : gcj02ToWgs84([lng, lat]);
  const alt = Number(raw.altitude);
  const acc = Number(raw.accuracy);
  const heading = Number(raw.heading);
  const speed = Number(raw.speed);
  return {
    lng: wLng,
    lat: wLat,
    // AMap reports 0 for "no altitude" on network fixes.
    alt: Number.isFinite(alt) && alt !== 0 ? alt : undefined,
    acc: Number.isFinite(acc) && acc > 0 ? acc : undefined,
    heading: Number.isFinite(heading) && heading > 0 ? heading : undefined,
    speed: Number.isFinite(speed) && speed >= 0 ? speed : undefined,
    t: Number(raw.timestamp) || Date.now(),
  };
}

if (TaskManager && Platform.OS !== 'web') {
  // Must run at module load, before the app tree mounts: iOS may relaunch the
  // app in the background just to deliver locations to this task.
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(TASK_NAME, async ({ data, error: taskError }) => {
    if (taskError || !data?.locations?.length) return;
    await restoreTrail();
    ingest(data.locations.map(fromExpo));
  });
}

// ─── location sources ───────────────────────────────────────────────────────

type Stop = () => void;
let recordingStop: Stop | null = null;
let previewStop: Stop | null = null;
let previewCount = 0;

function amapAvailable(): boolean {
  const module = amapModule();
  return Platform.OS === 'android' && !!module && ensureAmapReady(module);
}

function startAmap(background: boolean): Stop {
  const gaode = amapModule()!.ExpoGaodeMapModule;
  gaode.setLocatingWithReGeocode(false);
  gaode.setLocationMode(1 as any); // 高精度：卫星 + 网络
  gaode.setGpsFirst(true);
  gaode.setSensorEnable(true);
  gaode.setInterval(2_000);
  gaode.setAllowsBackgroundLocationUpdates(background);
  const subscription = gaode.addLocationListener((raw) => {
    const next = fromAmap(raw);
    if (next) ingest([next]);
  });
  gaode.start();
  return () => {
    subscription.remove();
    gaode.stop();
    gaode.setAllowsBackgroundLocationUpdates(false);
  };
}

async function startExpoWatch(): Promise<Stop> {
  const subscription = await Location.watchPositionAsync(
    { accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 2, timeInterval: 2_000 },
    (location) => ingest([fromExpo(location)]),
  );
  return () => subscription.remove();
}

async function startRecordingSource(): Promise<boolean> {
  stopPreviewSource();
  recordingStop?.();
  recordingStop = null;
  if (amapAvailable()) {
    recordingStop = startAmap(true);
    return true;
  }
  if (TaskManager) {
    const running = await Location.hasStartedLocationUpdatesAsync(TASK_NAME).catch(() => false);
    if (!running) {
      await Location.startLocationUpdatesAsync(TASK_NAME, {
        accuracy: Location.Accuracy.BestForNavigation,
        distanceInterval: 3,
        timeInterval: 2_000,
        activityType: Location.ActivityType.Fitness,
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: '开爬正在记录轨迹',
          notificationBody: '回到开爬可查看路线和数据',
          killServiceOnDestroy: false,
        },
      });
    }
    recordingStop = () => { void Location.stopLocationUpdatesAsync(TASK_NAME).catch(() => undefined); };
    return true;
  }
  recordingStop = await startExpoWatch();
  return false;
}

function stopRecordingSource() {
  recordingStop?.();
  recordingStop = null;
  if (TaskManager) {
    // A task left over from a killed launch is not in `recordingStop`.
    void Location.hasStartedLocationUpdatesAsync(TASK_NAME)
      .then((running) => (running ? Location.stopLocationUpdatesAsync(TASK_NAME) : undefined))
      .catch(() => undefined);
  }
  if (previewCount > 0) void startPreviewSource();
}

async function startPreviewSource() {
  if (previewStop || recordingStop) return;
  try {
    previewStop = amapAvailable() ? startAmap(false) : await startExpoWatch();
    if (previewCount === 0 || recordingStop) stopPreviewSource();
  } catch (cause) {
    console.warn('[trailRecorder] preview location failed:', cause);
  }
}

function stopPreviewSource() {
  previewStop?.();
  previewStop = null;
}

async function ensurePermission(): Promise<TrailStartError | null> {
  if (!(await Location.hasServicesEnabledAsync().catch(() => true))) return 'services_disabled';
  let permission = await Location.getForegroundPermissionsAsync();
  if (!permission.granted && permission.canAskAgain) permission = await Location.requestForegroundPermissionsAsync();
  return permission.granted ? null : 'permission';
}

/**
 * Live position for the navigation page before and around a recording. Ref
 * counted; a running recording already supplies fixes, so this adds nothing.
 */
export function watchTrailPosition(): () => void {
  previewCount += 1;
  if (previewCount === 1) {
    if (!fix) gps = 'searching';
    emit();
    armSignalTimer();
    void ensurePermission().then((problem) => {
      if (problem) {
        error = problem;
        gps = 'off';
        emit();
        return;
      }
      if (previewCount > 0) void startPreviewSource();
    });
  }
  return () => {
    previewCount = Math.max(0, previewCount - 1);
    if (previewCount === 0) {
      stopPreviewSource();
      if (session?.status !== 'recording') {
        gps = 'off';
        emit();
      }
    }
  };
}

// ─── controls ───────────────────────────────────────────────────────────────

export async function startTrail(route: TrailRouteRef | null): Promise<boolean> {
  await restoreTrail();
  // One recording at a time; a finished one must be saved or discarded first.
  if (session) return session.status !== 'finished';
  error = await ensurePermission();
  if (error) {
    emit();
    return false;
  }
  const now = Date.now();
  session = {
    id: `trail-${now}`,
    status: 'recording',
    route,
    startedAt: now,
    activeMs: 0,
    resumedAt: now,
    endedAt: null,
    segments: [[]],
    totals: EMPTY_TOTALS,
    climbRef: null,
    background: false,
  };
  persistedChunks = new Set();
  // The fix that showed "you are here" before the start becomes the first point.
  if (fix && now - fix.t < 15_000 && judgeFix(fix, null) === 'accept') {
    const point = toTrailPoint({ ...fix, t: now });
    session.segments[0].push(point);
    session.totals = addPoint(EMPTY_TOTALS, null, null, point).totals;
    session.climbRef = point[2];
  }
  gps = fix ? gps : 'searching';
  try {
    session.background = await startRecordingSource();
  } catch (cause) {
    console.warn('[trailRecorder] start failed:', cause);
    session = null;
    error = 'unavailable';
    emit();
    if (previewCount > 0) void startPreviewSource();
    return false;
  }
  error = null;
  emit();
  await persist(true);
  return true;
}

function pauseInMemory() {
  if (!session || session.status !== 'recording') return;
  const now = Date.now();
  session = { ...session, status: 'paused', activeMs: trailMovingMs(session, now), resumedAt: null };
}

export async function pauseTrail() {
  if (session?.status !== 'recording') return;
  pauseInMemory();
  stopRecordingSource();
  emit();
  await persist();
}

export async function resumeTrail(): Promise<boolean> {
  if (session?.status !== 'paused') return false;
  error = await ensurePermission();
  if (error) {
    emit();
    return false;
  }
  const lastSegment = session.segments[session.segments.length - 1];
  session = {
    ...session,
    status: 'recording',
    resumedAt: Date.now(),
    // An empty segment is reused rather than leaving a gap of nothing.
    segments: lastSegment.length ? [...session.segments, []] : session.segments,
  };
  try {
    session.background = await startRecordingSource();
  } catch {
    pauseInMemory();
    error = 'unavailable';
    emit();
    return false;
  }
  emit();
  await persist();
  return true;
}

/** Stops the feed but keeps the recording until it is saved or discarded. */
export async function finishTrail(): Promise<TrailSession | null> {
  if (!session || session.status === 'finished') return session;
  pauseInMemory();
  session = { ...session, status: 'finished', endedAt: Date.now() };
  stopRecordingSource();
  emit();
  await persist();
  return session;
}

/** Back from the summary to keep walking. */
export async function reopenTrail(): Promise<boolean> {
  if (session?.status !== 'finished') return false;
  session = { ...session, status: 'paused', endedAt: null };
  emit();
  await persist();
  return resumeTrail();
}

export async function clearTrail() {
  if (session && session.status !== 'finished') stopRecordingSource();
  session = null;
  error = null;
  emit();
  await persist(true);
}

export function clearTrailError() {
  if (!error) return;
  error = null;
  emit();
}

AppState.addEventListener('change', (state) => {
  if (state !== 'active' && session) void persist();
});
