import type {
  PlanDocument,
  ResearchBrief,
  TransportPlan,
} from "./plan-document.ts";
import { validatePlanFeasibility } from "./plan-feasibility.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
type Item = PlanDocument["itineraryItems"][number];
type Endpoint = PlanDocument["endpoints"][number];
type Route = ResearchBrief["routes"][number];
function place(name: string): NonNullable<Item["location"]> {
  return {
    name,
    source: "custom",
    longitude: null,
    latitude: null,
    address: null,
    trackId: null,
    trackMeters: null,
    trackLengthMeters: null,
    incomingMode: null,
  };
}
function item(day: string, overrides: Partial<Item> = {}): Item {
  return {
    day,
    kind: "activity",
    title: "山间徒步",
    routeId: "trk008",
    timeStart: null,
    timeEnd: null,
    startLocation: null,
    location: null,
    ...overrides,
  };
}
function endpoint(day: string, overrides: Partial<Endpoint> = {}): Endpoint {
  return {
    day,
    routeId: "trk008",
    waypointIndex: null,
    trackFinish: null,
    endDistanceKm: null,
    locationName: null,
    estimateBasis: null,
    userDistanceQuote: null,
    overnightReview: null,
    ...overrides,
  };
}
function plan(items: Item[] = [], endpoints: Endpoint[] = []): PlanDocument {
  return {
    journey: null,
    schedule: null,
    mapLocation: null,
    itineraryItems: items,
    endpoints,
    groupNotes: [],
    transport: null,
    packingProfile: null,
    assumptions: [],
    unverified: [],
    blocker: null,
    pendingQuestion: null, followUpSuggestion: null,
  };
}
function route(id = "trk008", name = "党岭三湖连穿"): Route {
  return {
    routeId: id,
    name,
    hikingDays: 2,
    distanceKm: 19.463,
    summary: "",
    sourceUrls: [],
    unresolved: [],
    start: null,
    end: null,
    waypoints: [
      { index: 0, name: "起点", distanceKm: 0, elevationMeters: 3389 },
      {
        index: 54,
        name: "D5：卓雍措营地",
        distanceKm: 9.179,
        elevationMeters: 4340,
      },
      {
        index: 104,
        name: "终点：卡尔杂",
        distanceKm: 19.463,
        elevationMeters: 3780,
      },
    ],
  };
}
function research(routes: Route[] = [route()]): ResearchBrief {
  return {
    destination: "",
    routes,
    chosenRoute: null,
    overnightCandidates: [],
    facts: [],
    routeFacts: [],
    factSuggestions: [], guideEvidence: [],
    waterAndResupply: [],
    transportOptions: [],
    unresolved: [],
    suggestedDays: null,
    durationBasis: "",
  };
}
function transport(durationMinutes: number | null = null): TransportPlan {
  return {
    mainTravel: null,
    segments: [{
      fromRoute: "党岭三湖连穿",
      toRoute: "雅拉温泉线",
      from: "卡尔杂",
      to: "雅拉起点",
      mode: durationMinutes == null ? "unknown" : "car",
      durationMinutes,
      overnightRequired: false,
      verified: false,
      sourceUrl: null,
      note: "",
      fromLocation: null,
      toLocation: null,
    }],
    totalTransportMinutes: null,
    recommendedDays: null,
    basis: "",
    unresolved: [],
  };
}
const context = { now: Date.parse("2026-10-08T12:00:00Z"), plannedDate: null };
const code = (
  result: ReturnType<typeof validatePlanFeasibility>,
  name: string,
) => result.issues.filter((issue) => issue.code === name);
const evaluate = (
  document: PlanDocument,
  extra: Partial<Parameters<typeof validatePlanFeasibility>[1]> = {},
) => validatePlanFeasibility(document, { ...context, ...extra });
const transfer = (day = "Day 2", overrides: Partial<Item> = {}) =>
  item(day, {
    kind: "custom",
    routeId: null,
    title: "路线间接驳：党岭三湖连穿终点→雅拉温泉线起点",
    startLocation: place("卡尔杂"),
    location: place("雅拉起点"),
    ...overrides,
  });

Deno.test("past_departure: China-local G3586 departure is already past at 20:00", () => {
  const p = plan([
    item("Day 1", {
      kind: "custom",
      title: "高铁 G3586 南宁东→成都东",
      timeStart: "16:43",
      timeEnd: "23:02",
    }),
  ]);
  const issues = code(
    evaluate(p, { plannedDate: "2026-10-08" }),
    "past_departure",
  );
  assert(
    issues.length === 1 && issues[0].severity === "blocker",
    "must block past G3586",
  );
  assert(
    issues[0].detail?.startAt === "2026-10-08T08:43:00.000Z",
    "UTC+8 conversion",
  );
});
Deno.test("past_departure: buffer boundary, subsequent day and Chinese day labels", () => {
  const p = plan([
    item("第一天", { timeStart: "21:00" }),
    item("Day 2", { timeStart: "06:00" }),
  ]);
  assert(
    !code(evaluate(p, { plannedDate: "2026-10-08" }), "past_departure").length,
    "exact one-hour boundary and next day allowed",
  );
  p.itineraryItems[0].timeStart = "20:59";
  assert(
    code(evaluate(p, { plannedDate: "2026-10-08" }), "past_departure")
      .length === 1,
    "inside buffer blocked",
  );
});
Deno.test("past_departure: missing/invalid dates, times and unnumbered groups silently skipped", () => {
  const p = plan([item("自由行", { timeStart: "08:00" }), item("Day 1")]);
  for (const plannedDate of [null, "2026-02-30", "2026-10-08"]) {
    assert(
      !code(evaluate(p, { plannedDate }), "past_departure").length,
      "no invented absolute time",
    );
  }
});
Deno.test("daily_load: warning and blocker thresholds are strict", () => {
  for (
    const [end, expected] of [["18:00", null], ["18:01", "warning"], [
      "22:00",
      "warning",
    ], ["22:01", "blocker"]] as const
  ) {
    const result = evaluate(
      plan([item("Day 1", { timeStart: "08:00", timeEnd: end })]),
    );
    assert(
      (code(result, "daily_load")[0]?.severity ?? null) === expected,
      `threshold at ${end}`,
    );
  }
});
Deno.test("daily_load: hike plus timed custom transfer; unrelated custom items do not count", () => {
  const result = evaluate(
    plan([
      item("Day 1", { timeStart: "06:00", timeEnd: "15:00" }),
      transfer("Day 1", { timeStart: "15:00", timeEnd: "21:00" }),
      item("Day 1", {
        kind: "custom",
        title: "参观博物馆",
        timeStart: "21:00",
        timeEnd: "22:00",
      }),
    ]),
  );
  assert(
    code(result, "daily_load")[0]?.severity === "blocker",
    "15 hours total",
  );
  assert(result.days[0].transferHours === 6, "only transport");
});
Deno.test("daily_load: consecutive endpoint differences and route resets", () => {
  const r = route();
  r.waypoints[1].distanceKm = 44;
  r.waypoints[2].distanceKm = 48;
  const second = route("trk065", "雅拉温泉线");
  second.waypoints[1].distanceKm = 8;
  const result = evaluate(
    plan([item("Day 1"), item("Day 2"), item("Day 3", { routeId: "trk065" })], [
      endpoint("Day 1", { waypointIndex: 54 }),
      endpoint("Day 2", { waypointIndex: 104 }),
      endpoint("Day 3", { routeId: "trk065", waypointIndex: 54 }),
    ]),
    { research: research([r, second]) },
  );
  assert(
    result.days.map((day) => day.hikingHours).join() === "11,1,2",
    "do not sum cumulative distance or mix routes",
  );
  assert(
    code(result, "daily_load")[0]?.detail?.estimated === true,
    "label estimate",
  );
});
Deno.test("daily_load: real cumulative ascent counter is used; net elevation is never ascent", () => {
  const r = route();
  Object.assign(r.waypoints[0], { cumulativeAscentMeters: 0 });
  Object.assign(r.waypoints[1], { cumulativeAscentMeters: 600 });
  const p = plan([item("Day 1")], [endpoint("Day 1", { waypointIndex: 54 })]);
  assert(
    evaluate(p, { research: research([r]) }).days[0].hikingHours ===
      9.179 / 4 + 1,
    "actual ascent term",
  );
  assert(
    evaluate(p, { research: research() }).days[0].hikingHours === 9.179 / 4,
    "no inferred ascent from heights",
  );
});
Deno.test("daily_load: explicit hiking takes precedence and missing inputs remain null", () => {
  const p = plan([item("Day 1", { timeStart: "08:00", timeEnd: "09:00" })], [
    endpoint("Day 1", { endDistanceKm: 100 }),
  ]);
  assert(
    evaluate(p, { research: research() }).days[0].hikingHours === 1,
    "explicit precedence",
  );
  const result = evaluate(plan([item("Day 1"), transfer("Day 1")]));
  assert(
    result.days[0].hikingHours === null &&
      result.days[0].transferHours === null,
    "unknown loads",
  );
  assert(
    !code(result, "daily_load").length,
    "unknown inputs alone do not flag daily load",
  );
});
Deno.test("daily_load: known matched segments and review legs without double counting", () => {
  const p = plan([
    item("Day 2", { timeStart: "08:00", timeEnd: "16:00" }),
    transfer(),
  ]);
  const t = transport(180);
  assert(
    evaluate(p, { transportPlan: t }).days[0].transferHours === 3,
    "segment matched to actual day",
  );
  p.itineraryItems[1].timeStart = "16:00";
  p.itineraryItems[1].timeEnd = "19:00";
  assert(
    evaluate(p, { transportPlan: t }).days[0].transferHours === 3,
    "timed row and segment count once",
  );
  p.itineraryItems[1].timeStart = null;
  p.itineraryItems[1].timeEnd = null;
  p.transport = {
    direction: "round_trip",
    origin: null,
    returnDestination: null,
    trailStart: "",
    trailFinish: "",
    hikeStart: 0,
    hikeEnd: 0,
    arrivalBuffer: 0,
    departureBuffer: 0,
    outbound: [{
      from: "卡尔杂",
      to: "雅拉起点",
      mode: "shuttle",
      departure: 0,
      arrival: 240,
      bufferBefore: 0,
      verified: false,
      sourceUrl: null,
      fallback: null,
    }],
    inbound: [],
    vehicleRetrieval: null,
    reviewIssues: [],
    unverified: [],
  };
  assert(
    evaluate(p).days[0].transferHours === 4,
    "matched review leg duration",
  );
  assert(
    evaluate(plan([item("Day 1")]), { transportPlan: t }).days[0]
      .transferHours === 0,
    "unassigned segment silently skipped",
  );
});
Deno.test("unknown_same_day_transfer: archived 6782ab8d Day 2 trk008 to trk065", () => {
  const p = plan([
    item("Day 1"),
    item("Day 2", { title: "卓雍措营地→终点：卡尔杂" }),
    transfer(),
    item("Day 3", { routeId: "trk065" }),
  ], [
    endpoint("Day 1", { waypointIndex: 54 }),
    endpoint("Day 2", { trackFinish: true }),
  ]);
  const result = evaluate(p, {
    research: research(),
    transportPlan: transport(),
  });
  assert(
    code(result, "unknown_same_day_transfer").some((issue) =>
      issue.day === "Day 2"
    ),
    "unknown inter-route transfer after hike",
  );
});
Deno.test("unknown_same_day_transfer: known duration, separate travel day and local transit are negative", () => {
  assert(
    !code(
      evaluate(plan([item("Day 2"), transfer()]), {
        transportPlan: transport(120),
      }),
      "unknown_same_day_transfer",
    ).length,
    "known duration",
  );
  assert(
    !code(
      evaluate(plan([item("Day 1"), transfer()]), {
        transportPlan: transport(),
      }),
      "unknown_same_day_transfer",
    ).length,
    "dedicated transfer day",
  );
  assert(
    !code(
      evaluate(
        plan([
          item("Day 1"),
          transfer("Day 1", {
            title: "市内地铁",
            startLocation: null,
            location: null,
          }),
        ]),
      ),
      "unknown_same_day_transfer",
    ).length,
    "local movement not cross-region",
  );
});
Deno.test("unknown_same_day_transfer: untimed cross-region warning; unknown mode remains unknown despite times", () => {
  assert(
    code(
      evaluate(plan([item("Day 2"), transfer()])),
      "unknown_same_day_transfer",
    ).length === 1,
    "untimed inter-route row",
  );
  const result = evaluate(
    plan([
      item("Day 2"),
      transfer("Day 2", { timeStart: "16:00", timeEnd: "18:00" }),
    ]),
    { transportPlan: transport() },
  );
  assert(
    code(result, "unknown_same_day_transfer").length === 1,
    "unknown segment retained",
  );
});
Deno.test("multi_route_same_day: canonical labels group two routes, distinct days and null ids do not", () => {
  assert(
    code(
      evaluate(plan([item("Day 1"), item("第一天", { routeId: "trk065" })])),
      "multi_route_same_day",
    ).length === 1,
    "two routes same day",
  );
  assert(
    !code(
      evaluate(
        plan([
          item("Day 1"),
          item("Day 2", { routeId: "trk065" }),
          item("Day 1", { routeId: null }),
        ]),
      ),
      "multi_route_same_day",
    ).length,
    "different days/null unknown route",
  );
});
Deno.test("missing_overnight: archived f2c17d0d Day 4; Day 5 exit does not cover Day 4", () => {
  const p = plan([
    item("Day 3"),
    item("Day 3", { kind: "stay", title: "卓雍措营地过夜" }),
    item("Day 4", { title: "卓雍措至卡尔杂", location: place("终点：卡尔杂") }),
    transfer("Day 5", { title: "出山接驳至成都", location: place("成都") }),
  ], [
    endpoint("Day 3", { waypointIndex: 54 }),
    endpoint("Day 4", { trackFinish: true, locationName: "终点：卡尔杂" }),
  ]);
  assert(
    code(evaluate(p, { research: research() }), "missing_overnight").some(
      (issue) => issue.day === "Day 4",
    ),
    "missing Day 4 lodging",
  );
});
Deno.test("missing_overnight: camp, stay, later same-day transfer and last day suppress warning", () => {
  for (
    const rows of [[item("Day 1", { kind: "stay", title: "卡尔杂民宿" })], [
      transfer("Day 1"),
    ]]
  ) {
    const result = evaluate(
      plan([item("Day 1"), ...rows, item("Day 2")], [
        endpoint("Day 1", { trackFinish: true }),
      ]),
      { research: research() },
    );
    assert(!code(result, "missing_overnight").length, "stay or exit");
  }
  assert(
    !code(
      evaluate(
        plan([item("Day 1"), item("Day 2")], [
          endpoint("Day 1", { waypointIndex: 54 }),
        ]),
        { research: research() },
      ),
      "missing_overnight",
    ).length,
    "camp waypoint",
  );
  assert(
    !code(
      evaluate(
        plan([item("Day 1")], [endpoint("Day 1", { trackFinish: true })]),
        { research: research() },
      ),
      "missing_overnight",
    ).length,
    "final day exempt",
  );
});
Deno.test("missing_overnight: morning transfer does not satisfy lodging after hike", () => {
  const result = evaluate(
    plan([
      transfer("Day 1", { timeStart: "07:00", timeEnd: "08:00" }),
      item("Day 1", { timeStart: "09:00", timeEnd: "17:00" }),
      item("Day 2"),
    ], [endpoint("Day 1", { trackFinish: true })]),
    { research: research() },
  );
  assert(
    code(result, "missing_overnight").length === 1,
    "transfer before hike ignored",
  );
});

function altitudePlan(elevations: (number | null)[]) {
  const r = route();
  r.waypoints = elevations.map((elevationMeters, n) => ({
    index: n,
    name: `第${n + 1}营地`,
    distanceKm: n * 4,
    elevationMeters,
  }));
  const p = plan(
    elevations.map((_, n) => item(`Day ${n + 1}`)),
    elevations.map((_, n) => endpoint(`Day ${n + 1}`, { waypointIndex: n })),
  );
  return { p, r };
}
Deno.test("sleeping_altitude: nightly gain above 500m at over 3000m is heuristic warning", () => {
  const { p, r } = altitudePlan([3200, 3801]);
  const result = evaluate(p, { research: research([r]) });
  assert(code(result, "sleeping_altitude")[0]?.day === "Day 2", "nightly gain");
  assert(
    code(result, "sleeping_altitude")[0]?.detail?.heuristic === true,
    "explicit heuristic detail",
  );
});
Deno.test("sleeping_altitude: first high night after known low night or train day", () => {
  const { p, r } = altitudePlan([1400, 3400]);
  assert(
    code(evaluate(p, { research: research([r]) }), "sleeping_altitude")
      .length === 1,
    "known low altitude",
  );
  const train = item("Day 1", {
    kind: "custom",
    routeId: null,
    title: "高铁 G3586",
    timeStart: "08:00",
    timeEnd: "15:00",
    location: place("成都东"),
  });
  const q = plan([train, item("Day 2")], [
    endpoint("Day 2", { waypointIndex: 54 }),
  ]);
  assert(
    code(evaluate(q, { research: research() }), "sleeping_altitude").length ===
      1,
    "train/city preceding day without invented elevation",
  );
});
Deno.test("sleeping_altitude: boundaries, gradual gain, unknown elevation and no previous night do not warn", () => {
  for (
    const values of [[2500, 3000], [3200, 3700], [null, 4300], [
      4340,
    ]] as (number | null)[][]
  ) {
    const { p, r } = altitudePlan(values);
    assert(
      !code(evaluate(p, { research: research([r]) }), "sleeping_altitude")
        .length,
      `negative ${values}`,
    );
  }
});
Deno.test("sleeping_altitude: transferring away or staying elsewhere cannot inherit endpoint elevation", () => {
  const { p, r } = altitudePlan([1400, 4340]);
  p.itineraryItems.push(
    transfer("Day 2", { title: "出山接驳至成都", location: place("成都") }),
  );
  const result = evaluate(p, { research: research([r]) });
  assert(
    result.days[1].sleepLocation === "成都" &&
      result.days[1].sleepElevationMeters === null,
    "city altitude unknown",
  );
  assert(
    !code(result, "sleeping_altitude").length,
    "not sleeping at high endpoint",
  );
});
Deno.test("provider-only rows: past departure checked, city sleep anchored, no mutation or duplicate counts", () => {
  const provider = item("Day 1", {
    kind: "custom",
    title: "高铁 G3586",
    routeId: null,
    timeStart: "16:43",
    timeEnd: "23:02",
    location: place("南宁东"),
  });
  const arrival = item("Day 1", {
    kind: "custom",
    title: "抵达成都东",
    routeId: null,
    timeStart: "23:02",
    location: { ...place("成都东"), incomingMode: "rail" },
  });
  const t = transport();
  t.segments = [];
  t.mainTravel = {
    request: {
      origin: null,
      returnDestination: null,
      modes: [],
      adults: 1,
      originQuote: "",
      modesQuote: "",
    },
    queries: [],
    itineraryItems: [provider, arrival],
    unresolved: [],
    suggestedDays: null,
    durationBasis: "",
  };
  const p = plan([{
    ...provider,
    title: "G3586 南宁东—成都东",
    location: place("成都东"),
  }]);
  const before = JSON.stringify({ p, t });
  const result = evaluate(p, { plannedDate: "2026-10-08", transportPlan: t });
  assert(
    code(result, "past_departure").length === 1,
    "provider service checked once",
  );
  assert(result.days[0].sleepLocation === "成都东", "arrival city anchors day");
  assert(
    result.days[0].transferHours === 379 / 60,
    "arrival marker does not add duration",
  );
  assert(JSON.stringify({ p, t }) === before, "pure validation");
});

Deno.test("unknown_same_day_transfer: an untimed transfer to another researched trailhead needs no segment", () => {
  const second = route("trk065", "雅拉温泉线");
  const result = evaluate(
    plan([item("Day 2"), transfer("Day 2", { title: "接驳至雅拉温泉线起点" })]),
    { research: research([route(), second]) },
  );
  assert(
    code(result, "unknown_same_day_transfer").length === 1,
    "explicit destination is a different route",
  );
});

Deno.test("daily_load: partial known loads can block but are labelled incomplete", () => {
  const result = evaluate(
    plan([
      item("Day 1", { timeStart: "06:00", timeEnd: "21:00" }),
      item("Day 1"),
      transfer("Day 1"),
    ]),
  );
  const issue = code(result, "daily_load")[0];
  assert(
    issue?.severity === "blocker" && issue.detail?.incomplete === true &&
      issue.detail?.estimated === false,
    "known minimum already exceeds fourteen hours; missing activities are not invented",
  );
});

Deno.test("daily_load: overnight intervals require explicit overnight wording", () => {
  const p = plan([
    item("Day 1", {
      kind: "custom",
      title: "夜行卧铺次日抵达",
      timeStart: "22:00",
      timeEnd: "07:00",
    }),
  ]);
  assert(
    evaluate(p).days[0].transferHours === 9,
    "explicit overnight duration",
  );
  p.itineraryItems[0].title = "火车出行";
  assert(
    evaluate(p).days[0].transferHours === null,
    "invalid reversed range silently skipped",
  );
});
