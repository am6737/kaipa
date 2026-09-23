// The maintained route-facts library ("线路资料") as the pipeline sees it.
//
// Split out of pipeline.ts for the same reason the metrics and preview helpers
// are: the pipeline is where everything is wired, and anything that has to be
// tested on its own has to live outside it.
//
// Two things here are deliberate. The facts a run uses are collected
// deterministically — bindRouteFacts overwrites whatever the model wrote into
// the brief, so nothing invented can be presented as a confirmed fact. And a
// failed read is returned rather than swallowed: the deployed function once
// read this RPC with a client that had no execute grant, so "the read is
// broken" and "the library is empty" looked identical from the outside.
import { TRANSPORT_NOTE_MAX, type ResearchBrief } from './plan-document.ts';
import type { AgentSource } from './types.ts';

export type RouteFactRow = {
  /** Entry id. Targets a revision suggestion and is what the UI cites. */
  id: string;
  route_id: string;
  route_name: string;
  category: { slug: string; name: string };
  title: string;
  fields: Record<string, unknown>;
  source_url: string | null;
  confirmed_at: string | null;
  reviewed_at: string | null;
  review_due_at: string | null;
};

/** One fact as recorded on the research stage, for citing and measuring. */
export type RouteFactSource = {
  entryId: string;
  routeName: string;
  category: string;
  title: string;
  sourceUrl: string | null;
  reviewedAt: string | null;
  reviewDueAt: string | null;
  stale: boolean;
};

/** Per-run counters. agent_route_fact_stats reads them back out of the stage row. */
export type RouteFactStats = {
  loaded: number;
  injected: number;
  read_failed: boolean;
  reused: boolean;
  suggestions_written: number;
  unknown_targets: number;
};

/** Facts recorded per run. Bounded so one route set cannot inflate the stage row. */
export const ROUTE_FACT_SOURCE_LIMIT = 24;

export function emptyRouteFactStats(): RouteFactStats {
  return { loaded: 0, injected: 0, read_failed: false, reused: false, suggestions_written: 0, unknown_targets: 0 };
}

// A confirmed fact whose review date has passed is still the best record
// available, but it is no longer what the prompt calls authoritative.
export function isStaleReview(reviewDueAt: string | null, now = Date.now()): boolean {
  if (!reviewDueAt) return false;
  const due = Date.parse(reviewDueAt);
  return Number.isFinite(due) && due < now;
}

// Fact reading must never fail a planning run, so a miss still degrades to "no
// facts" — but the reason comes back with it.
export async function loadRouteFacts(admin: any, names: string[]): Promise<{ rows: RouteFactRow[]; error: string | null }> {
  if (!names.length) return { rows: [], error: null };
  try {
    // Route-facts RPCs are deliberately service-role-only; the user-scoped
    // client must not be able to enumerate the maintained knowledge base.
    const { data, error } = await admin.rpc('get_route_facts', { p_route_names: names });
    if (error) return { rows: [], error: (error.message || 'get_route_facts failed').slice(0, 300) };
    return { rows: (Array.isArray(data) ? data : []) as RouteFactRow[], error: null };
  } catch (error) {
    return { rows: [], error: (error instanceof Error ? error.message : String(error)).slice(0, 300) };
  }
}

export function factsForRoute(rows: RouteFactRow[], name: string, preferredRouteId?: string | null): RouteFactRow[] {
  if (preferredRouteId) {
    const exact = rows.filter(row => row.route_id === preferredRouteId);
    if (exact.length) return exact;
  }
  return rows.filter(row => typeof row.route_name === 'string' && (row.route_name.includes(name) || name.includes(row.route_name)));
}

function factSource(routeName: string, row: RouteFactRow, now = Date.now()): RouteFactSource {
  return {
    entryId: row.id,
    routeName: row.route_name || routeName,
    category: row.category?.name || '',
    title: row.title,
    sourceUrl: row.source_url,
    reviewedAt: row.reviewed_at,
    reviewDueAt: row.review_due_at,
    stale: isStaleReview(row.review_due_at, now),
  };
}

/**
 * The facts travel with the brief they were loaded for. Overwrites whatever the
 * model produced, like bindCatalogFacts does for catalog geometry: a fact is
 * either in the library or it is not, and a model cannot add one.
 */
export function bindRouteFacts(brief: ResearchBrief, rows: RouteFactRow[], stats: RouteFactStats, now = Date.now()): ResearchBrief {
  const routeFacts = rows.slice(0, ROUTE_FACT_SOURCE_LIMIT).map(row => factSource(row.route_name || '', row, now));
  stats.loaded = rows.length;
  stats.injected = routeFacts.length;
  return { ...brief, routeFacts };
}

/**
 * Prompt block for one route's facts, split by review freshness: a fact past
 * its review date must not outrank what a guide read today says.
 */
export function factPromptBlock(rows: RouteFactRow[], now = Date.now()): string[] {
  if (!rows.length) return [];
  const asPromptFact = (row: RouteFactRow) => ({
    id: row.id, 类目: row.category?.name || '', 标题: row.title, ...row.fields,
    confirmed_at: row.confirmed_at, review_due_at: row.review_due_at,
  });
  const fresh = rows.filter(row => !isStaleReview(row.review_due_at, now));
  const stale = rows.filter(row => isStaleReview(row.review_due_at, now));
  const blocks: string[] = [];
  if (fresh.length) {
    blocks.push(`已核实线路资料（人工维护，优先于攻略正文；冲突以此为准，来源日期见每条 confirmed_at）：${JSON.stringify(fresh.map(asPromptFact))}`);
  }
  if (stale.length) {
    blocks.push(`已过期待复核的线路资料（仅供参考，不作为冲突依据；若攻略更新了其中某条，用它的 id 提交 targetEntryId 修订建议）：${JSON.stringify(stale.map(asPromptFact))}`);
  }
  return blocks;
}

/** Folds the model's key/value list back into the record the route-facts RPC takes. */
export function factFieldsRecord(entries: Array<{ key: string; value: string }> | null | undefined): Record<string, string> {
  const record: Record<string, string> = {};
  for (const entry of entries || []) {
    if (entry && typeof entry.key === 'string' && entry.key) record[entry.key] = entry.value ?? '';
  }
  return record;
}

/**
 * The transport-leg note, reminding the planner that maintained facts outrank
 * the guide text for this leg.
 *
 * The whole note is clamped to the schema's bound, not just the fact text: the
 * earlier version truncated the facts to 600 and then prefixed a label, so one
 * full entry (five JSON fields) produced a note past transportPlanSchema's
 * 500-character limit and failed the entire transport stage.
 */
export function transportLegNote(legFacts: RouteFactRow[], fallback: string): string {
  if (!legFacts.length) return fallback;
  const head = '已核实线路资料（人工维护，接驳方式与价格以此为准；时间仍需按当地班次核对）：';
  const body = legFacts.map(fact => `${fact.category?.name || ''}·${fact.title}·${JSON.stringify(fact.fields)}`).join('；');
  return `${head}${body}`.slice(0, TRANSPORT_NOTE_MAX);
}

/** Reads the recorded facts back off a research stage row, tolerating junk. */
export function routeFactSourcesFromArtifact(value: unknown): RouteFactSource[] {
  if (!Array.isArray(value)) return [];
  const sources: RouteFactSource[] = [];
  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object') continue;
    const row = candidate as Record<string, unknown>;
    if (typeof row.entryId !== 'string' || !row.entryId) continue;
    sources.push({
      entryId: row.entryId,
      routeName: typeof row.routeName === 'string' ? row.routeName : '',
      category: typeof row.category === 'string' ? row.category : '',
      title: typeof row.title === 'string' ? row.title : '',
      sourceUrl: typeof row.sourceUrl === 'string' ? row.sourceUrl : null,
      reviewedAt: typeof row.reviewedAt === 'string' ? row.reviewedAt : null,
      reviewDueAt: typeof row.reviewDueAt === 'string' ? row.reviewDueAt : null,
      stale: row.stale === true,
    });
  }
  return sources.slice(0, ROUTE_FACT_SOURCE_LIMIT);
}

/**
 * Cites for one run: the verified facts first, then the web.
 *
 * Facts are given the first slots rather than sharing one pool with eight web
 * links, because a fact is the only source here a human confirmed. A fact's
 * source_url is added to the dedupe set first, so a link that is both a
 * maintained source and a search result is cited once, as the verified entry.
 */
export function factSourceChips(
  facts: RouteFactSource[],
  web: AgentSource[],
  options: { webLimit?: number } = {},
): AgentSource[] {
  // Every fact is cited, and only the web links are capped.
  //
  // The cap used to be on the total, which meant the facts that lost their slot
  // were whichever came last in category order — 季节与安全, the closure and
  // risk entry, was first to go. A verified fact a human stood behind is the
  // last thing that should be dropped to make room for another guide link, and
  // silently hiding half the library makes it impossible to tell from the reply
  // what the planner actually had.
  const webLimit = options.webLimit ?? 8;
  const chips: AgentSource[] = [];
  const seen = new Set<string>();
  for (const fact of facts) {
    const url = fact.sourceUrl || '';
    if (url) seen.add(url);
    chips.push({
      title: fact.title || fact.category || fact.routeName,
      ...(url ? { url } : {}),
      source: fact.category,
      kind: 'fact',
      factId: fact.entryId,
      ...(fact.reviewedAt ? { verifiedAt: fact.reviewedAt } : {}),
      ...(fact.stale ? { stale: true } : {}),
    });
  }
  let webCount = 0;
  for (const item of web) {
    if (webCount >= webLimit) break;
    const url = typeof item.url === 'string' ? item.url : '';
    if (!url || seen.has(url)) continue;
    seen.add(url);
    webCount += 1;
    chips.push(item);
  }
  return chips;
}
