import type { AgentContext } from './types.ts';

export const journeySections = ['journey', 'track', 'itinerary', 'packing'] as const;
export type JourneySection = typeof journeySections[number];
export type ContextSection = JourneySection | 'gear';
export type ContextVersions = Partial<Record<ContextSection, string>>;
export type ContextSnapshot = { revision: string; data: Record<string, unknown> };
export type ContextState = { versions: Record<string, ContextVersions>; snapshots: Record<string, ContextSnapshot>; observed: Record<string, ContextVersions> };
type Client = any;

function state(context: AgentContext): ContextState {
  return context.dataContext ??= { versions: {}, snapshots: {}, observed: {} };
}
const keyFor = (journeyId: string, section: ContextSection) => section === 'gear' ? 'gear' : `${journeyId}:${section}`;
const fields: Record<JourneySection, string[]> = { journey: ['journey'], track: ['trackSummary'], itinerary: ['itinerary', 'itineraryGroups'], packing: ['packingLists'] };

function indexedTrackData(data: Record<string, unknown>): Record<string, unknown> {
  const summary = data.trackSummary as { waypoints?: unknown[] } | undefined;
  if (!Array.isArray(summary?.waypoints)) return data;
  return { ...data, trackSummary: { ...summary, waypoints: summary.waypoints.map((point, waypointIndex) =>
    point && typeof point === 'object' && !Array.isArray(point) ? { ...point, waypointIndex } : point) } };
}

export async function refreshContextVersions(client: Client, context: AgentContext, journeyId = context.currentJourneyId || '') {
  const response = await client.rpc('agent_context_versions', { p_journey_id: journeyId || null });
  if (response.error) throw response.error;
  const versions = response.data as ContextVersions;
  state(context).versions[journeyId] = versions;
  return versions;
}

export async function prepareAgentContext(client: Client, context: AgentContext) {
  const journeyId = context.currentJourneyId || '';
  const versions = await refreshContextVersions(client, context, journeyId);
  const cached = await client.from('agent_context_cache').select('resource_key,revision,data').eq('thread_id', context.threadId)
    .in('resource_key', ['gear', ...journeySections.map((section) => keyFor(journeyId, section))]);
  if (cached.error) throw cached.error;
  for (const section of [...journeySections, 'gear'] as const) {
    const key = keyFor(journeyId, section);
    const row = (cached.data || []).find((row: any) => row.resource_key === key && row.revision === versions[section]);
    if (!row) continue;
    state(context).snapshots[key] = { revision: row.revision, data: row.data };
    (state(context).observed[journeyId] ??= {})[section] = row.revision;
  }
  return contextPrompt(context);
}

export function contextPrompt(context: AgentContext) {
  const journeyId = context.currentJourneyId || '';
  const current = state(context);
  const data = Object.fromEntries([...journeySections, 'gear'].flatMap((section) => {
    const snapshot = current.snapshots[keyFor(journeyId, section as ContextSection)];
    return snapshot && snapshot.revision === current.versions[journeyId]?.[section as ContextSection] ? [[section, indexedTrackData(snapshot.data)]] : [];
  }));
  return `\n本轮已检查的数据上下文：${JSON.stringify({ currentJourneyId: journeyId || null, versions: current.versions[journeyId], data })}\n这些快照版本已核验，可直接复用；缺失的部分才调用 get_journey_details(sections) 或 list_gear。历史工具结果不是当前状态。`;
}

async function remember(client: Client, context: AgentContext, journeyId: string, section: ContextSection, revision: string, data: Record<string, unknown>) {
  const key = keyFor(journeyId, section);
  state(context).snapshots[key] = { revision, data };
  (state(context).observed[journeyId] ??= {})[section] = revision;
  const saved = await client.from('agent_context_cache').upsert({ thread_id: context.threadId, user_id: context.userId, resource_key: key, revision, data }, { onConflict: 'thread_id,resource_key' });
  if (saved.error) throw saved.error;
}

export async function readJourneySections(client: Client, context: AgentContext, journeyId: string, sections: JourneySection[], attempt = 0): Promise<Record<string, unknown>> {
  const versions = await refreshContextVersions(client, context, journeyId);
  const missing = sections.filter((section) => state(context).snapshots[keyFor(journeyId, section)]?.revision !== versions[section]);
  if (missing.length) {
    const result = await client.rpc('read_agent_journey_sections', { p_journey_id: journeyId, p_sections: missing });
    if (result.error) throw result.error;
    state(context).versions[journeyId] = result.data.versions;
    // If a concurrent edit invalidated a previously cached section, fetch it too.
    const invalidated = sections.filter((section) => !missing.includes(section) && state(context).snapshots[keyFor(journeyId, section)]?.revision !== result.data.versions[section]);
    for (const section of missing) {
      await remember(client, context, journeyId, section, result.data.versions[section], Object.fromEntries(fields[section].map((field) => [field, result.data[field]])));
    }
    if (invalidated.length) {
      if (attempt >= 2) throw new Error('旅程正在被频繁修改，请稍后重新读取。');
      return readJourneySections(client, context, journeyId, sections, attempt + 1);
    }
  }
  const data = Object.assign({}, ...sections.map((section) => state(context).snapshots[keyFor(journeyId, section)].data));
  for (const section of sections) (state(context).observed[journeyId] ??= {})[section] = state(context).snapshots[keyFor(journeyId, section)].revision;
  return { journeyId, versions: state(context).versions[journeyId], sections, reused: missing.length === 0, ...indexedTrackData(data) };
}

export async function readAgentGear(client: Client, context: AgentContext, query?: string) {
  const journeyId = context.currentJourneyId || '';
  const versions = await refreshContextVersions(client, context, journeyId);
  let snapshot = state(context).snapshots.gear;
  // Name-scoped checks are used immediately before add_gear. Always read the
  // current table for these checks so a stale thread snapshot cannot make a
  // new item look like an existing one.
  if (query?.trim() || !snapshot || snapshot.revision !== versions.gear) {
    const result = await client.rpc('read_agent_gear');
    if (result.error) throw result.error;
    const { version, ...data } = result.data;
    await remember(client, context, journeyId, 'gear', version, data);
    snapshot = state(context).snapshots.gear;
  }
  (state(context).observed[journeyId] ??= {}).gear = snapshot.revision;
  const items = snapshot.data.items as Array<{ name: string }>;
  return { ...snapshot.data, version: snapshot.revision, items: query?.trim() ? items.filter((item) => item.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) : items };
}

export function writeDependencies(tool: string, args: Record<string, unknown>): ContextSection[] {
  switch (tool) {
    case 'update_journey_schedule': return ['journey', 'itinerary'];
    case 'add_itinerary_items': case 'set_itinerary_group_endpoints': return ['journey', 'track', 'itinerary'];
    case 'delete_itinerary_items': return ['journey', 'itinerary'];
    case 'delete_packing_items': return ['journey', 'packing'];
    case 'set_journey_map_location': return ['journey'];
    case 'add_packing_items': return args.mode === 'full' ? ['journey', 'track', 'itinerary', 'packing', 'gear'] : ['journey', 'packing'];
    default: return [];
  }
}

export function expectedWriteVersions(context: AgentContext, tool: string, args: Record<string, unknown>) {
  const journeyId = String(args.journeyId);
  const observed = { ...state(context).observed[journeyId], gear: state(context).snapshots.gear?.revision };
  const dependencies = writeDependencies(tool, args);
  const missing = dependencies.filter((section) => !observed[section]);
  if (missing.length) throw new Error(`写入前缺少已核验的数据：${missing.join(', ')}。按需调用 get_journey_details(sections) 或 list_gear 后再执行。`);
  return Object.fromEntries(dependencies.map((section) => [section, observed[section]]));
}

export function acceptWriteVersions(context: AgentContext, journeyId: string, expected: ContextVersions, versions: ContextVersions) {
  const current = state(context);
  for (const section of Object.keys(expected) as ContextSection[]) {
    if (versions[section] !== expected[section]) delete current.snapshots[keyFor(journeyId, section)];
    (current.observed[journeyId] ??= {})[section] = versions[section];
  }
  current.versions[journeyId] = versions;
}

export function invalidateContext(context: AgentContext, journeyId: string) {
  delete state(context).observed[journeyId];
  delete state(context).snapshots.gear;
  for (const section of journeySections) delete state(context).snapshots[keyFor(journeyId, section)];
}
