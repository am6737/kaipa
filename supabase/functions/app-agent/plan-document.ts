// Declarative handoff between the pipeline stages.
//
// The plan stage never writes. It returns one PlanDocument, which the
// deterministic save stage maps onto the existing scoped tools. Every schema
// here mirrors the parameters of the tool that consumes it, so the save stage
// passes validated arguments straight into the same code path the light-path
// agent uses, including receipt replay, version checks and undo payloads.
import { z } from 'npm:zod@4.1.12';
import { createJourneyParams, itineraryItem, itineraryGroupEndpoint, setJourneyMapLocationParams, updateJourneyScheduleParams } from './tools.ts';
import { reviewTransportParams } from './transport-tool.ts';
import { packingPlanProfile } from './packing-schema.ts';
import type { PlanDraft } from './task.ts';

// Every field a reader can default is defaulted rather than merely nullable:
// a model that omits an empty section must not fail a run whose work is done.
export const researchBriefSchema = z.object({
  destination: z.string().max(200).default('').describe('目的地，未知时留空字符串'),
  routes: z.array(z.object({
    name: z.string().min(1).max(120),
    routeId: z.string().max(100).nullable().default(null),
    hikingDays: z.number().int().min(1).max(30).nullable().default(null),
    distanceKm: z.number().positive().max(10000).nullable().default(null),
    summary: z.string().max(800).default(''),
    sourceUrls: z.array(z.string().max(1000)).max(8).default([]),
    unresolved: z.array(z.string().max(300)).max(8).default([]),
    start: z.object({ name: z.string().max(160), longitude: z.number().min(-180).max(180), latitude: z.number().min(-90).max(90) }).nullable().default(null),
    end: z.object({ name: z.string().max(160), longitude: z.number().min(-180).max(180), latitude: z.number().min(-90).max(90) }).nullable().default(null),
    // Named points along the recorded track, in track order, with their
    // cumulative distance. The planner needs these to choose real overnight
    // points and day endpoints; without them a multi-day plan degrades to
    // "day N" titles with no location.
    waypoints: z.array(z.object({
      index: z.number().int().min(0).max(5000),
      name: z.string().min(1).max(120),
      distanceKm: z.number().min(0).max(10000),
      elevationMeters: z.number().nullable().default(null),
    })).max(40).default([]).describe('选自路线 GPX 的具名标注点，按轨迹顺序，含累计里程；编排过夜点与每日终点只能从中选择'),
  })).max(12).default([]).describe('每个用户选择的路线都必须有一条独立研究结论；资料不足也要保留条目并填写 unresolved'),
  chosenRoute: z.object({
    routeId: z.string().max(100).nullable().default(null),
    routeName: z.string().max(120).nullable().default(null),
    reason: z.string().max(500).nullable().default(null),
  }).nullable().default(null),
  overnightCandidates: z.array(z.object({
    day: z.string().min(1).max(40),
    waypointIndex: z.number().int().min(0).nullable().default(null),
    waypointName: z.string().max(120).nullable().default(null),
    endDistanceKm: z.number().positive().max(10000).nullable().default(null),
    trackFinish: z.boolean().default(false),
    campSuitability: z.string().max(500).default(''),
    water: z.string().max(300).default(''),
    guideSourceUrl: z.string().max(1000).nullable().default(null),
    guideQuote: z.string().max(500).nullable().default(null),
  })).max(12).default([]).describe('每晚过夜候选，来自真实读取的攻略或轨迹标注点'),
  facts: z.array(z.object({
    fact: z.string().max(500),
    sourceUrl: z.string().max(1000).nullable().default(null),
  })).max(30).default([]),
  // Drafts for the maintained route-facts library ("线路资料"). Only from guide
  // text this run actually read; a human confirms or discards them in admin,
  // so the model is never trusted to write 'confirmed' facts itself.
  factSuggestions: z.array(z.object({
    routeId: z.string().min(1).max(100),
    category: z.enum(['access_transport', 'shuttle_cost', 'lodging', 'campsite', 'itinerary', 'season_safety']),
    title: z.string().min(1).max(120),
    fields: z.record(z.string(), z.string().max(400)).default({}),
    sourceUrl: z.string().max(1000).nullable().default(null),
  })).max(12).default([]).describe('仅当攻略正文给出具体、可复核、且线路资料里没有的地面信息（价格、营地、班次、住宿）时提交草稿；fields 的 key 用该类目的字段名，值一律写成字符串'),
  waterAndResupply: z.array(z.string().max(500)).max(12).default([]),
  transportOptions: z.array(z.object({
    direction: z.enum(['outbound', 'return']),
    summary: z.string().max(800).default(''),
    offers: z.array(z.object({
      mode: z.string().max(40).default(''),
      departAt: z.string().max(40).nullable().default(null),
      arriveAt: z.string().max(40).nullable().default(null),
      status: z.string().max(60).nullable().default(null),
      priceCny: z.number().nullable().default(null),
      note: z.string().max(400).nullable().default(null),
    })).max(12).default([]),
  })).max(4).default([]).describe('仅交通域填写，来自 search_transport 的实际查询结果'),
  unresolved: z.array(z.string().max(300)).max(12).default([]).describe('仍未解决的事实缺口，必须如实记录'),
  suggestedDays: z.number().int().min(1).max(30).nullable().default(null)
    .describe('根据路线徒步时长、路线之间交通和必要缓冲推算的建议总天数；无法可靠估算时为 null'),
  durationBasis: z.string().max(800).default('')
    .describe('建议天数的计算依据，简述各路线耗时、中转耗时和缓冲；没有建议天数时留空'),
});
export type ResearchBrief = z.infer<typeof researchBriefSchema>;

// Dedicated handoff for moving between independent routes. Keeping this out
// of ResearchBrief prevents route facts and transport assumptions from being
// mixed together or silently omitted by the itinerary planner.
export const transportPlanSchema = z.object({
  segments: z.array(z.object({
    fromRoute: z.string().min(1).max(120),
    toRoute: z.string().min(1).max(120),
    from: z.string().min(1).max(200),
    to: z.string().min(1).max(200),
    mode: z.enum(['rail', 'flight', 'bus', 'shuttle', 'taxi', 'car', 'walk', 'unknown']),
    durationMinutes: z.number().int().min(0).max(43200).nullable().default(null),
    overnightRequired: z.boolean().default(false),
    verified: z.boolean().default(false),
    sourceUrl: z.string().max(1000).nullable().default(null),
    note: z.string().max(500).default(''),
    fromLocation: z.object({ name: z.string().max(160), longitude: z.number().min(-180).max(180), latitude: z.number().min(-90).max(90) }).nullable().default(null),
    toLocation: z.object({ name: z.string().max(160), longitude: z.number().min(-180).max(180), latitude: z.number().min(-90).max(90) }).nullable().default(null),
  })).max(12).default([]),
  totalTransportMinutes: z.number().int().min(0).max(200000).nullable().default(null),
  recommendedDays: z.number().int().min(1).max(30).nullable().default(null),
  basis: z.string().max(1000).default(''),
  unresolved: z.array(z.string().max(300)).max(12).default([]),
});
export type TransportPlan = z.infer<typeof transportPlanSchema>;

export const planDocumentSchema = z.object({
  // Exactly the create_journey parameters, so assertCreationFacts keeps holding.
  journey: createJourneyParams.nullable().default(null).describe('本任务不创建旅程时为 null'),
  // Exactly the set_journey_map_location arguments minus journeyId.
  mapLocation: setJourneyMapLocationParams.omit({ journeyId: true }).nullable().default(null),
  // Exactly the update_journey_schedule arguments minus journeyId; only for an
  // authorized replan of an existing journey. dayAssignments stays tolerated as
  // empty, unlike the tool schema, so "no day moves" is not a document error.
  schedule: updateJourneyScheduleParams.omit({ journeyId: true }).extend({
    dayAssignments: z.array(updateJourneyScheduleParams.shape.dayAssignments.element).max(365).default([]),
  }).nullable().default(null),
  // Exactly the add_itinerary_items items; transport legs are ordinary
  // itinerary items and have no separate write.
  itineraryItems: z.array(itineraryItem).max(80).default([]).describe('本任务没有行程项时留空数组，不要为凑数编造条目'),
  // Exactly the set_itinerary_group_endpoints endpoints.
  endpoints: z.array(itineraryGroupEndpoint).max(30).default([]).describe('没有可用轨迹终点时留空数组'),
  // Full review_transport_plan input for the transport domain, with every field
  // tolerant of omission. The plan stage calls review_transport_plan itself and
  // records the verdict here.
  transport: z.object({
    direction: reviewTransportParams.shape.direction.default('round_trip'),
    origin: reviewTransportParams.shape.origin.nullable().default(null),
    returnDestination: reviewTransportParams.shape.returnDestination.nullable().default(null),
    trailStart: reviewTransportParams.shape.trailStart.default(''),
    trailFinish: reviewTransportParams.shape.trailFinish.default(''),
    hikeStart: reviewTransportParams.shape.hikeStart.default(0),
    hikeEnd: reviewTransportParams.shape.hikeEnd.default(0),
    arrivalBuffer: reviewTransportParams.shape.arrivalBuffer.default(0),
    departureBuffer: reviewTransportParams.shape.departureBuffer.default(0),
    outbound: reviewTransportParams.shape.outbound.default([]),
    inbound: reviewTransportParams.shape.inbound.default([]),
    vehicleRetrieval: reviewTransportParams.shape.vehicleRetrieval.nullable().default(null),
    reviewIssues: z.array(z.string().max(500)).max(30).default([]),
    unverified: z.array(z.string().max(500)).max(30).default([]),
  }).nullable().default(null),
  // Conditions the packing stage turns into a concrete checklist. The plan
  // stage already read the journey and itinerary, so it owns this judgement.
  packingProfile: packingPlanProfile.nullable().default(null),
  assumptions: z.array(z.string().max(300)).max(12).default([]),
  unverified: z.array(z.string().max(300)).max(30).default([]),
  blocker: z.string().max(1000).nullable().default(null),
  pendingQuestion: z.string().max(1000).nullable().default(null),
});
export type PlanDocument = z.infer<typeof planDocumentSchema>;

// Provider-facing schema only. A user may explicitly leave the duration
// undecided, and models commonly represent that as journey.days=null. Accept
// it long enough for the pipeline to turn the proposed journey into a draft or
// pending question; the persisted PlanDocument remains strict.
export const planDocumentModelSchema = planDocumentSchema.extend({
  journey: z.object({
    name: z.string().min(1).max(120),
    region: z.string().max(120).default(''),
    routeId: z.string().max(100).nullable().default(null),
    trackAttachmentName: z.string().max(160).nullable().default(null),
    plannedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
    days: z.number().int().min(1).max(30).nullable().default(null),
    description: z.string().max(1000).nullable().default(null),
  }).nullable().default(null),
  itineraryItems: z.array(itineraryItem.extend({
    timeStart: itineraryItem.shape.timeStart.nullable().default(null),
    timeEnd: itineraryItem.shape.timeEnd.nullable().default(null),
    transport: z.object({
      mode: z.enum(['car', 'taxi', 'bus', 'shuttle', 'walk', 'unknown']),
      from: z.object({ name: z.string().min(1).max(160), source: z.enum(['map', 'custom']).default('custom'), longitude: z.number().min(-180).max(180).nullable().default(null), latitude: z.number().min(-90).max(90).nullable().default(null), address: z.string().max(300).nullable().default(null) }),
      to: z.object({ name: z.string().min(1).max(160), source: z.enum(['map', 'custom']).default('custom'), longitude: z.number().min(-180).max(180).nullable().default(null), latitude: z.number().min(-90).max(90).nullable().default(null), address: z.string().max(300).nullable().default(null) }),
      distanceMeters: z.number().nonnegative().max(2_000_000).nullable().default(null),
      durationMinutes: z.number().int().nonnegative().max(100_000).nullable().default(null),
      geometry: z.array(z.object({ longitude: z.number().min(-180).max(180), latitude: z.number().min(-90).max(90) })).default([]),
      status: z.enum(['verified', 'estimated', 'unknown']).default('unknown'),
      source: z.string().max(500).nullable().default(null),
      note: z.string().max(500).nullable().default(null),
    }).nullable().default(null),
  })).max(80).default([]),
  endpoints: z.array(itineraryGroupEndpoint.extend({
    waypointIndex: itineraryGroupEndpoint.shape.waypointIndex.nullable().default(null),
    trackFinish: itineraryGroupEndpoint.shape.trackFinish.nullable().default(null),
    endDistanceKm: itineraryGroupEndpoint.shape.endDistanceKm.nullable().default(null),
    locationName: itineraryGroupEndpoint.shape.locationName.nullable().default(null),
    estimateBasis: itineraryGroupEndpoint.shape.estimateBasis.nullable().default(null),
    userDistanceQuote: itineraryGroupEndpoint.shape.userDistanceQuote.nullable().default(null),
    overnightReview: z.null().default(null),
  })).max(30).default([]),
  mapLocation: z.object({
    query: z.string().min(1).max(160),
    region: z.string().min(1).max(120).nullable().default(null),
  }).nullable().default(null),
  schedule: z.object({
    totalDays: z.number().int().min(1).max(365),
    plannedDate: z.string().nullable().default(null),
    dayAssignments: z.array(z.object({ from: z.string().min(1).max(100), toDay: z.number().int().min(1).max(365) })).default([]),
  }).nullable().default(null),
});

// Chunked-plan handoffs. When one oversized PlanDocument output is rejected
// or misses the budget, the planner first emits this small outline and then
// fills each day chunk independently, so a single failed output can no longer
// lose the whole plan. Every reused shape stays the same schema the save
// stage consumes, not a looser copy.
export const planSkeletonSchema = planDocumentSchema.pick({
  journey: true,
  mapLocation: true,
  schedule: true,
  transport: true,
  packingProfile: true,
  assumptions: true,
  unverified: true,
  blocker: true,
  pendingQuestion: true,
}).extend({
  dayNames: z.array(z.string().min(1).max(40)).max(40).default([])
    .describe('按顺序列出的全部行程日，如 Day 1、Day 2；与 journey.days 一致，无法确定时留空并写入 blocker 或 pendingQuestion'),
});
export type PlanSkeleton = z.infer<typeof planSkeletonSchema>;

export const planChunkSchema = z.object({
  itineraryItems: z.array(itineraryItem).max(30).default([])
    .describe('仅本组覆盖天数的行程条目；其他天留给后续轮次，不要重复前序天'),
  endpoints: z.array(itineraryGroupEndpoint).max(15).default([])
    .describe('仅本组徒步日的终点'),
});
export type PlanChunk = z.infer<typeof planChunkSchema>;


// Renders an unsaved or partially saved plan as the existing draft shape so
// the response can show a proposal that was never written to the database.
export function planDraftFrom(plan: PlanDocument): PlanDraft {
  const lines: string[] = [];
  if (plan.journey) {
    const facts = [plan.journey.region, plan.journey.plannedDate, plan.journey.days ? `${plan.journey.days} 天` : ''].filter(Boolean);
    lines.push(`${plan.journey.name}${facts.length ? `（${facts.join(' · ')}）` : ''}`);
  }
  const byDay = new Map<string, string[]>();
  for (const item of plan.itineraryItems || []) {
    const times = item.timeStart ? `${item.timeStart}${item.timeEnd ? `-${item.timeEnd}` : ''} ` : '';
    byDay.set(item.day, [...(byDay.get(item.day) || []), `${times}${item.title}`]);
  }
  for (const [day, items] of byDay) lines.push(`${day}: ${items.join('；')}`);
  for (const endpoint of plan.endpoints || []) {
    lines.push(`${endpoint.day} 终点：${endpoint.locationName || (endpoint.trackFinish ? '轨迹终点' : `${endpoint.endDistanceKm ?? ''} km`)}${
      endpoint.overnightReview ? `（过夜候选，水源${endpoint.overnightReview.waterStatus === 'reported' ? '有攻略提及' : '未知'}）` : ''}`);
  }
  if (plan.transport) {
    const chain = (legs: typeof plan.transport.outbound) => legs.map(leg => `${leg.from}→${leg.to}(${leg.mode})`).join('，');
    if (plan.transport.outbound.length) lines.push(`去程：${chain(plan.transport.outbound)}`);
    if (plan.transport.inbound.length) lines.push(`返程：${chain(plan.transport.inbound)}`);
    if (plan.transport.vehicleRetrieval) lines.push(`取车安排：${plan.transport.vehicleRetrieval}`);
    for (const issue of plan.transport.reviewIssues || []) lines.push(`待解决：${issue}`);
  }
  for (const assumption of plan.assumptions) lines.push(`假设：${assumption}`);
  for (const item of plan.unverified) lines.push(`待核实：${item}`);
  if (plan.blocker) lines.push(`阻塞：${plan.blocker}`);
  return {
    title: plan.journey?.name || (plan.transport ? '出行接驳方案' : '行程方案'),
    body: lines.join('\n').slice(0, 16000) || '（暂无可用内容）',
    assumptions: plan.assumptions,
    unverified: plan.unverified,
  };
}

// The ordered save operations a PlanDocument implies. Kept next to the schema
// so a new field cannot be added without deciding how it is written. The tool
// names are also the pipeline's dispatch gate: a task only enters the staged
// path when every authorized write is one of these (or packing items for a
// full-checklist task), so the save stage can never silently drop one.
export const saveToolNames = ['create_journey', 'update_journey_schedule', 'add_itinerary_items', 'set_itinerary_group_endpoints', 'set_journey_map_location'] as const;
export type SaveToolName = typeof saveToolNames[number];

export function saveOperations(plan: PlanDocument) {
  const operations: Array<{ tool: SaveToolName; args: Record<string, unknown> }> = [];
  if (plan.journey) operations.push({ tool: 'create_journey', args: { ...plan.journey } });
  if (plan.schedule) operations.push({ tool: 'update_journey_schedule', args: { ...plan.schedule } });
  if (plan.itineraryItems?.length) operations.push({ tool: 'add_itinerary_items', args: { items: plan.itineraryItems } });
  if (plan.endpoints?.length) operations.push({ tool: 'set_itinerary_group_endpoints', args: { endpoints: plan.endpoints } });
  if (plan.mapLocation) operations.push({ tool: 'set_journey_map_location', args: { ...plan.mapLocation } });
  return operations;
}
