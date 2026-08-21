import { aggregateTravelSearch } from './aggregate.ts';
import type { TravelSearchProvider, TravelSearchResult } from './types.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function provider(source: TravelSearchProvider['source'], results: TravelSearchResult[]): TravelSearchProvider {
  return { source, search: async () => ({ available: true, results }) };
}

Deno.test('aggregateTravelSearch interleaves sources and removes duplicate URLs', async () => {
  const shared = 'https://example.com/place?utm_source=test';
  const output = await aggregateTravelSearch({
    query: '徒步',
    providers: [
      provider('tavily', [
        { source: 'tavily', kind: 'web', reliability: 'web', title: 'Official guide', url: shared },
        { source: 'tavily', kind: 'web', reliability: 'web', title: 'Transport', url: 'https://example.com/transport' },
      ]),
      provider('xhs', [
        { source: 'xhs', kind: 'guide', reliability: 'community', title: 'Community guide', url: 'https://example.com/community' },
        { source: 'xhs', kind: 'guide', reliability: 'community', title: 'Duplicate', url: 'https://example.com/place' },
      ]),
    ],
  });

  assert(output.available, 'expected search to be available');
  assert(output.results.length === 3, 'expected duplicate URL to be removed');
  assert(output.results[0].source === 'tavily', 'expected first configured source first');
  assert(output.results[1].source === 'xhs', 'expected results to be interleaved');
});

Deno.test('aggregateTravelSearch keeps successful providers when another fails', async () => {
  const failing: TravelSearchProvider = { source: 'douyin', search: async () => { throw new Error('offline'); } };
  const output = await aggregateTravelSearch({
    query: '露营',
    providers: [
      failing,
      provider('tavily', [{ source: 'tavily', kind: 'web', reliability: 'web', title: 'Result', url: 'https://example.com/result' }]),
    ],
  });

  assert(output.available, 'expected partial search to remain available');
  assert(output.results.length === 1, 'expected successful results to be retained');
  assert(output.sources[0].status === 'failed', 'expected failed provider status');
});

Deno.test('aggregateTravelSearch serializes providers in the same concurrency group', async () => {
  let active = 0;
  let maximumActive = 0;
  const groupedProvider = (source: 'xhs' | 'douyin'): TravelSearchProvider => ({
    source,
    concurrencyGroup: 'mediacrawler',
    search: async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return { available: true, results: [] };
    },
  });

  await aggregateTravelSearch({
    query: '雪山',
    providers: [groupedProvider('xhs'), groupedProvider('douyin')],
  });

  assert(maximumActive === 1, 'expected shared crawler providers to run serially');
});
