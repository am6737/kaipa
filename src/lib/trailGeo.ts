// trailGeo.ts — the arithmetic behind 徒步导航 and 轨迹记录: filtering raw GPS
// fixes, totting up a recording, and placing the walker on a planned route.
// Pure functions only, so the recorder, the page and the background task all
// agree on the numbers. Coordinates are WGS-84 [lng, lat] like the rest of the app.
import { distanceMeters, measureTrack, type Coordinate, type TrackMeasure } from './routeSegments';

export interface TrailFix {
  lng: number;
  lat: number;
  /** Metres; GPS altitude, absent when the provider has none. */
  alt?: number;
  /** Horizontal accuracy in metres. */
  acc?: number;
  /** Degrees clockwise from north. */
  heading?: number;
  /** Metres per second. */
  speed?: number;
  /** Epoch milliseconds. */
  t: number;
}

/** What a stored recording keeps per point: [lng, lat, alt | null, t]. */
export type TrailPoint = [number, number, number | null, number];

// A fix worse than this tells us which valley we are in, not where on the path.
const MAX_ACCURACY_METERS = 40;
// Below this the "movement" is GPS wander while standing still.
const MIN_STEP_METERS = 5;
// The step a fix must clear grows with its error circle up to this. Indoors and
// under trees fixes report 15–40 m and wander about that much on their own.
const MAX_STEP_GATE_METERS = 25;
// Doppler speed under this means standing still, whatever the position says.
const STILL_SPEED_MPS = 0.4;
// Faster than a fell runner downhill is a jump, not a step.
const MAX_SPEED_MPS = 12;
// Altitude changes smaller than this are noise; GPS altitude wanders ±5 m.
const CLIMB_THRESHOLD_METERS = 5;

// A jump is one stray fix. This many in a row, all judged against the same last
// point, mean that point is the stale one: the walker moved on faster than
// MAX_SPEED_MPS (a bike, a car) or it was itself a stray. Without this every
// later fix is dropped until the pace falls, and the track draws a straight line.
export const JUMP_STREAK_LIMIT = 3;

export type FixVerdict = 'accept' | 'inaccurate' | 'stationary' | 'jump';

/** Whether a fix extends the track drawn so far, judged against its last point. */
export function judgeFix(fix: TrailFix, last: TrailPoint | null): FixVerdict {
  if (fix.acc != null && fix.acc > MAX_ACCURACY_METERS) return 'inaccurate';
  if (!last) return 'accept';
  const step = distanceMeters([last[0], last[1]], [fix.lng, fix.lat]);
  // A step inside the fix's own error circle is wander, not walking. Measured
  // from the last kept point, so a real walk still clears it within a few fixes.
  const gate = Math.max(MIN_STEP_METERS, Math.min(fix.acc ?? 0, MAX_STEP_GATE_METERS));
  if (step < gate) return 'stationary';
  // Wander that has drifted just past the circle while the receiver says it is
  // not moving. Network fixes report 0 here too, and they are the worst wanderers.
  if (fix.speed != null && fix.speed < STILL_SPEED_MPS && step < gate * 2) return 'stationary';
  const seconds = (fix.t - last[3]) / 1000;
  // A receiver measuring that speed itself (Doppler) is on a bike or in a car,
  // not jumping: the step only has to fit its own reading.
  const ceiling = Math.max(MAX_SPEED_MPS, (fix.speed ?? 0) * 1.5 + 5);
  if (seconds > 0 && step / seconds > ceiling && step > 60) return 'jump';
  return 'accept';
}

/**
 * Accuracy-weighted smoothing of the fixes a recording keeps, so wander
 * averages out instead of being drawn: standing still, the estimate settles;
 * walking, the uncertainty grows with time at walking pace and each new fix
 * pulls it along. A one-state Kalman filter on position, as most trackers use.
 */
export interface TrailSmoother {
  lng: number;
  lat: number;
  /** Variance of the estimate, square metres. */
  variance: number;
  t: number;
  /** Fixes taken in since the last reset. */
  count: number;
}

/**
 * Fixes a segment's first point waits for. The first answers after the GPS
 * comes on are often a cached or Wi-Fi position tens of metres off, and a
 * track anchored there draws a line from it to wherever the GPS settles.
 */
export const SETTLE_FIXES = 3;

// How fast the walker may have moved since the last fix, for the filter. Brisk
// hiking pace; a fix that reports a higher speed raises it for that step.
const SMOOTHING_SPEED_MPS = 2;
// After a gap this long the estimate is stale; start again from the fix.
const SMOOTHING_RESET_MS = 30_000;

export function smoothFix(state: TrailSmoother | null, fix: TrailFix): { state: TrailSmoother; fix: TrailFix } {
  const acc = Math.max(fix.acc ?? 10, 3);
  if (!state || fix.t - state.t > SMOOTHING_RESET_MS || fix.t < state.t) {
    return { state: { lng: fix.lng, lat: fix.lat, variance: acc * acc, t: fix.t, count: 1 }, fix };
  }
  const speed = Math.max(SMOOTHING_SPEED_MPS, fix.speed ?? 0);
  const variance = state.variance + ((fix.t - state.t) / 1000) * speed * speed;
  const gain = variance / (variance + acc * acc);
  const next: TrailSmoother = {
    lng: state.lng + gain * (fix.lng - state.lng),
    lat: state.lat + gain * (fix.lat - state.lat),
    variance: (1 - gain) * variance,
    t: fix.t,
    count: state.count + 1,
  };
  // Keeps the raw accuracy: judgeFix's step gate is about the receiver's error.
  return { state: next, fix: { ...fix, lng: next.lng, lat: next.lat } };
}

export function toTrailPoint(fix: TrailFix): TrailPoint {
  const alt = fix.alt != null && Number.isFinite(fix.alt) ? Math.round(fix.alt * 10) / 10 : null;
  return [Math.round(fix.lng * 1e7) / 1e7, Math.round(fix.lat * 1e7) / 1e7, alt, Math.round(fix.t)];
}

/** Running totals for a recording. Segments are the stretches between pauses. */
export interface TrailTotals {
  distM: number;
  ascM: number;
  descM: number;
  minAlt: number | null;
  maxAlt: number | null;
  pointCount: number;
}

export const EMPTY_TOTALS: TrailTotals = { distM: 0, ascM: 0, descM: 0, minAlt: null, maxAlt: null, pointCount: 0 };

/**
 * Incremental totals: the recorder feeds one point at a time and must not
 * re-walk a 10,000-point recording per fix. `climbRef` is the last altitude a
 * climb was counted from; it carries the hysteresis between calls.
 */
export function addPoint(
  totals: TrailTotals,
  climbRef: number | null,
  previous: TrailPoint | null,
  point: TrailPoint,
): { totals: TrailTotals; climbRef: number | null } {
  let { distM, ascM, descM, minAlt, maxAlt } = totals;
  if (previous) distM += distanceMeters([previous[0], previous[1]], [point[0], point[1]]);
  let ref = climbRef;
  const alt = point[2];
  if (alt != null) {
    minAlt = minAlt == null ? alt : Math.min(minAlt, alt);
    maxAlt = maxAlt == null ? alt : Math.max(maxAlt, alt);
    if (ref == null) ref = alt;
    const delta = alt - ref;
    if (Math.abs(delta) >= CLIMB_THRESHOLD_METERS) {
      if (delta > 0) ascM += delta;
      else descM -= delta;
      ref = alt;
    }
  }
  return { totals: { distM, ascM, descM, minAlt, maxAlt, pointCount: totals.pointCount + 1 }, climbRef: ref };
}

export function totalsOf(segments: TrailPoint[][]): TrailTotals {
  let totals = EMPTY_TOTALS;
  let climbRef: number | null = null;
  for (const segment of segments) {
    let previous: TrailPoint | null = null;
    for (const point of segment) {
      ({ totals, climbRef } = addPoint(totals, climbRef, previous, point));
      previous = point;
    }
  }
  return totals;
}

/** A distance-keyed altitude profile, decimated to about 500 samples like imports. */
export function elevationProfile(segments: TrailPoint[][]): { km: number; ele: number }[] | undefined {
  const samples: { km: number; ele: number }[] = [];
  const count = segments.reduce((sum, segment) => sum + segment.length, 0);
  const stride = Math.max(1, Math.floor(count / 500));
  let meters = 0;
  let index = 0;
  let withAltitude = 0;
  for (const segment of segments) {
    for (let i = 0; i < segment.length; i += 1, index += 1) {
      const point = segment[i];
      if (i > 0) meters += distanceMeters([segment[i - 1][0], segment[i - 1][1]], [point[0], point[1]]);
      if (point[2] == null) continue;
      withAltitude += 1;
      if (index % stride === 0 || index === count - 1) samples.push({ km: meters / 1000, ele: point[2] });
    }
  }
  return withAltitude >= count * 0.5 && samples.length >= 2 ? samples : undefined;
}

// ─── following a planned route ──────────────────────────────────────────────

/** Further than this from the line counts as off route. */
export const OFF_ROUTE_METERS = 50;
/** …and coming back within this clears it, so the banner doesn't flicker. */
export const BACK_ON_ROUTE_METERS = 35;

export interface RouteProgress {
  /** Distance walked along the route to the nearest point on it. */
  alongM: number;
  remainingM: number;
  totalM: number;
  /** How far the walker stands from the line. */
  offsetM: number;
  /** Nearest point on the route. */
  snapped: Coordinate;
}

/**
 * Where on the route the walker is. Out-and-back and figure-of-eight routes
 * pass the same spot twice, and the plain nearest segment would jump the
 * progress back and forth between the two passes. So among segments about as
 * close as the nearest one, the one nearest the previous progress wins.
 */
export function locateOnRoute(
  measure: TrackMeasure,
  coordinate: Coordinate,
  previousAlongM?: number | null,
): RouteProgress | null {
  const points = measure.coordinates;
  if (points.length < 2) return null;
  const lngScale = 111320 * Math.cos((coordinate[1] * Math.PI) / 180);
  const latScale = 110540;
  type Candidate = { offset: number; along: number; snapped: Coordinate };
  let nearest: Candidate | null = null;
  const candidates: Candidate[] = [];
  for (let index = 0; index + 1 < points.length; index += 1) {
    const ax = (points[index][0] - coordinate[0]) * lngScale;
    const ay = (points[index][1] - coordinate[1]) * latScale;
    const bx = (points[index + 1][0] - coordinate[0]) * lngScale;
    const by = (points[index + 1][1] - coordinate[1]) * latScale;
    const dx = bx - ax;
    const dy = by - ay;
    const span = dx * dx + dy * dy;
    const t = span > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / span)) : 0;
    const offset = Math.hypot(ax + dx * t, ay + dy * t);
    const segmentM = measure.cumulativeMeters[index + 1] - measure.cumulativeMeters[index];
    const candidate: Candidate = {
      offset,
      along: measure.cumulativeMeters[index] + segmentM * t,
      snapped: [
        points[index][0] + (points[index + 1][0] - points[index][0]) * t,
        points[index][1] + (points[index + 1][1] - points[index][1]) * t,
      ],
    };
    if (offset <= OFF_ROUTE_METERS * 2) candidates.push(candidate);
    if (!nearest || offset < nearest.offset) nearest = candidate;
  }
  if (!nearest) return null;
  let chosen = nearest;
  if (previousAlongM != null && candidates.length > 1) {
    const tolerance = nearest.offset + 25;
    for (const candidate of candidates) {
      if (candidate.offset > tolerance) continue;
      if (Math.abs(candidate.along - previousAlongM) < Math.abs(chosen.along - previousAlongM)) chosen = candidate;
    }
  }
  return {
    alongM: chosen.along,
    remainingM: Math.max(0, measure.totalMeters - chosen.along),
    totalM: measure.totalMeters,
    offsetM: chosen.offset,
    snapped: chosen.snapped,
  };
}

/** Climb still ahead, read off the route's stored profile. */
export function remainingAscent(profile: { km: number; ele: number }[] | undefined, alongM: number): number | null {
  if (!profile || profile.length < 2) return null;
  const fromKm = alongM / 1000;
  let ascent = 0;
  let ref: number | null = null;
  for (let i = 0; i < profile.length; i += 1) {
    const sample = profile[i];
    if (sample.km < fromKm) {
      // Interpolate the starting altitude so the first partial step counts.
      const next = profile[i + 1];
      if (next && next.km >= fromKm) {
        const span = next.km - sample.km;
        ref = span > 0 ? sample.ele + ((next.ele - sample.ele) * (fromKm - sample.km)) / span : sample.ele;
      }
      continue;
    }
    if (ref == null) ref = sample.ele;
    const delta = sample.ele - ref;
    if (Math.abs(delta) >= CLIMB_THRESHOLD_METERS) {
      if (delta > 0) ascent += delta;
      ref = sample.ele;
    }
  }
  return Math.round(ascent);
}

/** The next named waypoint ahead of the walker. */
export function nextWaypoint(
  waypoints: { name: string; km: number }[] | undefined,
  alongM: number,
): { name: string; aheadM: number } | null {
  if (!waypoints?.length) return null;
  // A waypoint within 30 m behind still counts as "here", not passed.
  const next = waypoints.find((waypoint) => waypoint.km * 1000 >= alongM - 30);
  return next ? { name: next.name, aheadM: Math.max(0, next.km * 1000 - alongM) } : null;
}

export function routeMeasure(coords: Coordinate[] | undefined): TrackMeasure | null {
  return measureTrack(coords);
}

// ─── formatting ─────────────────────────────────────────────────────────────

/** Value and unit apart, so the number can be set large on its own. */
export function splitDistance(meters: number | null | undefined): { value: string; unit: string } {
  if (meters == null || !Number.isFinite(meters)) return { value: '--', unit: 'km' };
  if (meters < 1000) return { value: String(Math.round(meters)), unit: 'm' };
  return { value: (meters / 1000).toFixed(meters < 100_000 ? 2 : 1), unit: 'km' };
}

/** Moving time: `mm:ss`, then `h:mm:ss` once there is an hour. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** Minutes per kilometre as m'ss", or `--` before there is enough to say. */
export function formatPace(distM: number, movingMs: number): string {
  if (distM < 50 || movingMs < 30_000) return '--';
  const secondsPerKm = movingMs / 1000 / (distM / 1000);
  if (!Number.isFinite(secondsPerKm) || secondsPerKm > 99 * 60) return '--';
  const m = Math.floor(secondsPerKm / 60);
  const s = Math.round(secondsPerKm % 60);
  return `${m}'${String(s === 60 ? 0 : s).padStart(2, '0')}"`;
}
