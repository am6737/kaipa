// trailGuide.ts — the part of 徒步导航 that has to keep working with the
// screen locked: where the walker is on the route, whether they have left it,
// what is coming up, and saying so out loud.
//
// It listens to the recorder at module level, not from a component, because
// with the screen off React may not render at all while the background task
// still delivers fixes. The page reads the same state, so what is spoken and
// what is shown never disagree.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { translate, type ResolvedLang, type TKey, type TVars } from '../i18n';
import { routeMeasure, locateOnRoute, nextWaypoint, OFF_ROUTE_METERS, BACK_ON_ROUTE_METERS, type RouteProgress } from './trailGeo';
import type { TrackMeasure } from './routeSegments';
import { getTrailSnapshot, subscribeTrail, trailMovingMs, type TrailSession } from './trailRecorder';

type SpeechModule = typeof import('expo-speech');
type AudioModule = typeof import('expo-audio');

// Both are native; a binary that predates them just stays silent.
let Speech: SpeechModule | null = null;
let Audio: AudioModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Speech = require('expo-speech') as SpeechModule;
} catch {
  Speech = null;
}
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Audio = require('expo-audio') as AudioModule;
} catch {
  Audio = null;
}

const VOICE_KEY = 'kaipa.trail.voice.v1';
// Only fixes this good move the off-route state; worse ones only show position.
const TRUSTED_ACCURACY_METERS = 40;
// Announce a waypoint once, when it comes within this distance.
const WAYPOINT_ANNOUNCE_METERS = 200;
// While still off route, say so again this often.
const OFF_ROUTE_REPEAT_MS = 2 * 60_000;
const ARRIVE_METERS = 40;

export interface TrailGuideState {
  /** Null on a free recording, or before the first fix. */
  progress: RouteProgress | null;
  offRoute: boolean;
  arrived: boolean;
  nextWaypoint: { name: string; aheadM: number } | null;
  voice: boolean;
  /** False when the binary has no speech module. */
  voiceAvailable: boolean;
}

let state: TrailGuideState = {
  progress: null,
  offRoute: false,
  arrived: false,
  nextWaypoint: null,
  voice: true,
  voiceAvailable: Speech != null,
};
const listeners = new Set<() => void>();
let lang: ResolvedLang = 'zh';

// Per recording; reset whenever the session id changes.
let sessionId: string | null = null;
let measure: TrackMeasure | null = null;
let measuredCoords: unknown = null;
let alongM: number | null = null;
let announcedWaypoints = new Set<number>();
let offRouteSpokenAt = 0;
let lastKmSpoken = 0;
let lastFixT = 0;
let lastStatus: TrailSession['status'] | null = null;
let audioReady = false;

function set(patch: Partial<TrailGuideState>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

export function subscribeTrailGuide(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getTrailGuide(): TrailGuideState {
  return state;
}

/** The app language, so prompts are spoken in what the screen shows. */
export function setTrailGuideLanguage(next: ResolvedLang) {
  lang = next;
}

export function setTrailVoice(on: boolean) {
  set({ voice: on });
  if (!on) Speech?.stop();
  void AsyncStorage.setItem(VOICE_KEY, on ? '1' : '0').catch(() => undefined);
}

void AsyncStorage.getItem(VOICE_KEY).then((value) => {
  if (value === '0') set({ voice: false });
}).catch(() => undefined);

// ─── speaking ───────────────────────────────────────────────────────────────

function t(key: TKey, vars?: TVars) {
  return translate(lang, key, vars);
}

function spokenDistance(meters: number): string {
  if (meters < 1000) return t('trail.voice.meters', { n: Math.max(10, Math.round(meters / 10) * 10) });
  const km = meters / 1000;
  return t('trail.voice.km', { n: km >= 10 ? Math.round(km) : Math.round(km * 10) / 10 });
}

function spokenDuration(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return t('trail.voice.minutes', { m });
  return m ? t('trail.voice.hoursMinutes', { h, m }) : t('trail.voice.hours', { h });
}

// The recording owns the audio session only while it runs: ducking other
// apps under a prompt, heard on silent and with the screen locked.
async function claimAudio() {
  if (audioReady || !Audio) return;
  audioReady = true;
  try {
    await Audio.setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'duckOthers', allowsRecording: false });
  } catch {
    audioReady = false;
  }
}

async function releaseAudio() {
  if (!audioReady || !Audio) return;
  audioReady = false;
  try {
    await Audio.setAudioModeAsync({ playsInSilentMode: false, shouldPlayInBackground: false, interruptionMode: 'mixWithOthers', allowsRecording: false });
  } catch {
    // Leaving the session as it was is harmless.
  }
}

function say(text: string, urgent = false) {
  if (!Speech || !state.voice) return;
  void claimAudio().then(() => {
    if (urgent) Speech?.stop();
    Speech?.speak(text, { language: lang === 'zh' ? 'zh-CN' : 'en-US', rate: lang === 'zh' ? 1.0 : 0.95 });
  });
}

/** For the voice button: says one line so the walker hears the setting work. */
export function previewTrailVoice() {
  say(t('trail.voice.on'), true);
}

// ─── following ──────────────────────────────────────────────────────────────

function reset(next: TrailSession | null) {
  sessionId = next?.id ?? null;
  alongM = null;
  announcedWaypoints = new Set();
  offRouteSpokenAt = 0;
  lastKmSpoken = next ? Math.floor(next.totals.distM / 1000) : 0;
  lastFixT = 0;
  set({ progress: null, offRoute: false, arrived: false, nextWaypoint: null });
}

function onSnapshot() {
  const { session, fix } = getTrailSnapshot();

  if ((session?.id ?? null) !== sessionId) {
    const isNew = session != null && session.status === 'recording' && session.totals.pointCount === 0;
    reset(session);
    lastStatus = session?.status ?? null;
    if (!session) void releaseAudio();
    if (isNew && session) {
      say(session.route
        ? t('trail.voice.startRoute', { distance: spokenDistance(routeMeasure(session.route.coords)?.totalMeters ?? 0) })
        : t('trail.voice.startFree'));
    }
  }
  if (!session) return;
  if (session.status !== lastStatus) {
    if (session.status === 'paused') say(t('trail.voice.paused'));
    else if (session.status === 'recording' && lastStatus === 'paused') say(t('trail.voice.resumed'));
    else if (session.status === 'finished') {
      Speech?.stop();
      void releaseAudio();
    }
    lastStatus = session.status;
  }

  if (!fix || fix.t === lastFixT) return;
  lastFixT = fix.t;
  const recording = session.status === 'recording';

  // Every whole kilometre, the distance and time so far.
  const km = Math.floor(session.totals.distM / 1000);
  if (recording && km > lastKmSpoken) {
    lastKmSpoken = km;
    say(t('trail.voice.kilometre', { distance: spokenDistance(km * 1000), time: spokenDuration(trailMovingMs(session)) }));
  }

  const route = session.route;
  if (!route || route.coords.length < 2) return;
  if (measuredCoords !== route.coords) {
    measuredCoords = route.coords;
    measure = routeMeasure(route.coords);
  }
  if (!measure) return;
  const progress = locateOnRoute(measure, [fix.lng, fix.lat], alongM);
  if (!progress) return;
  const trusted = fix.acc == null || fix.acc <= TRUSTED_ACCURACY_METERS;
  // Progress only advances on trusted fixes so a wild one can't jump it.
  if (trusted) alongM = progress.alongM;

  let { offRoute, arrived } = state;
  const now = Date.now();
  if (recording && trusted) {
    if (!offRoute && progress.offsetM > OFF_ROUTE_METERS) {
      offRoute = true;
      offRouteSpokenAt = now;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
      say(t('trail.voice.offRoute', { distance: spokenDistance(progress.offsetM) }), true);
    } else if (offRoute && progress.offsetM < BACK_ON_ROUTE_METERS) {
      offRoute = false;
      say(t('trail.voice.backOnRoute'));
    } else if (offRoute && now - offRouteSpokenAt > OFF_ROUTE_REPEAT_MS) {
      offRouteSpokenAt = now;
      say(t('trail.voice.stillOffRoute', { distance: spokenDistance(progress.offsetM) }));
    }
  }
  if (!recording) offRoute = false;

  // Loops start at their finish, so arrival needs most of the route behind.
  const nowArrived = recording && progress.remainingM < ARRIVE_METERS && progress.alongM > progress.totalM * 0.5;
  if (nowArrived && !arrived) {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    say(t('trail.voice.arrived'), true);
  }
  arrived = arrived || nowArrived;

  const ahead = nextWaypoint(route.waypoints, alongM ?? progress.alongM);
  if (recording && ahead && !offRoute) {
    const index = route.waypoints?.findIndex((waypoint) => waypoint.name === ahead.name) ?? -1;
    if (index >= 0 && !announcedWaypoints.has(index) && ahead.aheadM <= WAYPOINT_ANNOUNCE_METERS) {
      announcedWaypoints.add(index);
      say(ahead.aheadM < 30
        ? t('trail.voice.waypointHere', { name: ahead.name })
        : t('trail.voice.waypointAhead', { name: ahead.name, distance: spokenDistance(ahead.aheadM) }));
    }
  }

  set({ progress, offRoute, arrived, nextWaypoint: ahead });
}

subscribeTrail(onSnapshot);
