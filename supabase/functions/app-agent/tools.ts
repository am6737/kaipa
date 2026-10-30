import { ruralLocationProvince, geocodeKeywordLadder, matchesWaypointName } from './itinerary-geocoding.ts';
import { presentItinerary } from './itinerary-presentation.ts';
import { expandItineraryLocations } from './itinerary-locations.ts';
// @ts-ignore Deno npm specifier
import { tool } from 'npm:@openai/agents@0.16.1';
// @ts-ignore Deno npm specifier
import { z } from 'npm:zod@4.1.12';
import { guideEvidence, guideDisclosure, recordGuideGaps, type GuideLookup } from './trusted-guides.ts';
import { lookupRouteKnowledge, type RouteGuide } from '../_shared/route-guides.ts';
import type { AgentContext } from './types.ts';
import { assertCreationFacts, assertTaskPackingMode, assertTaskWrite } from './task.ts';
import { packingItem, packingPlanProfile, type PackingItem, type PackingProfile } from './packing-schema.ts';
import { draftFeedback, draftPatchSchema, newPackingDraft, patchPackingDraft, type PackingDraft, type DraftIssue } from './packing-draft.ts';
import { readPackingDraft, savePackingDraft } from './packing-draft-store.ts';
import { validateDeletionTargets } from './deletion.ts';
import { queryGroundTransport } from './search/ground-transport.ts';
import { queryTransport } from './search/transport.ts';
import { journeyDayOrdinal, resolveJourneyDay } from './journey-days.ts';
import { itineraryMinutes } from './itinerary-time.ts';
import { itineraryValidationError, validIsoDate, validateItineraryItems, validateItineraryConflicts } from './itinerary-validation.ts';
import { packingItemDisplayName, packingItemIdentityKey, packingValidationError, validatePackingItems } from './packing-validation.ts';
import { missingPackingCoverage, packingCoverageError } from './packing-coverage.ts';
import type { PackingPlanProfile } from './packing-coverage.ts';
import { dietaryConflictError, estimatePersonalPackingNeeds, isPlanningFoodItem, normalizePlanningProfile, nutritionPlanError } from './personal-planning.ts';
import { assertTrackDistanceConsistency, endpointAtDistance, normalizeTrackCoordinates, trackLengthMeters, type TrackCoordinate } from './route-endpoints.ts';
import { overnightReviewSchema, resolveHikingEndpoint, validateHikingBoundary } from './hiking-boundaries.ts';
import { haversine, isTrackFilename } from './track.ts';
import { geometryMeters, routeTrackFacts } from './track-metrics.ts';
import { officialDayEnd, officialStopKms, type PlanStop, type PlanStopRow } from './official-stops.ts';
import { loadTrackAttachment } from './attachments.ts';
import { canReplayToolResult } from './tool-replay.ts';
import { compactToolData, sanitizeSessionItem } from './session-input.ts';
import { acceptWriteVersions, contextPrompt, expectedWriteVersions, invalidateContext, journeySections, readAgentGear, readJourneySections, writeDependencies } from './context.ts';

declare const Deno: { env: { get(name: string): string | undefined } };

type Client = any;
type RunContext = { context: AgentContext };
type UndoableResult<T> = { __undoable: true; value: T; undo: Record<string, unknown> };
type JourneyMapLocation = { name: string; region: string; coord: string; lng: number; lat: number; address?: string };
type UploadedTrackData = {
  name?: string;
  fileUrl: string;
  fileName: string;
  trackCoords: [number, number][];
  trackElevation: { km: number; ele: number }[] | null;
  trackDurationMs: number | null;
  trackWaypoints: { name: string; km: number }[] | null;
  dist: string;
  asc: string | null;
  /** Library-row values; journeys store only a reference to them. */
  distM: number;
  ascM: number | null;
  pointCount: number;
  startedAt: string | null;
  start: { lng: number; lat: number };
};

const requestClients = new Map<string, Client>();
const cacheClients = new Map<string, Client>();
const journeyWrites = new Map<string, Promise<unknown>>();
// Identical replayable calls of one run that are still executing, keyed by run, tool and arguments.
const callsInFlight = new Map<string, Promise<unknown>>();

// The stage currently executing for a run, and when its budget expires.
const stageDeadlines = new Map<string, { stage: string; deadlineAt: number }>();

export function bindStageDeadline(runId: string, stage: string, deadlineAt: number) {
  stageDeadlines.set(runId, { stage, deadlineAt });
}
export function releaseStageDeadline(runId: string) {
  stageDeadlines.delete(runId);
}

// One search may not consume the stage that is waiting on it. A stage budget
// covers the whole tool loop, so an unbounded provider timeout surfaced as an
// aborted stage instead of as a slow tool: TRAVEL_SEARCH_TIMEOUT_MS reached
// 90000 against a 120000 research budget, and the research stage then hit its
// ceiling on 14 of 26 attempts with no single model call anywhere near it.
// Bound one call to a share of the stage's remaining time so the loop always
// keeps enough to synthesize what it already found.
const SEARCH_STAGE_SHARE = 0.4;
const SEARCH_FLOOR_MS = 2000;
export function stageBoundedTimeoutMs(configured: number, runId?: string) {
  const bound = runId ? stageDeadlines.get(runId) : undefined;
  if (!bound) return configured;
  return Math.max(SEARCH_FLOOR_MS, Math.min(configured, Math.round((bound.deadlineAt - Date.now()) * SEARCH_STAGE_SHARE)));
}

// A compatible provider may return a JSON string where an object is expected.
// Shared by the interactive finalizer and the stage pipeline so the two paths
// cannot drift on array/null handling.
export function parseJsonString(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function bindRunClient(runId: string, client: Client, cacheClient?: Client) {
  requestClients.set(runId, client);
  if (cacheClient) cacheClients.set(runId, cacheClient);
}
export function releaseRunClient(runId: string) {
  requestClients.delete(runId);
  cacheClients.delete(runId);
  journeyWrites.delete(runId);
  stageDeadlines.delete(runId);
}

function clientFor(runContext?: RunContext): Client {
  const runId = runContext?.context?.runId;
  const client = runId ? requestClients.get(runId) : undefined;
  if (!client) throw new Error('Agent request context is unavailable');
  return client;
}

function contextFor(runContext?: RunContext): AgentContext {
  if (!runContext?.context) throw new Error('Agent context is unavailable');
  return runContext.context;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stable(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function readExternalCache(client: Client, cacheKey: string): Promise<any | null> {
  const result = await client.rpc('read_agent_external_cache', { p_cache_key: cacheKey });
  if (result.error) throw result.error;
  return result.data ?? null;
}

async function writeExternalCache(client: Client, cacheKey: string, payload: unknown, ttlSeconds: number) {
  if (!payload || typeof payload !== 'object') return;
  const now = Date.now();
  const result = await client.rpc('write_agent_external_cache', {
    p_cache_key: cacheKey, p_payload: payload, p_ttl_seconds: ttlSeconds,
  });
  if (result.error) throw result.error;
}

function cacheClientFor(runId: string, fallback: Client): Client | null {
  return cacheClients.get(runId) || (cacheClients.has(runId) ? fallback : null);
}

function cacheTtl(name: string, fallback: number, min: number, max: number) {
  const value = Number(Deno.env.get(name));
  return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;
}

export function errorText(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try { return JSON.stringify(error); } catch { return String(error); }
}

export function railCacheTtl(departureDate: string, now = Date.now()) {
  const base = cacheTtl('RAIL_CACHE_TTL_SECONDS', 900, 1, 604800);
  const departure = Date.parse(`${departureDate}T00:00:00+08:00`);
  return departure <= now + 48 * 3600000 ? Math.min(base, 900) : base;
}





function isUndoableResult<T>(value: T | UndoableResult<T>): value is UndoableResult<T> {
  return Boolean(value && typeof value === 'object' && '__undoable' in value && value.__undoable === true);
}

function coordinateLabel(lng: number, lat: number): string {
  const latDir = lat >= 0 ? 'N' : 'S';
  const lngDir = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(5)} ${latDir}  ${Math.abs(lng).toFixed(5)} ${lngDir}`;
}

function amapWebKey() {
  return (Deno.env.get('AMAP_WEB_KEY') || '').trim();
}

function wgs84ToGcj02(lng: number, lat: number): [number, number] {
  if (lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271) return [lng, lat];
  const pi = Math.PI;
  const axis = 6378245;
  const eccentricity = 0.006693421622965943;
  const x = lng - 105;
  const y = lat - 35;
  let dLat = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  dLat += ((20 * Math.sin(6 * x * pi) + 20 * Math.sin(2 * x * pi)) * 2) / 3;
  dLat += ((20 * Math.sin(y * pi) + 40 * Math.sin((y / 3) * pi)) * 2) / 3;
  dLat += ((160 * Math.sin((y / 12) * pi) + 320 * Math.sin((y * pi) / 30)) * 2) / 3;
  let dLng = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  dLng += ((20 * Math.sin(6 * x * pi) + 20 * Math.sin(2 * x * pi)) * 2) / 3;
  dLng += ((20 * Math.sin(x * pi) + 40 * Math.sin((x / 3) * pi)) * 2) / 3;
  dLng += ((150 * Math.sin((x / 12) * pi) + 300 * Math.sin((x / 30) * pi)) * 2) / 3;
  const radLat = (lat / 180) * pi;
  let magic = Math.sin(radLat);
  magic = 1 - eccentricity * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180) / (((axis * (1 - eccentricity)) / (magic * sqrtMagic)) * pi);
  dLng = (dLng * 180) / ((axis / sqrtMagic) * Math.cos(radLat) * pi);
  return [lng + dLng, lat + dLat];
}

function gcj02ToWgs84(lng: number, lat: number): [number, number] {
  let estimate: [number, number] = [lng, lat];
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const converted = wgs84ToGcj02(estimate[0], estimate[1]);
    estimate = [estimate[0] + lng - converted[0], estimate[1] + lat - converted[1]];
  }
  return estimate;
}

/** The free web key is rate-limited per second; a throttled answer is a retry,
 * not a missing place, and must not silently cost the plan its coordinate. */
class AmapThrottledError extends Error {}

type AmapPoi = { name?: string; pname?: string; cityname?: string; adname?: string; address?: string; location?: string };

async function searchAmapPoi(key: string, keywords: string, province?: string): Promise<AmapPoi | null> {
  const params = new URLSearchParams({
    key,
    keywords,
    offset: '1',
    page: '1',
    extensions: 'base',
    citylimit: province ? 'true' : 'false',
    ...(province ? { city: province } : {}),
    language: 'zh_cn',
  });
  const response = await fetch(`https://restapi.amap.com/v3/place/text?${params.toString()}`, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error('地图定位服务暂不可用');
  const json = await response.json() as { status?: string; info?: string; pois?: AmapPoi[] };
  if (json.info === 'CUQPS_HAS_EXCEEDED_THE_LIMIT') throw new AmapThrottledError();
  const candidate = json.status === '1' ? json.pois?.[0] : null;
  // Providers can ignore the city filter. Reject a rural namesake outside
  // the journey province instead of routing the itinerary across the country.
  return candidate && (!province || candidate.pname === province) ? candidate : null;
}

async function geocodeJourneyMapLocation(query: string, province?: string): Promise<JourneyMapLocation> {
  const key = amapWebKey();
  if (!key) throw new Error('地图定位服务暂不可用');
  let poi: AmapPoi | null = null;
  for (const keywords of geocodeKeywordLadder(query)) {
    poi = await searchAmapPoi(key, keywords, province);
    if (poi) break;
  }
  if (poi) {
    const [gcjLng, gcjLat] = String(poi.location || '').split(',').map(Number);
    if (!Number.isFinite(gcjLng) || !Number.isFinite(gcjLat)) throw new Error(`没有找到「${query}」的地图坐标`);
    const [lng, lat] = gcj02ToWgs84(gcjLng, gcjLat);
    const name = poi.name || query;
    const parentValue = poi.cityname || poi.adname || poi.pname || '';
    const parent = Array.isArray(parentValue) ? parentValue.filter(Boolean).join('') : parentValue;
    const regionParts = [name, parent].filter((part, index, parts) => part && parts.indexOf(part) === index);
    return {
      name,
      address: [poi.pname, poi.cityname, poi.adname, poi.address].filter(value => typeof value === 'string').join(''),
      region: regionParts.slice(0, 2).join(' · ') || name,
      coord: coordinateLabel(lng, lat),
      lng,
      lat,
    };
  }
  // Administrative and village names live in the address geocoder rather than
  // in the POI index, so a name-only lookup is a second opinion, not a failure.
  const addressParams = new URLSearchParams({ key, address: query, ...(province ? { city: province } : {}) });
  const addressResponse = await fetch(`https://restapi.amap.com/v3/geocode/geo?${addressParams.toString()}`, { signal: AbortSignal.timeout(8000) });
  if (!addressResponse.ok) throw new Error('地图定位服务暂不可用');
  const addressJson = await addressResponse.json() as { status?: string; info?: string; geocodes?: Array<{ location?: string; formatted_address?: string; province?: string; city?: string; district?: string; level?: string }> };
  if (addressJson.info === 'CUQPS_HAS_EXCEEDED_THE_LIMIT') throw new AmapThrottledError();
  const geo = addressJson.status === '1' ? (addressJson.geocodes || []).find(entry => {
    if (province && entry.province !== province) return false;
    // The geocoder happily answers with the enclosing district, or with a
    // namesake whose stem only partly matches ("卡尔杂村" → 茂县卡尔). A coarse
    // or unmatched answer is worth less than no coordinate at all, because the
    // day's driving leg would then be planned to the wrong town.
    if (['国家', '省', '市', '区县', '特别行政区'].includes(String(entry.level))) return false;
    return Boolean(entry.formatted_address?.includes(query));
  }) : null;
  const [geoLng, geoLat] = String(geo?.location || '').split(',').map(Number);
  if (!geo || !Number.isFinite(geoLng) || !Number.isFinite(geoLat)) throw new Error(`没有找到「${query}」的地图坐标`);
  const [lng, lat] = gcj02ToWgs84(geoLng, geoLat);
  const regionParts = [geo.province, geo.city, geo.district].filter(value => typeof value === 'string' && value) as string[];
  return {
    name: query,
    address: geo.formatted_address || regionParts.join(''),
    region: [query, regionParts[1] || regionParts[0]].filter(Boolean).join(' · '),
    coord: coordinateLabel(lng, lat),
    lng,
    lat,
  };
}

async function maybeGeocodeJourneyMapLocation(query: string | undefined, province?: string): Promise<JourneyMapLocation | null> {
  const cleaned = query?.trim();
  if (!cleaned) return null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await geocodeJourneyMapLocation(cleaned, province);
    } catch (error) {
      if (!(error instanceof AmapThrottledError) || attempt === 1) {
        console.warn('Could not geocode journey location', error);
        return null;
      }
      await new Promise(resolve => setTimeout(resolve, 900));
    }
  }
  return null;
}

async function uploadedTrackForRun(client: Client, context: AgentContext, requestedName?: string): Promise<UploadedTrackData | null> {
  const message = await client
    .from('agent_messages')
    .select('ui')
    .eq('thread_id', context.threadId)
    .eq('user_id', context.userId)
    .eq('role', 'user')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (message.error) throw message.error;
  const attachments = context.attachments ?? (Array.isArray(message.data?.ui?.attachments) ? message.data.ui.attachments : []);
  const normalizedRequested = requestedName?.trim().toLocaleLowerCase();
  const trackAttachment = attachments.find((attachment: any) => {
    const name = typeof attachment?.name === 'string' ? attachment.name : '';
    if (!isTrackFilename(name)) return false;
    return !normalizedRequested || name.toLocaleLowerCase() === normalizedRequested;
  }) || null;
  if (!trackAttachment) {
    if (requestedName) throw new Error('指定的轨迹附件不存在，不能创建不带轨迹的旅程');
    return null;
  }
  return loadTrackAttachment(client, trackAttachment, context.userId);
}

// A chat attachment becomes a track library row the first time it is bound to a
// journey. Later bindings of the same file reuse that row, so two journeys
// planned from one uploaded GPX share a single track.
// A journey never carries geometry of its own; it points at a library track.
// The app materializes one when a route is imported into the library, so a
// journey created from a catalog route must do the same: without a track the
// journey has no map, and set_itinerary_group_endpoints has no waypoint index
// to resolve, which is what left multi-day plans with day titles and no
// endpoints. Reuses the user's existing copy of the same route file.
async function routeTrackId(client: Client, context: AgentContext, route: Record<string, unknown>): Promise<string | null> {
  const coords = Array.isArray(route.track_coords) ? route.track_coords : [];
  if (coords.length < 3) return null;
  const name = String(route.name);
  const fileName = typeof route.track_file_name === 'string' && route.track_file_name ? route.track_file_name : `${name}.gpx`;
  // The journey's copy of a catalog line stays out of 「我的轨迹」; the user saves
  // it there from the journey page. Only another journey's copy is reused, never
  // a library entry, which the user may rename or delete.
  const existing = await client.from('tracks').select('id').eq('user_id', context.userId).eq('in_library', false).eq('name', name).eq('file_name', fileName).limit(1).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data.id;
  const extension = fileName.split('.').pop()?.toLocaleLowerCase();
  const durationMs = Number(route.track_duration_ms);
  const inserted = await client.from('tracks').insert({
    user_id: context.userId,
    name,
    file_name: fileName,
    file_format: extension === 'kmz' || extension === 'kml' ? extension : 'gpx',
    coords,
    elevation: Array.isArray(route.track_elevation) ? route.track_elevation : null,
    duration_ms: Number.isFinite(durationMs) && durationMs > 0 ? durationMs : null,
    waypoints: Array.isArray(route.track_waypoints) ? route.track_waypoints : null,
    point_count: coords.length,
    in_library: false,
  }).select('id').single();
  if (inserted.error) throw inserted.error;
  return inserted.data.id;
}

async function libraryTrackId(client: Client, context: AgentContext, track: UploadedTrackData): Promise<string> {
  const existing = await client.from('tracks').select('id').eq('user_id', context.userId).eq('file_url', track.fileUrl).limit(1).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data.id;
  const extension = track.fileName.split('.').pop()?.toLocaleLowerCase();
  const inserted = await client.from('tracks').insert({
    user_id: context.userId,
    name: track.name || track.fileName,
    file_name: track.fileName,
    file_format: extension === 'kmz' || extension === 'kml' ? extension : 'gpx',
    file_url: track.fileUrl,
    coords: track.trackCoords,
    elevation: track.trackElevation,
    duration_ms: track.trackDurationMs,
    waypoints: track.trackWaypoints,
    dist_m: track.distM,
    asc_m: track.ascM,
    point_count: track.pointCount,
    started_at: track.startedAt,
  }).select('id').single();
  if (inserted.error) throw inserted.error;
  return inserted.data.id;
}

async function mutate<T>(toolName: string, args: unknown, runContext: RunContext | undefined, operation: (client: Client, context: AgentContext) => Promise<T | UndoableResult<T>>): Promise<T> {
  if (!canReplayToolResult(toolName)) return mutateSerialized(toolName, args, runContext, operation);
  // Models sometimes send the same call twice in one parallel batch (加两个X as
  // two identical add_gear calls). Both would pass a dedupe read before either
  // writes and share one audit row, so the twin awaits the first call's result
  // exactly as a replay of the completed call would.
  const key = `${contextFor(runContext).runId}\u0000${toolName}\u0000${stable(args)}`;
  const pending = callsInFlight.get(key);
  if (pending) return pending as Promise<T>;
  const call = mutateSerialized(toolName, args, runContext, operation);
  callsInFlight.set(key, call);
  try { return await call; } finally { callsInFlight.delete(key); }
}

async function mutateSerialized<T>(toolName: string, args: unknown, runContext: RunContext | undefined, operation: (client: Client, context: AgentContext) => Promise<T | UndoableResult<T>>): Promise<T> {
  if (!writeDependencies(toolName, (args || {}) as Record<string, unknown>).length) return mutateUnlocked(toolName, args, runContext, operation);
  const runId = contextFor(runContext).runId;
  const previous = journeyWrites.get(runId) || Promise.resolve();
  const next = previous.catch(() => {}).then(() => mutateUnlocked(toolName, args, runContext, operation));
  journeyWrites.set(runId, next);
  try { return await next; } finally { if (journeyWrites.get(runId) === next) journeyWrites.delete(runId); }
}

async function commitJourneyChange<T>(client: Client, context: AgentContext, journeyId: string, change: unknown, output: T, undo: Record<string, unknown> | null = null): Promise<T> {
  if (!context.writeReceipt) throw new Error('Missing checked write context');
  const result = await client.rpc('apply_agent_journey_change', {
    p_call_id: context.writeReceipt.callId, p_journey_id: journeyId, p_expected: context.writeReceipt.expected,
    p_change: change, p_output: output, p_undo: undo,
  });
  if (result.error) {
    if (result.error.code === 'PT409' || String(result.error.message).includes('agent_context_conflict')) {
      invalidateContext(context, journeyId);
      throw new Error('旅程数据已被修改，本次写入没有执行。重新读取所需 sections，保留最新安排后再规划；不要原样重试旧写入。');
    }
    throw result.error;
  }
  context.writeReceipt.committed = true;
  acceptWriteVersions(context, journeyId, context.writeReceipt.expected, result.data.versions);
  return result.data.output as T;
}

async function mutateUnlocked<T>(toolName: string, args: unknown, runContext: RunContext | undefined, operation: (client: Client, context: AgentContext) => Promise<T | UndoableResult<T>>): Promise<T> {
  const client = clientFor(runContext);
  const context = contextFor(runContext);
  const targetJourneyId = (args as { journeyId?: string })?.journeyId;
  assertTaskWrite(context.task, toolName, targetJourneyId);
  if (toolName === 'add_packing_items') assertTaskPackingMode(context.task, (args as { mode: 'full' | 'incremental' }).mode);
  const argumentsHash = await sha256(stable(args));
  const existing = await client.from('agent_tool_calls').select('status,output').eq('run_id', context.runId).eq('tool_name', toolName).eq('arguments_hash', argumentsHash).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data?.status === 'completed' && canReplayToolResult(toolName)) {
    if (toolName === 'create_journey' && context.task) {
      context.task.journeyId = existing.data.output.id;
      context.currentJourneyId = existing.data.output.id;
    }
    return existing.data.output as T;
  }

  // started_at is reset on every attempt while created_at is not, so the two
  // must not be conflated: this row is upserted on
  // (run_id, tool_name, arguments_hash), and a resumed attempt reuses it.
  // Deriving latency from updated_at - created_at therefore measured the span
  // across attempts, which reported 1445s for a packing write and 179s for an
  // app-context read. duration_ms below is the only trustworthy tool latency.
  const startedAt = new Date();
  const recorded = await client.from('agent_tool_calls').upsert({
    run_id: context.runId,
    thread_id: context.threadId,
    user_id: context.userId,
    tool_name: toolName,
    arguments: args,
    arguments_hash: argumentsHash,
    status: 'running',
    output: null,
    error: null,
    started_at: startedAt.toISOString(),
    duration_ms: null,
    updated_at: startedAt.toISOString(),
  }, { onConflict: 'run_id,tool_name,arguments_hash' }).select('id').single();
  if (recorded.error) throw recorded.error;

  const elapsed = () => Math.max(0, Date.now() - startedAt.getTime());

  try {
    context.dataContext ??= { versions: {}, snapshots: {}, observed: {} };
    const checked = writeDependencies(toolName, (args || {}) as Record<string, unknown>).length > 0;
    const operationContext = checked ? { ...context, writeReceipt: { callId: recorded.data.id, expected: expectedWriteVersions(context, toolName, args as Record<string, unknown>), committed: false } } : context;
    const operationResult = await operation(client, operationContext);
    const output = isUndoableResult(operationResult) ? operationResult.value : operationResult;
    if (toolName === 'create_journey' && context.task) {
      const id = (output as { id: string }).id;
      context.task.journeyId = id;
      context.currentJourneyId = id;
    }
    if (operationContext.writeReceipt?.committed) return output;
    const undoPayload = isUndoableResult(operationResult) ? operationResult.undo : null;
    const saved = await client.from('agent_tool_calls').update({ status: 'completed', output, undo_payload: undoPayload, duration_ms: elapsed(), updated_at: new Date().toISOString() }).eq('id', recorded.data.id);
    if (saved.error) throw saved.error;
    return output;
  } catch (error) {
    await client.from('agent_tool_calls').update({ status: 'failed', error: errorText(error), duration_ms: elapsed(), updated_at: new Date().toISOString() }).eq('id', recorded.data.id).neq('status', 'completed');
    throw error;
  }
}

export const itineraryLocation = z.object({
  name: z.string().min(1).max(160),
  source: z.enum(['map', 'custom']).default('custom'),
  longitude: z.number().min(-180).max(180).nullable().default(null),
  latitude: z.number().min(-90).max(90).nullable().default(null),
  address: z.string().max(300).nullable().default(null),
});

export const itineraryItem = z.object({
  day: z.string().min(1).max(40).describe('旅程日序，标准日期使用 Day 1、Day 2；只有用户明确使用自定义分组时才填写其他名称'),
  title: z.string().min(1).max(120).describe('地点、路线段、活动或交通安排，不包含解释、提醒或注意事项'),
  routeId: z.string().max(100).nullable().default(null).describe('徒步活动对应的 routes 目录 ID；普通地点或接驳安排留空'),
  timeStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().default(null).describe('24 小时制开始时间，必须使用 HH:mm，例如 04:00、13:30'),
  timeEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().default(null).describe('24 小时制结束时间，必须使用 HH:mm，例如 05:30、21:00'),
  startLocation: itineraryLocation.nullable().default(null).describe('移动安排的具体出发地点；location 填具体到达地点。系统拆成两个地点项，不能把 A→B 当作地点名称'),
  kind: z.enum(['activity', 'stay', 'custom']).default('activity'),
  location: z.object({
    name: z.string().min(1).max(160),
    incomingMode: z.enum(['rail', 'flight']).nullable().default(null).describe('到达该地点的大交通方式标记，用于识别交通到达项；普通地点间的地图路线统一使用驾车导航'),
    trackId: z.string().max(100).nullable().default(null),
    trackMeters: z.number().min(0).nullable().default(null),
    trackLengthMeters: z.number().positive().nullable().default(null),
    source: z.enum(['map', 'custom']).default('custom'),
    longitude: z.number().min(-180).max(180).nullable().default(null),
    latitude: z.number().min(-90).max(90).nullable().default(null),
    address: z.string().max(300).nullable().default(null),
  }).nullable().default(null).describe('旅程发生地点；有地图坐标时填写，交通安排也作为普通地点旅程项保存'),
});


async function loadPersonalPlanningNeeds(client: Client, context: AgentContext, journeyId: string, plan: PackingPlanProfile) {
  const [profile, journey, itinerary] = await Promise.all([
    client.from('user_planning_profiles').select('height_cm,weight_kg,age_years,dietary_restrictions').eq('user_id', context.userId).maybeSingle(),
    client.from('journeys').select('id,days,total_days,dist,asc_,tracks ( duration_ms )').eq('id', journeyId).is('deleted_at', null).single(),
    client.from('timeline_rows').select('day,time_mins,time_end_mins').eq('journey_id', journeyId),
  ]);
  if (profile.error) throw profile.error;
  if (journey.error) throw journey.error;
  if (itinerary.error) throw itinerary.error;
  // A recorded duration now lives on the journey's track, not on the journey.
  const { tracks, ...journeyFacts } = journey.data;
  return estimatePersonalPackingNeeds(normalizePlanningProfile(profile.data), { ...journeyFacts, track_duration_ms: tracks?.duration_ms ?? null }, itinerary.data || [], plan, context.task?.decision.activeHoursPerDay);
}

const itineraryDeletionTarget = z.object({
  id: z.string().min(1).max(100),
  title: z.string().min(1).max(120),
});

const packingDeletionTarget = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(120),
});

export const itineraryGroupEndpoint = z.object({
  day: z.string().min(1).max(40).describe('要设置终点的旅程组，标准日序使用 Day 1、Day 2'),
  waypointIndex: z.number().int().min(0).nullable().default(null).describe('优先使用 trackSummary.waypoints 中返回的 waypointIndex 选择真实标注点。系统读取名称和累计距离，无需抄写；此时省略 endDistanceKm 和 locationName'),
  trackFinish: z.boolean().nullable().default(null).describe('最后一天到达整条轨迹终点时设 true，并省略 waypointIndex、endDistanceKm 和 locationName'),
  endDistanceKm: z.number().positive().max(10000).nullable().default(null).describe('兼容手动累计公里数，不是当天距离。优先选择 waypointIndex 或 trackFinish 避免抄错名字/数值；禁止按天数或时长分配'),
  locationName: z.string().min(1).max(120).nullable().default(null).describe('轨迹标注点名称；没有可靠名称时省略'),
  estimateBasis: z.string().trim().min(1).max(80).nullable().default(null).describe('已停用，必须省略；暂估分段写入会被拒绝'),
  userDistanceQuote: z.string().trim().min(1).max(500).nullable().default(null).describe('仅当用户本轮明确指定某日累计公里数时，引用包含对应 km/公里数的用户原话；不是 AI 估算或泛泛的规划请求'),
  overnightReview: overnightReviewSchema.nullable().default(null).describe('可选过夜评估；无攻略证据也可保存真实轨迹候选终点，不代表已确认适合扎营或有水'),
  routeId: z.string().max(100).nullable().default(null).describe('该终点所属的目录路线 ID。多路线出行中每天属于不同路线，waypointIndex 与累计里程按该路线自己的轨迹解析；不填表示用当前旅程绑定的轨迹，纯接驳或住宿日不填'),
  officialStop: z.object({
    itineraryId: z.string().uuid(), version: z.number().int().min(1), dayIndex: z.number().int().min(0).max(30),
  }).nullable().default(null).describe('仅供服务端按已发布官方方案设置终点，模型必须省略'),
});

async function assertDeleteContext(client: Client, context: AgentContext, journeyId: string) {
  if (!context.currentJourneyId || context.currentJourneyId !== journeyId) {
    throw new Error('只能删除当前打开旅程中的项目');
  }
  // Exact IDs/titles are checked again inside the version-checked SQL transaction.
}

async function assertJourneyWriteAccess(client: Client, context: AgentContext, journeyId: string, permission: 'editTimeline' | 'editChecklist') {
  const journey = await client.from('journeys').select('id,user_id,participant_permissions').eq('id', journeyId).is('deleted_at', null).single();
  if (journey.error) throw journey.error;
  if (journey.data.user_id === context.userId) return;
  const member = await client.from('companions').select('id').eq('journey_id', journeyId).eq('user_id', context.userId).limit(1).maybeSingle();
  if (member.error) throw member.error;
  const permissions = journey.data.participant_permissions as Record<string, unknown> | null;
  if (!member.data || permissions?.[permission] !== true) throw new Error('你没有修改这个旅程的权限');
}

export const getAppContext = tool({
  name: 'get_app_context',
  description: 'Read the journey currently open in the app and the on-demand device location/status for this request. Use this when the user refers to their current location. Always use this first when the user says current journey or this journey; its currentJourneyId is authoritative.',
  parameters: z.object({}),
  execute: async (args, runContext) => mutate('get_app_context', args, runContext as RunContext, async (_client, context) => ({ currentJourneyId: context.currentJourneyId || null, currentLocation: context.currentLocation || null, dataContext: contextPrompt(context) })),
});

export const searchJourneys = tool({
  name: 'search_journeys',
  description: 'Find a different existing journey by name or region when no current journey is open. Never use this to resolve the current journey from its display title; use get_app_context instead.',
  parameters: z.object({ query: z.string().max(80).nullable().default(null) }),
  execute: async ({ query }, runContext) => mutate('search_journeys', { query }, runContext as RunContext, async (client) => {
    const columns = 'id,name,region,planned_date,date,days,total_days,dist,asc_,diff,desc';
    if (!query?.trim()) {
      const { data, error } = await client.from('journeys').select(columns).is('deleted_at', null).order('created_at', { ascending: false }).limit(30);
      if (error) throw error;
      return data || [];
    }
    const pattern = `%${query.trim()}%`;
    const [byName, byRegion] = await Promise.all([
      client.from('journeys').select(columns).is('deleted_at', null).ilike('name', pattern).limit(30),
      client.from('journeys').select(columns).is('deleted_at', null).ilike('region', pattern).limit(30),
    ]);
    if (byName.error) throw byName.error;
    if (byRegion.error) throw byRegion.error;
    return [...new Map([...(byName.data || []), ...(byRegion.data || [])].map((row: { id: string }) => [row.id, row])).values()].slice(0, 30);
  }),
});

// A chain request names several routes at once, and the model is told to make
// one focused search, so it sends them as a single string. Matching that whole
// string as one contiguous substring can never hit: no route row contains the
// names of the other two. That is why multi-route planning fell back to web
// research and then reported "未找到可直接绑定的现成路线轨迹" even though
// 党岭三湖连穿 (trk008), 雅拉温泉线 (trk065) and 桑措玉琼 (trk043) are all in
// the catalog with track data — losing the catalog means losing verified
// distance, ascent and coordinates, so the plan could not bind day endpoints
// and refused to save.
//
// Split on the separators a route list actually uses, and drop fragments too
// short to discriminate: single characters would match almost every row.
const ROUTE_TERM_SEPARATORS = /[、,，;；/+]+|\s+/;
export function routeSearchTerms(query: string): string[] {
  const terms = query.trim().split(ROUTE_TERM_SEPARATORS)
    .map(term => term.trim()).filter(term => term.length >= 2);
  return [...new Set(terms)].slice(0, 6);
}

// "这个月去哪走" names no route or region, so a name/region-only search had
// nothing to match: the model sent "中国 秋季 10月 徒步", got [] and told the
// user the catalog covered nothing, although most routes carry best_months.
// A month filter lists the catalog by season; with a query it narrows those
// matches, and when the query terms are generic words that hit no name or
// region, the month listing alone is the answer.
const MONTH_ROUTE_LIMIT = 40;

export const searchRoutes = tool({
  name: 'search_routes',
  description: 'Search the Kaipa route catalog by route name or region, and/or by month. Set month (1-12) for seasonal questions such as where to hike this month; query may then be null or a region such as 四川 or 浙江. Each route returns bestMonths, seasonNote and days (walking-day options). An empty result means no catalog match for those words, not that the catalog is empty.',
  parameters: z.object({
    query: z.string().max(80).nullable().default(null).describe('Route name(s) or region; omit generic words like 徒步, 秋季, 中国'),
    month: z.number().int().min(1).max(12).nullable().default(null).describe('Only routes whose best months include this month'),
  }),
  execute: async ({ query, month }, runContext) => mutate('search_routes', { query, month }, runContext as RunContext, async (client) => {
    const columns = 'id,name,region,dist,asc_,diff,desc,best_months,season_note,days';
    const select = () => {
      const request = client.from('routes').select(columns);
      return month ? request.contains('best_months', [month]) : request;
    };
    const text = query?.trim() || '';
    const terms = routeSearchTerms(text);
    const patterns = (terms.length ? terms : text ? [text] : []).map(term => `%${term}%`);
    // One request per term rather than an `or=` filter: route names carry
    // parentheses and full-width punctuation that PostgREST would need
    // escaped inside the filter expression.
    const results = await Promise.all([
      ...patterns.map(pattern => select().ilike('name', pattern).limit(20)),
      ...patterns.map(pattern => select().ilike('region', pattern).limit(20)),
    ]);
    const errors = results.filter((result: { error?: unknown }) => result.error);
    if (errors.length) throw errors[0].error;
    let rows = results.flatMap((result: { data?: unknown[] }) => (result.data || []) as Array<Record<string, unknown>>);
    let limit = 20;
    if (month && !rows.length) {
      const listing = await select().order('name').limit(MONTH_ROUTE_LIMIT);
      if (listing.error) throw listing.error;
      rows = listing.data || [];
      limit = MONTH_ROUTE_LIMIT;
    }
    // Earlier terms win: for a chain the first named route is the one the model
    // asked for first, and the cap has to drop the tail rather than the head.
    return [...new Map(rows.map(row => [row.id, row])).values()].slice(0, limit)
      .map(({ best_months, season_note, ...row }) => ({ ...row, bestMonths: best_months ?? null, seasonNote: season_note ?? null }));
  }),
});

export const listGear = tool({
  name: 'list_gear',
  description: 'Read the user\'s gear library and categories. Use before recommending or adding gear.',
  parameters: z.object({ query: z.string().max(80).nullable().default(null) }),
  execute: async ({ query }, runContext) => mutate('list_gear', { query }, runContext as RunContext, async (client, context) => readAgentGear(client, context, query ?? undefined)),
});

export const getJourneyDetails = tool({
  name: 'get_journey_details',
  description: 'Read only missing or changed sections of a journey. Reuse version-verified context supplied with this turn. Sections: journey (dates/region), track (cached summary, never raw coordinates), itinerary (rows/groups), packing (lists/items). Request only sections needed for this task; transport does not need packing. A full plan needs all four sections. On a write conflict, reread the affected sections before revising the plan.',
  parameters: z.object({ journeyId: z.string().min(1).max(100), sections: z.array(z.enum(journeySections)).min(1).max(4).default(['journey', 'track']) }),
  execute: async ({ journeyId, sections }, runContext) => mutate('get_journey_details', { journeyId, sections }, runContext as RunContext, async (client, context) => readJourneySections(client, context, journeyId, sections)),
});

const estimatePersonalPackingParams = z.object({
  journeyId: z.string().min(1).max(100),
  planProfile: packingPlanProfile.describe('本次旅程已知的住宿、补水、餐食与环境条件；未知项使用 unknown'),
});
export const runEstimatePersonalPacking = async (args: z.infer<typeof estimatePersonalPackingParams>, runContext?: RunContext) => mutate('estimate_personal_packing_needs', args, runContext, async (client, context) => (
  loadPersonalPlanningNeeds(client, context, args.journeyId, args.planProfile)
));
export const estimatePersonalPacking = tool({
  name: 'estimate_personal_packing_needs',
  description: 'Privately estimate practical food and carrying needs for the current user before generating a full packing list. This tool does not prescribe water quantities; assess hydration from the journey context. The result is internal planning context: use it to choose concrete item quantities, but do not quote body measurements, calories, confidence, formulas or calculations unless the user explicitly asks. Always call after get_journey_details and before add_packing_items for a full plan. Missing profile fields are allowed and must not trigger follow-up questions.',
  parameters: estimatePersonalPackingParams,
  execute: runEstimatePersonalPacking,
});

// Dependency injection keeps tests independent of concurrently curated guide data.
export function createReadRouteGuide(lookup?: GuideLookup | ((routeId: string) => RouteGuide | null)) {
  return tool({
    name: 'read_route_guide',
    description: 'Read the published team-maintained route knowledge by catalog routeId or route name. Cite its sources, including sources without links. State asOf for prices, transport and closures. If missing or not covered, say so plainly and do not estimate or invent. No live web search.',
    parameters: z.object({ routeId: z.string().min(1).max(100).nullable().default(null), name: z.string().min(1).max(120).nullable().default(null) }),
    execute: (args, runContext) => mutate('read_route_guide', args, runContext as RunContext, async (client, context) => {
      let routeId = args.routeId;
      let name = args.name || routeId || '该路线';
      if (!routeId && args.name) {
        const result = await client.from('routes').select('id,name').ilike('name', `%${args.name}%`).limit(3);
        if (result.error) throw result.error;
        const rows = result.data || [];
        const exact = rows.find((row: { name: string }) => row.name === args.name);
        const route = exact ?? (rows.length === 1 ? rows[0] : null);
        if (route) { routeId = route.id; name = route.name; }
      }
      const effectiveLookup: any = !lookup
        ? (id: string) => lookupRouteKnowledge(cacheClients.get(context.runId) || client, id)
        : lookup;
      let evidence: any;
      let guide: any = null;
      try {
        guide = routeId ? await effectiveLookup(routeId) : null;
        // Build the evidence from the same read so a mutable knowledge row is
        // not fetched twice during one tool invocation.
        evidence = guideEvidence(name, routeId, () => guide);
      } catch (error) {
        console.warn('[AppAgent] route knowledge read failed', String(error instanceof Error ? error.message : error).slice(0, 200));
        evidence = { routeName: name, routeId, markdown: '', asOf: null, sources: [], missingSections: ['*'], knowledgeReadFailed: true };
      }
      if (!evidence.knowledgeReadFailed) await recordGuideGaps(cacheClients.get(context.runId), context.runId, context.userId, context.threadId, evidence);
      return { available: !!guide, routeId, name, markdown: guide?.markdown ?? '', asOf: evidence.asOf,
        sections: guide?.sections ?? [], sources: evidence.sources, missingSections: evidence.missingSections,
        disclosure: guideDisclosure(name, evidence.missingSections, evidence.knowledgeReadFailed) };
    }),
  });
}
export const readRouteGuide = createReadRouteGuide();

export const searchRouteKnowledge = tool({
  name: 'search_route_knowledge',
  description: 'Search the published route and area knowledge base by keyword. regions must be exact catalog region strings such as "四川 · 甘孜", never a country; leave it null otherwise. This is guide text, not the route list: use search_routes to find routes. Cite returned sources and state each asOf date. If nothing is found, say so plainly and do not invent information.',
  parameters: z.object({
    query: z.string().min(1).max(240),
    routeIds: z.array(z.string().min(1).max(100)).max(30).nullable().default(null),
    regions: z.array(z.string().min(1).max(100)).max(30).nullable().default(null),
    sections: z.array(z.enum(['overview','itinerary','access','overnight','costs','water_supply','season_risk','gear','tips'])).max(9).nullable().default(null),
  }),
  execute: (args, runContext) => mutate('search_route_knowledge', args, runContext as RunContext, async (client) => {
    const result = await (cacheClients.get((runContext as RunContext).context.runId) || client).rpc('search_route_knowledge', {
      p_query: args.query, p_route_ids: args.routeIds, p_regions: args.regions, p_sections: args.sections, p_limit: 12,
    });
    if (result.error) throw result.error;
    return { query: args.query, entries: (result.data || []).map((entry: any) => ({
      id: entry.id, routeId: entry.route_id, region: entry.region, section: entry.section,
      title: entry.title, body: entry.body, sources: entry.sources || [], asOf: entry.as_of,
    })), found: Boolean(result.data?.length), disclosure: result.data?.length ? null : '知识库中没有找到相关内容，不能据此编造。' };
  }),
});

async function guideHistory(client: Client, runId: string) {
  const [calls, stage] = await Promise.all([
    client.from('agent_tool_calls').select('tool_name,status,output').eq('run_id', runId).eq('tool_name', 'read_route_guide'),
    client.from('agent_stages').select('artifact').eq('run_id', runId).eq('stage', 'research').order('attempt', { ascending: false }).limit(1),
  ]);
  if (calls.error) throw calls.error;
  if (stage.error) throw stage.error;
  const guides = stage.data?.[0]?.artifact?.guideEvidence ?? [];
  return [...(calls.data ?? []), ...guides.map((guide: { markdown: string; sources: unknown[] }) => ({
    tool_name: 'read_route_guide', status: 'completed', output: { available: !!guide.markdown, ...guide },
  }))];
}


export const searchTransport = tool({
  name: 'search_transport',
  description: 'Read-only dated rail/flight query, never community timetables. Rail uses exact Chinese station names within 15 days including today in Shanghai; default direct trains, or set viaStation for one-page two-leg connection candidates. Inspect each connection.status: buffer_met means only a conservative 45-minute same-station time floor, not guaranteed transfer or ticket access. Never recommend same_train_split, insufficient_buffer or station_change_unverified as validated transfers. Prices are per adult per leg, not through/group fares. Use earliestHour for evening returns. Flights use FlyAI when configured (verified city names or IATA city/airport codes); otherwise production Amadeus needs IATA codes. FlyAI prices are per adult, with taxes/baggage/group availability unverified. No booking; empty never means no service.',
  parameters: z.object({
    mode: z.enum(['rail', 'flight']),
    origin: z.string().min(1).max(120),
    destination: z.string().min(1).max(120),
    departureDate: z.string().refine(validIsoDate, 'Use a valid YYYY-MM-DD date'),
    adults: z.number().int().min(1).max(9).describe('Adult count used for pricing; do not treat a quote for one adult as a group total.'),
    earliestHour: z.number().int().min(0).max(23).nullable().default(null).describe('Rail only: earliest departure hour in Asia/Shanghai after allowing hike end, station transfer and boarding buffer. Null means all hours.'),
    viaStation: z.string().min(1).max(40).nullable().default(null).describe('Rail only: exact Chinese interchange arrival station to query two-leg candidates. Null means direct. Resolve a plausible hub from route context; no silent city/station substitution. Partial one-page coverage; empty is not exhaustive.'),
  }),
  execute: (args, runContext) => mutate('search_transport', args, runContext as RunContext,
    async (client) => {
      const flightProvider = Deno.env.get('FLYAI_QUERY_URL') ? 'flyai' : 'amadeus';
      const cacheKey = `transport:v2:${args.mode === 'flight' ? flightProvider : '12306'}:${await sha256(stable(args))}`;
      const cacheClient = cacheClientFor(contextFor(runContext as RunContext).runId, client);
      const cached = cacheClient ? await readExternalCache(cacheClient, cacheKey) : null;
      const fresh = args.mode !== 'rail' || (typeof cached?.cacheMeta?.observedAt === 'string'
        && Date.parse(cached.cacheMeta.observedAt) > Date.now() - railCacheTtl(args.departureDate) * 1000);
      if (fresh && (cached?.available || cached?.status === 'empty')) return { ...cached, cached: true,
        cacheMeta: { ...(cached.cacheMeta || {}), layer: 'transport', cacheHit: true } };
      const result = await queryTransport(args, name => Deno.env.get(name));
      if ((result.available || result.status === 'empty') && cacheClient) {
        const isRail = args.mode === 'rail';
        await writeExternalCache(cacheClient, cacheKey, { ...result,
          cacheMeta: { layer: 'transport', observedAt: new Date().toISOString(), cacheHit: false } },
          isRail
            ? railCacheTtl(args.departureDate)
            : cacheTtl('FLIGHT_CACHE_TTL_SECONDS', 300, 15, 3600));
      }
      return result;
    }),
});

export const runSearchTransport = (args: import('./search/transport.ts').TransportQuery, runContext: RunContext) =>
  searchTransport.invoke(runContext as never, JSON.stringify(args), undefined);

export const searchGroundTransport = tool({
  name: 'search_ground_transport',
  description: 'Query AMap driving distance, duration estimate and tolls between named places. Does not query tickets, road closures or shuttle availability.',
  parameters: z.object({ origin: z.string().min(1).max(200), destination: z.string().min(1).max(200) }),
  execute: (args, runContext) => mutate('search_ground_transport', args, runContext as RunContext,
    async () => queryGroundTransport(args, name => Deno.env.get(name))),
});
export const runSearchGroundTransport = (args: { origin: string; destination: string }, runContext: RunContext) =>
  searchGroundTransport.invoke(runContext as never, JSON.stringify(args), undefined);

export const addGear = tool({
  name: 'add_gear',
  description: 'Add one item the user already owns to their gear library. When the user names several items (添加头灯、水袋、登山鞋), call add_gear once per item in the same turn. The user\'s words are the confirmation: never ask about scenarios, budget, preferences, weight, price or brand. A stated count goes in quantity on that one call (两个Nalgene is one call with quantity 2), never repeated calls. Keep the user\'s wording (brand and model included) as the name, fill only what they stated, and leave the rest at the defaults. Use a matching categoryId from the categories given in the task input (or list_gear), or null; there is no need to read the library first. Call add_gear for every named item; an item whose name is already in the library comes back with existing=true and nothing is added, so report it as already in the library.',
  parameters: z.object({
    name: z.string().min(1).max(120),
    categoryId: z.string().max(100).nullable().default(null),
    weightKg: z.number().min(0).max(100).default(0),
    priceCny: z.number().min(0).max(10000000).default(0),
    quantity: z.number().int().min(1).max(999).default(1),
    status: z.enum(['packed', 'worn', 'consumable', 'optional']).default('packed'),
    note: z.string().max(500).nullable().default(null),
  }),
  execute: async (args, runContext) => mutate('add_gear', args, runContext as RunContext, async (client, context) => {
    // Duplicates are skipped here, not left to the model: a request whose items
    // all exist must still count as done, and must never insert a second copy.
    const key = (name: string) => name.replace(/\s+/g, '').toLocaleLowerCase();
    const [owned, category] = await Promise.all([
      client.from('gear_items').select('id,name').eq('user_id', context.userId),
      args.categoryId ? client.from('gear_categories').select('id').eq('user_id', context.userId).eq('id', args.categoryId).maybeSingle() : null,
    ]);
    if (owned.error) throw owned.error;
    if (category?.error) throw category.error;
    const match = owned.data.find((item: { name: string }) => key(item.name) === key(args.name));
    if (match) return { ...match, existing: true };
    // gear_items.price holds whole yuan.
    // A model-chosen category that is not one of the user's (a category name
    // instead of its id) files the item as uncategorized rather than failing it.
    const { data, error } = await client.from('gear_items').insert({ user_id: context.userId, name: args.name, cat_id: category?.data?.id ?? null, weight: args.weightKg, price: Math.round(args.priceCny), qty: args.quantity, status: args.status, note: args.note || null }).select('id,name').single();
    if (error) throw error;
    return data;
  }),
});

// Gear sets are read live, not through the revision-checked gear snapshot:
// set membership changes do not bump the gear revision.
export const listGearSets = tool({
  name: 'list_gear_sets',
  description: 'Read the user\'s gear sets (装备页的装备清单: reusable named lists such as 高海拔三天两夜) with the library items in each. Use before adding to or reviewing a set; match the set the user names loosely (高海拔两天 can mean 高海拔三天两夜).',
  parameters: z.object({}),
  execute: async (args, runContext) => mutate('list_gear_sets', args, runContext as RunContext, async (client, context) => {
    const { data, error } = await client.from('gear_sets')
      .select('id,name,description,gear_set_items(item_id,qty,status,gear_items(name,cat_id,owned,weight,note))')
      .eq('user_id', context.userId).order('created_at').limit(100);
    if (error) throw error;
    return {
      sets: (data || []).map((set: any) => ({
        id: set.id, name: set.name, description: set.description ?? null,
        items: (set.gear_set_items || []).map((link: any) => ({
          gearItemId: link.item_id, name: link.gear_items?.name ?? null, categoryId: link.gear_items?.cat_id ?? null,
          owned: link.gear_items?.owned !== false, quantity: link.qty ?? null, status: link.status ?? null,
          // Per-unit kg; 0 means the user never entered a weight.
          weightKg: Number(link.gear_items?.weight) || 0, note: link.gear_items?.note ?? null,
        })),
      })),
    };
  }),
});

const gearSetItem = z.object({
  gearItemId: z.number().int().positive().nullable().default(null).describe('ID of an item already in the user library (list_gear); null for gear the user does not have'),
  name: z.string().min(1).max(120).describe('Generic gear name such as 羽绒服 or 头灯, never an invented brand or model'),
  categoryId: z.string().max(100).nullable().default(null).describe('A real category id from list_gear, or null'),
  quantity: z.number().int().min(1).max(99).nullable().default(null).describe('Quantity in this set when more than one, e.g. 3 双袜子'),
  status: z.enum(['packed', 'worn', 'consumable', 'optional']).nullable().default(null).describe('Carry role in this set: worn on body, consumable (food, fuel, sunscreen), optional when it depends on the trip'),
  note: z.string().max(200).nullable().default(null),
});

export const addGearSetItems = tool({
  name: 'add_gear_set_items',
  description: 'Create a gear set or add gear to an existing one (装备页的装备清单). Additive only: never removes or changes what is already in the set. Read list_gear and list_gear_sets first. Pass setId for an existing set; pass setId=null with setName to create a set (an existing set of exactly that name is reused). Use the user library item (gearItemId) whenever the user owns a matching item; other items are saved to the library as 待购 (not owned) with no weight or price. Only add what the set is missing, in one call. A set is not a journey: never plan a trip, ask for dates or create a journey for it; ask only when several sets plausibly match. categoryId must be a real ID from list_gear; mark scenario-dependent extras optional. Reply with what was added, split into owned and to-buy.',
  parameters: z.object({
    setId: z.string().max(100).nullable().default(null),
    setName: z.string().max(200).nullable().default(null),
    description: z.string().max(300).nullable().default(null).describe('Short scenario description for a new set only'),
    items: z.array(gearSetItem).min(1).max(80),
  }),
  execute: async (args, runContext) => mutate('add_gear_set_items', args, runContext as RunContext, async (client) => {
    if (!args.setId && !args.setName?.trim()) throw new Error('add_gear_set_items needs setId for an existing set or setName for a new one.');
    const { data, error } = await client.rpc('agent_add_gear_set_items', {
      p_set_id: args.setId, p_set_name: args.setName, p_description: args.description, p_items: args.items,
    });
    if (error) {
      const message = String(error.message || '');
      if (message.includes('gear_set_not_found')) throw new Error('这个装备清单不存在或已被删除。重新调用 list_gear_sets 后再选择清单。');
      if (message.includes('gear_item_not_found')) throw new Error('gearItemId 不在用户当前的装备库里。重新调用 list_gear，只对真实存在的装备填写 gearItemId。');
      throw error;
    }
    const { undo, ...value } = data;
    return { __undoable: true, value, undo };
  }),
});

export const createJourneyParams = z.object({
  name: z.string().min(1).max(120),
  region: z.string().max(120).default(''),
  // Optional fields are nullish, not just optional: models express "absent"
  // as null, and the task decision itself stores null for "no track".
  routeId: z.string().max(100).nullable().default(null),
  trackAttachmentName: z.string().max(160).nullable().default(null).describe('Name of an uploaded GPX/KML/KMZ attachment to use as this journey track'),
  plannedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null).describe('出发日期，必须是 YYYY-MM-DD'),
  days: z.number().int().min(1).max(30).default(1),
  description: z.string().max(1000).nullable().default(null),
});
export const runCreateJourney = async (args: z.infer<typeof createJourneyParams>, runContext?: RunContext): Promise<unknown> => mutate('create_journey', args, runContext, async (client, context) => {
    if (context.currentJourneyId) {
      throw new Error('当前会话已经关联旅程，不能再次创建旅程。');
    }
    const linkedThread = await client.from('agent_threads').select('current_journey_id').eq('id', context.threadId).single();
    if (linkedThread.error) throw linkedThread.error;
    if (linkedThread.data.current_journey_id) {
      const existing = await client.from('journeys').select('id,name,region,planned_date,total_days').eq('id', linkedThread.data.current_journey_id).is('deleted_at', null).single();
      if (existing.error) throw existing.error;
      return existing.data;
    }
    assertCreationFacts(context.task, { plannedDate: args.plannedDate ?? undefined, days: args.days, trackAttachmentName: args.trackAttachmentName ?? undefined });
    if (args.plannedDate && !validIsoDate(args.plannedDate)) {
      throw new Error('出发日期不是有效的 YYYY-MM-DD 日历日期，请修正后重新调用 create_journey。');
    }
    const routeResult = args.routeId ? await client.from('routes').select('*').eq('id', args.routeId).maybeSingle() : { data: null, error: null };
    if (routeResult.error) throw routeResult.error;
    const route = routeResult.data;
    const uploadedTrack = await uploadedTrackForRun(client, context, args.trackAttachmentName ?? undefined);
    const resolvedLocation = route || uploadedTrack ? null : await maybeGeocodeJourneyMapLocation(args.region || args.name);
    const id = `j_${crypto.randomUUID()}`;
    const startLocation = uploadedTrack?.start;
    const trackId = uploadedTrack ? await libraryTrackId(client, context, uploadedTrack) : route ? await routeTrackId(client, context, route) : null;
    const journeyPayload = {
      id, user_id: context.userId, route_id: route?.id || null, name: args.name, region: args.region || route?.region || resolvedLocation?.region || uploadedTrack?.name || '',
      coord: startLocation ? coordinateLabel(startLocation.lng, startLocation.lat) : route?.coord || resolvedLocation?.coord || '',
      lng: startLocation?.lng ?? route?.lng ?? resolvedLocation?.lng ?? 0,
      lat: startLocation?.lat ?? route?.lat ?? resolvedLocation?.lat ?? 0,
      dist: uploadedTrack?.dist || route?.dist || '', asc_: uploadedTrack?.asc || route?.asc_ || '',
      diff: route?.diff || null, tone: route?.tone || 'forest', desc: args.description || route?.desc || null,
      date: args.plannedDate || null, planned_date: args.plannedDate || null, days: `${args.days} 天`, total_days: args.days,
      track_id: trackId,
    };
    const profile = await client.from('profiles').select('nick,display_name').eq('id', context.userId).single();
    const displayName = profile.data?.nick || profile.data?.display_name || '我';
    const inserted = await client.rpc('create_agent_journey', {
      p_thread_id: context.threadId, p_journey: journeyPayload,
      p_companion: { user_id: context.userId, journey_id: id, ini: displayName.slice(0, 1), name: displayName, color: '#0A84FF' },
    });
    if (inserted.error) throw inserted.error;
    return compactToolData(inserted.data);
});
export const createJourney = tool({
  name: 'create_journey',
  description: 'Create a journey after route and date requirements are understood. This does not add itinerary or packing items.',
  parameters: createJourneyParams,
  execute: runCreateJourney,
});

export const itineraryGroupNote = z.object({
  day: z.string().min(1).max(40),
  note: z.string().trim().min(1).max(1000).describe('按行程备注模板写当天 note：徒步日数据行、当天说明、交通：列表（有依据的价格/时长/预约要点）、住宿：列表（名称/类型/海拔/费用参考）、补给、下撤；Day 1 开头概览，最后一天注意事项列表和可靠费用参考。往返交通日只写简短一段和必要交通列表。不确定信息省略，不写资料来源或待核实等过程措辞；itineraryItems.title 保持简洁地点名'),
});
export const addItineraryParams = z.object({ journeyId: z.string().min(1).max(100), items: z.array(itineraryItem).min(1).max(80), groupNotes: z.array(itineraryGroupNote).max(30).default([]) });
export const runAddItinerary = async (args: z.infer<typeof addItineraryParams>, runContext?: RunContext): Promise<unknown> => mutate('add_itinerary_items', args, runContext, async (client, context) => {
    await assertJourneyWriteAccess(client, context, args.journeyId, 'editTimeline');
    const [journey, existingRows, existingGroups] = await Promise.all([
      client.from('journeys').select('total_days,region,track_id,route_id,lng,lat').eq('id', args.journeyId).single(),
      client.from('timeline_rows').select('id,day,title,time_mins,time_end_mins,item_kind,location').eq('journey_id', args.journeyId),
      client.from('timeline_groups').select('name,note,sort_order,deleted').eq('journey_id', args.journeyId),
    ]);
    if (journey.error) throw journey.error;
    if (existingRows.error) throw existingRows.error;
    if (existingGroups.error) throw existingGroups.error;
    const existingNames = [...new Set([
      ...(existingGroups.data || []).map((group: { name: string }) => group.name),
      ...(existingRows.data || []).map((row: { day: string }) => row.day),
    ].filter(Boolean))];
    const presentation = presentItinerary(expandItineraryLocations(args.items), args.groupNotes, journey.data.total_days);
    const normalizedItems = presentation.items.map((item) => ({ ...item, day: resolveJourneyDay(item.day, existingNames) }));
    const validationIssues = validateItineraryItems(normalizedItems, journey.data.total_days || undefined);
    if (validationIssues.length) throw new Error(itineraryValidationError(validationIssues));
    const existingKeys = new Set((existingRows.data || []).map((row: { day: string; title: string }) => `${resolveJourneyDay(row.day, existingNames).toLocaleLowerCase()}\u0000${row.title.trim().toLocaleLowerCase()}`));
    const uniqueItems = normalizedItems.filter((item) => !existingKeys.has(`${item.day.toLocaleLowerCase()}\u0000${item.title.trim().toLocaleLowerCase()}`));
    const notes = new Map<string, string>();
    for (const entry of presentation.groupNotes) {
      const day = resolveJourneyDay(entry.day, existingNames);
      if (notes.has(day)) throw new Error('同一个旅程组只能提交一份摘要');
      if (!normalizedItems.some(item => item.day === day)) throw new Error(`找不到摘要对应的旅程组「${day}」`);
      const existing = (existingGroups.data || []).find((group: { name: string }) => group.name === day);
      if (!existing?.note?.trim() && !existing?.deleted) notes.set(day, entry.note);
    }
    if (!uniqueItems.length && !notes.size) return { journeyId: args.journeyId, added: 0, skippedDuplicates: normalizedItems.length };
    const clock = (minutes: number | null) => minutes == null ? undefined : `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
    const conflicts = validateItineraryConflicts(uniqueItems, (existingRows.data || []).map((row: { day: string; title: string; time_mins: number | null; time_end_mins: number | null }) => ({
      day: resolveJourneyDay(row.day, existingNames), title: row.title, timeStart: clock(row.time_mins), timeEnd: clock(row.time_end_mins),
    })));
    if (conflicts.length) throw new Error(itineraryValidationError(conflicts));
    // A model-filled lat/lng is not evidence, so every place is re-resolved by the
    // server. The exception is a stop that names a waypoint on a track this journey
    // can draw: the recorded walk is better authority than the POI index, and the
    // model only ever cites the research alias (trk008), never a track uuid.
    const uuidShape = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const referenced = [...new Set(uniqueItems.flatMap(item => item.location?.trackId ? [String(item.location.trackId)] : []))];
    const aliasRefs = referenced.filter(id => !uuidShape.test(id));
    const aliasToTrack = new Map<string, string>();
    if (aliasRefs.length) {
      const aliasRoutes = await client.from('routes').select('id,name,track_file_name').in('id', aliasRefs);
      if (aliasRoutes.error) throw aliasRoutes.error;
      const routesByFile = new Map<string, string>((aliasRoutes.data || []).map((route: { id: string; name: string; track_file_name?: string | null }) =>
        [route.track_file_name || `${route.name}.gpx`, route.id] as const));
      if (routesByFile.size) {
        const aliasTracks = await client.from('tracks').select('id,file_name').eq('user_id', context.userId).in('file_name', [...routesByFile.keys()]).limit(40);
        if (aliasTracks.error) throw aliasTracks.error;
        for (const track of (aliasTracks.data || []) as Array<{ id: string; file_name: string }>) {
          const alias = routesByFile.get(track.file_name);
          if (alias) aliasToTrack.set(alias, track.id);
        }
      }
    }
    const candidateTrackIds = new Set([...referenced.filter(id => uuidShape.test(id)), ...aliasToTrack.values()]);
    if (journey.data.track_id) candidateTrackIds.add(journey.data.track_id);
    const trackWaypoints = new Map<string, Array<{ name: string; meters: number }>>();
    // Waypoint km and dist_m are the recording's stated distances, while the
    // app places a row on the stored coordinates and drops it when the length
    // it was measured against differs by more than 2%. A sampled track is
    // shorter than its stated length, so anchors move onto the geometry.
    const trackScales = new Map<string, { stated: number; geometry: number }>();
    const trackCoordinates = new Map<string, TrackCoordinate[]>();
    if (candidateTrackIds.size) {
      const anchorTracks = await client.from('tracks').select('id,waypoints,dist_m,coords').in('id', [...candidateTrackIds]);
      if (anchorTracks.error) throw anchorTracks.error;
      for (const track of anchorTracks.data || []) {
        const entries: Array<{ name: string; meters: number }> = [];
        for (const waypoint of Array.isArray(track.waypoints) ? track.waypoints : []) {
          const name = typeof waypoint?.name === 'string' ? waypoint.name.trim() : '';
          const km = Number(waypoint?.km);
          if (name && Number.isFinite(km)) entries.push({ name, meters: Math.round(km * 1000) });
        }
        trackWaypoints.set(track.id, entries);
        const coordinates = normalizeTrackCoordinates(track.coords);
        const geometry = trackLengthMeters(coordinates);
        const stated = Number(track.dist_m);
        if (geometry > 0) {
          trackScales.set(track.id, { geometry, stated: Number.isFinite(stated) && stated > 0 ? stated : geometry });
          trackCoordinates.set(track.id, coordinates);
        }
      }
    }
    // The bound route's published plans name their stops with km on this same
    // track; they are curated, so they come before recorder waypoint notes.
    const planStops = journey.data.route_id && journey.data.track_id && candidateTrackIds.has(journey.data.track_id)
      ? await client.rpc('route_itineraries_published', { p_route_id: journey.data.route_id }) : null;
    if (planStops?.error) throw planStops.error;
    const officialKms = officialStopKms((planStops?.data || []) as PlanStopRow[]);
    const confirmedAnchor = (item: typeof uniqueItems[number]) => {
      const location = item.location;
      const name = location?.name.trim();
      if (!location || !name) return null;
      const cited = location.trackId ? aliasToTrack.get(String(location.trackId)) || (uuidShape.test(String(location.trackId)) ? String(location.trackId) : null) : null;
      for (const trackId of cited ? [cited] : [...candidateTrackIds]) {
        const scale = trackScales.get(trackId);
        if (!scale) continue;
        const officialKm = trackId === journey.data.track_id ? officialKms.get(name) : undefined;
        const entries = trackWaypoints.get(trackId) || [];
        const waypoint = officialKm != null ? { name, meters: officialKm * 1000 }
          : entries.find(entry => entry.name === name) ?? entries.find(entry => matchesWaypointName(name, entry.name));
        if (!waypoint) continue;
        const claimed = officialKm == null ? location.trackMeters : null;
        const stated = typeof claimed === 'number' && Number.isFinite(claimed) && claimed >= 0 ? claimed : waypoint.meters;
        return { trackId, trackMeters: Math.round(Math.min(scale.geometry, stated / scale.stated * scale.geometry)), trackLengthMeters: Math.round(scale.geometry) };
      }
      return null;
    };
    const trustedAnchor = (item: typeof uniqueItems[number]) => Boolean(confirmedAnchor(item)) || Boolean(item.location?.address);
    const queries = [...new Set(uniqueItems.filter(item => item.location && !trustedAnchor(item) && !/→|->|住宿地点|候选营地|附近|住宿$|轨迹起点|轨迹终点/.test(item.location.name)).map(item => item.location!.name))];
    const locations = new Map<string, JourneyMapLocation | null>();
    // Two in flight keeps the batch inside the map provider's per-second quota;
    // a throttled name is retried rather than dropped.
    for (let offset = 0; offset < queries.length; offset += 2) {
      await Promise.all(queries.slice(offset, offset + 2).map(async name => locations.set(name, await maybeGeocodeJourneyMapLocation(name, ruralLocationProvince(name, journey.data.region)))));
    }
    // The POI index has no entry for many trail hamlets and answers with a
    // namesake instead (南太行's 韩口 resolves to a Jiangsu harbour, 马武寨 to
    // Beijing). A sightseeing stop far from the journey's own coordinate is that
    // namesake, and no coordinate beats a day leg driven across the country.
    // Transport rows (kind custom) start and end far away by design.
    const destination = journey.data.lng != null && journey.data.lat != null && Number.isFinite(Number(journey.data.lng)) && Number.isFinite(Number(journey.data.lat))
      ? { lon: Number(journey.data.lng), lat: Number(journey.data.lat) } : null;
    const transportNames = new Set(uniqueItems.filter(item => item.kind === 'custom' || item.location?.incomingMode).map(item => item.location?.name));
    for (const [name, resolved] of locations) {
      if (destination && resolved && !transportNames.has(name) && haversine(destination, { lon: resolved.lng, lat: resolved.lat }) > 300_000) locations.set(name, null);
    }
    const rows = uniqueItems.map((item, index) => {
      // Model coordinates never reach the timeline: a place is either anchored on
      // the walk, resolved by the map provider, or kept as a name only. A walk
      // anchor also carries the track's own point at that distance, as a place
      // picked on the track in the app does; the map chain only joins places
      // that have one.
      const resolved = item.location ? locations.get(item.location.name) ?? null : null;
      const anchor = item.location ? confirmedAnchor(item) : null;
      const point = anchor ? trackPointAt(trackCoordinates.get(anchor.trackId), anchor.trackMeters) : null;
      const location = !item.location ? null : anchor
        ? { ...item.location, longitude: point?.[0] ?? null, latitude: point?.[1] ?? null, source: 'track' as const, trackId: anchor.trackId, trackMeters: anchor.trackMeters, trackLengthMeters: anchor.trackLengthMeters }
        : resolved
          ? { ...item.location, longitude: resolved.lng, latitude: resolved.lat, address: resolved.address || null, source: 'map' as const, trackId: null, trackMeters: null, trackLengthMeters: null }
          : item.location.address
            ? { ...item.location, trackId: null, trackMeters: null, trackLengthMeters: null }
            : { ...item.location, longitude: null, latitude: null, trackId: null, trackMeters: null, trackLengthMeters: null, source: 'custom' as const };
      return {
        id: `ai_${crypto.randomUUID()}`, journey_id: args.journeyId, user_id: context.userId,
        title: item.title, day: item.day,
        time_mins: itineraryMinutes(item.timeStart) ?? null,
        time_end_mins: itineraryMinutes(item.timeEnd) ?? null,
        item_kind: item.kind ?? 'activity',
        route_id: item.kind === 'activity' ? item.routeId || null : null,
        location,
        is_synth: true, is_custom: false, checked: false, sort_order: (existingRows.data?.length || 0) + index,
      };
    });
    const groupNames = [...new Set([...uniqueItems.map((item) => item.day), ...notes.keys()])];
    const createdGroupNames = groupNames.filter((name) => !existingNames.includes(name));
    const groups = groupNames.filter(name => createdGroupNames.includes(name) || notes.has(name)).map((name, index) => ({
      journey_id: args.journeyId,
      user_id: context.userId,
      name,
      note: notes.get(name) ?? null,
      deleted: false,
      sort_order: (existingGroups.data || []).find((group: { name: string }) => group.name === name)?.sort_order ?? (journeyDayOrdinal(name) ? journeyDayOrdinal(name)! - 1 : existingNames.length + index),
      updated_at: new Date().toISOString(),
    }));
    return commitJourneyChange(client, context, args.journeyId, { rows, groups },
      { journeyId: args.journeyId, added: rows.length, groupNotesSaved: notes.size, skippedDuplicates: normalizedItems.length - rows.length },
      { kind: 'add_itinerary_items', journeyId: args.journeyId, rowIds: rows.map((row) => row.id), createdGroupNames, groupNotes: [...notes].map(([name, applied]) => ({ name, previous: (existingGroups.data || []).find((group: { name: string }) => group.name === name)?.note ?? null, applied })) },
    );
});
/** The track's own point at a distance along it; the start for 0 m. */
export function trackPointAt(coordinates: TrackCoordinate[] | undefined, meters: number): TrackCoordinate | null {
  if (!coordinates?.length || !Number.isFinite(meters)) return null;
  if (meters <= 0 || coordinates.length < 2) return coordinates[0];
  try {
    return endpointAtDistance(coordinates, meters).coordinate;
  } catch {
    return null;
  }
}
export const addItinerary = tool({
  name: 'add_itinerary_items',
  description: 'Add an executable itinerary to an existing journey. Supply one groupNotes entry per day using the itinerary-note template: supported hiking metrics, day paragraph, 交通／住宿 lists, 补给 and 下撤; Day 1 overview and final-day 注意事项／可靠费用参考. Transport-only days use a short paragraph. Omit uncertain facts and process wording; keep notes within 1000 characters by dropping whole trailing sections. Do not repeat the stop list or train/flight timetables, provider provenance, obvious advice or disclaimers. Mention a known material constraint briefly once; report unresolved feasibility issues separately, not as repeated unverified/not-included/allow-extra-time caveats in the daily note. State planned arrangements without claiming lodging is booked. Keep location and actionable item titles short. Do not create generic city lodging rows or placeholder hotels; lodging is the user’s choice unless they selected a specific hotel. Retain necessary real hiking overnight places. Preserve existing user notes. Each title must identify a specific place, route segment, activity, or transport action; never submit vague titles such as 早餐, 徒步, 游览, or 返程. Keep items in chronological order, use valid time ranges, stay within the journey day count, read journey details first, and avoid duplicates.',
  parameters: addItineraryParams,
  execute: runAddItinerary,
});

export const updateJourneyScheduleParams = z.object({
  journeyId: z.string().min(1).max(100),
  totalDays: z.number().int().min(1).max(365),
  plannedDate: z.string().nullable().default(null).describe('New journey start date YYYY-MM-DD; omit to preserve it'),
  dayAssignments: z.array(z.object({
    from: z.string().min(1).max(100).describe('Exact existing day/group name'),
    toDay: z.number().int().min(1).max(365),
  })).max(365),
});
export const runUpdateJourneySchedule = async (args: z.infer<typeof updateJourneyScheduleParams>, runContext?: RunContext): Promise<unknown> => {
  // Null from the model must mean "keep the current date", exactly like an
  // omitted field; never persist it as a cleared date. The recorded call
  // arguments must equal the change, or the database rejects it.
  const change = args.plannedDate == null ? { journeyId: args.journeyId, totalDays: args.totalDays, dayAssignments: args.dayAssignments } : args;
  return mutate('update_journey_schedule', change, runContext, async (client, context) => {
    await assertJourneyWriteAccess(client, context, args.journeyId, 'editTimeline');
    if (args.plannedDate != null && !validIsoDate(args.plannedDate)) throw new Error('出发日期必须是有效的 YYYY-MM-DD 日期');
    return commitJourneyChange(client, context, args.journeyId, change, { journeyId: args.journeyId, totalDays: args.totalDays, dayAssignments: args.dayAssignments });
  });
};
export const updateJourneySchedule = tool({
  name: 'update_journey_schedule',
  description: 'Atomically update an existing journey start date, total days, and move whole day groups without recreating items. Read journey and itinerary sections first. Supply every existing day/group name exactly once in dayAssignments, including unchanged groups; assign each a distinct target day. Preserve relative hiking order and route endpoints. Only move custom groups when the user requests it. Omit plannedDate to keep the current date. Ask only when the intended date or move is ambiguous, not for manual editing.',
  parameters: updateJourneyScheduleParams,
  execute: runUpdateJourneySchedule,
});

export const setJourneyMapLocationParams = z.object({
  journeyId: z.string().min(1).max(100),
  query: z.string().min(1).max(160).describe('Place name to geocode, for example 武功山金顶, 桂林老寨山, or 杭州西湖'),
  region: z.string().min(1).max(120).nullable().default(null).describe('Optional display region to save instead of the geocoding result'),
});
export const runSetJourneyMapLocation = async (args: z.infer<typeof setJourneyMapLocationParams>, runContext?: RunContext): Promise<unknown> => mutate('set_journey_map_location', args, runContext, async (client, context) => {
    await assertJourneyWriteAccess(client, context, args.journeyId, 'editTimeline');
    const current = await client.from('journeys').select('id,name,region,coord,lng,lat').eq('id', args.journeyId).single();
    if (current.error) throw current.error;
    const location = await geocodeJourneyMapLocation(args.query);
    const patch = {
      region: args.region?.trim() || current.data.region || location.region,
      coord: location.coord,
      lng: location.lng,
      lat: location.lat,
      updated_at: new Date().toISOString(),
    };
    const applied = { ...current.data, region: patch.region, coord: patch.coord, lng: patch.lng, lat: patch.lat };
    return commitJourneyChange(client, context, args.journeyId, patch,
      { journeyId: args.journeyId, location: applied },
      { kind: 'set_journey_map_location', journeyId: args.journeyId, previous: current.data, applied },
    );
});
export const setJourneyMapLocation = tool({
  name: 'set_journey_map_location',
  description: 'Set the journey card/map GPS location from a real place search. Use this when an AI-planned journey has no map location, default 0/0 coordinates, or the user asks to fix the journey map position. Prefer the destination, route start, main scenic area, or most specific place from the itinerary as the query.',
  parameters: setJourneyMapLocationParams,
  execute: runSetJourneyMapLocation,
});

export function resolvePackingOwner(companions: Array<{ id: number; user_id?: string | null; is_self?: boolean }>, userId: string) {
  const owner = companions.find((companion) => companion.user_id === userId)
    ?? (companions.length === 1 && !companions[0].user_id && companions[0].is_self ? companions[0] : undefined);
  if (!owner) throw new Error('无法确定你的旅程成员身份，请先加入旅程后再添加装备。');
  return owner.id;
}

type PackingArgs = { journeyId: string; mode: 'full' | 'incremental'; planProfile?: PackingProfile | null; items: PackingItem[] };

async function preparePacking(client: Client, context: AgentContext, args: PackingArgs, partial = false) {
  if (args.mode === 'full' && !args.planProfile) {
    throw new Error('mode=full 时必须提交 planProfile，未知条件请明确填写 unknown。');
  }
  const validationIssues = validatePackingItems(args.items);
  await assertJourneyWriteAccess(client, context, args.journeyId, 'editChecklist');
  const companions = await client.from('companions').select('id,user_id,is_self').eq('journey_id', args.journeyId).order('sort_order');
  if (companions.error) throw companions.error;
  const kind = 'personal';
  const ownerCompanionId = resolvePackingOwner(companions.data ?? [], context.userId);
  const listQuery = client.from('journey_packing_lists').select('id').eq('journey_id', args.journeyId).eq('kind', kind).eq('owner_companion_id', ownerCompanionId);
  const list = await listQuery.maybeSingle();
  if (list.error) throw list.error;
  const createdList = !list.data;
  const existing = list.data
    ? await client.from('journey_packing_items').select('name,category_name,quantity,attrs').eq('list_id', list.data.id)
    : { data: [], error: null };
  if (existing.error) throw existing.error;
  const prepared = args.items.map((item) => ({ ...item, displayName: packingItemDisplayName(item) }));
  const personalNeeds = !partial && args.mode === 'full' && args.planProfile
    ? await loadPersonalPlanningNeeds(client, context, args.journeyId, args.planProfile)
    : undefined;
  const existingHasFood = (existing.data || []).some((item: { name: string; category_name?: string; quantity: number }) => isPlanningFoodItem({
    name: item.name,
    categoryName: item.category_name,
    quantity: item.quantity,
  }));
  const nutritionError = personalNeeds && !existingHasFood
    ? nutritionPlanError(args.items, personalNeeds.recommendation.carriedFoodEnergyKcal)
    : undefined;
  const dietaryError = personalNeeds
    ? dietaryConflictError(personalNeeds.personalization.dietaryRestrictions, args.items)
    : undefined;
  const coverageGaps = !partial && args.mode === 'full' && args.planProfile
    ? missingPackingCoverage([
      ...(existing.data || []).map((item: { name: string; category_name?: string; quantity: number; attrs?: [string, string][] }) => ({
        name: item.name,
        categoryName: item.category_name,
        quantity: item.quantity,
        attributes: item.attrs?.map(([name, value]) => ({ name, value })),
      })),
      ...args.items,
    ], args.planProfile)
    : [];
  return { kind, ownerCompanionId, list, createdList, existing, prepared, validationIssues, coverageGaps, nutritionError, dietaryError };
}

async function executePackingItems(args: PackingArgs, runContext: RunContext | undefined, partialRevision?: number) {
  return mutate('add_packing_items', partialRevision == null ? args : { ...args, partialRevision }, runContext as RunContext, async (client, context) => {
    const { kind, ownerCompanionId, list, createdList, existing, prepared, validationIssues, coverageGaps, nutritionError, dietaryError } = await preparePacking(client, context, args, partialRevision != null);
    const errors = [validationIssues.length ? packingValidationError(validationIssues) : '', coverageGaps.length ? packingCoverageError(coverageGaps) : '', nutritionError, dietaryError].filter(Boolean);
    if (errors.length) throw new Error(errors.join('\n'));
    const listId: string = list.data?.id || crypto.randomUUID();
    const identities = new Set((existing.data || []).map((row: { name: string; quantity: number; attrs?: [string, string][] }) => packingItemIdentityKey({
      name: row.name,
      quantity: row.quantity,
      attributes: row.attrs?.map(([name, value]) => ({ name, value })),
    })));
    const unique = prepared.filter((item) => {
      const key = packingItemIdentityKey(item);
      if (identities.has(key)) return false;
      identities.add(key);
      return true;
    });
    const items = unique.map((item, index) => ({
        id: crypto.randomUUID(), name: item.displayName, category_name: item.categoryName || null,
        quantity: item.quantity, weight_kg: item.weightKg, weight_estimated: item.weightEstimated, carry_status: item.carryStatus,
        attrs: item.attributes?.map((attribute) => [attribute.name.trim(), attribute.value.trim()]) || null,
        note: null,
        packed: false, sort_order: (existing.data?.length || 0) + index,
      }));
    const itemIds = items.map((item) => item.id);
    const value = { journeyId: args.journeyId, listKind: kind, ownerCompanionId, added: unique.length, skippedDuplicates: args.items.length - unique.length };
    if (!items.length) return value;
    return commitJourneyChange(client, context, args.journeyId, { listId, createdList, kind, ownerCompanionId, items }, value,
      { kind: 'add_packing_items', journeyId: args.journeyId, listId, itemIds, createdList });
  });
}

export const addPackingItems = tool({
  name: 'add_packing_items',
  description: 'Add purchase-ready, itemized recommendations to a journey packing list. Use mode=full with planProfile for a complete plan and mode=incremental only for a few user-requested additions. Use short names, put decisive purchasing or safety specifications in attributes, and per-unit carried weight in weightKg. A full day-hike plan must include backpack, footwear, clothing, hydration, food, phone/map/GPS, backup power, lighting, rain and sun protection, disinfectant, wound covering, bandage or medical tape, blister treatment, and an emergency whistle or blanket. Split kits and meals into individual contents, but omit redundant comfort items and self-evident qualifiers. Always use the requesting user\'s personal list in both solo and group journeys. A checklist represents what that person carries; never create a shared list. Read journey details and gear first; avoid duplicates.',
  parameters: z.object({
    journeyId: z.string().min(1).max(100),
    mode: z.enum(['full', 'incremental']).describe('生成或补齐整份清单时使用 full；仅按用户要求增加少量指定物品时使用 incremental'),
    planProfile: packingPlanProfile.nullable().default(null).describe('full 模式必填；只填写从用户、旅程或可靠资料中已知的场景，未知项使用 unknown'),
    items: z.array(packingItem).min(1).max(100),
  }),
  execute: (args, runContext) => executePackingItems(args, runContext as RunContext),
});

async function validateDraft(client: Client, context: AgentContext, draft: PackingDraft) {
  assertTaskWrite(context.task, 'add_packing_items', draft.journeyId);
  const checked = await preparePacking(client, context, { journeyId: draft.journeyId, mode: 'full', planProfile: draft.planProfile, items: draft.items.map(item => item.value) });
  const foods = draft.items.filter(item => isPlanningFoodItem(item.value)).map(item => item.id);
  const issues: DraftIssue[] = checked.validationIssues.map(issue => ({ code: 'item', itemIds: [draft.items[issue.index].id], field: 'name/attributes', message: issue.message }));
  issues.push(...checked.coverageGaps.map(gap => ({ code: `coverage:${gap.key}`, itemIds: [] as string[], field: 'additions', message: gap.label })));
  if (checked.nutritionError) issues.push({ code: 'nutrition', itemIds: foods, field: 'quantity/estimatedEnergyKcalPerUnit', message: checked.nutritionError });
  if (checked.dietaryError) issues.push({ code: 'dietary', itemIds: foods, field: 'name', message: checked.dietaryError });
  return draftFeedback(draft, issues);
}

const draftLocks = new Map<string, Promise<unknown>>();
async function draftTool<T>(name: string, args: unknown, runContext: RunContext | undefined, operation: (client: Client, context: AgentContext) => Promise<T>) {
  const context = contextFor(runContext);
  assertTaskWrite(context.task, 'add_packing_items', context.task?.journeyId || undefined);
  assertTaskPackingMode(context.task, 'full');
  const previous = draftLocks.get(context.runId) || Promise.resolve();
  const next = previous.catch(() => {}).then(() => mutate(name, args, runContext, operation));
  draftLocks.set(context.runId, next);
  try { return await next; } finally { if (draftLocks.get(context.runId) === next) draftLocks.delete(context.runId); }
}

export const preparePackingDraftParams = z.object({ journeyId: z.string(), planProfile: packingPlanProfile, items: z.array(packingItem).min(1).max(100) });
export const runPreparePackingDraft = (args: z.infer<typeof preparePackingDraftParams>, runContext?: RunContext) => draftTool('prepare_packing_draft', args, runContext, async (client, context) => {
  assertTaskWrite(context.task, 'add_packing_items', args.journeyId);
  const saved = await readPackingDraft(client, context.runId);
  const draft = saved?.state || newPackingDraft(args.journeyId, args.planProfile, args.items);
  if (!saved) await savePackingDraft(context.runId, context.userId, draft);
  return validateDraft(client, context, draft);
});
export const preparePackingDraft = tool({
  name: 'prepare_packing_draft',
  description: 'Persist a complete packing proposal, not checklist items. Returns validation issues and stable IDs for only affected items. An existing draft is reused, never replaced. Read journey sections and estimate needs first.',
  parameters: preparePackingDraftParams,
  execute: runPreparePackingDraft,
});
export const readPackingDraftParams = z.object({});
export const runReadPackingDraft = (args: z.infer<typeof readPackingDraftParams>, runContext?: RunContext) => draftTool('read_packing_draft', args, runContext, async (client, context) => {
  const draft = await readPackingDraft(client, context.runId);
  return draft ? validateDraft(client, context, draft.state) : { status: 'absent' };
});
export const readPackingDraftTool = tool({
  name: 'read_packing_draft',
  description: 'Resume this run\'s durable packing draft and recheck current data. Returns only invalid items and missing categories, not the whole list. Use after recovery or revision conflict.',
  parameters: readPackingDraftParams,
  execute: runReadPackingDraft,
});
export const runRepairPackingDraft = (args: z.infer<typeof draftPatchSchema>, runContext?: RunContext) => draftTool('repair_packing_draft', args, runContext, async (client, context) => {
  const saved = await readPackingDraft(client, context.runId);
  if (!saved) throw new Error('Packing draft missing');
  assertTaskWrite(context.task, 'add_packing_items', saved.state.journeyId);
  const edit = await sha256(stable(args));
  if (saved.last_edit === edit) return validateDraft(client, context, saved.state);
  const draft = patchPackingDraft(saved.state, args);
  await savePackingDraft(context.runId, context.userId, draft, saved.state.revision, edit);
  return validateDraft(client, context, draft);
});
export const repairPackingDraft = tool({
  name: 'repair_packing_draft',
  description: 'Patch only invalid draft item fields by stable ID, or add missing items. Attribute arrays replace the affected item\'s attributes. Removals affect the draft only. Repairs are internal preparation, not user-visible checklist changes; no full-list regeneration. Revalidates the whole merged draft.',
  parameters: draftPatchSchema,
  execute: runRepairPackingDraft,
});
export const commitPackingDraftParams = z.object({ revision: z.number().int().positive() });
export const runCommitPackingDraft = (args: z.infer<typeof commitPackingDraftParams>, runContext?: RunContext) => draftTool('commit_packing_draft', args, runContext, async (client, context) => {
  const saved = await readPackingDraft(client, context.runId);
  if (!saved || saved.state.revision !== args.revision) throw new Error('draft_revision_conflict: read_packing_draft first');
  const draft = saved.state;
  assertTaskWrite(context.task, 'add_packing_items', draft.journeyId);
  const writeArgs: PackingArgs = { journeyId: draft.journeyId, mode: 'full', planProfile: draft.planProfile, items: draft.items.map(item => item.value) };
  const receipt = await client.from('agent_tool_calls').select('output').eq('run_id', context.runId).eq('tool_name', 'add_packing_items')
    .eq('arguments_hash', await sha256(stable(writeArgs))).eq('status', 'completed').maybeSingle();
  if (receipt.error) throw receipt.error;
  if (receipt.data) return receipt.data.output;
  const feedback = await validateDraft(client, context, draft);
  if (feedback.status !== 'ready') return feedback;
  return executePackingItems(writeArgs, runContext);
});

// Best-effort completion for background planning. A semantic problem in one
// draft item must not discard otherwise usable checklist entries. Invalid
// item rows are omitted; cross-list completeness (coverage/nutrition) remains
// feedback for the caller instead of blocking the write.
export const runCommitPackingDraftBestEffort = (args: z.infer<typeof commitPackingDraftParams>, runContext?: RunContext) => draftTool('commit_packing_draft_partial', args, runContext, async (client, context) => {
  const saved = await readPackingDraft(client, context.runId);
  if (!saved || saved.state.revision !== args.revision) throw new Error('draft_revision_conflict: read_packing_draft first');
  const draft = saved.state;
  const invalid = new Set(validatePackingItems(draft.items.map(item => item.value)).map(issue => issue.index));
  const usable = draft.items.filter((_, index) => !invalid.has(index)).map(item => item.value);
  if (!usable.length) return { added: 0, skippedInvalid: invalid.size };
  // Only this run's draft can skip completeness gates; the writer still
  // checks full-mode authorization and validates every retained item.
  const result = await executePackingItems({ journeyId: draft.journeyId, mode: 'full', planProfile: draft.planProfile, items: usable }, runContext, draft.revision);
  return { ...(result as Record<string, unknown>), skippedInvalid: invalid.size };
});
export const commitPackingDraft = tool({
  name: 'commit_packing_draft',
  description: 'Atomically save the current validated packing draft to the personal checklist. Supply only its revision, never repeat items. Rechecks current data and uses version-checked writes. Existing successful commit receipts are reused after recovery. When the task also authorizes delete_packing_items (a regeneration request), first delete the current personal checklist items with delete_packing_items so the committed draft replaces the old list instead of appending to it.',
  parameters: commitPackingDraftParams,
  execute: runCommitPackingDraft,
});
export const packingDraftTools = [preparePackingDraft, readPackingDraftTool, repairPackingDraft, commitPackingDraft];

export const setItineraryGroupEndpointsParams = z.object({
  journeyId: z.string().min(1).max(100),
  endpoints: z.array(itineraryGroupEndpoint).min(1).max(30),
});
const officialStopKey = (ref: { itineraryId: string; version: number; dayIndex: number }) => `${ref.itineraryId}@${ref.version}#${ref.dayIndex}`;

/** Day ends of the journey route's published plans, read back from the
 * database rather than trusted from the call, with the route's stated length
 * and its stored geometry to place them on. */
async function officialDayEnds(client: Client, routeId: string | null, endpoints: Array<{ officialStop?: { itineraryId: string; version: number; dayIndex: number } | null }>) {
  const ends = new Map<string, PlanStop & { totalKm: number; geometryMeters: number }>();
  const refs = endpoints.flatMap(endpoint => endpoint.officialStop ? [endpoint.officialStop] : []);
  if (!refs.length) return ends;
  if (!routeId) throw new Error('旅程没有绑定路线，不能按官方方案设置终点');
  const [plans, route] = await Promise.all([
    client.rpc('route_itineraries_published', { p_route_id: routeId }),
    client.from('routes').select('track_coords,track_elevation,track_waypoints').eq('id', routeId).maybeSingle(),
  ]);
  if (plans.error) throw plans.error;
  if (route.error) throw route.error;
  const facts = routeTrackFacts(route.data?.track_elevation, route.data?.track_waypoints);
  const geometry = trackLengthMeters(normalizeTrackCoordinates(route.data?.track_coords));
  if (!facts || !(geometry > 0)) throw new Error('路线缺少可用于官方方案终点的轨迹');
  for (const ref of refs) {
    const end = officialDayEnd((plans.data || []) as PlanStopRow[], ref);
    if (end) ends.set(officialStopKey(ref), { ...end, totalKm: facts.totalKm, geometryMeters: geometry });
  }
  return ends;
}

export const runSetItineraryGroupEndpoints = async (args: z.infer<typeof setItineraryGroupEndpointsParams>, runContext?: RunContext): Promise<unknown> => mutate('set_itinerary_group_endpoints', args, runContext, async (client, context) => {
    await assertJourneyWriteAccess(client, context, args.journeyId, 'editTimeline');
    const [journeyResult, groupsResult, rowsResult] = await Promise.all([
      client.from('journeys').select('id,dist,route_id,tracks ( coords, waypoints )').eq('id', args.journeyId).single(),
      client.from('timeline_groups').select('name,sort_order,route_id,route_end_meters,route_end_lng,route_end_lat,route_end_track_index,route_end_track_fraction,route_end_source,route_location_name,deleted').eq('journey_id', args.journeyId).order('sort_order'),
      client.from('timeline_rows').select('day,sort_order,item_kind,route_id').eq('journey_id', args.journeyId).order('sort_order'),
    ]);
    if (journeyResult.error) throw journeyResult.error;
    if (groupsResult.error) throw groupsResult.error;
    if (rowsResult.error) throw rowsResult.error;

    const boundTrack = journeyResult.data.tracks as { coords?: unknown; waypoints?: { name: string; km: number }[] | null } | null;
    const boundCoordinates = normalizeTrackCoordinates(boundTrack?.coords);
    // One trip is one journey and may walk several routes, each with its own
    // recorded track. A day boundary is only meaningful together with the route
    // it was measured on, so every route a call references is loaded here and
    // resolved on its own geometry; an endpoint without a route id keeps using
    // the journey's bound track, exactly as before.
    const requestedRouteIds = [...new Set(args.endpoints.flatMap(endpoint => endpoint.routeId ? [endpoint.routeId] : []))];
    const routeResult = requestedRouteIds.length
      ? await client.from('routes').select('id,name,track_coords,track_waypoints').in('id', requestedRouteIds)
      : { data: [], error: null };
    if (routeResult.error) throw routeResult.error;
    const routeTracks = new Map<string, { coordinates: [number, number][]; waypoints: { name: string; km: number }[] | null; totalMeters: number }>();
    for (const route of (routeResult.data || []) as Array<{ id: string; track_coords?: unknown; track_waypoints?: unknown }>) {
      const coordinates = normalizeTrackCoordinates(route.track_coords);
      routeTracks.set(route.id, {
        coordinates,
        waypoints: Array.isArray(route.track_waypoints) ? route.track_waypoints as { name: string; km: number }[] : null,
        totalMeters: trackLengthMeters(coordinates),
      });
    }
    const trackFor = (routeId: string | null | undefined) => {
      if (!routeId) {
        if (boundCoordinates.length < 2) throw new Error('当前旅程没有可用于设置终点的轨迹');
        return { coordinates: boundCoordinates, waypoints: boundTrack?.waypoints ?? null, totalMeters: trackLengthMeters(boundCoordinates), routeId: null as string | null };
      }
      const route = routeTracks.get(routeId);
      if (!route || route.coordinates.length < 2) throw new Error(`路线「${routeId}」没有可用于设置终点的轨迹，请改用当前旅程绑定的轨迹或不设置该日终点。`);
      return { ...route, routeId };
    };
    // The journey's own route id is the same track an untagged day resolves to,
    // so the ordering rule below does not reset between the two spellings.
    const boundRouteKey = (journeyResult.data.route_id as string | null) ?? null;
    const effectiveRouteKey = (routeId: string | null | undefined) => routeId ?? boundRouteKey;
    const officialEnds = await officialDayEnds(client, journeyResult.data.route_id ?? null, args.endpoints);
    if (!requestedRouteIds.length) {
      if (boundCoordinates.length < 2) throw new Error('当前旅程没有可用于设置终点的轨迹');
      // An official stop is converted from the route's stated km below, which
      // is exactly the comparison a sampled track fails.
      if (!args.endpoints.every(endpoint => endpoint.officialStop)) assertTrackDistanceConsistency(trackLengthMeters(boundCoordinates), journeyResult.data.dist);
    }
    const guideReceipts = args.endpoints.some(endpoint => endpoint.overnightReview)
      ? await guideHistory(client, context.runId) : [];
    const activeGroups = (groupsResult.data || []).filter((group: { deleted?: boolean }) => !group.deleted);
    const existingNames = [...new Set([
      ...activeGroups.map((group: { name: string }) => group.name),
      ...(rowsResult.data || []).map((row: { day: string }) => row.day),
    ].filter(Boolean))];
    const normalized = args.endpoints.map((endpoint) => {
      const track = trackFor(endpoint.routeId);
      if (endpoint.officialStop) {
        if (endpoint.routeId && endpoint.routeId !== journeyResult.data.route_id) throw new Error('官方方案终点只能设置在旅程绑定路线上');
        const end = officialEnds.get(officialStopKey(endpoint.officialStop));
        if (!end) throw new Error('官方方案当天没有已发布的轨迹终点');
        if (Math.abs(end.geometryMeters - track.totalMeters) / track.totalMeters > 0.02) throw new Error('当前旅程轨迹不是该官方方案所用的路线轨迹');
        const meters = end.km >= end.totalKm - 0.001 ? track.totalMeters
          : Math.max(1, geometryMeters(end.km, end.totalKm, track.totalMeters)!);
        return {
          ...endpoint, endDistanceKm: meters / 1000, locationName: end.name,
          day: resolveJourneyDay(endpoint.day, existingNames),
          position: endpointAtDistance(track.coordinates, meters),
          annotation: { source: 'waypoint' as const, locationName: end.name },
          routeId: track.routeId,
          trackTotalMeters: track.totalMeters,
        };
      }
      const resolved = resolveHikingEndpoint(endpoint, track.totalMeters, track.waypoints);
      return {
        ...resolved,
        day: resolveJourneyDay(resolved.day, existingNames),
        position: endpointAtDistance(track.coordinates, resolved.endDistanceKm * 1000),
        annotation: validateHikingBoundary(resolved, track.totalMeters, track.waypoints, guideReceipts, context.originalUserMessage),
        routeId: track.routeId,
        trackTotalMeters: track.totalMeters,
      };
    });
    if (new Set(normalized.map((endpoint) => endpoint.day)).size !== normalized.length) {
      throw new Error('同一个旅程组只能设置一个终点');
    }
    const unknown = normalized.find((endpoint) => !existingNames.includes(endpoint.day));
    if (unknown) throw new Error(`找不到旅程组「${unknown.day}」`);

    const effectiveMeters = new Map<string, number>();
    const effectiveTrack = new Map<string, string | null>();
    const trackTotals = new Map<string | null, number>();
    if (boundCoordinates.length >= 2) trackTotals.set(boundRouteKey, trackLengthMeters(boundCoordinates));
    activeGroups.forEach((group: { name: string; route_end_meters?: number | null; route_id?: string | null }) => {
      if (group.route_end_meters != null) effectiveMeters.set(group.name, Number(group.route_end_meters));
      effectiveTrack.set(group.name, effectiveRouteKey(group.route_id));
    });
    normalized.forEach((endpoint) => {
      effectiveMeters.set(endpoint.day, endpoint.position.distanceMeters);
      effectiveTrack.set(endpoint.day, effectiveRouteKey(endpoint.routeId));
      trackTotals.set(effectiveRouteKey(endpoint.routeId), endpoint.trackTotalMeters);
    });
    // Distances only increase along one track. The first day on a new route
    // legitimately restarts near zero, which is why the sequence resets when
    // the day's route changes instead of comparing across tracks.
    let previousMeters = -1;
    let previousTrack: string | null | undefined;
    for (const name of existingNames) {
      const meters = effectiveMeters.get(name);
      if (meters == null) continue;
      const track = effectiveTrack.get(name) ?? null;
      if (track !== previousTrack) { previousMeters = -1; previousTrack = track; }
      if (meters <= previousMeters + 1) throw new Error('同一路线上的旅程组终点必须按照旅程顺序递增');
      previousMeters = meters;
    }

    const sortOrders = new Map(activeGroups.map((group: { name: string; sort_order: number }) => [group.name, group.sort_order]));
    const endpointRows = normalized.map((endpoint) => ({
      journey_id: args.journeyId,
      user_id: context.userId,
      name: endpoint.day,
      route_id: endpoint.routeId ?? null,
      deleted: false,
      sort_order: sortOrders.get(endpoint.day) ?? existingNames.indexOf(endpoint.day),
      route_end_meters: endpoint.position.distanceMeters,
      route_end_lng: endpoint.position.coordinate[0],
      route_end_lat: endpoint.position.coordinate[1],
      route_end_track_index: endpoint.position.trackPointIndex,
      route_end_track_fraction: endpoint.position.trackPointFraction,
      route_end_source: endpoint.annotation.source,
      route_location_name: endpoint.annotation.locationName,
      updated_at: new Date().toISOString(),
    }));
    const value = {
      journeyId: args.journeyId,
      updated: normalized.length,
      coverage: {
        groupCount: effectiveMeters.size,
        requiredGroupCount: new Set([
          ...(rowsResult.data || []).filter((row: { item_kind?: string | null; route_id?: string | null }) => row.route_id || row.item_kind === 'activity')
            .map((row: { day: string }) => resolveJourneyDay(row.day, existingNames)),
          ...effectiveMeters.keys(),
        ]).size,
        // Reaching the end means reaching the end of that day's own route, not
        // of whichever track the journey happens to bind.
        reachesTrackEnd: [...effectiveMeters.entries()].some(([name, meters]) => {
          const total = trackTotals.get(effectiveTrack.get(name) ?? null);
          return total != null && Math.abs(meters - total) <= 1;
        }),
      },
      endpoints: normalized.map((endpoint) => ({ day: endpoint.day, endDistanceKm: endpoint.position.distanceMeters / 1000, locationName: endpoint.annotation.locationName, overnightReview: endpoint.overnightReview })),
    };
    const changedNames = new Set(normalized.map((endpoint) => endpoint.day));
    const previous = activeGroups.filter((group: { name: string }) => changedNames.has(group.name));
    const applied = endpointRows.map(({ name, route_id, route_end_meters, route_end_lng, route_end_lat, route_end_track_index, route_end_track_fraction, route_end_source, route_location_name }) => ({
      name, route_id, route_end_meters, route_end_lng, route_end_lat, route_end_track_index, route_end_track_fraction, route_end_source, route_location_name,
    }));
    return commitJourneyChange(client, context, args.journeyId, { groups: endpointRows }, value, { kind: 'set_itinerary_group_endpoints', journeyId: args.journeyId, previous, applied });
});
export const setItineraryGroupEndpoints = tool({
  name: 'set_itinerary_group_endpoints',
  description: 'Save hiking day boundaries at real track waypoints, not equal-distance or time-proportional splits. Read journey, track and itinerary first. PREFER waypointIndex from trackSummary.waypoints for intermediate stops and trackFinish=true for the finish; omit name/distance in these modes. The server resolves exact coordinates, km and name, avoiding transcription mistakes. Legacy name/distance inputs must exactly match stored waypoints. Keep calls concise: overnightReview is optional, put uncertainty and effort in itinerary items. Guide proof of overnight use is NOT required: save a candidate endpoint with an unverified camping label when absent. overnightReview and its guide source/campQuote are optional; any supplied quotes must be genuine successfully read text. Save effort, water uncertainty and carried-water fallback in itinerary descriptions. A saved boundary does not certify camping suitability or water availability. The actual track finish needs no review. Explicit user distances require userDistanceQuote. Missing real track position blocks writes, missing guide evidence does not. Preserve manual boundaries unless asked to replan.',
  parameters: setItineraryGroupEndpointsParams,
  execute: runSetItineraryGroupEndpoints,
});

export const undoLastAgentChanges = tool({
  name: 'undo_last_agent_changes',
  description: 'Undo the most recent reversible changes made by this assistant in the current conversation. Use only when the user explicitly asks to undo, revert, or take back the previous assistant changes.',
  parameters: z.object({}),
  execute: async (args, runContext) => mutate('undo_last_agent_changes', args, runContext as RunContext, async (client, context) => {
    const recentRuns = await client.from('agent_runs')
      .select('id')
      .eq('thread_id', context.threadId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(20);
    if (recentRuns.error) throw recentRuns.error;
    const runIds = (recentRuns.data || []).map((run: { id: string }) => run.id);
    if (!runIds.length) throw new Error('当前对话没有可撤销的更改');
    const reversibleCalls = await client.from('agent_tool_calls')
      .select('run_id')
      .in('run_id', runIds)
      .not('undo_payload', 'is', null)
      .is('undone_at', null);
    if (reversibleCalls.error) throw reversibleCalls.error;
    const reversibleRunIds = new Set((reversibleCalls.data || []).map((call: { run_id: string }) => call.run_id));
    const targetRunId = runIds.find((runId: string) => reversibleRunIds.has(runId));
    if (!targetRunId) throw new Error('当前对话没有可撤销的更改');
    const undone = await client.rpc('undo_agent_run', { target_run_id: targetRunId });
    if (undone.error) throw undone.error;
    return undone.data;
  }),
});

export const deleteItineraryItems = tool({
  name: 'delete_itinerary_items',
  description: 'Permanently delete selected itinerary items from the current journey. Use exact IDs/titles from a version-verified itinerary snapshot, reading sections journey/itinerary only if missing or changed. The transaction rejects concurrent changes. Never infer IDs or delete from another journey.',
  parameters: z.object({
    journeyId: z.string().min(1).max(100),
    items: z.array(itineraryDeletionTarget).min(1).max(200),
  }),
  execute: async (args, runContext) => mutate('delete_itinerary_items', args, runContext as RunContext, async (client, context) => {
    await assertDeleteContext(client, context, args.journeyId);
    const requested = args.items.map((item) => ({ id: item.id, label: item.title }));
    const requestedIds = requested.map((item) => item.id);
    const found = await client.from('timeline_rows').select('id,title').eq('journey_id', args.journeyId).in('id', requestedIds);
    if (found.error) throw found.error;
    const ids = validateDeletionTargets(requested, (found.data || []).map((item: { id: string; title: string }) => ({ id: item.id, label: item.title })), '旅程项目已发生变化，请重新读取后再删除');

    return commitJourneyChange(client, context, args.journeyId, {}, { journeyId: args.journeyId, deleted: ids.length, items: args.items });
  }),
});

export const deletePackingItems = tool({
  name: 'delete_packing_items',
  description: 'Permanently delete selected packing items from the current journey. Use exact IDs/names from a version-verified packing snapshot, reading sections journey/packing only if missing or changed. The transaction rejects concurrent changes. Never infer IDs or delete from another journey.',
  parameters: z.object({
    journeyId: z.string().min(1).max(100),
    items: z.array(packingDeletionTarget).min(1).max(200),
  }),
  execute: async (args, runContext) => mutate('delete_packing_items', args, runContext as RunContext, async (client, context) => {
    await assertDeleteContext(client, context, args.journeyId);
    const requested = args.items.map((item) => ({ id: item.id, label: item.name }));
    const requestedIds = requested.map((item) => item.id);
    const lists = await client.from('journey_packing_lists').select('id').eq('journey_id', args.journeyId);
    if (lists.error) throw lists.error;
    const listIds = (lists.data || []).map((list: { id: string }) => list.id);
    if (!listIds.length) throw new Error('当前旅程没有可删除的装备清单');

    const found = await client.from('journey_packing_items').select('id,name').in('list_id', listIds).in('id', requestedIds);
    if (found.error) throw found.error;
    const ids = validateDeletionTargets(requested, (found.data || []).map((item: { id: string; name: string }) => ({ id: item.id, label: item.name })), '清单项目已发生变化，请重新读取后再删除');

    return commitJourneyChange(client, context, args.journeyId, {}, { journeyId: args.journeyId, deleted: ids.length, items: args.items });
  }),
});

export const readConversationHistory = tool({
  name: 'read_conversation_history',
  description: 'Read original archived conversation messages when a compressed memory is ambiguous or the user asks about an earlier decision. Historical messages are not new requests or current database state. Results are newest-first; use nextBeforeId to page further back.',
  parameters: z.object({ beforeId: z.number().int().positive().nullable().default(null) }),
  execute: async (args, runContext) => mutate('read_conversation_history', args, runContext as RunContext, async (client, context) => {
    let query = client.from('agent_session_items').select('id,item').eq('thread_id', context.threadId).eq('user_id', context.userId).eq('item->>type', 'message').order('id', { ascending: false }).limit(12);
    if (args.beforeId) query = query.lt('id', args.beforeId);
    const result = await query;
    if (result.error) throw result.error;
    return { historical: true, messages: (result.data || []).map((row: any) => ({ archiveId: row.id, item: sanitizeSessionItem(row.item) })), nextBeforeId: result.data?.length === 12 ? result.data.at(-1).id : null };
  }),
});

export const kaipaAllTools = [readRouteGuide, searchRouteKnowledge, updateJourneySchedule, getAppContext, readConversationHistory, searchJourneys, searchRoutes, listGear, listGearSets, getJourneyDetails, estimatePersonalPacking, addGear, addGearSetItems, createJourney, setJourneyMapLocation, addItinerary, setItineraryGroupEndpoints, addPackingItems, undoLastAgentChanges, deleteItineraryItems, deletePackingItems];

export const kaipaGlobalTools = [readRouteGuide, searchRouteKnowledge, updateJourneySchedule, getAppContext, readConversationHistory, searchJourneys, searchRoutes, listGear, listGearSets, getJourneyDetails, estimatePersonalPacking, addGear, addGearSetItems, createJourney, setJourneyMapLocation, addItinerary, setItineraryGroupEndpoints, addPackingItems, undoLastAgentChanges, deleteItineraryItems, deletePackingItems];

export const kaipaJourneyTools = [readRouteGuide, searchRouteKnowledge, updateJourneySchedule, getAppContext, readConversationHistory, getJourneyDetails, estimatePersonalPacking, setJourneyMapLocation, addItinerary, setItineraryGroupEndpoints, addPackingItems, undoLastAgentChanges, deleteItineraryItems, deletePackingItems, listGear, listGearSets, searchJourneys, searchRoutes, addGear, addGearSetItems];
