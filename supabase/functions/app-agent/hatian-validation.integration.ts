import { createClient } from 'npm:@supabase/supabase-js@2.108.1';
import { buildAgentTrackData, computeTrackStats, parseTrackBytes, snapTrackWaypoints } from './track.ts';
import { endpointAtDistance, normalizeTrackCoordinates, trackLengthMeters } from './route-endpoints.ts';
import { validateHikingBoundary } from './hiking-boundaries.ts';

// Read-only audit of a user-selected journey, including soft-deleted history.
// Storage is accessed through the authenticated SDK; no signed URLs or keys are reported.
const journeyId = Deno.args[0];
if (!journeyId) throw new Error('Usage: hatian-validation.integration.ts <journey-id>');
const serviceKey = Deno.env.get('SERVICE_ROLE_KEY');
if (!serviceKey) throw new Error('Missing self-hosted runtime environment');
const db = createClient(`http://127.0.0.1:${Deno.env.get('KONG_HTTP_PORT') || '8010'}`, serviceKey, { auth: { persistSession: false } });
const journey = await db.from('journeys').select('name,deleted_at,total_days,dist,asc_,tracks ( file_url, file_name, coords, waypoints )')
  .eq('id', journeyId).single();
if (journey.error) throw journey.error;
const { tracks: boundTrack, ...j } = journey.data;
if (!boundTrack?.file_url || !boundTrack.file_name) throw new Error('Original track file is missing');
const path = new URL(boundTrack.file_url).pathname;
const prefix = '/storage/v1/object/public/';
if (!path.startsWith(prefix)) throw new Error('Unsupported stored track path; do not fetch arbitrary external URLs');
const [bucket, ...segments] = path.slice(prefix.length).split('/').map(decodeURIComponent);
const file = await db.storage.from(bucket).download(segments.join('/'));
if (file.error) throw file.error;
const parsed = await parseTrackBytes(new Uint8Array(await file.data.arrayBuffer()), boundTrack.file_name);
const stats = computeTrackStats(parsed.points);
if (!stats) throw new Error('Original track is invalid');
const display = normalizeTrackCoordinates(boundTrack.coords);
const displayMeters = trackLengthMeters(display);
const rebuilt = buildAgentTrackData(stats);
const exactDisplayMatch = JSON.stringify(rebuilt.trackCoords) === JSON.stringify(display);
const originalWaypoints = snapTrackWaypoints(parsed.waypoints, stats) || [];
const namedWaypointOffsets = (parsed.waypoints || []).filter(point => point.name.trim()).map(point => {
  let nearestIndex = 0;
  let offsetMeters = Infinity;
  stats.points.forEach((trackPoint, index) => {
    const offset = trackLengthMeters([[point.lon, point.lat], [trackPoint.lon, trackPoint.lat]]);
    if (offset < offsetMeters) { offsetMeters = offset; nearestIndex = index; }
  });
  return { name: point.name, nearestTrackKm: stats.cum[nearestIndex] / 1000, offsetMeters,
    waypointElevation: Number.isFinite(point.ele) ? point.ele : null, trackElevation: stats.points[nearestIndex].ele };
});
const candidateNames = ['第一天营地', '第二天营地陈家窝子', '第三天营地达拉牧场', '第五天营地白拉措营地'];
let startIndex = 0;
// Audit one possible compression of the recorded camps, never recommend it as feasible.
const candidateFiveDay = [...candidateNames, '轨迹终点'].map((name, day) => {
  const km = day === 4 ? stats.distM / 1000 : originalWaypoints.find(point => point.name === name)?.km;
  if (km == null) throw new Error(`Missing original camp: ${name}`);
  const endIndex = stats.cum.reduce((best, distance, index) => Math.abs(distance - km * 1000) < Math.abs(stats.cum[best] - km * 1000) ? index : best, startIndex);
  const points = stats.points.slice(startIndex, endIndex + 1);
  const segment = computeTrackStats(points);
  const reversed = computeTrackStats([...points].reverse());
  if (!segment || !reversed) throw new Error('Invalid camp sequence');
  startIndex = endIndex;
  return { day: day + 1, endpoint: name, km: segment.distM / 1000, ascentMeters: segment.ascent,
    descentMeters: reversed.ascent, minElevation: Math.min(...points.map(p => p.ele).filter(Number.isFinite)),
    maxElevation: Math.max(...points.map(p => p.ele).filter(Number.isFinite)), approved: false };
});
const groups = await db.from('timeline_groups').select('name,route_end_meters,route_location_name')
  .eq('journey_id', journeyId).eq('deleted', false).order('sort_order');
if (groups.error) throw groups.error;
let previousMeters = 0;
const boundaries = groups.data.map(group => {
  if (group.route_end_meters == null) return { day: group.name, missing: true };
  const meters = Number(group.route_end_meters);
  const dayKm = (meters - previousMeters) / 1000;
  previousMeters = meters;
  const position = endpointAtDistance(display, meters);
  let rejection: string | null = null;
  try {
    // Omit estimateBasis to test that simply hiding the estimated label cannot bypass the guard.
    validateHikingBoundary({ endDistanceKm: meters / 1000, locationName: group.route_location_name || undefined }, displayMeters, boundTrack.waypoints, []);
  } catch (error) { rejection = error instanceof Error ? error.message : 'validation failed'; }
  return { day: group.name, dayKm, cumulativeDisplayKm: meters / 1000, savedLabel: group.route_location_name,
    coordinate: position.coordinate, rejectedByNewGuard: rejection !== null, rejection };
});
const report = {
  auditedAt: new Date().toISOString(), readOnly: true, name: j.name, deleted: Boolean(j.deleted_at), days: j.total_days,
  original: { points: stats.points.length, km: stats.distM / 1000, ascentMeters: stats.ascent,
    waypoints: parsed.waypoints?.length || 0, fileName: boundTrack.file_name,
    waypointDistances: originalWaypoints.filter(point => point.name.trim()), namedWaypointOffsets },
  display: { points: display.length, km: displayMeters / 1000, exactReproductionByCurrentSampler: exactDisplayMatch,
    missingKm: (stats.distM - displayMeters) / 1000, undercountPercent: (1 - displayMeters / stats.distM) * 100 },
  storedWaypoints: boundTrack.waypoints || [], boundaries, candidateFiveDay,
  conclusion: 'NOT_APPROVED: original camp waypoints were lost on import and displayed distances are underestimated. A compressed five-day candidate still lacks validated effort, current access and water contingencies. Interpolation is not a campsite assessment.',
};
const reportPath = '/tmp/kaipa-hatian-track-validation.json';
await Deno.writeTextFile(reportPath, JSON.stringify(report, null, 2), { mode: 0o600 });
console.log(JSON.stringify({ ...report, reportPath }, null, 2));
