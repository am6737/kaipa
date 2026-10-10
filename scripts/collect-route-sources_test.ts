import {
  collectRouteSources,
  ConfigurationError,
  parseCollectorArgs,
  writeInbox,
} from "./collect-route-sources.ts";
import type {
  CollectorDependencies,
  InboxDocument,
} from "./collect-route-sources.ts";
import { GUIDE_LIMITS } from "../supabase/functions/app-agent/search/guide-reader.ts";
import type { GuideContent } from "../supabase/functions/app-agent/search/guide-reader.ts";
import type {
  TravelSearchProvider,
  TravelSearchResult,
  TravelSearchSource,
} from "../supabase/functions/app-agent/search/types.ts";

function assert(value: unknown, message = "Assertion failed"): asserts value {
  if (!value) throw new Error(message);
}
function equal(actual: unknown, expected: unknown) {
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${JSON.stringify(actual)} != ${JSON.stringify(expected)}`,
  );
}
const timestamp = "2026-10-09T12:34:56.000Z";
function result(
  index: number,
  source: TravelSearchSource = "tavily",
): TravelSearchResult {
  return {
    source,
    kind: "guide",
    reliability: "community",
    title: `攻略 ${index}`,
    url: `https://hiking.cn/articles/${index}`,
    publishedAt: "2026-09-01",
  };
}
function body(url: string): GuideContent {
  return {
    available: true,
    status: "completed",
    url,
    retrievedAt: timestamp,
    text: "路线正文",
    truncated: false,
    images: [{ id: 1, url: "https://images.hiking.cn/camp.jpg" }],
    imagesTruncated: false,
    limitation: "Untrusted",
  };
}
function fixture(extra: CollectorDependencies = {}) {
  const writes: Array<{ path: string; document: InboxDocument }> = [];
  const logs: string[] = [];
  const sleeps: number[] = [];
  const deps: CollectorDependencies = {
    env: () => undefined,
    fetch: () => {
      throw new Error("Unexpected network");
    },
    routes: [{ id: "r1", name: "哈天线" }, { id: "r2", name: "贡嘎线" }],
    providers: [{
      source: "tavily",
      search: async () => ({ available: true, results: [result(1)] }),
    }],
    read: async (url) => body(url),
    clock: {
      now: () => new Date(timestamp),
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    },
    writer: async (path, document) => {
      writes.push({ path, document });
    },
    log: (message) => {
      logs.push(message);
    },
    ...extra,
  };
  return { deps, writes, logs, sleeps };
}

Deno.test("dry-run makes zero metadata/provider/reader calls and writes nothing", async () => {
  const fail = () => {
    throw new Error("Dry-run invoked network");
  };
  const test = fixture({
    routes: undefined,
    gapRows: undefined,
    providers: [{ source: "tavily", search: fail }],
    read: fail,
    fetch: fail,
  });
  const collected = await collectRouteSources({
    routeIds: ["r1"],
    gaps: true,
    dryRun: true,
  }, test.deps);
  equal(collected.plans[0].query, "<route name for r1> 徒步 攻略");
  equal(test.writes, []);
  equal(test.sleeps, []);
  assert(test.logs.some((log) => log.includes("no network")));
  const gapsOnly = await collectRouteSources(
    { gaps: true, dryRun: true },
    test.deps,
  );
  equal(gapsOnly.plans, []);
});

Deno.test("dry-run uses offline names and merges section hints into one query, respecting route limit", async () => {
  const test = fixture({
    gapRows: [
      { route_id: "r1", section: "access" },
      { route_id: "r1", section: "overnight" },
      { route_id: "r1", section: "costs" },
      { route_id: "r1", section: "water_supply" },
      { route_id: "r1", section: "season_risk" },
      { route_id: "r2", section: "*" },
    ],
  });
  const collected = await collectRouteSources({
    routeIds: ["r1", "r1"],
    gaps: true,
    limitRoutes: 1,
    dryRun: true,
  }, test.deps);
  equal(collected.plans.length, 1);
  equal(
    collected.plans[0].query,
    "哈天线 徒步 攻略 交通 营地 住宿 费用 水源 补给 季节 风险",
  );
});

Deno.test("verification_required disables that search provider for the whole run; others continue", async () => {
  let blockedCalls = 0;
  let workingCalls = 0;
  const test = fixture({
    providers: [
      {
        source: "douyin",
        search: async () => {
          blockedCalls++;
          return {
            available: false,
            results: [],
            error: "manual verification",
            errorCode: "verification_required",
          };
        },
      },
      {
        source: "tavily",
        search: async () => {
          workingCalls++;
          return { available: true, results: [result(1)] };
        },
      },
    ],
  });
  const collected = await collectRouteSources(
    { routeIds: ["r1", "r2"] },
    test.deps,
  );
  equal(blockedCalls, 1);
  equal(workingCalls, 2);
  equal(collected.disabledProviders, ["douyin"]);
  assert(
    collected.documents.every((doc) =>
      doc.errors.some((error) => error.code === "verification_required")
    ),
  );
  equal(test.logs.filter((log) => log.includes("provider disabled")).length, 1);
});

Deno.test("one discovery per route; failed extractions count toward the three article cap", async () => {
  let searches = 0;
  let reads = 0;
  const test = fixture({
    providers: [{
      source: "tavily",
      search: async () => {
        searches++;
        return {
          available: true,
          results: Array.from({ length: 8 }, (_, i) => result(i)),
        };
      },
    }],
    read: async (url) => {
      reads++;
      if (reads === 1) throw new Error("provider failed");
      return {
        ...body(url),
        text: "字".repeat(GUIDE_LIMITS.text + 10),
        images: Array.from(
          { length: 20 },
          (_, i) => ({ id: i, url: `https://images.hiking.cn/${i}.jpg` }),
        ),
      };
    },
  });
  const collected = await collectRouteSources({ routeIds: ["r1"] }, test.deps);
  equal(searches, 1);
  equal(reads, 3);
  equal(collected.documents[0].items.length, 3);
  assert(collected.documents[0].items[0].errors[0].code === "failed");
  equal(
    collected.documents[0].items[1].extractedText.length,
    GUIDE_LIMITS.text,
  );
  equal(
    collected.documents[0].items[1].imageCandidates?.length,
    GUIDE_LIMITS.candidates,
  );
  equal(test.sleeps, [5000, 5000, 5000]);
});

Deno.test("output has provenance and unknown author; all writes stay strictly inside _inbox", async () => {
  const test = fixture({ gapRows: [{ route_id: "r1", section: "access" }] });
  const collected = await collectRouteSources({
    routeIds: ["r1", "r2"],
    gaps: true,
  }, test.deps);
  equal(collected.paths, [
    `data/route-guides/_inbox/r1/${timestamp}.json`,
    `data/route-guides/_inbox/r2/${timestamp}.json`,
  ]);
  equal(test.writes[0].document, {
    routeId: "r1",
    routeName: "哈天线",
    gapSections: ["access"],
    collectedAt: timestamp,
    items: [{
      platform: "tavily",
      url: result(1).url,
      title: "攻略 1",
      author: null,
      publishedAt: "2026-09-01",
      extractedText: "路线正文",
      errors: [],
      imageCandidates: ["https://images.hiking.cn/camp.jpg"],
    }],
    errors: [],
  });
  assert(
    test.writes.every((write) =>
      /^data\/route-guides\/_inbox\/[^/]+\/[^/]+\.json$/.test(write.path)
    ),
  );
  assert(test.writes.every((write) => !write.path.endsWith(".md")));
  let rejected = false;
  try {
    await collectRouteSources({ routeIds: ["../../escape"] }, test.deps);
  } catch (error) {
    rejected = error instanceof ConfigurationError;
  }
  assert(rejected);
  equal(test.writes.length, 2);
  for (
    const path of [
      "data/route-guides/r1.md",
      "/tmp/escape.json",
      `data/route-guides/_inbox/r1/../${timestamp}.json`,
    ]
  ) {
    rejected = false;
    try {
      await writeInbox(path, test.writes[0].document);
    } catch (error) {
      rejected = error instanceof ConfigurationError;
    }
    assert(rejected, `Writer accepted ${path}`);
  }
});

Deno.test("service-role metadata fetches are GET-only; queue groups distinct routes and resolves names", async () => {
  const calls: URL[] = [];
  const test = fixture({
    routes: undefined,
    gapRows: undefined,
    env: (name) =>
      ({
        SUPABASE_URL: "http://supabase.local",
        SUPABASE_SERVICE_ROLE_KEY: "secret-fixture",
      })[name],
    fetch: async (input, init) => {
      const url = new URL(String(input));
      calls.push(url);
      const requestInit = init as
        | { method?: string; headers?: HeadersInit }
        | undefined;
      assert(!requestInit?.method || requestInit.method === "GET");
      equal(
        new Headers(requestInit?.headers).get("Authorization"),
        "Bearer secret-fixture",
      );
      if (url.pathname.endsWith("route_guide_gap_queue")) {
        const rows = [{ route_id: "r1", section: "access" }, {
          route_id: "r1",
          section: "overnight",
        }, { route_id: "r2", section: "*" }];
        const filter = url.searchParams.get("route_id")?.slice(3);
          return Response.json(
            filter
              ? rows.filter((row) => row.route_id === filter)
              : rows.filter((row) => row.section !== 'overnight'),
          );
      }
      return Response.json([{
        id: url.searchParams.get("id")!.slice(3),
        name: "数据库线路名",
      }]);
    },
  });
  const collected = await collectRouteSources(
    { gaps: true, limitRoutes: 2 },
    test.deps,
  );
  equal(calls.length, 5);
  equal(collected.plans.length, 2);
  equal(collected.documents[0].routeName, "数据库线路名");
  equal(collected.plans[0].query, "数据库线路名 徒步 攻略 交通 营地 住宿");
  assert(!test.logs.join("").includes("secret-fixture"));
});

Deno.test("real registry and reader adapters pace every HTTP request, including Tavily key retries", async () => {
  const events: string[] = [];
  const original = globalThis.fetch;
  const test = fixture({
    providers: undefined,
    read: undefined,
    env: (name) =>
      ({ TRAVEL_SEARCH_SOURCES: "tavily", TAVILY_API_KEYS: "key-one,key-two" })[
        name
      ],
    clock: {
      now: () => new Date(timestamp),
      sleep: async (ms) => {
        events.push(`sleep:${ms}`);
      },
    },
    fetch: async (input) => {
      const url = String(input);
      events.push(url.endsWith("/search") ? "search" : "extract");
      if (events.length === 1) return new Response("{}", { status: 500 });
      return Response.json(
        url.endsWith("/search")
          ? { results: [{ title: "徒步攻略", url: result(1).url }] }
          : {
            results: [{
              url: result(1).url,
              raw_content: "完整正文",
              images: [],
            }],
          },
      );
    },
  });
  const collected = await collectRouteSources({
    routeIds: ["r1"],
    delayMs: 7000,
  }, test.deps);
  equal(events, ["search", "sleep:7000", "search", "sleep:7000", "extract"]);
  equal(collected.documents[0].items[0].extractedText, "完整正文");
  assert(globalThis.fetch === original, "Global fetch must be restored");
});

Deno.test("reader gateway verification stops Douyin search and extraction on later routes", async () => {
  const requests: string[] = [];
  const url = "https://www.douyin.com/note/1234567890123456789";
  const test = fixture({
    providers: undefined,
    read: undefined,
    env: (name) =>
      ({
        TRAVEL_SEARCH_SOURCES: "douyin",
        MEDIACRAWLER_SEARCH_URL: "http://gateway.local/search",
        MEDIACRAWLER_API_KEY: "gateway-key",
      })[name],
    fetch: async (input) => {
      requests.push(String(input));
      return String(input).endsWith("/search")
        ? Response.json({ results: [{ title: "攻略", url }] })
        : Response.json({ detail: "verification_required: manual check" }, {
          status: 503,
        });
    },
  });
  const collected = await collectRouteSources(
    { routeIds: ["r1", "r2"] },
    test.deps,
  );
  equal(requests, [
    "http://gateway.local/search",
    "http://gateway.local/content",
  ]);
  equal(collected.disabledProviders, ["douyin"]);
  equal(
    collected.documents[0].items[0].errors[0].code,
    "verification_required",
  );
  equal(collected.documents[1].items, []);
});

Deno.test("Tavily verification never sends another key or further provider requests", async () => {
  let calls = 0;
  const test = fixture({
    providers: undefined,
    read: undefined,
    env: (name) =>
      ({ TRAVEL_SEARCH_SOURCES: "tavily", TAVILY_API_KEYS: "key-one,key-two" })[
        name
      ],
    fetch: async () => {
      calls++;
      return Response.json({ errorCode: "verification_required" }, {
        status: 403,
      });
    },
  });
  const collected = await collectRouteSources(
    { routeIds: ["r1", "r2"] },
    test.deps,
  );
  equal(calls, 1);
  equal(collected.disabledProviders, ["tavily"]);
  assert(collected.documents.every((doc) => doc.items.length === 0));
});

Deno.test("provider failures persist as errors and credentials are redacted", async () => {
  const test = fixture({
    env: (name) => name === "MEDIACRAWLER_API_KEY" ? "secret-123" : undefined,
    providers: [{
      source: "xhs",
      search: () => {
        throw new Error("Upstream secret-123 rejected");
      },
    }],
  });
  const collected = await collectRouteSources({ routeIds: ["r1"] }, test.deps);
  equal(test.writes.length, 1);
  equal(collected.documents[0].items, []);
  assert(collected.documents[0].errors[0].message.includes("[redacted]"));
  assert(!JSON.stringify(collected).includes("secret-123"));
});

Deno.test("CLI accepts repeated routes and rejects configuration errors before requests", async () => {
  equal(
    parseCollectorArgs([
      "--route",
      "r1",
      "--route",
      "r2",
      "--gaps",
      "--limit-routes",
      "2",
      "--delay-ms",
      "100",
      "--dry-run",
    ]),
    {
      routeIds: ["r1", "r2"],
      gaps: true,
      limitRoutes: 2,
      delayMs: 100,
      dryRun: true,
    },
  );
  const test = fixture();
  for (
    const options of [{}, { routeIds: ["r1"], limitRoutes: 0 }, {
      routeIds: ["r1"],
      delayMs: -1,
    }]
  ) {
    let rejected = false;
    try {
      await collectRouteSources(options, test.deps);
    } catch (error) {
      rejected = error instanceof ConfigurationError;
    }
    assert(rejected);
  }
  equal(test.writes, []);
});
