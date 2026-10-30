// routePreview.ts — the numbers and one-line facts the route detail card shows.
//
// Deliberately free of imports (the way lib/officialItinerary.ts is), so a Node
// test can run this file with type-stripping alone. The screen reads the values,
// the locale supplies the words.

import type { Poi } from '../data/pois';

export type RouteTripType = 'loop' | 'shuttle';

/** Trailheads this far apart still read as the same point on a walking map. */
const LOOP_GAP_METERS = 300;
const EARTH_RADIUS_METERS = 6_371_000;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

function gapMeters(a: [number, number], b: [number, number]): number {
  const lat1 = toRadians(a[1]);
  const lat2 = toRadians(b[1]);
  const dLat = lat2 - lat1;
  const dLng = toRadians(b[0] - a[0]);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** 环线 when the track ends where it starts, otherwise 单程穿越. Without a
 *  track there is no honest answer, so the property row drops the fact. */
export function routeTripType(coords?: [number, number][]): RouteTripType | null {
  if (!coords || coords.length < 2) return null;
  const first = coords[0];
  const last = coords[coords.length - 1];
  if (![first[0], first[1], last[0], last[1]].every((value) => Number.isFinite(value))) return null;
  return gapMeters(first, last) < LOOP_GAP_METERS ? 'loop' : 'shuttle';
}

/** The stored label splits into the number and its unit, so the number can
 *  get the big role and the unit the quiet one ("13.0" + "km"). */
export function routeDistanceParts(dist: string | undefined): { value: string; unit: string } | null {
  const trimmed = dist?.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/\d+(?:[.,]\d+)?/);
  if (!match) return null;
  return { value: match[0].replace(',', '.'), unit: trimmed.replace(match[0], '').trim() };
}

/** Rounded metres with thousands separators, or null when there is nothing. */
export function climbValueMeters(meters: number | undefined): string | null {
  if (meters == null || !Number.isFinite(meters)) return null;
  return Math.round(meters).toLocaleString('en-US');
}

export type DurationParts = {
  hours?: string;
  hoursUnit?: string;
  minutes?: string;
  minutesUnit?: string;
};

/** Hours and minutes as two parts, so the panel can style the units quieter.
 *  The unit words come from the caller's locale dictionary. */
export function durationParts(totalMinutes: number, units: { hours: string; minutes: string }): DurationParts {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.round(totalMinutes - hours * 60);
  if (hours <= 0) return { minutes: String(minutes), minutesUnit: units.minutes };
  if (minutes <= 0) return { hours: String(hours), hoursUnit: units.hours };
  return { hours: String(hours), hoursUnit: units.hours, minutes: String(minutes), minutesUnit: units.minutes };
}

/** Recorded duration wins; otherwise Naismith: km / 5 + ascent m / 600 hours,
 *  rounded to the nearest 5 minutes. `null` when the distance is unknown. */
export function estimateDurationMinutes(route: Pick<Poi, 'dist' | 'trackDurationMs'>, ascentMeters?: number): number | null {
  if (route.trackDurationMs != null && route.trackDurationMs > 0) {
    return Math.max(5, Math.round(route.trackDurationMs / 60000 / 5) * 5);
  }
  const km = Number.parseFloat(routeDistanceParts(route.dist)?.value ?? '');
  if (!Number.isFinite(km) || km <= 0) return null;
  const hours = km / 5 + Math.max(0, ascentMeters ?? 0) / 600;
  return Math.max(5, Math.round((hours * 60) / 5) * 5);
}

/** One sample of a recorded elevation profile. */
export type ElevationPoint = { km: number; ele: number };

/** A profile is only worth drawing when the file actually measured it —
 *  `buildElevation` invents a curve otherwise, and an invented curve shown as
 *  a measured one is a lie. */
export function hasMeasuredElevation(profile: ElevationPoint[] | undefined): boolean {
  return (profile?.length ?? 0) >= 2;
}

/** Height at `km`, straight between the recorded samples and clamped at both
 *  ends. `null` when there is no profile to read off. */
export function elevationAtKm(profile: ElevationPoint[] | undefined, km: number): number | null {
  if (!profile?.length || !Number.isFinite(km)) return null;
  if (km <= profile[0].km) return profile[0].ele;
  for (let i = 1; i < profile.length; i += 1) {
    const b = profile[i];
    if (km > b.km) continue;
    const a = profile[i - 1];
    return b.km === a.km ? b.ele : a.ele + ((b.ele - a.ele) * (km - a.km)) / (b.km - a.km);
  }
  return profile[profile.length - 1].ele;
}

/** Highest, lowest and steepest of a measured profile. The steepest figure is
 *  the largest grade between two adjacent samples, in percent, ignoring
 *  direction — a descent reads as steep too. */
export function elevationSummary(profile: ElevationPoint[] | undefined): { maxEle: number; minEle: number; maxGrade: number } | null {
  if (!hasMeasuredElevation(profile)) return null;
  let maxEle = -Infinity;
  let minEle = Infinity;
  let maxGrade = 0;
  profile!.forEach(({ km, ele }, index) => {
    if (ele > maxEle) maxEle = ele;
    if (ele < minEle) minEle = ele;
    if (index === 0) return;
    const prev = profile![index - 1];
    const runMeters = (km - prev.km) * 1000;
    if (runMeters > 0) maxGrade = Math.max(maxGrade, (Math.abs(ele - prev.ele) / runMeters) * 100);
  });
  return { maxEle: Math.round(maxEle), minEle: Math.round(minEle), maxGrade };
}

/** Mileage counted from the far trailhead, i.e. from where the walker starts
 *  when the route is walked backwards. Rounded to a tenth of a kilometre, the
 *  precision every caller shows it at, so subtracting it from the total never
 *  leaks float noise into a label or a sort. */
export function directedKm(totalKm: number, km: number, reversed: boolean): number {
  if (!reversed) return km;
  return Math.max(0, Math.round((totalKm - km) * 10) / 10);
}

export type DirectedWaypoint = {
  name: string;
  /** Where the library stored it, along the track as recorded. */
  km: number;
} & DirectedWaypointOrder;

/** The fields `directedWaypoints` adds to whatever the library stored. */
export type DirectedWaypointOrder = {
  /** Distance from the end being walked now. */
  alongKm: number;
  /** Position in the stored list, which is what the map layer indexes. */
  index: number;
  /** 1-based place in walking order, matching the map's numbered discs. */
  order: number;
};

/** The route's annotations in the direction being walked, numbered as the map
 *  numbers them. Ties keep the stored order, so the list is stable. Extra
 *  fields the library stored on a waypoint (its photo, whether it is a
 *  highlight) ride along untouched. */
export function directedWaypoints<T extends { name: string; km: number }>(
  waypoints: T[] | undefined,
  totalKm: number,
  reversed: boolean,
): (T & DirectedWaypointOrder)[] {
  if (!waypoints?.length) return [];
  return waypoints
    .map((waypoint, index) => ({ ...waypoint, index, alongKm: directedKm(totalKm, waypoint.km, reversed) }))
    .sort((a, b) => a.alongKm - b.alongKm || a.index - b.index)
    .map((waypoint, rank) => ({ ...waypoint, order: rank + 1 }));
}

/** One picture in the route's gallery: the file to show, and when it was taken
 *  at a waypoint, which one and how far along the walk. */
export type RouteGalleryPhoto = {
  uri: string;
  /** Position in the route's stored waypoint list, which is what the map layer
   *  and `onOpenWaypoint` index into. */
  waypointIndex?: number;
  name?: string;
  /** Mileage counted from the end being walked, like the waypoint list shows. */
  km?: number;
};

/** Everything there is to look at on a route, in one swipeable order: the
 *  photos taken at waypoints first (walking order, so the gallery reads like
 *  the trail), then the route's own pictures. A shot that is also in
 *  `photoUris` appears once, as its waypoint. `totalKm` is the mileage the
 *  caller numbers its waypoints with, so the gallery and the list never
 *  disagree; the stored distance stands in when it is not given. */
export function routeGallery(
  route: Pick<Poi, 'photoUris' | 'trackWaypoints' | 'dist'>,
  reversed: boolean,
  totalKm?: number,
): RouteGalleryPhoto[] {
  const total = totalKm != null && Number.isFinite(totalKm)
    ? totalKm
    : Number.parseFloat(routeDistanceParts(route.dist)?.value ?? '') || 0;
  const seen = new Set<string>();
  const photos: RouteGalleryPhoto[] = [];
  for (const waypoint of directedWaypoints(route.trackWaypoints, total, reversed)) {
    const uri = waypoint.photo?.trim();
    if (!uri || seen.has(uri)) continue;
    seen.add(uri);
    photos.push({ uri, waypointIndex: waypoint.index, name: waypoint.name, km: waypoint.alongKm });
  }
  for (const uri of route.photoUris ?? []) {
    const trimmed = uri?.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    photos.push({ uri: trimmed });
  }
  return photos;
}

/** The spots worth pulling out of a long waypoint list: the ones the editor
 *  marked, or all of them when nobody marked any. */
export function featuredWaypoints<T extends { name: string; highlight?: true }>(waypoints: T[]): T[] {
  const highlights = waypoints.filter((waypoint) => waypoint.highlight);
  return highlights.length ? highlights : waypoints;
}

/** Scroll-spy for the pinned section tabs: `offsets` are the section tops in
 *  page order (ascending). A section is current once its top has reached the
 *  bottom edge of the pinned header, so `scrollY + stickyHeight` picks the last
 *  offset it has passed. The first section owns everything above it; -1 when
 *  nothing has been measured yet. */
export function routeSectionIndexAtScroll(offsets: number[], scrollY: number, stickyHeight: number): number {
  if (!offsets.length) return -1;
  const edge = scrollY + stickyHeight;
  let index = 0;
  for (let i = 0; i < offsets.length; i += 1) {
    if (offsets[i] > edge) break;
    index = i;
  }
  return index;
}

/** The best months as one continuous run, cut at the widest gap so a season
 *  that wraps the year end (10…4) arrives in walking order. A run whose
 *  months jump backwards is not consecutive, and the caller lists them. */
export function seasonRun(months: number[] | undefined): number[] {
  const sorted = [...new Set(months ?? [])].filter((m) => Number.isInteger(m) && m >= 1 && m <= 12).sort((a, b) => a - b);
  if (!sorted.length) return [];
  if (sorted.length === 12) return sorted;
  const gaps = sorted.map((month, index) => {
    const next = sorted[(index + 1) % sorted.length];
    return { gap: (next - month + 12) % 12, index };
  });
  const widest = gaps.reduce((max, entry) => (entry.gap > max.gap ? entry : max), gaps[0]);
  const start = (widest.index + 1) % sorted.length;
  return sorted.map((_, offset) => sorted[(start + offset) % sorted.length]);
}
