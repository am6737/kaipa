/** Offline only. Never imported by planning, never writes guides or database rows. */
import { createTravelSearchProviders } from "../supabase/functions/app-agent/search/registry.ts";
import { aggregateTravelSearch } from "../supabase/functions/app-agent/search/aggregate.ts";
import {
  GUIDE_LIMITS,
  readGuide,
} from "../supabase/functions/app-agent/search/guide-reader.ts";
import type { GuideContent } from "../supabase/functions/app-agent/search/guide-reader.ts";
import type {
  TravelSearchProvider,
  TravelSearchSource,
} from "../supabase/functions/app-agent/search/types.ts";

export type Route = { id: string; name: string };
export type Gap = { route_id: string; section: string };
type ProviderError = {
  platform: TravelSearchSource;
  stage: "search" | "read";
  code: string;
  message: string;
};
export type InboxItem = {
  platform: TravelSearchSource;
  url: string;
  title: string;
  author: string | null;
  publishedAt?: string;
  extractedText: string;
  imageCandidates?: string[];
  errors: ProviderError[];
};
export type InboxDocument = {
  routeId: string;
  routeName: string;
  gapSections: string[];
  collectedAt: string;
  items: InboxItem[];
  errors: ProviderError[];
};
export type CollectorOptions = {
  routeIds?: string[];
  gaps?: boolean;
  limitRoutes?: number;
  dryRun?: boolean;
  delayMs?: number;
};
type ReadResult = GuideContent & {
  errorCode?: "verification_required";
  author?: string;
  publishedAt?: string;
};
export type CollectorDependencies = {
  env?: (name: string) => string | undefined;
  fetch?: typeof fetch;
  providers?: TravelSearchProvider[];
  read?: (url: string) => Promise<ReadResult>;
  clock?: { now: () => Date; sleep: (ms: number) => Promise<void> };
  writer?: (path: string, document: InboxDocument) => Promise<void>;
  log?: (message: string) => void;
  /** Optional offline metadata snapshots, primarily for tests and dry-run previews. */
  routes?: Route[];
  gapRows?: Gap[];
};
export class ConfigurationError extends Error {}

const hints: Record<string, string> = {
  overview: "线路概况",
  itinerary: "行程",
  access: "交通",
  overnight: "营地 住宿",
  costs: "费用",
  water_supply: "水源 补给",
  season_risk: "季节 风险",
  gear: "装备",
  tips: "注意事项",
};
const inboxRoot = "data/route-guides/_inbox";
const repoRoot = new URL("../", import.meta.url);
function checkRouteId(id: string) {
  if (!/^[\p{L}\p{N}][\p{L}\p{N}_.-]{0,127}$/u.test(id)) {
    throw new ConfigurationError(
      "Route IDs must be safe single directory names (letters, numbers, dots, hyphens, underscores).",
    );
  }
}

/** Refuse symlink ancestors as well as traversal; use createNew to preserve prior runs. */
export async function writeInbox(path: string, document: InboxDocument) {
  checkRouteId(document.routeId);
  if (
    path !== `${inboxRoot}/${document.routeId}/${document.collectedAt}.json` ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(document.collectedAt)
  ) {
    throw new ConfigurationError("Invalid inbox output path.");
  }
  let directory = repoRoot;
  const segments = [...inboxRoot.split("/"), document.routeId];
  for (const [index, segment] of segments.entries()) {
    directory = new URL(`${segment}/`, directory);
    try {
      if (!(await Deno.lstat(directory)).isDirectory) {
        throw new ConfigurationError(
          "Inbox ancestors must be real directories.",
        );
      }
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) throw error;
      // data/route-guides belongs to the maintained guide library. Only create
      // the inbox and its children; never create anything outside the inbox.
      if (index < 2) {
        throw new ConfigurationError(
          "The data/route-guides directory must already exist.",
        );
      }
      try {
        await Deno.mkdir(directory);
      } catch (error) {
        if (!(error instanceof Deno.errors.AlreadyExists)) throw error;
      }
      if (!(await Deno.lstat(directory)).isDirectory) {
        throw new ConfigurationError(
          "Inbox ancestors must be real directories.",
        );
      }
    }
  }
  await Deno.writeTextFile(
    new URL(path, repoRoot),
    `${JSON.stringify(document, null, 2)}\n`,
    { createNew: true },
  );
}

/** Sequential API: do not run concurrent collectors in the same JS isolate.
 * Registry providers use global fetch, so its scoped replacement also paces
 * their internal key retries. It is always restored, including on failure.
 */
export async function collectRouteSources(
  options: CollectorOptions,
  deps: CollectorDependencies = {},
) {
  const limit = options.limitRoutes ?? 5;
  const delay = options.delayMs ?? 5000;
  if (
    !Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(delay) ||
    delay < 0
  ) {
    throw new ConfigurationError(
      "limit-routes must be positive and delay-ms must be nonnegative integers.",
    );
  }
  const explicit = [...new Set(options.routeIds ?? [])];
  if (!explicit.length && !options.gaps) {
    throw new ConfigurationError("Specify --route and/or --gaps.");
  }
  explicit.forEach(checkRouteId);
  const env = deps.env ?? ((name: string) => Deno.env.get(name));
  const request = deps.fetch ?? globalThis.fetch;
  const clock = deps.clock ??
    {
      now: () => new Date(),
      sleep: (ms: number) =>
        new Promise<void>((resolve) => setTimeout(resolve, ms)),
    };
  const log = deps.log ?? console.log;
  const writer = deps.writer ?? writeInbox;
  const secrets = [
    "SUPABASE_SERVICE_ROLE_KEY",
    "TAVILY_API_KEY",
    "TAVILY_API_KEYS",
    "MEDIACRAWLER_API_KEY",
  ]
    .flatMap((name) => (env(name) ?? "").split(/[\s,]+/)).filter(Boolean);
  const safeError = (message: string) =>
    secrets.reduce(
      (text, secret) => text.replaceAll(secret, "[redacted]"),
      message,
    ).slice(0, 500);

  async function rest<T>(
    table: string,
    params: Record<string, string>,
  ): Promise<T[]> {
    const base = env("SUPABASE_URL")?.trim();
    const key = env("SUPABASE_SERVICE_ROLE_KEY")?.trim();
    if (!base || !key) {
      throw new ConfigurationError(
        "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for route metadata.",
      );
    }
    let target: URL;
    try {
      target = new URL(`${base.replace(/\/$/, "")}/rest/v1/${table}`);
      if (
        !["http:", "https:"].includes(target.protocol) || target.username ||
        target.password
      ) throw new Error();
    } catch {
      throw new ConfigurationError(
        "SUPABASE_URL must be an HTTP(S) URL without embedded credentials.",
      );
    }
    for (const [name, value] of Object.entries(params)) {
      target.searchParams.set(name, value);
    }
    try {
      const response = await request(target, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error();
      }
      const rows = await response.json();
      if (!Array.isArray(rows)) throw new Error();
      return rows as T[];
    } catch {
      throw new ConfigurationError(
        `Cannot read ${table}; check service-role access and the gap migration.`,
      );
    }
  }

  // Dry-run is genuinely offline: DB-only names and queue selection are deferred.
  let gapRows = options.gaps ? deps.gapRows : [];
  if (options.gaps && !gapRows) {
    if (options.dryRun) {
      gapRows = [];
      log(
        "DRY RUN: queue route IDs, names and section hints will be resolved from Supabase on a real run; no network performed.",
      );
    } else {
      gapRows = [];
      // PostgREST caps page size; paginate so limit-routes counts distinct routes,
      // rather than losing routes behind many section rows for the first route.
      for (let offset = 0;;) {
        const page = await rest<Gap>("route_guide_gap_queue", {
          select: "route_id,section",
          order: "hit_count.desc,last_seen_at.desc,id.asc",
          limit: "100",
          offset: String(offset),
        });
        gapRows.push(...page);
        if (
          !page.length ||
          new Set([...explicit, ...gapRows.map((row) => row.route_id)]).size >=
            limit
        ) break;
        offset += page.length;
      }
    }
  }
  const routeIds = [
    ...new Set([...explicit, ...(gapRows ?? []).map((row) => row.route_id)]),
  ].slice(0, limit);
  routeIds.forEach(checkRouteId);
  const plans: Array<
    { routeId: string; routeName: string; gapSections: string[]; query: string }
  > = [];
  for (const id of routeIds) {
    const route = deps.routes?.find((row) => row.id === id) ??
      (options.dryRun ? undefined : (await rest<Route>("routes", {
        select: "id,name",
        id: `eq.${id}`,
        limit: "1",
      }))[0]);
    if (!route && !options.dryRun) {
      throw new ConfigurationError("Requested route was not found in routes.");
    }
    if (route && (typeof route.name !== "string" || !route.name.trim())) {
      throw new ConfigurationError("Route name is missing.");
    }
    const routeName = route?.name ?? `<route name for ${id}>`;
    // Queue paging chooses routes by priority, but a low-priority section of
    // a chosen route can appear much later. Fetch all of its open sections.
    const routeGaps = options.gaps && !options.dryRun && !deps.gapRows
      ? await rest<Gap>("route_guide_gap_queue", {
        select: "route_id,section",
        route_id: `eq.${id}`,
        order: "hit_count.desc,last_seen_at.desc,id.asc",
        limit: "10",
      })
      : (gapRows ?? []).filter((row) => row.route_id === id);
    const gapSections = [...new Set(routeGaps.map((row) => row.section))];
    const keywords = gapSections.flatMap((section) =>
      hints[section] ? [hints[section]] : []
    );
    const query = [routeName, "徒步 攻略", ...keywords].join(" ");
    plans.push({ routeId: id, routeName, gapSections, query });
  }
  if (options.dryRun) {
    for (const plan of plans) log(`DRY RUN: ${JSON.stringify(plan)}`);
    return {
      plans,
      documents: [] as InboxDocument[],
      paths: [] as string[],
      disabledProviders: [] as TravelSearchSource[],
    };
  }

  const providers = deps.providers ?? createTravelSearchProviders(env);
  if (!providers.length) {
    throw new ConfigurationError(
      "No supported TRAVEL_SEARCH_SOURCES are enabled.",
    );
  }
  const disabled = new Set<TravelSearchSource>();
  function disable(source: TravelSearchSource) {
    if (!disabled.has(source)) {
      disabled.add(source);
      log(
        `${source}: verification_required; provider disabled for the remainder of this run.`,
      );
    }
  }
  const documents: InboxDocument[] = [];
  const paths: string[] = [];
  let usedProvider = false;
  async function pace() {
    if (usedProvider) await clock.sleep(delay);
    usedProvider = true;
  }
  // Classification follows the existing reader: canonical Douyin content uses
  // the gateway; all other articles (including XHS) use Tavily Extract.
  function readerProvider(url: string): TravelSearchSource {
    try {
      const parsed = new URL(url);
      if (
        ["douyin.com", "www.douyin.com"].includes(parsed.hostname) &&
        /^\/(?:video|note)\/\d{10,24}\/?$/.test(parsed.pathname)
      ) return "douyin";
    } catch { /* The existing reader will reject invalid URLs. */ }
    return "tavily";
  }
  let activeProvider: TravelSearchSource = "tavily";
  const providerFetch: typeof fetch = async (target, init) => {
    const source = activeProvider;
    if (disabled.has(source)) throw new Error("verification_required");
    await pace();
    const response = await request(target, init);
    // Readers intentionally return unavailable on gateway errors. Preserve the
    // verification signal here before they discard the gateway response body.
    const payload = await response.clone().json().catch(() => null);
    if (
      payload?.errorCode === "verification_required" ||
      payload?.error_code === "verification_required" ||
      (typeof payload?.detail === "string" &&
        payload.detail.startsWith("verification_required:"))
    ) {
      disable(source);
    }
    return response;
  };
  const originalFetch = globalThis.fetch;
  if (!deps.providers) globalThis.fetch = providerFetch;
  try {
    for (const plan of plans) {
      const collectedAt = clock.now().toISOString();
      const document: InboxDocument = {
        routeId: plan.routeId,
        routeName: plan.routeName,
        gapSections: plan.gapSections,
        collectedAt,
        items: [],
        errors: [],
      };
      // One aggregate discovery with a shared group forces all sources into a
      // single serial lane. No second discovery or query rephrasing is performed.
      const search = await aggregateTravelSearch({
        query: plan.query,
        timeoutMs: 60000,
        providers: providers.filter((provider) =>
          !disabled.has(provider.source)
        ).map((provider) => ({
          source: provider.source,
          concurrencyGroup: "offline-collector",
          async search(query, signal) {
            activeProvider = provider.source;
            if (deps.providers) await pace();
            const response = await provider.search(query, signal);
            if (response.errorCode === "verification_required") {
              disable(provider.source);
            }
            return disabled.has(provider.source)
              ? {
                available: false,
                results: [],
                error: "verification_required",
                errorCode: "verification_required" as const,
              }
              : response;
          },
        })),
      });
      for (const source of search.sources) {
        if (source.error || source.status !== "completed") {
          document.errors.push({
            platform: source.source,
            stage: "search",
            code: source.errorCode ?? source.status,
            message: safeError(source.error ?? "Search unavailable"),
          });
        }
      }
      for (const platform of disabled) {
        if (
          !document.errors.some((error) =>
            error.platform === platform &&
            error.code === "verification_required"
          )
        ) {
          document.errors.push({
            platform,
            stage: "search",
            code: "verification_required",
            message: "Provider disabled for this run.",
          });
        }
      }
      let articles = 0;
      for (const result of search.results) {
        if (articles >= GUIDE_LIMITS.pages) break;
        const upstream = readerProvider(result.url);
        if (disabled.has(result.source) || disabled.has(upstream)) continue;
        articles++;
        activeProvider = upstream;
        const item: InboxItem = {
          platform: result.source,
          url: result.url,
          title: result.title,
          // Normalized search APIs do not expose authors; never invent one.
          author: null,
          ...(result.publishedAt ? { publishedAt: result.publishedAt } : {}),
          extractedText: "",
          errors: [],
        };
        try {
          if (deps.read) await pace();
          const body: ReadResult = await (deps.read
            ? deps.read(result.url)
            : readGuide(result.url, env, providerFetch));
          if (body.errorCode === "verification_required") {
            disable(upstream);
          }
          if (disabled.has(upstream) || !body.available) {
            item.errors.push({
              platform: upstream,
              stage: "read",
              code: disabled.has(upstream)
                ? "verification_required"
                : body.status,
              message: safeError(body.limitation),
            });
          } else {
            item.extractedText = body.text.slice(0, GUIDE_LIMITS.text);
            item.imageCandidates = body.images.slice(0, GUIDE_LIMITS.candidates)
              .map((image) =>
                image.url
              );
            item.author = body.author ?? null;
            if (body.publishedAt) item.publishedAt = body.publishedAt;
          }
        } catch {
          item.errors.push({
            platform: upstream,
            stage: "read",
            code: "failed",
            message: "Article reader failed.",
          });
        }
        document.items.push(item);
      }
      const path = `${inboxRoot}/${plan.routeId}/${collectedAt}.json`;
      try {
        await writer(path, document);
      } catch {
        throw new ConfigurationError(
          "Cannot write inbox output; check directory permissions, symlinks and timestamp collisions.",
        );
      }
      documents.push(document);
      paths.push(path);
      log(`Collected ${document.items.length} candidate articles: ${path}`);
    }
  } finally {
    if (!deps.providers) globalThis.fetch = originalFetch;
  }
  return { plans, documents, paths, disabledProviders: [...disabled] };
}

export function parseCollectorArgs(args: string[]): CollectorOptions {
  const options: CollectorOptions = { routeIds: [] };
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (flag === "--gaps") options.gaps = true;
    else if (flag === "--dry-run") options.dryRun = true;
    else if (["--route", "--limit-routes", "--delay-ms"].includes(flag)) {
      const value = args[++index];
      if (!value || value.startsWith("--")) {
        throw new ConfigurationError("Missing option value.");
      }
      if (flag === "--route") options.routeIds!.push(value);
      else if (flag === "--limit-routes") options.limitRoutes = Number(value);
      else options.delayMs = Number(value);
    } else {throw new ConfigurationError(
        "Unknown option. Use --route, --gaps, --limit-routes, --delay-ms, --dry-run.",
      );}
  }
  return options;
}

if (import.meta.main) {
  try {
    await collectRouteSources(parseCollectorArgs(Deno.args));
  } catch (error) {
    // Provider failures are handled above; CLI failures concern configuration.
    console.error(
      error instanceof ConfigurationError
        ? error.message
        : "Collector configuration or local runtime error.",
    );
    Deno.exitCode = 1;
  }
}
