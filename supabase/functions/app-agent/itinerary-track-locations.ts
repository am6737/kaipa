import { itineraryItem } from './tools.ts';
import type { PlanDocument } from './plan-document.ts';
import { endpointAtDistance, normalizeTrackCoordinates, trackLengthMeters } from './route-endpoints.ts';
import { resolveHikingEndpoint } from './hiking-boundaries.ts';
import { journeyDayOrdinal } from './journey-days.ts';

export type ItineraryTrack = { id: string; name: string; coordinates: unknown; waypoints: { name: string; km: number }[] | null };

/** Use the same GPX distances as the day boundaries, not geocoded camp names. */
export function addTrackDayLocations(plan: PlanDocument, tracks: Map<string | null, ItineraryTrack>) {
  const days = new Map<string, { start: ReturnType<typeof itineraryItem.parse>; end: ReturnType<typeof itineraryItem.parse> }>();
  const previous = new Map<string, { meters: number; name: string }>();
  for (const endpoint of [...plan.endpoints].sort((a, b) => (journeyDayOrdinal(a.day) ?? 0) - (journeyDayOrdinal(b.day) ?? 0))) {
    const track = tracks.get(endpoint.routeId ?? null);
    if (!track) continue;
    const coords = normalizeTrackCoordinates(track.coordinates);
    if (coords.length < 2) continue;
    const total = trackLengthMeters(coords);
    let resolved;
    try { resolved = resolveHikingEndpoint(endpoint, total, track.waypoints); } catch { continue; }
    const last = previous.get(track.id);
    const startMeters = last?.meters ?? 0;
    const startCoords = startMeters === 0 ? coords[0] : endpointAtDistance(coords, startMeters).coordinate;
    const end = endpointAtDistance(coords, resolved.endDistanceKm * 1000);
    const startName = last?.name ?? `${track.name}轨迹起点`;
    const endName = resolved.locationName || `${track.name}轨迹终点`;
    const marker = (name: string, coordinate: [number, number], meters: number, prefix: string) => itineraryItem.parse({
      day: endpoint.day, kind: 'custom', title: `${prefix}${name}`.slice(0, 120),
      location: { name, source: 'map', longitude: coordinate[0], latitude: coordinate[1], trackId: track.id,
        trackMeters: meters, trackLengthMeters: total },
    });
    days.set(endpoint.day, { start: marker(startName, startCoords, startMeters, '从'), end: marker(endName, end.coordinate, end.distanceMeters, '抵达') });
    previous.set(track.id, { meters: end.distanceMeters, name: endName });
  }
  const inserted = new Set<string>();
  const remaining = new Map(plan.itineraryItems.map(item => [item.day, plan.itineraryItems.filter(other => other.day === item.day && other.kind === 'activity').length]));
  const original = plan.itineraryItems.filter(item => {
    const markers = days.get(item.day);
    return !markers || ![markers.start, markers.end].some(marker => item.title === marker.title && item.location?.trackId === marker.location?.trackId);
  });
  plan.itineraryItems = original.flatMap(item => {
    const markers = days.get(item.day);
    if (!markers || item.kind !== 'activity') return [item];
    const first = !inserted.has(item.day); inserted.add(item.day);
    const left = (remaining.get(item.day) ?? 1) - 1; remaining.set(item.day, left);
    return [...(first ? [{ ...markers.start, timeStart: item.timeStart }] : []),
      { ...item, startLocation: null, location: null },
      ...(left === 0 ? [{ ...markers.end, timeStart: item.timeEnd }] : [])];
  });
}
