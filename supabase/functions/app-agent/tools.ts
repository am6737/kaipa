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

declare const Deno: { env: { get(name: string): string | undefined } };

type Client = any;
type RunContext = { context: AgentContext };

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

async function mutate<T>(toolName: string, args: unknown, runContext: RunContext | undefined, operation: (client: Client, context: AgentContext) => Promise<T>): Promise<T> {
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
    const output = await operation(client, context);
    const saved = await client.from('agent_tool_calls').update({ status: 'completed', output, updated_at: new Date().toISOString() }).eq('id', recorded.data.id);
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
  execute: async ({ query }, runContext) => mutate('search_routes', { query }, runContext as RunContext, async (client) => {
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
    const search = mutate('search_travel_web', { query }, runContext as RunContext, async () => {
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
    plannedDate: z.string().max(40).optional(),
    days: z.number().int().min(1).max(30).default(1),
    description: z.string().max(1000).optional(),
  }),
  needsApproval: true,
  execute: async (args, runContext) => mutate('create_journey', args, runContext as RunContext, async (client, context) => {
    const routeResult = args.routeId ? await client.from('routes').select('*').eq('id', args.routeId).maybeSingle() : { data: null, error: null };
    if (routeResult.error) throw routeResult.error;
    const route = routeResult.data;
    const id = `j_${crypto.randomUUID()}`;
    const inserted = await client.from('journeys').insert({
      id, user_id: context.userId, route_id: route?.id || null, name: args.name, region: args.region || route?.region || '',
      coord: route?.coord || '', lng: route?.lng || 0, lat: route?.lat || 0, dist: route?.dist || '', asc_: route?.asc_ || '',
      diff: route?.diff || null, tone: route?.tone || 'forest', desc: args.description || route?.desc || null,
      date: args.plannedDate || null, planned_date: args.plannedDate || null, days: `${args.days} 天`, total_days: args.days,
      track_coords: route?.track_coords || null, track_elevation: route?.track_elevation || null,
      track_duration_ms: route?.track_duration_ms || null, track_waypoints: route?.track_waypoints || null,
      photo_uris: route?.photo_uris || null,
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
  needsApproval: true,
  execute: async (args, runContext) => mutate('add_itinerary_items', args, runContext as RunContext, async (client, context) => {
    const ownership = await client.from('journeys').select('id').eq('id', args.journeyId).single();
    if (ownership.error) throw ownership.error;
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
    const inserted = await client.from('timeline_rows').insert(rows);
    if (inserted.error) throw inserted.error;
    const groups = [...new Set(normalizedItems.map((item) => item.day))].map((name, index) => ({ journey_id: args.journeyId, user_id: context.userId, name, deleted: false, sort_order: index, updated_at: new Date().toISOString() }));
    const grouped = await client.from('timeline_groups').upsert(groups, { onConflict: 'journey_id,name' });
    if (grouped.error) throw grouped.error;
    return { journeyId: args.journeyId, added: rows.length };
  }),
});

export const addPackingItems = tool({
  name: 'add_packing_items',
  description: 'Add reviewed recommendations to a journey packing list. Solo journeys use the current user\'s personal list; group journeys use the shared list. Read journey details and gear first; avoid duplicates.',
  parameters: z.object({ journeyId: z.string().min(1).max(100), items: z.array(packingItem).min(1).max(100) }),
  needsApproval: true,
  execute: async (args, runContext) => mutate('add_packing_items', args, runContext as RunContext, async (client, context) => {
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
    if (!list.data) {
      list = await client.from('journey_packing_lists').insert({ journey_id: args.journeyId, kind, owner_companion_id: ownerCompanionId, created_by: context.userId }).select('id').single();
      if (list.error) throw list.error;
    }
    const existing = await client.from('journey_packing_items').select('name').eq('list_id', list.data.id);
    if (existing.error) throw existing.error;
    const names = new Set((existing.data || []).map((row: { name: string }) => row.name.trim().toLocaleLowerCase()));
    const unique = args.items.filter((item) => !names.has(item.name.trim().toLocaleLowerCase()));
    if (unique.length) {
      const inserted = await client.from('journey_packing_items').insert(unique.map((item, index) => ({
        list_id: list.data.id, source_type: 'custom', name: item.name, category_name: item.categoryName || null,
        quantity: item.quantity, weight_kg: item.weightKg && item.weightKg > 0 ? item.weightKg : null,
        note: item.note || null, packed: false, sort_order: (existing.data?.length || 0) + index,
      })));
      if (inserted.error) throw inserted.error;
    }
    return { journeyId: args.journeyId, listKind: kind, ownerCompanionId, added: unique.length, skippedDuplicates: args.items.length - unique.length };
  }),
});

export const setItineraryGroupEndpoints = tool({
  name: 'set_itinerary_group_endpoints',
  description: 'Set track endpoints for itinerary groups in an existing journey. Read journey details first. Only use exact cumulative km values from trackSummary.totalKm, trackSummary.waypoints, route search track_waypoints, or values explicitly supplied by the user; never estimate a distance from prose. Endpoint distances must increase in itinerary group order.',
  parameters: z.object({
    journeyId: z.string().min(1).max(100),
    endpoints: z.array(itineraryGroupEndpoint).min(1).max(30),
  }),
  needsApproval: true,
  execute: async (args, runContext) => mutate('set_itinerary_group_endpoints', args, runContext as RunContext, async (client, context) => {
    const [journeyResult, groupsResult, rowsResult] = await Promise.all([
      client.from('journeys').select('id,track_coords').eq('id', args.journeyId).single(),
      client.from('timeline_groups').select('name,sort_order,route_end_meters,deleted').eq('journey_id', args.journeyId).order('sort_order'),
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
    const saved = await client.from('timeline_groups').upsert(normalized.map((endpoint) => ({
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
    })), { onConflict: 'journey_id,name' });
    if (saved.error) throw saved.error;
    return {
      journeyId: args.journeyId,
      updated: normalized.length,
      endpoints: normalized.map((endpoint) => ({ day: endpoint.day, endDistanceKm: endpoint.position.distanceMeters / 1000, locationName: endpoint.locationName })),
    };
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

export const kaipaAllTools = [getAppContext, searchJourneys, searchRoutes, listGear, getJourneyDetails, searchTravelWeb, addGear, createJourney, addItinerary, setItineraryGroupEndpoints, addPackingItems, deleteItineraryItems, deletePackingItems];

export const kaipaGlobalTools = [getAppContext, searchJourneys, searchRoutes, listGear, getJourneyDetails, searchTravelWeb, addGear, createJourney, addItinerary, setItineraryGroupEndpoints, addPackingItems, deleteItineraryItems, deletePackingItems];

export const kaipaJourneyTools = [getAppContext, getJourneyDetails, addItinerary, setItineraryGroupEndpoints, addPackingItems, deleteItineraryItems, deletePackingItems, listGear, searchTravelWeb, searchJourneys, searchRoutes, addGear, createJourney];
