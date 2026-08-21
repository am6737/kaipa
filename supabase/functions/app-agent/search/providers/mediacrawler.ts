import type {
  ProviderSearchResponse,
  TravelSearchProvider,
  TravelSearchSource,
} from '../types.ts';

type MediaCrawlerPlatform = 'xhs' | 'dy';

function textField(item: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function numberField(item: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return undefined;
}

export function createMediaCrawlerProvider(args: {
  source: Extract<TravelSearchSource, 'xhs' | 'douyin'>;
  endpoint?: string;
  apiKey?: string;
  maxResults?: number;
}): TravelSearchProvider {
  const platform: MediaCrawlerPlatform = args.source === 'xhs' ? 'xhs' : 'dy';
  return {
    source: args.source,
    async search(query, signal): Promise<ProviderSearchResponse> {
      if (!args.endpoint || !args.apiKey) {
        return { available: false, results: [], error: `${args.source} search is not configured` };
      }
      const response = await fetch(args.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Kaipa-Gateway-Key': args.apiKey,
        },
        body: JSON.stringify({ platform, query, limit: args.maxResults ?? 10 }),
        signal,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
        const detail = typeof payload?.detail === 'string' ? payload.detail.trim().slice(0, 240) : '';
        throw new Error(`${args.source} search failed (${response.status})${detail ? `: ${detail}` : ''}`);
      }
      const payload = await response.json() as Record<string, unknown>;
      const rawResults = Array.isArray(payload.results)
        ? payload.results
        : Array.isArray(payload.items)
        ? payload.items
        : [];
      const results = rawResults.flatMap((value) => {
        if (!value || typeof value !== 'object') return [];
        const item = value as Record<string, unknown>;
        const title = textField(item, ['title', 'displayTitle', 'display_title', 'desc']);
        const url = textField(item, ['url', 'noteUrl', 'note_url', 'awemeUrl', 'aweme_url']);
        if (!title || !url || !/^https?:\/\//i.test(url)) return [];
        return [{
          source: args.source,
          kind: args.source === 'xhs' ? 'guide' as const : 'video' as const,
          reliability: 'community' as const,
          title: title.slice(0, 180),
          url,
          snippet: textField(item, ['snippet', 'content', 'desc'])?.slice(0, 600),
          publishedAt: textField(item, ['publishedAt', 'published_at', 'createTime', 'create_time']),
          score: numberField(item, ['score', 'popularity']),
        }];
      });
      return { available: true, results };
    },
  };
}
