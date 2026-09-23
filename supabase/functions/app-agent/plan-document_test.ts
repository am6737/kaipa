import { planDocumentModelSchema, planDocumentSchema, planDraftFrom, researchBriefSchema, saveOperations } from './plan-document.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function rejects(run: () => unknown, message: string) {
  let rejected = false;
  try { run(); } catch { rejected = true; }
  assert(rejected, message);
}

// Every section is required and explicitly null when unused: the planner has to
// decide, and the save stage never has to guess between "absent" and "empty".
const minimalPlan = {
  journey: { name: '党岭三湖连穿', region: '四川', days: 2 },
  mapLocation: null,
  schedule: null,
  transport: null,
  packingProfile: null,
  assumptions: [],
  unverified: [],
  blocker: null,
  pendingQuestion: null,
};

Deno.test('plan document keeps the argument shape of the tool that saves it', () => {
  const plan = planDocumentSchema.parse({
    ...minimalPlan,
    itineraryItems: [{ day: 'Day 1', title: '党岭村出发', timeStart: '07:00' }],
    endpoints: [{ day: 'Day 1', trackFinish: false, waypointIndex: 3 }],
  });
  assert(plan.journey?.days === 2, 'journey defaults were not applied');
  const operations = saveOperations(plan);
  assert(
    JSON.stringify(operations.map((operation) => operation.tool))
      === JSON.stringify(['create_journey', 'add_itinerary_items', 'set_itinerary_group_endpoints']),
    `unexpected save order: ${operations.map((operation) => operation.tool).join(',')}`,
  );
  // update_journey_schedule stays between creation and the itinerary when present.
  const replan = saveOperations(planDocumentSchema.parse({
    ...minimalPlan, journey: null, mapLocation: { query: '党岭村' },
    schedule: { totalDays: 3, dayAssignments: [{ from: 'Day 1', toDay: 1 }, { from: 'Day 2', toDay: 2 }] },
    itineraryItems: [{ day: 'Day 1', title: '党岭村出发' }],
  }));
  assert(
    JSON.stringify(replan.map((operation) => operation.tool))
      === JSON.stringify(['update_journey_schedule', 'add_itinerary_items', 'set_journey_map_location']),
    `unexpected replan order: ${replan.map((operation) => operation.tool).join(',')}`,
  );
});

Deno.test('plan document rejects invented fields instead of passing them to the writer', () => {
  const stripped = planDocumentSchema.parse({ ...minimalPlan, itineraryItems: [{ day: 'Day 1', title: '徒步' }], injectedOperation: 'delete_itinerary_items' });
  assert(
    !saveOperations(stripped).some(operation => String(operation.tool) === 'delete_itinerary_items'),
    'a field outside the document must never become a save operation',
  );
  rejects(() => planDocumentSchema.parse({ ...minimalPlan, journey: { name: 'x', days: 0 } }), 'a zero-day journey must be rejected');
  planDocumentModelSchema.parse({ ...minimalPlan, journey: { name: 'x', days: null } });
  rejects(() => planDocumentSchema.parse({ ...minimalPlan, journey: { name: 'x', days: null } }), 'a persisted journey with unknown days must be rejected');
  rejects(() => planDocumentSchema.parse({ ...minimalPlan, journey: { name: 'x', plannedDate: '2026/09/18' } }), 'a non ISO date must be rejected');
  rejects(() => planDocumentSchema.parse({ ...minimalPlan, itineraryItems: [{ day: 'Day 1', title: '出发', timeStart: '7:00' }] }), 'a non HH:mm start time must be rejected');
  // A blocked or questioned plan is still a valid document; only the schema shape is enforced here.
  const blocked = planDocumentSchema.parse({ ...minimalPlan, journey: null, blocker: '缺少可用轨迹' });
  assert(blocked.blocker === '缺少可用轨迹', 'blockers must survive parsing');
});

Deno.test('a plan with no saved write renders as an unsaved draft', () => {
  const plan = planDocumentSchema.parse({
    ...minimalPlan,
    itineraryItems: [
      { day: 'Day 1', title: '党岭村出发', timeStart: '07:00', timeEnd: '08:00' },
      { day: 'Day 2', title: '卓雍措营地' },
    ],
    endpoints: [{ day: 'Day 2', trackFinish: true }],
    assumptions: ['按两天安排'],
    unverified: ['营地水源情况未知'],
  });
  const draft = planDraftFrom(plan);
  assert(draft.title === '党岭三湖连穿', 'draft title must come from the journey name');
  assert(draft.body.includes('Day 1') && draft.body.includes('07:00-08:00 党岭村出发'), 'draft body must list the itinerary');
  assert(draft.body.includes('Day 2 终点：轨迹终点'), 'draft body must state the endpoints');
  assert(draft.assumptions.length === 1 && draft.unverified.length === 1, 'assumptions and unverified facts must be carried');
});

Deno.test('a transport-only plan names itself and keeps the chain', () => {
  const plan = planDocumentSchema.parse({
    ...minimalPlan,
    journey: null,
    transport: {
      direction: 'round_trip', origin: '成都', returnDestination: '成都',
      trailStart: '党岭村', trailFinish: '卡尔杂村', hikeStart: 480, hikeEnd: 3200,
      arrivalBuffer: 60, departureBuffer: 90,
      outbound: [{ from: '成都', to: '丹巴', mode: 'bus', departure: 0, arrival: 400, bufferBefore: 30, verified: false, sourceUrl: null, fallback: null }],
      inbound: [], vehicleRetrieval: null,
    },
  });
  const draft = planDraftFrom(plan);
  assert(draft.title === '出行接驳方案', 'a transport plan must not be titled like a journey');
  assert(draft.body.includes('成都→丹巴(bus)'), 'the chain must be rendered');
  assert(plan.transport?.hikeStart === 480, 'the relative-minute hiking window must survive');
});

Deno.test('research brief separates evidence from unresolved facts', () => {
  const brief = researchBriefSchema.parse({
    destination: '党岭', chosenRoute: null,
    overnightCandidates: [{
      day: 'Day 1', waypointIndex: 4, waypointName: '卓雍措营地', endDistanceKm: 9.18, trackFinish: false,
      campSuitability: '轨迹标注营地', water: '未知', guideSourceUrl: null, guideQuote: null,
    }],
    facts: [{ fact: '党岭村可住宿', sourceUrl: 'https://example.com/guide' }],
    waterAndResupply: ['党岭村可补水'],
    unresolved: ['夏羌拉垭口冬季路况'],
  });
  assert(brief.overnightCandidates[0].waypointIndex === 4, 'a candidate overnight point must keep its track index');
  assert(brief.unresolved.length === 1, 'unresolved facts must be reported');
  // A provider that omits an empty section must not fail a run whose work is done.
  const sparse = researchBriefSchema.parse({ destination: '党岭' });
  assert(
    sparse.unresolved.length === 0 && sparse.overnightCandidates.length === 0 && sparse.chosenRoute === null && sparse.facts.length === 0,
    'omitted sections must default instead of failing the brief',
  );
});

Deno.test('a brief written before routeFacts existed still parses', () => {
  // findRecentBrief re-parses stored artifacts with safeParse to decide whether
  // a destination can be reused. A new required field would silently disable
  // that reuse, so routeFacts has to default.
  const stored = researchBriefSchema.safeParse({
    destination: '党岭', chosenRoute: null, facts: [], unresolved: [], routes: [],
  });
  assert(stored.success, 'an artifact predating routeFacts must still parse');
  assert(stored.data.routeFacts.length === 0, 'the missing section must default to empty rather than failing');
  // And the model's own output for it is accepted, then overwritten by the system.
  const withFacts = researchBriefSchema.safeParse({
    destination: '党岭',
    routeFacts: [{ entryId: 'fact-1', title: '葫芦海营地' }],
  });
  assert(withFacts.success && withFacts.data.routeFacts[0].entryId === 'fact-1', 'a model-emitted list parses before bindRouteFacts replaces it');
  const suggestion = researchBriefSchema.safeParse({
    destination: '党岭',
    factSuggestions: [{ routeId: 'trk008', category: 'campsite', title: '营地更新', fields: [{ key: '水源', value: '有' }], targetEntryId: 'fact-1' }],
  });
  assert(suggestion.success && suggestion.data.factSuggestions[0].targetEntryId === 'fact-1', 'a revision suggestion must carry its target');
  const plain = researchBriefSchema.safeParse({
    destination: '党岭',
    factSuggestions: [{ routeId: 'trk008', category: 'campsite', title: '新营地', fields: [{ key: '水源', value: '无' }] }],
  });
  assert(plain.success && plain.data.factSuggestions[0].targetEntryId === null, 'a draft with no target defaults to a new entry');
});
