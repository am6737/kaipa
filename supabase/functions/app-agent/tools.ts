// @ts-ignore Deno npm specifier
import { tool } from 'npm:@openai/agents@0.16.1';
// @ts-ignore Deno npm specifier
import { z } from 'npm:zod@4.1.12';
import type { AgentContext } from './types.ts';
import { assertCreationFacts, assertTaskPackingMode, assertTaskWrite } from './task.ts';
import { packingItem, packingPlanProfile, type PackingItem, type PackingProfile } from './packing-schema.ts';
import { draftFeedback, draftPatchSchema, newPackingDraft, patchPackingDraft, type PackingDraft, type DraftIssue } from './packing-draft.ts';
import { readPackingDraft, savePackingDraft } from './packing-draft-store.ts';
import { validateDeletionTargets } from './deletion.ts';
import { aggregateTravelSearch } from './search/aggregate.ts';
import { createTravelSearchProviders, travelSearchNumberSetting } from './search/registry.ts';
import { searchPurpose } from './search/routing.ts';
import { analyzeGuideImages, readGuide, publicGuideUrl, GUIDE_LIMITS, type GuideContent, type GuideObservation } from './search/guide-reader.ts';
import { queryTransport } from './search/transport.ts';
import { journeyDayOrdinal, resolveJourneyDay } from './journey-days.ts';
import { itineraryMinutes } from './itinerary-time.ts';
import { itineraryValidationError, validIsoDate, validateItineraryItems, validateItineraryConflicts } from './itinerary-validation.ts';
import { packingItemDisplayName, packingItemIdentityKey, packingValidationError, validatePackingItems } from './packing-validation.ts';
import { missingPackingCoverage, packingCoverageError } from './packing-coverage.ts';
import type { PackingPlanProfile } from './packing-coverage.ts';
import { dietaryConflictError, estimatePersonalPackingNeeds, isPlanningFoodItem, normalizePlanningProfile, nutritionPlanError } from './personal-planning.ts';
import { assertTrackDistanceConsistency, endpointAtDistance, normalizeTrackCoordinates, trackLengthMeters } from './route-endpoints.ts';
import { overnightReviewSchema, resolveHikingEndpoint, validateHikingBoundary } from './hiking-boundaries.ts';
import { isTrackFilename } from './track.ts';
import { loadTrackAttachment } from './attachments.ts';
import { canReplayToolResult } from './tool-replay.ts';
import { compactToolData, sanitizeSessionItem } from './session-input.ts';
import { acceptWriteVersions, contextPrompt, expectedWriteVersions, invalidateContext, journeySections, readAgentGear, readJourneySections, writeDependencies } from './context.ts';

declare const Deno: { env: { get(name: string): string | undefined } };

type Client = any;
type RunContext = { context: AgentContext };
type UndoableResult<T> = { __undoable: true; value: T; undo: Record<string, unknown> };
type JourneyMapLocation = { name: string; region: string; coord: string; lng: number; lat: number };
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
const travelSearches = new Map<string, Map<string, Promise<unknown>>>();
const guideReads = new Map<string, Promise<unknown>>();
const journeyWrites = new Map<string, Promise<unknown>>();

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
  travelSearches.delete(runId);
  guideReads.delete(runId);
  journeyWrites.delete(runId);
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

function needsSourceVerification(output: any): boolean {
  return Array.isArray(output?.sources) && output.sources.some((source: { errorCode?: string }) => source.errorCode === 'verification_required');
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

function errorText(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try { return JSON.stringify(error); } catch { return String(error); }
}

function knowledgeCacheTtl(topic?: string) {
  const base = cacheTtl('TRAVEL_KNOWLEDGE_CACHE_TTL_SECONDS', 15552000, 86400, 63072000);
  // Most route knowledge changes slowly. Keep operational and safety-sensitive
  // topics fresher without making evergreen route guidance miss the cache often.
  if (topic === 'safety' || topic === 'access') return Math.min(base, 604800);
  if (topic === 'season') return Math.min(base, 2592000);
  return base;
}

function knowledgeTopic(query: string, purpose: 'guide' | 'transport') {
  if (purpose === 'transport') return 'access';
  const value = query.toLocaleLowerCase();
  if (/营地|露营|住宿|扎营|客栈/.test(value)) return 'camp';
  if (/水源|补水|取水|饮水/.test(value)) return 'water';
  if (/交通|班车|接驳|进山|出山|自驾|包车|拼车/.test(value)) return 'access';
  if (/季节|月份|天气|雨季|雪季|开放/.test(value)) return 'season';
  if (/安全|风险|封闭|高反|危险|救援/.test(value)) return 'safety';
  if (/装备|穿着|物资|清单/.test(value)) return 'equipment';
  return 'route';
}

async function knowledgeCacheIdentity(client: Client, context: AgentContext, query: string, purpose: 'guide' | 'transport') {
  const normalizedQuery = query.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  const locale = /[\u3400-\u9fff]/.test(query) ? 'zh' : 'en';
  const topic = knowledgeTopic(query, purpose);
  if (!context.currentJourneyId) return { routeKey: `query:${normalizedQuery}`, topic, locale, knowledgeVersion: 'global' };
  const journey = await client.from('journeys').select('route_id,track_id,name,region')
    .eq('id', context.currentJourneyId).is('deleted_at', null).maybeSingle();
  if (journey.error) throw journey.error;
  const row = journey.data;
  const revisions = await client.from('agent_journey_revisions').select('journey,track')
    .eq('journey_id', context.currentJourneyId).maybeSingle();
  if (revisions.error) throw revisions.error;
  const routeKey = row?.route_id ? `route:${row.route_id}`
    : row?.track_id ? `track:${row.track_id}`
    : `journey:${String(row?.name || row?.region || normalizedQuery).trim().replace(/\s+/g, ' ').toLocaleLowerCase()}`;
  // Route facts can be shared, but a changed route/track must get a new key.
  // Itinerary and packing revisions are intentionally excluded: they are user
  // state, not changes to the underlying route knowledge.
  const knowledgeVersion = revisions.data
    ? `journey-${revisions.data.journey}:track-${revisions.data.track}`
    : 'unknown';
  return { routeKey, topic, locale, knowledgeVersion };
}

function cacheMetadata(identity: { routeKey: string; topic: string; locale: string; knowledgeVersion: string }, cacheHit: boolean) {
  return {
    layer: 'route_knowledge',
    routeKey: identity.routeKey,
    topic: identity.topic,
    locale: identity.locale,
    knowledgeVersion: identity.knowledgeVersion,
    observedAt: new Date().toISOString(),
    cacheHit,
  };
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

async function geocodeJourneyMapLocation(query: string, language = 'zh,en'): Promise<JourneyMapLocation> {
  const key = amapWebKey();
  if (!key) throw new Error('地图定位服务暂不可用');
  const params = new URLSearchParams({
    key,
    keywords: query,
    offset: '1',
    page: '1',
    extensions: 'base',
    citylimit: 'false',
    language: language.startsWith('en') ? 'en' : 'zh_cn',
  });
  const response = await fetch(`https://restapi.amap.com/v3/place/text?${params.toString()}`);
  if (!response.ok) throw new Error('地图定位服务暂不可用');
  const json = await response.json() as { status?: string; pois?: any[] };
  const poi = json.status === '1' ? json.pois?.[0] : null;
  const [gcjLng, gcjLat] = String(poi?.location || '').split(',').map(Number);
  if (!Number.isFinite(gcjLng) || !Number.isFinite(gcjLat)) throw new Error(`没有找到「${query}」的地图坐标`);
  const [lng, lat] = gcj02ToWgs84(gcjLng, gcjLat);
  const name = poi.name || query;
  const parentValue = poi.cityname || poi.adname || poi.pname || '';
  const parent = Array.isArray(parentValue) ? parentValue.filter(Boolean).join('') : parentValue;
  const regionParts = [name, parent].filter((part, index, parts) => part && parts.indexOf(part) === index);
  return {
    name,
    region: regionParts.slice(0, 2).join(' · ') || name,
    coord: coordinateLabel(lng, lat),
    lng,
    lat,
  };
}

async function maybeGeocodeJourneyMapLocation(query: string | undefined): Promise<JourneyMapLocation | null> {
  const cleaned = query?.trim();
  if (!cleaned) return null;
  try {
    return await geocodeJourneyMapLocation(cleaned);
  } catch (error) {
    console.warn('Could not geocode journey location', error);
    return null;
  }
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
  const existing = await client.from('tracks').select('id').eq('user_id', context.userId).eq('name', name).eq('file_name', fileName).limit(1).maybeSingle();
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
  if (existing.data?.status === 'completed' && canReplayToolResult(toolName)
    && !(toolName === 'search_travel_web' && !existing.data.output?.available && !needsSourceVerification(existing.data.output))) {
    if (toolName === 'create_journey' && context.task) {
      context.task.journeyId = existing.data.output.id;
      context.currentJourneyId = existing.data.output.id;
    }
    return existing.data.output as T;
  }

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
    updated_at: new Date().toISOString(),
  }, { onConflict: 'run_id,tool_name,arguments_hash' }).select('id').single();
  if (recorded.error) throw recorded.error;

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
    const saved = await client.from('agent_tool_calls').update({ status: 'completed', output, undo_payload: undoPayload, updated_at: new Date().toISOString() }).eq('id', recorded.data.id);
    if (saved.error) throw saved.error;
    return output;
  } catch (error) {
    await client.from('agent_tool_calls').update({ status: 'failed', error: errorText(error), updated_at: new Date().toISOString() }).eq('id', recorded.data.id).neq('status', 'completed');
    throw error;
  }
}

export const itineraryItem = z.object({
  day: z.string().min(1).max(40).describe('行程日序，标准日期使用 Day 1、Day 2；只有用户明确使用自定义分组时才填写其他名称'),
  title: z.string().min(1).max(120).describe('地点、路线段、活动或交通安排，不包含解释、提醒或注意事项'),
  routeId: z.string().max(100).nullable().default(null).describe('徒步活动对应的 routes 目录 ID；交通项留空'),
  timeStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional().describe('24 小时制开始时间，必须使用 HH:mm，例如 04:00、13:30'),
  timeEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional().describe('24 小时制结束时间，必须使用 HH:mm，例如 05:30、21:00'),
  kind: z.enum(['activity', 'transport', 'stay', 'custom']).default('activity'),
  transport: z.object({
    mode: z.enum(['car', 'taxi', 'bus', 'shuttle', 'walk', 'unknown']),
    from: z.object({ name: z.string().min(1).max(160), source: z.enum(['map', 'custom']).default('custom'), longitude: z.number().min(-180).max(180).nullable().optional(), latitude: z.number().min(-90).max(90).nullable().optional(), address: z.string().max(300).nullable().optional() }),
    to: z.object({ name: z.string().min(1).max(160), source: z.enum(['map', 'custom']).default('custom'), longitude: z.number().min(-180).max(180).nullable().optional(), latitude: z.number().min(-90).max(90).nullable().optional(), address: z.string().max(300).nullable().optional() }),
    distanceMeters: z.number().nonnegative().max(2_000_000).nullable().optional(),
    durationMinutes: z.number().int().nonnegative().max(100_000).nullable().optional(),
    // Object points keep the generated JSON Schema compatible with providers
    // that reject tuple/array item schemas in structured output.
    geometry: z.array(z.object({ longitude: z.number().min(-180).max(180), latitude: z.number().min(-90).max(90) })).max(20_000).nullable().optional(),
    status: z.enum(['verified', 'estimated', 'unknown']).default('unknown'),
    source: z.string().max(500).nullable().optional(),
    note: z.string().max(500).nullable().optional(),
  }).nullable().optional().describe('kind=transport 时填写；普通行程项省略'),
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
  day: z.string().min(1).max(40).describe('要设置终点的行程组，标准日序使用 Day 1、Day 2'),
  waypointIndex: z.number().int().min(0).nullable().optional().describe('优先使用 trackSummary.waypoints 中返回的 waypointIndex 选择真实标注点。系统读取名称和累计距离，无需抄写；此时省略 endDistanceKm 和 locationName'),
  trackFinish: z.boolean().nullable().optional().describe('最后一天到达整条轨迹终点时设 true，并省略 waypointIndex、endDistanceKm 和 locationName'),
  endDistanceKm: z.number().positive().max(10000).nullable().optional().describe('兼容手动累计公里数，不是当天距离。优先选择 waypointIndex 或 trackFinish 避免抄错名字/数值；禁止按天数或时长分配'),
  locationName: z.string().min(1).max(120).nullable().optional().describe('轨迹标注点名称；没有可靠名称时省略'),
  estimateBasis: z.string().trim().min(1).max(80).nullable().optional().describe('已停用，必须省略；暂估分段写入会被拒绝'),
  userDistanceQuote: z.string().trim().min(1).max(500).nullable().optional().describe('仅当用户本轮明确指定某日累计公里数时，引用包含对应 km/公里数的用户原话；不是 AI 估算或泛泛的规划请求'),
  overnightReview: overnightReviewSchema.nullable().optional().describe('可选过夜评估；无攻略证据也可保存真实轨迹候选终点，不代表已确认适合扎营或有水'),
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
  parameters: z.object({ query: z.string().max(80).nullable().optional() }),
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

export const searchRoutes = tool({
  name: 'search_routes',
  description: 'Search route catalog by route name or region when planning a journey.',
  parameters: z.object({ query: z.string().min(1).max(80) }),
  execute: async ({ query }, runContext) => mutate('search_routes', { query }, runContext as RunContext, async (client, context) => {
    const columns = 'id,name,region,dist,asc_,diff,desc';
    const pattern = `%${query.trim()}%`;
    const [byName, byRegion] = await Promise.all([
      client.from('routes').select(columns).ilike('name', pattern).limit(20),
      client.from('routes').select(columns).ilike('region', pattern).limit(20),
    ]);
    if (byName.error) throw byName.error;
    if (byRegion.error) throw byRegion.error;
    return [...new Map([...(byName.data || []), ...(byRegion.data || [])].map((row: { id: string }) => [row.id, row])).values()].slice(0, 20);
  }),
});

export const listGear = tool({
  name: 'list_gear',
  description: 'Read the user\'s gear library and categories. Use before recommending or adding gear.',
  parameters: z.object({ query: z.string().max(80).nullable().optional() }),
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

export const searchTravelWeb = tool({
  name: 'search_travel_web',
  description: 'Search destination guides or transport reference pages. For guides, first verify the destination against journey/track context, then make one discovery search covering the task. Further guide queries reuse that result, including after recovery: read its articles/images, do not rephrase keywords. State unresolved gaps instead of inventing facts. Use purpose=transport only for actual transport evidence; community crawlers are excluded. For dated train/flight schedules, seats and fares use search_transport first. Web pages are not live availability or ticket quotes.',
  parameters: z.object({
    query: z.string().min(2).max(200),
    purpose: z.enum(['guide', 'transport']).nullable().optional(),
  }),
  execute: async ({ query, purpose }, runContext) => {
    const resolvedPurpose = searchPurpose(query, purpose ?? undefined);
    const context = contextFor(runContext as RunContext);
    const perform = async () => {
      if (resolvedPurpose === 'guide') {
        // The staged pipeline's deterministic research collector registers its
        // fixed per-route queries in advance; those bypass the one-discovery
        // guard so every route gets its own discovery pass. All other callers
        // (the interactive loop) keep the single-search discipline.
        const planned = plannedGuideQueries.get(context.runId)?.has(query.trim().replace(/\s+/g, ' ').toLocaleLowerCase()) === true;
        const history = await guideHistory(clientFor(runContext as RunContext), context.runId);
        const previous = planned ? undefined : history.find(call => call.tool_name === 'search_travel_web' && call.status === 'completed'
          && (call.output?.purpose ?? searchPurpose(call.arguments.query || '', call.arguments.purpose)) === 'guide'
          && Array.isArray(call.output?.results));
        if (previous) return { ...previous.output, reused: true,
          nextAction: 'This task already searched for guides. No new provider request was made. Reuse these original results and already-read articles/images; do not call search again or switch purpose to evade this limit. Finish remaining work and disclose unresolved facts.' };
      }
      const searches = travelSearches.get(context.runId) || new Map<string, Promise<unknown>>();
      travelSearches.set(context.runId, searches);
      const key = `${resolvedPurpose}:${query.trim().replace(/\s+/g, ' ').toLocaleLowerCase()}`;
      const activeSearch = searches.get(key);
      if (activeSearch) return activeSearch;
      const search = mutate('search_travel_web', { query, purpose: resolvedPurpose }, runContext as RunContext, async (client, context) => {
        const getEnv = (name: string) => Deno.env.get(name);
        const history = await client.from('agent_tool_calls').select('output').eq('run_id', context.runId).eq('tool_name', 'search_travel_web').eq('status', 'completed');
        if (history.error) throw history.error;
        const blocked = new Set((history.data || []).flatMap((call: { output?: { sources?: Array<{ source: string; errorCode?: string }> } }) =>
          (call.output?.sources || []).filter(source => source.errorCode === 'verification_required').map(source => source.source)));
        const providers = createTravelSearchProviders(getEnv, resolvedPurpose).map(provider => blocked.has(provider.source)
          ? { source: provider.source, search: async () => ({ available: false, results: [], errorCode: 'verification_required' as const,
            error: 'This source requires manual browser verification. No further platform request was made in this task.' }) }
          : provider);
        const hasCrawlerSource = providers.some((provider) => provider.source === 'xhs' || provider.source === 'douyin');
        const maxResults = travelSearchNumberSetting(getEnv, 'TRAVEL_SEARCH_MAX_RESULTS', 10, 1, 30);
        const identity = await knowledgeCacheIdentity(client, context, query, resolvedPurpose);
        const cacheKey = `travel-search:v2:${await sha256(stable({ purpose: resolvedPurpose, ...identity,
          sources: providers.map(provider => provider.source).sort(), maxResults }))}`;
        const cacheClient = cacheClientFor(context.runId, client);
        const cached = cacheClient ? await readExternalCache(cacheClient, cacheKey) : null;
        if (cached?.available) return { ...cached, purpose: resolvedPurpose, cached: true,
          cacheMeta: { ...(cached.cacheMeta || {}), cacheHit: true },
          ...(resolvedPurpose === 'guide' ? { nextAction: 'Select 1-3 promising guide URLs and call read_travel_guide. This task has used its guide discovery search; do not change keywords to search again.' } : {}),
        };
        const result = await aggregateTravelSearch({
          query,
          providers,
          timeoutMs: travelSearchNumberSetting(getEnv, 'TRAVEL_SEARCH_TIMEOUT_MS', hasCrawlerSource ? 60000 : 8000, 2000, 120000),
          maxResults,
        });
        const cacheableResult = resolvedPurpose === 'guide'
          ? { ...result, cacheMeta: cacheMetadata(identity, false) }
          : result;
        if (result.available && cacheClient) await writeExternalCache(cacheClient, cacheKey, cacheableResult,
          resolvedPurpose === 'guide' ? knowledgeCacheTtl(identity.topic) : cacheTtl('TRAVEL_SEARCH_CACHE_TTL_SECONDS', 900, 60, 86400));
        return { ...cacheableResult, purpose: resolvedPurpose, ...(resolvedPurpose === 'guide' ? {
          nextAction: result.results.length
            ? 'Select 1-3 promising guide URLs and call read_travel_guide. This task has used its guide discovery search; do not change keywords to search again. Read selected images only if needed; snippets do not include image or video understanding. Finish with existing evidence and disclose missing facts.'
            : 'No usable guide results. Do not repeat near-identical queries or retry unavailable sources. Use existing evidence and state the missing facts.',
        } : {}), ...(resolvedPurpose === 'transport' ? {
          limitation: 'Reference pages only, not live schedules, fares or inventory. Check operator provenance and publication dates. No community fallback is allowed.',
          ...(!result.available ? { nextAction: 'The reference provider is unavailable. Do not rephrase or repeat searches to bypass missing access; explain the limitation and continue with clearly unverified estimates.' } : {}),
        } : {}) };
      });
      searches.set(key, search);
      void search.then(result => {
        if (!(result as { available?: boolean }).available && !needsSourceVerification(result)) searches.delete(key);
      }, () => { searches.delete(key); });
      return search;
    };
    // The journal survives worker recovery; serialization also prevents parallel rephrases.
    return resolvedPurpose === 'guide' ? guideOperation(runContext as RunContext, perform) : perform();
  },
});

// Programmatic entry point for the staged pipeline's deterministic research
// collector. It reuses the tool's own invoke path — argument parsing, journal
// receipts, provider guards and read budgets — so the pipeline cannot drift
// from the interactive code path. On a tool error the SDK's default error
// function returns an error string instead of throwing; aborts still throw.
export const runSearchTravelWeb = async (args: { query: string; purpose?: 'guide' | 'transport' | null }, runContext: RunContext): Promise<unknown> =>
  searchTravelWeb.invoke(runContext as never, JSON.stringify(args), undefined);

type GuideCall = { tool_name: string; status: string; arguments: { query?: string; purpose?: 'guide' | 'transport'; url?: string; imageIds?: number[] }; output?: any };

// Fixed per-route discovery queries registered by the staged pipeline's
// deterministic research collector. The interactive one-search guard stays in
// force for every query that was not planned in advance.
const plannedGuideQueries = new Map<string, Set<string>>();
export function allowGuideQueries(runId: string, queries: string[]): void {
  plannedGuideQueries.set(runId, new Set(queries.map(query => query.trim().replace(/\s+/g, ' ').toLocaleLowerCase())));
}
// The deterministic research collector registers the guide URLs it will read
// before reading them, the same way it registers queries: the interactive
// per-run page budget must not silently truncate a multi-route pipeline's
// evidence collection. The collector's own deadline still bounds the work.
const plannedGuideReads = new Map<string, Set<string>>();
export function allowGuideReads(runId: string, urls: string[]): void {
  const set = plannedGuideReads.get(runId) || new Set<string>();
  for (const url of urls) set.add(url);
  plannedGuideReads.set(runId, set);
}
export function clearGuideQueries(runId: string): void {
  plannedGuideQueries.delete(runId);
  plannedGuideReads.delete(runId);
}

async function guideHistory(client: Client, runId: string): Promise<GuideCall[]> {
  const result = await client.from('agent_tool_calls').select('tool_name,status,arguments,output').eq('run_id', runId)
    .in('tool_name', ['search_travel_web', 'read_travel_guide', 'read_travel_guide_images']);
  if (result.error) throw result.error;
  return result.data || [];
}

// Serialize read/vision decisions so parallel tool calls cannot evade the
// per-run budget. Journal receipts also retain the budget across recovery.
async function guideOperation<T>(runContext: RunContext, operation: () => Promise<T>): Promise<T> {
  const runId = contextFor(runContext).runId;
  const next = (guideReads.get(runId) || Promise.resolve()).catch(() => {}).then(operation);
  guideReads.set(runId, next);
  try { return await next; } finally { if (guideReads.get(runId) === next) guideReads.delete(runId); }
}

export const readTravelGuide = tool({
  name: 'read_travel_guide',
  description: 'Read the body and candidate image URLs of a selected search_travel_web result, not just its snippet. Read 1-3 promising guides from the existing search instead of searching again. Only URLs returned by this run\'s search are accepted. Images are NOT analyzed yet; choose relevant image IDs with read_travel_guide_images if text leaves important gaps. No videos or restricted-content bypass.',
  parameters: z.object({ url: z.string().min(1).max(2048) }),
  execute: ({ url: input }, runContext) => {
    const url = publicGuideUrl(input);
    return guideOperation(runContext as RunContext, () => mutate('read_travel_guide', { url }, runContext as RunContext, async (client, context) => {
      const calls = await guideHistory(client, context.runId);
      const sources = calls.filter(call => call.tool_name === 'search_travel_web' && call.status === 'completed')
        .flatMap(call => Array.isArray(call.output?.results) ? call.output.results : []);
      const source = sources.find((source: { url?: string }) => {
        try { return typeof source.url === 'string' && publicGuideUrl(source.url) === url; } catch { return false; }
      });
      if (!source) throw new Error('Select an exact URL returned by search_travel_web in this task');
      const plannedRead = plannedGuideReads.get(context.runId)?.has(url) === true;
      if (!plannedRead && new Set(calls.filter(call => call.tool_name === 'read_travel_guide').map(call => call.arguments.url)).size > GUIDE_LIMITS.pages) {
        return { available: false, status: 'budget_exhausted', url, limitation: 'Article read budget reached. Reuse existing guides and report remaining gaps; do not keep searching to bypass this limit.' };
      }
      const cacheClient = cacheClientFor(context.runId, client);
      const cacheKey = `travel-guide:v1:${await sha256(url)}`;
      const cached = cacheClient ? await readExternalCache(cacheClient, cacheKey) : null;
      if (cached?.available) return { ...cached, cached: true,
        cacheMeta: { ...(cached.cacheMeta || {}), cacheHit: true }, title: source.title, publishedAt: source.publishedAt };
      const result = await readGuide(url, name => Deno.env.get(name));
      const output = { ...result, title: source.title, publishedAt: source.publishedAt,
        results: result.available ? [{ title: source.title, url, source: source.source, publishedAt: source.publishedAt }] : [] };
      const cacheableOutput = { ...output, cacheMeta: { layer: 'guide_document', sourceUrl: url, observedAt: new Date().toISOString(), cacheHit: false } };
      if (output.available && cacheClient) await writeExternalCache(cacheClient, cacheKey, cacheableOutput, knowledgeCacheTtl());
      return cacheableOutput;
    }));
  },
});

export const runReadTravelGuide = async (args: { url: string }, runContext: RunContext): Promise<unknown> =>
  readTravelGuide.invoke(runContext as never, JSON.stringify(args), undefined);

export const readTravelGuideImages = tool({
  name: 'read_travel_guide_images',
  description: 'Read selected image IDs from a successful read_travel_guide receipt in this task. Prefer route diagrams/day tables where body text leaves a concrete gap. Returns visible text, observations, uncertainties and image/source URLs, not verified current facts. Max 4 images per call, 6 distinct images and 3 image-read batches per task. No video analysis.',
  parameters: z.object({ url: z.string().min(1).max(2048), imageIds: z.array(z.number().int().positive()).min(1).max(GUIDE_LIMITS.batch) }),
  execute: ({ url: input, imageIds }, runContext) => {
    const url = publicGuideUrl(input);
    const ids = [...new Set(imageIds)].sort((a, b) => a - b);
    return guideOperation(runContext as RunContext, () => mutate('read_travel_guide_images', { url, imageIds: ids }, runContext as RunContext, async (client, context) => {
      const calls = await guideHistory(client, context.runId);
      const page = calls.find(call => call.tool_name === 'read_travel_guide' && call.status === 'completed'
        && call.arguments.url === url && call.output?.available)?.output as GuideContent | undefined;
      if (!page) throw new Error('Read the selected guide body first; only its returned images can be analyzed');
      const images = ids.map(id => page.images.find(image => image.id === id));
      if (images.some(image => !image)) throw new Error('Select only image IDs returned for this guide');
      const imageCalls = calls.filter(call => call.tool_name === 'read_travel_guide_images');
      const attempted = new Set(imageCalls.flatMap(call => (call.arguments.imageIds || []).map(id => `${call.arguments.url}#${id}`)));
      if (imageCalls.length > 3 || attempted.size > GUIDE_LIMITS.images) {
        return { available: false, status: 'budget_exhausted', sourceUrl: url, images: [], limitation: 'Image reading budget reached. Use existing text and observations; state any unresolved gaps.' };
      }
      const cached = new Map<number, GuideObservation>();
      for (const call of imageCalls) {
        if (call.arguments.url !== url || call.status !== 'completed' || !call.output?.available) continue;
        for (const observation of call.output.images as GuideObservation[]) cached.set(observation.imageId, observation);
      }
      const pending = images.filter((image): image is NonNullable<typeof image> => Boolean(image && !cached.has(image.id)));
      if (!pending.length) return { available: true, status: 'completed', sourceUrl: url, images: ids.map(id => cached.get(id)!), cached: true,
        limitation: 'Reused image observations, not current safety verification or exact GPX distances. No video was read.' };
      const cacheClient = cacheClientFor(context.runId, client);
      const cacheKey = `travel-guide-images:v1:${await sha256(stable({ url, ids }))}`;
      const external = cacheClient ? await readExternalCache(cacheClient, cacheKey) : null;
      if (external?.available) return { ...external, cached: true };
      const result = await analyzeGuideImages(url, pending, name => Deno.env.get(name));
      const output = { ...result, images: [...ids.flatMap(id => cached.has(id) ? [cached.get(id)!] : []), ...result.images] };
      if (output.available && cacheClient) await writeExternalCache(cacheClient, cacheKey, output, knowledgeCacheTtl());
      return output;
    }));
  },
});

export const runReadTravelGuideImages = async (args: { url: string; imageIds: number[] }, runContext: RunContext): Promise<unknown> =>
  readTravelGuideImages.invoke(runContext as never, JSON.stringify(args), undefined);

export const searchTransport = tool({
  name: 'search_transport',
  description: 'Read-only dated rail/flight query, never community timetables. Rail uses exact Chinese station names within 15 days including today in Shanghai; default direct trains, or set viaStation for one-page two-leg connection candidates. Inspect each connection.status: buffer_met means only a conservative 45-minute same-station time floor, not guaranteed transfer or ticket access. Never recommend same_train_split, insufficient_buffer or station_change_unverified as validated transfers. Prices are per adult per leg, not through/group fares. Use earliestHour for evening returns. Flights need verified IATA codes and production Amadeus. No booking; empty never means no service.',
  parameters: z.object({
    mode: z.enum(['rail', 'flight']),
    origin: z.string().min(1).max(120),
    destination: z.string().min(1).max(120),
    departureDate: z.string().refine(validIsoDate, 'Use a valid YYYY-MM-DD date'),
    adults: z.number().int().min(1).max(9).describe('Adult count used for pricing; do not treat a quote for one adult as a group total.'),
    earliestHour: z.number().int().min(0).max(23).nullable().optional().describe('Rail only: earliest departure hour in Asia/Shanghai after allowing hike end, station transfer and boarding buffer. Null means all hours.'),
    viaStation: z.string().min(1).max(40).nullable().optional().describe('Rail only: exact Chinese interchange arrival station to query two-leg candidates. Null means direct. Resolve a plausible hub from route context; no silent city/station substitution. Partial one-page coverage; empty is not exhaustive.'),
  }),
  execute: (args, runContext) => mutate('search_transport', args, runContext as RunContext,
    async (client) => {
      const cacheKey = `transport:v1:${await sha256(stable(args))}`;
      const cacheClient = cacheClientFor(contextFor(runContext as RunContext).runId, client);
      const cached = cacheClient ? await readExternalCache(cacheClient, cacheKey) : null;
      if (cached?.available || cached?.status === 'empty') return { ...cached, cached: true,
        cacheMeta: { ...(cached.cacheMeta || {}), layer: 'transport', cacheHit: true } };
      const result = await queryTransport(args, name => Deno.env.get(name));
      if ((result.available || result.status === 'empty') && cacheClient) {
        const isRail = args.mode === 'rail';
        await writeExternalCache(cacheClient, cacheKey, { ...result,
          cacheMeta: { layer: 'transport', observedAt: new Date().toISOString(), cacheHit: false } },
          isRail
            ? cacheTtl('RAIL_CACHE_TTL_SECONDS', 86400, 300, 604800)
            : cacheTtl('FLIGHT_CACHE_TTL_SECONDS', 300, 15, 3600));
      }
      return result;
    }),
});

export const addGear = tool({
  name: 'add_gear',
  description: 'Add one confirmed item to the user gear library. Read categories first and use a real categoryId or null.',
  parameters: z.object({
    name: z.string().min(1).max(120),
    categoryId: z.string().max(100).nullable().optional(),
    weightKg: z.number().min(0).max(100).default(0),
    priceCny: z.number().min(0).max(10000000).default(0),
    quantity: z.number().int().min(1).max(999).default(1),
    status: z.enum(['packed', 'worn', 'consumable', 'optional']).default('packed'),
    note: z.string().max(500).nullable().optional(),
  }),
  execute: async (args, runContext) => mutate('add_gear', args, runContext as RunContext, async (client, context) => {
    const { data, error } = await client.from('gear_items').insert({ user_id: context.userId, name: args.name, cat_id: args.categoryId || null, weight: args.weightKg, price: args.priceCny, qty: args.quantity, status: args.status, note: args.note || null }).select('id,name').single();
    if (error) throw error;
    return data;
  }),
});

export const createJourneyParams = z.object({
  name: z.string().min(1).max(120),
  region: z.string().max(120).default(''),
  // Optional fields are nullish, not just optional: models express "absent"
  // as null, and the task decision itself stores null for "no track".
  routeId: z.string().max(100).nullish(),
  trackAttachmentName: z.string().max(160).nullish().describe('Name of an uploaded GPX/KML/KMZ attachment to use as this journey track'),
  plannedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish().describe('出发日期，必须是 YYYY-MM-DD'),
  days: z.number().int().min(1).max(30).default(1),
  description: z.string().max(1000).nullish(),
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

export const addItineraryParams = z.object({ journeyId: z.string().min(1).max(100), items: z.array(itineraryItem).min(1).max(80) });
export const runAddItinerary = async (args: z.infer<typeof addItineraryParams>, runContext?: RunContext): Promise<unknown> => mutate('add_itinerary_items', args, runContext, async (client, context) => {
    await assertJourneyWriteAccess(client, context, args.journeyId, 'editTimeline');
    const [journey, existingRows, existingGroups] = await Promise.all([
      client.from('journeys').select('total_days').eq('id', args.journeyId).single(),
      client.from('timeline_rows').select('id,day,title,time_mins,time_end_mins,item_kind,transport').eq('journey_id', args.journeyId),
      client.from('timeline_groups').select('name').eq('journey_id', args.journeyId),
    ]);
    if (journey.error) throw journey.error;
    if (existingRows.error) throw existingRows.error;
    if (existingGroups.error) throw existingGroups.error;
    const existingNames = [...new Set([
      ...(existingGroups.data || []).map((group: { name: string }) => group.name),
      ...(existingRows.data || []).map((row: { day: string }) => row.day),
    ].filter(Boolean))];
    const normalizedItems = args.items.map((item) => ({ ...item, day: resolveJourneyDay(item.day, existingNames) }));
    const validationIssues = validateItineraryItems(normalizedItems, journey.data.total_days || undefined);
    if (validationIssues.length) throw new Error(itineraryValidationError(validationIssues));
    const existingKeys = new Set((existingRows.data || []).map((row: { day: string; title: string }) => `${resolveJourneyDay(row.day, existingNames).toLocaleLowerCase()}\u0000${row.title.trim().toLocaleLowerCase()}`));
    const uniqueItems = normalizedItems.filter((item) => !existingKeys.has(`${item.day.toLocaleLowerCase()}\u0000${item.title.trim().toLocaleLowerCase()}`));
    if (!uniqueItems.length) return { journeyId: args.journeyId, added: 0, skippedDuplicates: args.items.length };
    const clock = (minutes: number | null) => minutes == null ? undefined : `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
    const conflicts = validateItineraryConflicts(uniqueItems, (existingRows.data || []).map((row: { day: string; title: string; time_mins: number | null; time_end_mins: number | null }) => ({
      day: resolveJourneyDay(row.day, existingNames), title: row.title, timeStart: clock(row.time_mins), timeEnd: clock(row.time_end_mins),
    })));
    if (conflicts.length) throw new Error(itineraryValidationError(conflicts));
    const rows = uniqueItems.map((item, index) => ({
      id: `ai_${crypto.randomUUID()}`, journey_id: args.journeyId, user_id: context.userId,
      title: item.title, day: item.day,
      time_mins: itineraryMinutes(item.timeStart) ?? null,
      time_end_mins: itineraryMinutes(item.timeEnd) ?? null,
      item_kind: item.kind ?? 'activity',
      route_id: item.kind === 'activity' ? item.routeId || null : null,
      transport: item.kind === 'transport' && item.transport ? {
        ...item.transport,
        geometry: item.transport.geometry?.map((point) => [point.longitude, point.latitude]),
      } : null,
      is_synth: true, is_custom: false, checked: false, sort_order: (existingRows.data?.length || 0) + index,
    }));
    const groupNames = [...new Set(uniqueItems.map((item) => item.day))];
    const createdGroupNames = groupNames.filter((name) => !existingNames.includes(name));
    const groups = createdGroupNames.map((name, index) => ({
      journey_id: args.journeyId,
      user_id: context.userId,
      name,
      deleted: false,
      sort_order: journeyDayOrdinal(name) ? journeyDayOrdinal(name)! - 1 : existingNames.length + index,
      updated_at: new Date().toISOString(),
    }));
    return commitJourneyChange(client, context, args.journeyId, { rows, groups },
      { journeyId: args.journeyId, added: rows.length, skippedDuplicates: args.items.length - rows.length },
      { kind: 'add_itinerary_items', journeyId: args.journeyId, rowIds: rows.map((row) => row.id), createdGroupNames },
    );
});
export const addItinerary = tool({
  name: 'add_itinerary_items',
  description: 'Add an executable itinerary to an existing journey. Each title must identify a specific place, route segment, activity, or transport action; never submit vague titles such as 早餐, 徒步, 游览, or 返程. Keep items in chronological order, use valid time ranges, stay within the journey day count, read journey details first, and avoid duplicates.',
  parameters: addItineraryParams,
  execute: runAddItinerary,
});

export const updateJourneyScheduleParams = z.object({
  journeyId: z.string().min(1).max(100),
  totalDays: z.number().int().min(1).max(365),
  plannedDate: z.string().nullable().optional().describe('New journey start date YYYY-MM-DD; omit to preserve it'),
  dayAssignments: z.array(z.object({
    from: z.string().min(1).max(100).describe('Exact existing day/group name'),
    toDay: z.number().int().min(1).max(365),
  })).max(365),
});
export const runUpdateJourneySchedule = async (args: z.infer<typeof updateJourneyScheduleParams>, runContext?: RunContext): Promise<unknown> => mutate('update_journey_schedule', args, runContext, async (client, context) => {
  await assertJourneyWriteAccess(client, context, args.journeyId, 'editTimeline');
  if (args.plannedDate != null && !validIsoDate(args.plannedDate)) throw new Error('出发日期必须是有效的 YYYY-MM-DD 日期');
  // Null from the model must mean "keep the current date", exactly like an
  // omitted field; never persist it as a cleared date.
  const change = args.plannedDate == null ? { journeyId: args.journeyId, totalDays: args.totalDays, dayAssignments: args.dayAssignments } : args;
  return commitJourneyChange(client, context, args.journeyId, change, { journeyId: args.journeyId, totalDays: args.totalDays, dayAssignments: args.dayAssignments });
});
export const updateJourneySchedule = tool({
  name: 'update_journey_schedule',
  description: 'Atomically update an existing journey start date, total days, and move whole day groups without recreating items. Read journey and itinerary sections first. Supply every existing day/group name exactly once in dayAssignments, including unchanged groups; assign each a distinct target day. Preserve relative hiking order and route endpoints. Only move custom groups when the user requests it. Omit plannedDate to keep the current date. Ask only when the intended date or move is ambiguous, not for manual editing.',
  parameters: updateJourneyScheduleParams,
  execute: runUpdateJourneySchedule,
});

export const setJourneyMapLocationParams = z.object({
  journeyId: z.string().min(1).max(100),
  query: z.string().min(1).max(160).describe('Place name to geocode, for example 武功山金顶, 桂林老寨山, or 杭州西湖'),
  region: z.string().min(1).max(120).nullable().optional().describe('Optional display region to save instead of the geocoding result'),
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

async function preparePacking(client: Client, context: AgentContext, args: PackingArgs) {
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
  const personalNeeds = args.mode === 'full' && args.planProfile
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
  const coverageGaps = args.mode === 'full' && args.planProfile
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

async function executePackingItems(args: PackingArgs, runContext: RunContext | undefined) {
  return mutate('add_packing_items', args, runContext as RunContext, async (client, context) => {
    const { kind, ownerCompanionId, list, createdList, existing, prepared, validationIssues, coverageGaps, nutritionError, dietaryError } = await preparePacking(client, context, args);
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
    planProfile: packingPlanProfile.nullable().optional().describe('full 模式必填；只填写从用户、旅程或可靠资料中已知的场景，未知项使用 unknown'),
    items: z.array(packingItem).min(1).max(100),
  }),
  execute: executePackingItems,
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
export const commitPackingDraft = tool({
  name: 'commit_packing_draft',
  description: 'Atomically save the current validated packing draft to the personal checklist. Supply only its revision, never repeat items. Rechecks current data and uses version-checked writes. Existing successful commit receipts are reused after recovery.',
  parameters: commitPackingDraftParams,
  execute: runCommitPackingDraft,
});
export const packingDraftTools = [preparePackingDraft, readPackingDraftTool, repairPackingDraft, commitPackingDraft];

export const setItineraryGroupEndpointsParams = z.object({
  journeyId: z.string().min(1).max(100),
  endpoints: z.array(itineraryGroupEndpoint).min(1).max(30),
});
export const runSetItineraryGroupEndpoints = async (args: z.infer<typeof setItineraryGroupEndpointsParams>, runContext?: RunContext): Promise<unknown> => mutate('set_itinerary_group_endpoints', args, runContext, async (client, context) => {
    await assertJourneyWriteAccess(client, context, args.journeyId, 'editTimeline');
    const [journeyResult, groupsResult, rowsResult] = await Promise.all([
      client.from('journeys').select('id,dist,tracks ( coords, waypoints )').eq('id', args.journeyId).single(),
      client.from('timeline_groups').select('name,sort_order,route_end_meters,route_end_lng,route_end_lat,route_end_track_index,route_end_track_fraction,route_end_source,route_location_name,deleted').eq('journey_id', args.journeyId).order('sort_order'),
      client.from('timeline_rows').select('day,sort_order').eq('journey_id', args.journeyId).order('sort_order'),
    ]);
    if (journeyResult.error) throw journeyResult.error;
    if (groupsResult.error) throw groupsResult.error;
    if (rowsResult.error) throw rowsResult.error;

    const boundTrack = journeyResult.data.tracks as { coords?: unknown; waypoints?: { name: string; km: number }[] | null } | null;
    const coordinates = normalizeTrackCoordinates(boundTrack?.coords);
    if (coordinates.length < 2) throw new Error('当前旅程没有可用于设置终点的轨迹');
    const totalMeters = trackLengthMeters(coordinates);
    assertTrackDistanceConsistency(totalMeters, journeyResult.data.dist);
    const guideReceipts = args.endpoints.some(endpoint => endpoint.overnightReview)
      ? await guideHistory(client, context.runId) : [];
    const activeGroups = (groupsResult.data || []).filter((group: { deleted?: boolean }) => !group.deleted);
    const existingNames = [...new Set([
      ...activeGroups.map((group: { name: string }) => group.name),
      ...(rowsResult.data || []).map((row: { day: string }) => row.day),
    ].filter(Boolean))];
    const normalized = args.endpoints.map(endpoint => resolveHikingEndpoint(endpoint, totalMeters, boundTrack?.waypoints ?? null)).map((endpoint) => ({
      ...endpoint,
      day: resolveJourneyDay(endpoint.day, existingNames),
      position: endpointAtDistance(coordinates, endpoint.endDistanceKm * 1000),
      annotation: validateHikingBoundary(endpoint, totalMeters, boundTrack?.waypoints ?? null, guideReceipts, context.originalUserMessage),
    }));
    if (new Set(normalized.map((endpoint) => endpoint.day)).size !== normalized.length) {
      throw new Error('同一个行程组只能设置一个终点');
    }
    const unknown = normalized.find((endpoint) => !existingNames.includes(endpoint.day));
    if (unknown) throw new Error(`找不到行程组「${unknown.day}」`);

    const effectiveMeters = new Map<string, number>();
    activeGroups.forEach((group: { name: string; route_end_meters?: number | null }) => {
      if (group.route_end_meters != null) effectiveMeters.set(group.name, Number(group.route_end_meters));
    });
    normalized.forEach((endpoint) => effectiveMeters.set(endpoint.day, endpoint.position.distanceMeters));
    let previousMeters = -1;
    for (const name of existingNames) {
      const meters = effectiveMeters.get(name);
      if (meters == null) continue;
      if (meters <= previousMeters + 1) throw new Error('行程组终点必须按照行程顺序递增');
      previousMeters = meters;
    }

    const sortOrders = new Map(activeGroups.map((group: { name: string; sort_order: number }) => [group.name, group.sort_order]));
    const endpointRows = normalized.map((endpoint) => ({
      journey_id: args.journeyId,
      user_id: context.userId,
      name: endpoint.day,
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
        requiredGroupCount: existingNames.length,
        reachesTrackEnd: [...effectiveMeters.values()].some(meters => Math.abs(meters - totalMeters) <= 1),
      },
      endpoints: normalized.map((endpoint) => ({ day: endpoint.day, endDistanceKm: endpoint.position.distanceMeters / 1000, locationName: endpoint.annotation.locationName, overnightReview: endpoint.overnightReview })),
    };
    const changedNames = new Set(normalized.map((endpoint) => endpoint.day));
    const previous = activeGroups.filter((group: { name: string }) => changedNames.has(group.name));
    const applied = endpointRows.map(({ name, route_end_meters, route_end_lng, route_end_lat, route_end_track_index, route_end_track_fraction, route_end_source, route_location_name }) => ({
      name, route_end_meters, route_end_lng, route_end_lat, route_end_track_index, route_end_track_fraction, route_end_source, route_location_name,
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
    const ids = validateDeletionTargets(requested, (found.data || []).map((item: { id: string; title: string }) => ({ id: item.id, label: item.title })), '行程项目已发生变化，请重新读取后再删除');

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
  parameters: z.object({ beforeId: z.number().int().positive().nullable().optional() }),
  execute: async (args, runContext) => mutate('read_conversation_history', args, runContext as RunContext, async (client, context) => {
    let query = client.from('agent_session_items').select('id,item').eq('thread_id', context.threadId).eq('user_id', context.userId).eq('item->>type', 'message').order('id', { ascending: false }).limit(12);
    if (args.beforeId) query = query.lt('id', args.beforeId);
    const result = await query;
    if (result.error) throw result.error;
    return { historical: true, messages: (result.data || []).map((row: any) => ({ archiveId: row.id, item: sanitizeSessionItem(row.item) })), nextBeforeId: result.data?.length === 12 ? result.data.at(-1).id : null };
  }),
});

export const kaipaAllTools = [readTravelGuide, readTravelGuideImages, updateJourneySchedule, getAppContext, readConversationHistory, searchJourneys, searchRoutes, listGear, getJourneyDetails, estimatePersonalPacking, searchTravelWeb, addGear, createJourney, setJourneyMapLocation, addItinerary, setItineraryGroupEndpoints, addPackingItems, undoLastAgentChanges, deleteItineraryItems, deletePackingItems];

export const kaipaGlobalTools = [readTravelGuide, readTravelGuideImages, updateJourneySchedule, getAppContext, readConversationHistory, searchJourneys, searchRoutes, listGear, getJourneyDetails, estimatePersonalPacking, searchTravelWeb, addGear, createJourney, setJourneyMapLocation, addItinerary, setItineraryGroupEndpoints, addPackingItems, undoLastAgentChanges, deleteItineraryItems, deletePackingItems];

export const kaipaJourneyTools = [readTravelGuide, readTravelGuideImages, updateJourneySchedule, getAppContext, readConversationHistory, getJourneyDetails, estimatePersonalPacking, setJourneyMapLocation, addItinerary, setItineraryGroupEndpoints, addPackingItems, undoLastAgentChanges, deleteItineraryItems, deletePackingItems, listGear, searchTravelWeb, searchJourneys, searchRoutes, addGear];
