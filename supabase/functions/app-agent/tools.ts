// @ts-ignore Deno npm specifier
import { tool } from 'npm:@openai/agents@0.16.1';
// @ts-ignore Deno npm specifier
import { z } from 'npm:zod@4.1.12';
import type { AgentContext } from './types.ts';
import { validateDeletionTargets } from './deletion.ts';
import { aggregateTravelSearch } from './search/aggregate.ts';
import { createTravelSearchProviders, travelSearchNumberSetting } from './search/registry.ts';
import { resolveJourneyDay } from './journey-days.ts';
import { itineraryMinutes } from './itinerary-time.ts';
import { endpointAtDistance, normalizeTrackCoordinates, trackLengthMeters } from './route-endpoints.ts';
import { buildAgentTrackData, computeTrackStats, isTrackFilename, parseTrackBytes, snapTrackWaypoints } from './track.ts';

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
  start: { lng: number; lat: number };
};

const requestClients = new Map<string, Client>();
const travelSearches = new Map<string, Promise<unknown>>();

export function bindRunClient(runId: string, client: Client) { requestClients.set(runId, client); }
export function releaseRunClient(runId: string) {
  requestClients.delete(runId);
  travelSearches.delete(runId);
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


function looksLikeJourneyPlanRequest(message: string) {
  return /(创建|规划|安排|计划|做|生成).{0,12}(旅程|行程|路线|徒步|旅行|露营|登山)|帮我.{0,20}(旅程|行程|路线|徒步|旅行|露营|登山)/i.test(message);
}

function hasConcreteOrOpenJourneyDate(message: string) {
  return /(今天|明天|后天|大后天|本周|这周|下周|下个月|周[一二三四五六日天末]|星期[一二三四五六日天]|\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}|\d{1,2}\s*月\s*\d{1,2}\s*[日号]|日期\s*(未定|待定)|待定|暂定|稍后补)/i.test(message);
}

function hasJourneyDuration(message: string) {
  return /(\d+|[一二两三四五六七八九十半]+)\s*(天|日|晚|夜)|day|days|night|nights/i.test(message);
}

function explicitlyAllowsUndatedJourney(message: string) {
  return /(日期|时间|出发|哪天).{0,6}(未定|待定|暂定|稍后补|以后补)|先.{0,6}(未定|待定)|待定日期|日期待定|date\s*(tbd|unknown|later)/i.test(message);
}


function journeyCreationBasicsMissing(context: AgentContext) {
  const text = context.originalUserMessage?.trim() || '';
  if (!text) return false;
  const createLike = looksLikeJourneyPlanRequest(text);
  if (!createLike) return false;
  const hasDate = hasConcreteOrOpenJourneyDate(text) || explicitlyAllowsUndatedJourney(text);
  return !hasDate || !hasJourneyDuration(text);
}

function assertJourneyCreationBasicsReady(context: AgentContext) {
  if (journeyCreationBasicsMissing(context)) {
    throw new Error('创建旅程前必须先补齐出发日期和天数；不要先查询路线、搜索攻略或创建旅程。');
  }
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

function undoable<T>(value: T, undo: Record<string, unknown>): UndoableResult<T> {
  return { __undoable: true, value, undo };
}

function isUndoableResult<T>(value: T | UndoableResult<T>): value is UndoableResult<T> {
  return Boolean(value && typeof value === 'object' && '__undoable' in value && value.__undoable === true);
}

function coordinateLabel(lng: number, lat: number): string {
  const latDir = lat >= 0 ? 'N' : 'S';
  const lngDir = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(5)} ${latDir}  ${Math.abs(lng).toFixed(5)} ${lngDir}`;
}

function mapboxToken() {
  return (Deno.env.get('MAPBOX_TOKEN') || Deno.env.get('EXPO_PUBLIC_MAPBOX_TOKEN') || '').trim();
}

function mapboxContextName(feature: any): string {
  const context = feature?.properties?.context;
  return (
    context?.place?.name ||
    context?.locality?.name ||
    context?.district?.name ||
    context?.region?.name ||
    ''
  );
}

async function geocodeJourneyMapLocation(query: string, language = 'zh,en'): Promise<JourneyMapLocation> {
  const token = mapboxToken();
  if (!token) throw new Error('地图定位服务暂不可用');
  const params = new URLSearchParams({
    q: query,
    access_token: token,
    autocomplete: 'false',
    permanent: 'true',
    limit: '1',
    language,
    types: 'country,region,postcode,district,place,locality,neighborhood,street,address,poi',
  });
  const response = await fetch(`https://api.mapbox.com/search/geocode/v6/forward?${params.toString()}`);
  if (!response.ok) throw new Error('地图定位服务暂不可用');
  const json = await response.json() as { features?: any[] };
  const feature = json.features?.[0];
  const coordinates = feature?.geometry?.coordinates;
  const lng = Number(feature?.properties?.coordinates?.longitude ?? coordinates?.[0]);
  const lat = Number(feature?.properties?.coordinates?.latitude ?? coordinates?.[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) throw new Error(`没有找到「${query}」的地图坐标`);
  const name = feature.properties?.name_preferred || feature.properties?.name || query;
  const parent = mapboxContextName(feature);
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
  const attachments = Array.isArray(message.data?.ui?.attachments) ? message.data.ui.attachments : [];
  const normalizedRequested = requestedName?.trim().toLocaleLowerCase();
  const trackAttachment = attachments.find((attachment: any) => {
    const name = typeof attachment?.name === 'string' ? attachment.name : '';
    if (!isTrackFilename(name)) return false;
    return !normalizedRequested || name.toLocaleLowerCase() === normalizedRequested;
  }) || null;
  if (!trackAttachment) return null;
  const response = await fetch(trackAttachment.url);
  if (!response.ok) throw new Error('无法读取上传的轨迹文件');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > 15 * 1024 * 1024) throw new Error('轨迹文件过大，请上传 15MB 以内的 GPX/KML/KMZ');
  const parsed = await parseTrackBytes(bytes, trackAttachment.name);
  const stats = computeTrackStats(parsed.points);
  if (!stats) throw new Error('轨迹点不足，无法创建带轨迹的旅程');
  const track = buildAgentTrackData(stats);
  const start = stats.points[0];
  return {
    name: parsed.name,
    fileUrl: trackAttachment.url,
    fileName: trackAttachment.name,
    trackCoords: track.trackCoords,
    trackElevation: track.trackElevation,
    trackDurationMs: track.trackDurationMs,
    trackWaypoints: snapTrackWaypoints(parsed.waypoints, stats),
    dist: track.dist,
    asc: track.asc,
    start: { lng: start.lon, lat: start.lat },
  };
}

async function mutate<T>(toolName: string, args: unknown, runContext: RunContext | undefined, operation: (client: Client, context: AgentContext) => Promise<T | UndoableResult<T>>): Promise<T> {
  const client = clientFor(runContext);
  const context = contextFor(runContext);
  const argumentsHash = await sha256(stable(args));
  const existing = await client.from('agent_tool_calls').select('status,output').eq('run_id', context.runId).eq('tool_name', toolName).eq('arguments_hash', argumentsHash).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data?.status === 'completed') return existing.data.output as T;

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
    const operationResult = await operation(client, context);
    const output = isUndoableResult(operationResult) ? operationResult.value : operationResult;
    const undoPayload = isUndoableResult(operationResult) ? operationResult.undo : null;
    const saved = await client.from('agent_tool_calls').update({ status: 'completed', output, undo_payload: undoPayload, updated_at: new Date().toISOString() }).eq('id', recorded.data.id);
    if (saved.error) throw saved.error;
    return output;
  } catch (error) {
    await client.from('agent_tool_calls').update({ status: 'failed', error: error instanceof Error ? error.message : String(error), updated_at: new Date().toISOString() }).eq('id', recorded.data.id);
    throw error;
  }
}

const itineraryItem = z.object({
  day: z.string().min(1).max(40).describe('行程日序，标准日期使用 Day 1、Day 2；只有用户明确使用自定义分组时才填写其他名称'),
  title: z.string().min(1).max(40).describe('简短的地点、路线段、活动或交通安排，不包含解释、提醒或注意事项'),
  timeStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().describe('24 小时制开始时间，必须使用 HH:mm，例如 04:00、13:30'),
  timeEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().describe('24 小时制结束时间，必须使用 HH:mm，例如 05:30、21:00'),
});

const packingItem = z.object({
  name: z.string().min(1).max(120),
  categoryName: z.string().max(60).optional(),
  quantity: z.number().int().min(1).max(99).default(1),
  weightKg: z.number().min(0).max(100).optional(),
  note: z.string().max(300).optional(),
});

const itineraryDeletionTarget = z.object({
  id: z.string().min(1).max(100),
  title: z.string().min(1).max(120),
});

const packingDeletionTarget = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(120),
});

const itineraryGroupEndpoint = z.object({
  day: z.string().min(1).max(40).describe('要设置终点的行程组，标准日序使用 Day 1、Day 2'),
  endDistanceKm: z.number().positive().max(10000).describe('终点在完整轨迹上的累计公里数，只能使用轨迹标注点或用户明确提供的可靠数值'),
  locationName: z.string().min(1).max(120).optional().describe('轨迹标注点名称；没有可靠名称时省略'),
});

async function assertDeleteContext(client: Client, context: AgentContext, journeyId: string) {
  if (!context.currentJourneyId || context.currentJourneyId !== journeyId) {
    throw new Error('只能删除当前打开旅程中的项目');
  }
  const readCalls = await client
    .from('agent_tool_calls')
    .select('arguments')
    .eq('run_id', context.runId)
    .eq('tool_name', 'get_journey_details')
    .eq('status', 'completed');
  if (readCalls.error) throw readCalls.error;
  const readCurrentJourney = (readCalls.data || []).some((call: { arguments?: { journeyId?: unknown } }) => call.arguments?.journeyId === journeyId);
  if (!readCurrentJourney) throw new Error('删除前必须重新读取当前旅程详情');
}

async function assertJourneyWriteAccess(client: Client, context: AgentContext, journeyId: string, permission: 'editTimeline' | 'editChecklist') {
  const journey = await client.from('journeys').select('id,user_id,participant_permissions').eq('id', journeyId).single();
  if (journey.error) throw journey.error;
  if (journey.data.user_id === context.userId) return;
  const member = await client.from('companions').select('id').eq('journey_id', journeyId).eq('user_id', context.userId).limit(1).maybeSingle();
  if (member.error) throw member.error;
  const permissions = journey.data.participant_permissions as Record<string, unknown> | null;
  if (!member.data || permissions?.[permission] !== true) throw new Error('你没有修改这个旅程的权限');
}

export const getAppContext = tool({
  name: 'get_app_context',
  description: 'Read the journey currently open in the app. Always use this first when the user says current journey or this journey; its currentJourneyId is authoritative.',
  parameters: z.object({}),
  execute: async (args, runContext) => mutate('get_app_context', args, runContext as RunContext, async (_client, context) => ({ currentJourneyId: context.currentJourneyId || null })),
});

export const searchJourneys = tool({
  name: 'search_journeys',
  description: 'Find a different existing journey by name or region when no current journey is open. Never use this to resolve the current journey from its display title; use get_app_context instead.',
  parameters: z.object({ query: z.string().max(80).optional() }),
  execute: async ({ query }, runContext) => mutate('search_journeys', { query }, runContext as RunContext, async (client) => {
    const columns = 'id,name,region,planned_date,date,days,total_days,dist,asc_,diff,desc';
    if (!query?.trim()) {
      const { data, error } = await client.from('journeys').select(columns).order('created_at', { ascending: false }).limit(30);
      if (error) throw error;
      return data || [];
    }
    const pattern = `%${query.trim()}%`;
    const [byName, byRegion] = await Promise.all([
      client.from('journeys').select(columns).ilike('name', pattern).limit(30),
      client.from('journeys').select(columns).ilike('region', pattern).limit(30),
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
    assertJourneyCreationBasicsReady(context);
    const columns = 'id,name,region,dist,asc_,diff,desc,track_duration_ms,track_waypoints';
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
  parameters: z.object({ query: z.string().max(80).optional() }),
  execute: async ({ query }, runContext) => mutate('list_gear', { query }, runContext as RunContext, async (client) => {
    let itemsRequest = client.from('gear_items').select('id,name,cat_id,weight,price,qty,status,note').order('created_at').limit(100);
    if (query?.trim()) itemsRequest = itemsRequest.ilike('name', `%${query.trim()}%`);
    const [items, categories] = await Promise.all([itemsRequest, client.from('gear_categories').select('id,name,color').order('created_at')]);
    if (items.error) throw items.error;
    if (categories.error) throw categories.error;
    return { items: items.data || [], categories: categories.data || [] };
  }),
});

export const getJourneyDetails = tool({
  name: 'get_journey_details',
  description: 'Read one journey with its itinerary, itinerary groups and packing lists. Track waypoints include their cumulative km and can be used to set itinerary group endpoints. Always call before adding recommendations to an existing journey.',
  parameters: z.object({ journeyId: z.string().min(1).max(100) }),
  execute: async ({ journeyId }, runContext) => mutate('get_journey_details', { journeyId }, runContext as RunContext, async (client) => {
    const [journey, timeline, groups, lists] = await Promise.all([
      client.from('journeys').select('*').eq('id', journeyId).single(),
      client.from('timeline_rows').select('id,title,day,time_mins,time_end_mins,checked').eq('journey_id', journeyId).order('sort_order'),
      client.from('timeline_groups').select('name,sort_order,route_end_meters,route_location_name').eq('journey_id', journeyId).eq('deleted', false).order('sort_order'),
      client.from('journey_packing_lists').select('id,kind,journey_packing_items(id,name,category_name,quantity,weight_kg,note,packed)').eq('journey_id', journeyId),
    ]);
    if (journey.error) throw journey.error;
    if (timeline.error) throw timeline.error;
    if (groups.error) throw groups.error;
    if (lists.error) throw lists.error;
    const trackCoordinates = normalizeTrackCoordinates(journey.data.track_coords);
    const trackSummary = trackCoordinates.length >= 2 ? {
      totalKm: trackLengthMeters(trackCoordinates) / 1000,
      waypoints: Array.isArray(journey.data.track_waypoints) ? journey.data.track_waypoints : [],
    } : null;
    return { journey: journey.data, trackSummary, itinerary: timeline.data || [], itineraryGroups: groups.data || [], packingLists: lists.data || [] };
  }),
});

export const searchTravelWeb = tool({
  name: 'search_travel_web',
  description: 'Search configured live travel sources for current facts, places, destination guides, and community inspiration. Each result identifies its source and reliability; critical facts must rely on web or official links rather than community posts.',
  parameters: z.object({
    query: z.string().min(2).max(200),
  }),
  execute: async ({ query }, runContext) => {
    const context = contextFor(runContext as RunContext);
    const activeSearch = travelSearches.get(context.runId);
    if (activeSearch) return activeSearch;
    const search = mutate('search_travel_web', { query }, runContext as RunContext, async (_client, context) => {
      assertJourneyCreationBasicsReady(context);
      const getEnv = (name: string) => Deno.env.get(name);
      const providers = createTravelSearchProviders(getEnv);
      const hasCrawlerSource = providers.some((provider) => provider.source === 'xhs' || provider.source === 'douyin');
      return aggregateTravelSearch({
        query,
        providers,
        timeoutMs: travelSearchNumberSetting(getEnv, 'TRAVEL_SEARCH_TIMEOUT_MS', hasCrawlerSource ? 60000 : 8000, 2000, 120000),
        maxResults: travelSearchNumberSetting(getEnv, 'TRAVEL_SEARCH_MAX_RESULTS', 10, 1, 30),
      });
    });
    travelSearches.set(context.runId, search);
    return search;
  },
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
    note: z.string().max(500).optional(),
  }),
  needsApproval: true,
  execute: async (args, runContext) => mutate('add_gear', args, runContext as RunContext, async (client, context) => {
    const { data, error } = await client.from('gear_items').insert({ user_id: context.userId, name: args.name, cat_id: args.categoryId || null, weight: args.weightKg, price: args.priceCny, qty: args.quantity, status: args.status, note: args.note || null }).select('id,name').single();
    if (error) throw error;
    return data;
  }),
});

export const createJourney = tool({
  name: 'create_journey',
  description: 'Create a journey after route and date requirements are understood. This does not add itinerary or packing items.',
  parameters: z.object({
    name: z.string().min(1).max(120),
    region: z.string().max(120).default(''),
    routeId: z.string().max(100).optional(),
    trackAttachmentName: z.string().max(160).optional().describe('Name of an uploaded GPX/KML/KMZ attachment to use as this journey track'),
    plannedDate: z.string().max(40).optional(),
    days: z.number().int().min(1).max(30).default(1),
    description: z.string().max(1000).optional(),
  }),
  needsApproval: true,
  execute: async (args, runContext) => mutate('create_journey', args, runContext as RunContext, async (client, context) => {
    assertJourneyCreationBasicsReady(context);
    if (!args.plannedDate?.trim() && !context.allowUndatedJourney) {
      throw new Error('创建旅程前需要先询问用户出发日期；只有用户明确说日期待定/稍后补日期，才能创建未定日期旅程。');
    }
    const routeResult = args.routeId ? await client.from('routes').select('*').eq('id', args.routeId).maybeSingle() : { data: null, error: null };
    if (routeResult.error) throw routeResult.error;
    const route = routeResult.data;
    const uploadedTrack = route ? null : await uploadedTrackForRun(client, context, args.trackAttachmentName);
    const resolvedLocation = route || uploadedTrack ? null : await maybeGeocodeJourneyMapLocation(args.region || args.name);
    const id = `j_${crypto.randomUUID()}`;
    const startLocation = uploadedTrack?.start;
    const inserted = await client.from('journeys').insert({
      id, user_id: context.userId, route_id: route?.id || null, name: args.name, region: args.region || route?.region || resolvedLocation?.region || uploadedTrack?.name || '',
      coord: route?.coord || resolvedLocation?.coord || (startLocation ? coordinateLabel(startLocation.lng, startLocation.lat) : ''),
      lng: route?.lng || resolvedLocation?.lng || startLocation?.lng || 0,
      lat: route?.lat || resolvedLocation?.lat || startLocation?.lat || 0,
      dist: route?.dist || uploadedTrack?.dist || '', asc_: route?.asc_ || uploadedTrack?.asc || '',
      diff: route?.diff || null, tone: route?.tone || 'forest', desc: args.description || route?.desc || null,
      date: args.plannedDate || null, planned_date: args.plannedDate || null, days: `${args.days} 天`, total_days: args.days,
      track_coords: route?.track_coords || uploadedTrack?.trackCoords || null, track_elevation: route?.track_elevation || uploadedTrack?.trackElevation || null,
      track_duration_ms: route?.track_duration_ms || uploadedTrack?.trackDurationMs || null, track_waypoints: route?.track_waypoints || uploadedTrack?.trackWaypoints || null,
      track_file_url: route?.track_file_url || uploadedTrack?.fileUrl || null, track_file_name: route?.track_file_name || uploadedTrack?.fileName || null,
    }).select('id,name,region,planned_date,total_days').single();
    if (inserted.error) throw inserted.error;
    const profile = await client.from('profiles').select('nick,display_name').eq('id', context.userId).single();
    const displayName = profile.data?.nick || profile.data?.display_name || '我';
    const companion = await client.from('companions').insert({ user_id: context.userId, journey_id: id, ini: displayName.slice(0, 1), name: displayName, color: '#0A84FF', is_host: true, is_self: true, sort_order: 0 });
    if (companion.error) {
      await client.from('journeys').delete().eq('id', id);
      throw companion.error;
    }
    const linked = await client.from('agent_threads').update({ current_journey_id: id }).eq('id', context.threadId);
    if (linked.error) console.warn('Could not link created journey to agent thread', linked.error);
    return inserted.data;
  }),
});

export const addItinerary = tool({
  name: 'add_itinerary_items',
  description: 'Add a reviewed itinerary to an existing journey. Read journey details first and avoid duplicates.',
  parameters: z.object({ journeyId: z.string().min(1).max(100), items: z.array(itineraryItem).min(1).max(80) }),
  execute: async (args, runContext) => mutate('add_itinerary_items', args, runContext as RunContext, async (client, context) => {
    await assertJourneyWriteAccess(client, context, args.journeyId, 'editTimeline');
    const [existingRows, existingGroups] = await Promise.all([
      client.from('timeline_rows').select('id,day').eq('journey_id', args.journeyId),
      client.from('timeline_groups').select('name').eq('journey_id', args.journeyId),
    ]);
    if (existingRows.error) throw existingRows.error;
    if (existingGroups.error) throw existingGroups.error;
    const existingNames = [...new Set([
      ...(existingGroups.data || []).map((group: { name: string }) => group.name),
      ...(existingRows.data || []).map((row: { day: string }) => row.day),
    ].filter(Boolean))];
    const normalizedItems = args.items.map((item) => ({ ...item, day: resolveJourneyDay(item.day, existingNames) }));
    const rows = normalizedItems.map((item, index) => ({
      id: `ai_${crypto.randomUUID()}`, journey_id: args.journeyId, user_id: context.userId,
      title: item.title, day: item.day,
      time_mins: itineraryMinutes(item.timeStart) ?? null,
      time_end_mins: itineraryMinutes(item.timeEnd) ?? null,
      is_synth: true, is_custom: false, checked: false, sort_order: (existingRows.data?.length || 0) + index,
    }));
    const groupNames = [...new Set(normalizedItems.map((item) => item.day))];
    const createdGroupNames = groupNames.filter((name) => !existingNames.includes(name));
    const groups = createdGroupNames.map((name, index) => ({
      journey_id: args.journeyId,
      user_id: context.userId,
      name,
      deleted: false,
      sort_order: existingNames.length + index,
      updated_at: new Date().toISOString(),
    }));
    const applied = await client.rpc('apply_agent_itinerary', { p_itinerary_rows: rows, p_itinerary_groups: groups });
    if (applied.error) throw applied.error;
    return undoable(
      { journeyId: args.journeyId, added: rows.length },
      { kind: 'add_itinerary_items', journeyId: args.journeyId, rowIds: rows.map((row) => row.id), createdGroupNames },
    );
  }),
});


export const setJourneyMapLocation = tool({
  name: 'set_journey_map_location',
  description: 'Set the journey card/map GPS location from a real place search. Use this when an AI-planned journey has no map location, default 0/0 coordinates, or the user asks to fix the journey map position. Prefer the destination, route start, main scenic area, or most specific place from the itinerary as the query.',
  parameters: z.object({
    journeyId: z.string().min(1).max(100),
    query: z.string().min(1).max(160).describe('Place name to geocode, for example 武功山金顶, 桂林老寨山, or 杭州西湖'),
    region: z.string().min(1).max(120).optional().describe('Optional display region to save instead of the geocoding result'),
  }),
  execute: async (args, runContext) => mutate('set_journey_map_location', args, runContext as RunContext, async (client, context) => {
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
    const saved = await client.from('journeys').update(patch).eq('id', args.journeyId).select('id,name,region,coord,lng,lat').single();
    if (saved.error) throw saved.error;
    return undoable(
      { journeyId: args.journeyId, location: saved.data },
      { kind: 'set_journey_map_location', journeyId: args.journeyId, previous: current.data, applied: saved.data },
    );
  }),
});

export const addPackingItems = tool({
  name: 'add_packing_items',
  description: 'Add reviewed recommendations to a journey packing list. Solo journeys use the current user\'s personal list; group journeys use the shared list. Read journey details and gear first; avoid duplicates.',
  parameters: z.object({ journeyId: z.string().min(1).max(100), items: z.array(packingItem).min(1).max(100) }),
  execute: async (args, runContext) => mutate('add_packing_items', args, runContext as RunContext, async (client, context) => {
    await assertJourneyWriteAccess(client, context, args.journeyId, 'editChecklist');
    const companions = await client.from('companions').select('id,user_id,is_self').eq('journey_id', args.journeyId).order('sort_order');
    if (companions.error) throw companions.error;
    const soloOwner = companions.data?.length === 1
      ? companions.data.find((companion: { user_id?: string; is_self?: boolean }) => companion.user_id === context.userId || companion.is_self)
      : undefined;
    const kind = soloOwner ? 'personal' : 'shared';
    const ownerCompanionId = soloOwner?.id ?? null;
    let listQuery = client.from('journey_packing_lists').select('id').eq('journey_id', args.journeyId).eq('kind', kind);
    listQuery = kind === 'personal' ? listQuery.eq('owner_companion_id', ownerCompanionId) : listQuery.is('owner_companion_id', null);
    let list = await listQuery.maybeSingle();
    if (list.error) throw list.error;
    const createdList = !list.data;
    if (!list.data) {
      list = await client.from('journey_packing_lists').insert({ journey_id: args.journeyId, kind, owner_companion_id: ownerCompanionId, created_by: context.userId }).select('id').single();
      if (list.error) throw list.error;
    }
    const existing = await client.from('journey_packing_items').select('name').eq('list_id', list.data.id);
    if (existing.error) throw existing.error;
    const names = new Set((existing.data || []).map((row: { name: string }) => row.name.trim().toLocaleLowerCase()));
    const unique = args.items.filter((item) => !names.has(item.name.trim().toLocaleLowerCase()));
    let itemIds: string[] = [];
    if (unique.length) {
      const inserted = await client.from('journey_packing_items').insert(unique.map((item, index) => ({
        list_id: list.data.id, source_type: 'custom', name: item.name, category_name: item.categoryName || null,
        quantity: item.quantity, weight_kg: item.weightKg && item.weightKg > 0 ? item.weightKg : null,
        note: item.note || null, packed: false, sort_order: (existing.data?.length || 0) + index,
      }))).select('id');
      if (inserted.error) throw inserted.error;
      itemIds = (inserted.data || []).map((item: { id: string }) => item.id);
    }
    const value = { journeyId: args.journeyId, listKind: kind, ownerCompanionId, added: unique.length, skippedDuplicates: args.items.length - unique.length };
    return itemIds.length
      ? undoable(value, { kind: 'add_packing_items', journeyId: args.journeyId, listId: list.data.id, itemIds, createdList })
      : value;
  }),
});

export const setItineraryGroupEndpoints = tool({
  name: 'set_itinerary_group_endpoints',
  description: 'Set track endpoints for itinerary groups in an existing journey. Read journey details first. Only use exact cumulative km values from trackSummary.totalKm, trackSummary.waypoints, route search track_waypoints, or values explicitly supplied by the user; never estimate a distance from prose. Endpoint distances must increase in itinerary group order.',
  parameters: z.object({
    journeyId: z.string().min(1).max(100),
    endpoints: z.array(itineraryGroupEndpoint).min(1).max(30),
  }),
  execute: async (args, runContext) => mutate('set_itinerary_group_endpoints', args, runContext as RunContext, async (client, context) => {
    await assertJourneyWriteAccess(client, context, args.journeyId, 'editTimeline');
    const [journeyResult, groupsResult, rowsResult] = await Promise.all([
      client.from('journeys').select('id,track_coords').eq('id', args.journeyId).single(),
      client.from('timeline_groups').select('name,sort_order,route_end_meters,route_end_lng,route_end_lat,route_end_track_index,route_end_track_fraction,route_end_source,route_location_name,deleted').eq('journey_id', args.journeyId).order('sort_order'),
      client.from('timeline_rows').select('day,sort_order').eq('journey_id', args.journeyId).order('sort_order'),
    ]);
    if (journeyResult.error) throw journeyResult.error;
    if (groupsResult.error) throw groupsResult.error;
    if (rowsResult.error) throw rowsResult.error;

    const coordinates = normalizeTrackCoordinates(journeyResult.data.track_coords);
    if (coordinates.length < 2) throw new Error('当前旅程没有可用于设置终点的轨迹');
    const activeGroups = (groupsResult.data || []).filter((group: { deleted?: boolean }) => !group.deleted);
    const existingNames = [...new Set([
      ...activeGroups.map((group: { name: string }) => group.name),
      ...(rowsResult.data || []).map((row: { day: string }) => row.day),
    ].filter(Boolean))];
    const normalized = args.endpoints.map((endpoint) => ({
      ...endpoint,
      day: resolveJourneyDay(endpoint.day, existingNames),
      position: endpointAtDistance(coordinates, endpoint.endDistanceKm * 1000),
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
      route_end_source: endpoint.locationName ? 'waypoint' : 'distance',
      route_location_name: endpoint.locationName || null,
      updated_at: new Date().toISOString(),
    }));
    const saved = await client.from('timeline_groups').upsert(endpointRows, { onConflict: 'journey_id,name' });
    if (saved.error) throw saved.error;
    const value = {
      journeyId: args.journeyId,
      updated: normalized.length,
      endpoints: normalized.map((endpoint) => ({ day: endpoint.day, endDistanceKm: endpoint.position.distanceMeters / 1000, locationName: endpoint.locationName })),
    };
    const changedNames = new Set(normalized.map((endpoint) => endpoint.day));
    const previous = activeGroups.filter((group: { name: string }) => changedNames.has(group.name));
    const applied = endpointRows.map(({ name, route_end_meters, route_end_lng, route_end_lat, route_end_track_index, route_end_track_fraction, route_end_source, route_location_name }) => ({
      name, route_end_meters, route_end_lng, route_end_lat, route_end_track_index, route_end_track_fraction, route_end_source, route_location_name,
    }));
    return undoable(value, { kind: 'set_itinerary_group_endpoints', journeyId: args.journeyId, previous, applied });
  }),
});

export const undoLastAgentChanges = tool({
  name: 'undo_last_agent_changes',
  description: 'Undo the most recent reversible changes made by this assistant in the current conversation. Use only when the user explicitly asks to undo, revert, or take back the previous assistant changes.',
  parameters: z.object({}),
  execute: async (args, runContext) => mutate('undo_last_agent_changes', args, runContext as RunContext, async (client, context) => {
    if (!context.canUndoPreviousChanges) throw new Error('只有用户明确要求时才能撤销之前的更改');
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
  description: 'Permanently delete selected itinerary items from the journey currently open in the app. Call get_journey_details in the same turn, then copy the exact item IDs and titles returned by it. Never infer IDs or delete items from another journey.',
  parameters: z.object({
    journeyId: z.string().min(1).max(100),
    items: z.array(itineraryDeletionTarget).min(1).max(200),
  }),
  needsApproval: true,
  execute: async (args, runContext) => mutate('delete_itinerary_items', args, runContext as RunContext, async (client, context) => {
    await assertDeleteContext(client, context, args.journeyId);
    const requested = args.items.map((item) => ({ id: item.id, label: item.title }));
    const requestedIds = requested.map((item) => item.id);
    const found = await client.from('timeline_rows').select('id,title').eq('journey_id', args.journeyId).in('id', requestedIds);
    if (found.error) throw found.error;
    const ids = validateDeletionTargets(requested, (found.data || []).map((item: { id: string; title: string }) => ({ id: item.id, label: item.title })), '行程项目已发生变化，请重新读取后再删除');

    const deleted = await client.from('timeline_rows').delete().eq('journey_id', args.journeyId).in('id', ids).select('id');
    if (deleted.error) throw deleted.error;
    if ((deleted.data || []).length !== ids.length) throw new Error('部分行程项目未能删除');
    return { journeyId: args.journeyId, deleted: ids.length, items: args.items };
  }),
});

export const deletePackingItems = tool({
  name: 'delete_packing_items',
  description: 'Permanently delete selected packing items from the journey currently open in the app. Call get_journey_details in the same turn, then copy the exact item IDs and names returned by it. Never infer IDs or delete items from another journey.',
  parameters: z.object({
    journeyId: z.string().min(1).max(100),
    items: z.array(packingDeletionTarget).min(1).max(200),
  }),
  needsApproval: true,
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

    const deleted = await client.from('journey_packing_items').delete().in('list_id', listIds).in('id', ids).select('id');
    if (deleted.error) throw deleted.error;
    if ((deleted.data || []).length !== ids.length) throw new Error('部分清单项目未能删除');
    return { journeyId: args.journeyId, deleted: ids.length, items: args.items };
  }),
});

export const kaipaAllTools = [getAppContext, searchJourneys, searchRoutes, listGear, getJourneyDetails, searchTravelWeb, addGear, createJourney, setJourneyMapLocation, addItinerary, setItineraryGroupEndpoints, addPackingItems, undoLastAgentChanges, deleteItineraryItems, deletePackingItems];

export const kaipaGlobalTools = [getAppContext, searchJourneys, searchRoutes, listGear, getJourneyDetails, searchTravelWeb, addGear, createJourney, setJourneyMapLocation, addItinerary, setItineraryGroupEndpoints, addPackingItems, undoLastAgentChanges, deleteItineraryItems, deletePackingItems];

export const kaipaJourneyTools = [getAppContext, getJourneyDetails, setJourneyMapLocation, addItinerary, setItineraryGroupEndpoints, addPackingItems, undoLastAgentChanges, deleteItineraryItems, deletePackingItems, listGear, searchTravelWeb, searchJourneys, searchRoutes, addGear, createJourney];
