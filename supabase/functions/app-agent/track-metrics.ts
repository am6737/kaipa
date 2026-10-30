// Distances on a route track, in the route's own stated kilometres.
//
// Route waypoints and the elevation profile carry km measured on the original
// recording, while track_coords may be a sampled copy that measures shorter
// (南太行's 46.1 km track sums to 41.8 km). Official plan stops are written in
// the stated frame, like everything a walker reads; a map position is derived
// from it only when one is placed on the stored geometry.

export type ProfilePoint = { km: number; ele: number };
export type TrackWaypoint = { name?: unknown; km?: unknown; cumulativeAscentMeters?: unknown };
export type RouteTrackFacts = {
  /** The route's stated length in km: the end of its elevation profile. */
  totalKm: number;
  profile: ProfilePoint[];
  waypoints: TrackWaypoint[];
};
export type DayMetrics = { distanceKm: number; ascentM: number; descentM: number };

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

export function routeTrackFacts(elevation: unknown, waypoints: unknown): RouteTrackFacts | null {
  const profile = (Array.isArray(elevation) ? elevation : [])
    .filter((point): point is ProfilePoint => finite(point?.km) && finite(point?.ele))
    .sort((a, b) => a.km - b.km);
  if (profile.length < 2) return null;
  return { totalKm: profile.at(-1)!.km, profile, waypoints: Array.isArray(waypoints) ? waypoints : [] };
}

function interpolate(points: Array<[number, number]>, km: number) {
  if (km <= points[0][0]) return points[0][1];
  for (let index = 1; index < points.length; index += 1) {
    const [x1, y1] = points[index];
    if (km > x1) continue;
    const [x0, y0] = points[index - 1];
    return x1 === x0 ? y1 : y0 + (y1 - y0) * (km - x0) / (x1 - x0);
  }
  return points.at(-1)![1];
}

/** Climb accumulated from the start of the track to km. The waypoints carry it
 * from the full recording; the sampled profile undercounts every small climb
 * (1593 m against the recorded 1802 m on 南太行), so it is only the fallback. */
function ascentTo(track: RouteTrackFacts, km: number) {
  const recorded = track.waypoints
    .filter(point => finite(point.km) && finite(point.cumulativeAscentMeters))
    .map(point => [point.km as number, point.cumulativeAscentMeters as number] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  if (recorded.length >= 2) return interpolate([[0, 0], ...recorded], km);
  let climb = 0;
  for (let index = 1; index < track.profile.length; index += 1) {
    const previous = track.profile[index - 1], point = track.profile[index];
    if (previous.km >= km) break;
    const end = Math.min(point.km, km);
    const ele = end === point.km ? point.ele : interpolate([[previous.km, previous.ele], [point.km, point.ele]], end);
    climb += Math.max(0, ele - previous.ele);
  }
  return climb;
}

export function elevationAt(track: RouteTrackFacts, km: number) {
  return interpolate(track.profile.map(point => [point.km, point.ele] as [number, number]), km);
}

/** Distance, climb and descent between two km on the track. Descent follows
 * from the climb and the net height change, so the two always add up. */
export function rangeMetrics(track: RouteTrackFacts, fromKm: number, toKm: number): DayMetrics {
  const ascent = Math.max(0, ascentTo(track, toKm) - ascentTo(track, fromKm));
  const descent = Math.max(0, ascent - (elevationAt(track, toKm) - elevationAt(track, fromKm)));
  return { distanceKm: Math.round((toKm - fromKm) * 10) / 10, ascentM: Math.round(ascent / 10) * 10, descentM: Math.round(descent / 10) * 10 };
}

/** A stated km placed on the stored geometry. Without the original recording
 * the only faithful mapping is the share of the route walked. */
export function geometryMeters(km: number, totalKm: number, geometryTotalMeters: number) {
  if (!(totalKm > 0) || !(geometryTotalMeters > 0)) return null;
  return Math.max(0, Math.min(geometryTotalMeters, km / totalKm * geometryTotalMeters));
}
