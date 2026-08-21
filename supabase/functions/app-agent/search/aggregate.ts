import type {
  AggregatedTravelSearch,
  ProviderReport,
  ProviderSearchResponse,
  TravelSearchProvider,
  TravelSearchResult,
} from './types.ts';

type ProviderRun = {
  response: ProviderSearchResponse;
  report: ProviderReport;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function runProvider(provider: TravelSearchProvider, query: string, timeoutMs: number): Promise<ProviderRun> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await provider.search(query, controller.signal);
    return {
      response,
      report: {
        source: provider.source,
        status: response.available ? 'completed' : 'unavailable',
        resultCount: response.results.length,
        error: response.error,
      },
    };
  } catch (error) {
    const message = timedOut ? `Search timed out after ${timeoutMs}ms` : errorMessage(error);
    return {
      response: { available: false, results: [], error: message },
      report: {
        source: provider.source,
        status: timedOut ? 'timed_out' : 'failed',
        resultCount: 0,
        error: message,
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

function resultKey(result: TravelSearchResult) {
  try {
    const url = new URL(result.url);
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (key.startsWith('utm_') || key === 'spm' || key === 'share_source') url.searchParams.delete(key);
    }
    return url.toString().replace(/\/$/, '').toLocaleLowerCase();
  } catch {
    return `${result.source}:${result.url}`.toLocaleLowerCase();
  }
}

function interleave(resultGroups: TravelSearchResult[][], maxResults: number) {
  const merged: TravelSearchResult[] = [];
  const seen = new Set<string>();
  const longest = Math.max(0, ...resultGroups.map((group) => group.length));

  for (let index = 0; index < longest && merged.length < maxResults; index += 1) {
    for (const group of resultGroups) {
      const result = group[index];
      if (!result) continue;
      const key = resultKey(result);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(result);
      if (merged.length >= maxResults) break;
    }
  }
  return merged;
}

export async function aggregateTravelSearch(args: {
  query: string;
  providers: TravelSearchProvider[];
  timeoutMs?: number;
  maxResults?: number;
}): Promise<AggregatedTravelSearch> {
  const timeoutMs = args.timeoutMs ?? 8000;
  const maxResults = args.maxResults ?? 10;
  if (!args.providers.length) {
    return { available: false, query: args.query, results: [], sources: [], error: 'No travel search sources are enabled' };
  }

  const grouped = new Map<string, TravelSearchProvider[]>();
  for (const provider of args.providers) {
    const key = provider.concurrencyGroup || `source:${provider.source}`;
    grouped.set(key, [...(grouped.get(key) || []), provider]);
  }
  const groupedRuns = await Promise.all([...grouped.values()].map(async (providers) => {
    const runs: ProviderRun[] = [];
    for (const provider of providers) runs.push(await runProvider(provider, args.query, timeoutMs));
    return runs;
  }));
  const runsBySource = new Map(groupedRuns.flat().map((run) => [run.report.source, run]));
  const runs = args.providers.flatMap((provider) => {
    const run = runsBySource.get(provider.source);
    return run ? [run] : [];
  });
  const available = runs.some((run) => run.response.available);
  const results = interleave(
    runs.filter((run) => run.response.available).map((run) => run.response.results),
    maxResults,
  );

  return {
    available,
    query: args.query,
    results,
    sources: runs.map((run) => run.report),
    error: available ? undefined : runs.map((run) => run.report.error).filter(Boolean).join('; ') || 'Travel search is not configured',
  };
}
