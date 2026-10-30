// journeyDayFacts.ts — what one day of a journey can honestly report.
//
// Shared by the 总览 day rows and the 行程 page so the two never disagree about
// a day's date or its numbers. A distance or a climb appears only when the
// geometry behind it is already recorded (a track the day walks, a path the user
// drew); a day that only has a road plan waiting for it reports no numbers,
// because a straight line between two villages is not what a day travels.
// A day's summary in words is the user's own group note, never derived here.
import type { Poi } from '../data/pois';
import type { TLRow } from '../data/timeline';
import { journeyDayOrdinal } from './journeyDays';
import { buildJourneyLegs, buildJourneyStops, type JourneyLeg, type JourneyStop } from './journeyStops';
import { journeyTracks, trackForId, trackLengthMatches, type JourneyTrack } from './journeyTracks';
import { measureTrack, type Coordinate } from './routeSegments';

export interface JourneyDayFact {
  day: string;
  /** The calendar day this itinerary group happens on, when the journey has dates. */
  date?: Date;
  /** Where to ask for weather — the day's last place, else the track it walks. */
  weatherAt?: Coordinate;
  /** Metres walked, only when every hop of the day has geometry of its own. */
  distanceMeters?: number;
  /** Metres climbed, only when the day's places sit on one measured track. */
  ascentMeters?: number;
}

/** Ascent the recorded heights support between two distances of one track. */
function climbOnTrack(track: JourneyTrack, fromMeters: number, toMeters: number): number | null {
  const series = track.elevation;
  if (!series?.length) return null;
  const lo = Math.min(fromMeters, toMeters) / 1000;
  const hi = Math.max(fromMeters, toMeters) / 1000;
  const inside = series.filter((point) => Number.isFinite(point.ele) && point.km >= lo && point.km <= hi);
  if (inside.length < 2) return null;
  let climb = 0;
  for (let index = 1; index < inside.length; index += 1) climb += Math.max(0, inside[index].ele - inside[index - 1].ele);
  return climb;
}

/**
 * A day is measurable only when every hop of it already has geometry of its own.
 * A half-measured day would report a part of its walk as the whole of it.
 */
function dayDistanceMeters(legs: JourneyLeg[]): number | null {
  if (!legs.length) return null;
  let total = 0;
  for (const leg of legs) {
    const measure = leg.recordedGeometry ? measureTrack(leg.recordedGeometry) : null;
    if (!measure) return null;
    total += measure.totalMeters;
  }
  return total;
}

function dayClimbMeters(stops: JourneyStop[], tracks: JourneyTrack[]): number | null {
  if (stops.length < 2) return null;
  let total = 0;
  for (let index = 1; index < stops.length; index += 1) {
    const from = stops[index - 1];
    const to = stops[index];
    const track = trackForId(tracks, from.trackId);
    if (!track || track !== trackForId(tracks, to.trackId)) return null;
    if (from.trackMeters == null || to.trackMeters == null) return null;
    // Distances only mean this line while the file behind them is the same length.
    if (!trackLengthMatches(track, from.trackLengthMeters) || !trackLengthMatches(track, to.trackLengthMeters)) return null;
    const climb = climbOnTrack(track, from.trackMeters, to.trackMeters);
    if (climb == null) return null;
    total += climb;
  }
  return total;
}

export function computeJourneyDayFacts({
  poi,
  days,
  rows,
  knownGroups,
  routes,
  startDate,
}: {
  poi: Poi;
  days: string[];
  rows: TLRow[];
  knownGroups: string[];
  routes: Poi[];
  startDate: Date | null;
}): JourneyDayFact[] {
  if (!days.length) return [];
  const stops = buildJourneyStops(rows, knownGroups);
  const tracks = journeyTracks(poi, rows, routes);
  const trackCoords = new Map(tracks.flatMap((track) => track.ids.map((id) => [id, track.coords] as const)));
  const legs = stops.length >= 2 ? buildJourneyLegs(stops, (trackId) => trackCoords.get(trackId)) : [];
  const journeyMidpoint = (() => {
    const measure = measureTrack(poi.trackCoords);
    if (!measure) return null;
    return measure.coordinates[Math.floor((measure.coordinates.length - 1) / 2)] ?? null;
  })();

  return days.map((day, dayIndex) => {
    const dayStops = stops.filter((stop) => (stop.day ?? '') === day);
    const dayLegs = legs.filter((leg) => (leg.day ?? '') === day);
    const distance = dayDistanceMeters(dayLegs);
    const climb = dayClimbMeters(dayStops, tracks);
    const ordinal = journeyDayOrdinal(day) ?? dayIndex + 1;
    const date = startDate
      ? new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + ordinal - 1)
      : undefined;
    return {
      day,
      date,
      weatherAt: dayStops[dayStops.length - 1]?.coordinate ?? journeyMidpoint ?? undefined,
      distanceMeters: distance ?? undefined,
      ascentMeters: climb ?? undefined,
    };
  });
}

export const formatDayDistance = (meters: number) => (meters < 10_000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters / 1000)} km`);
