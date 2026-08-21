import type { ProviderSearchResponse, TravelSearchProvider } from '../types.ts';

export function createTavilyProvider(apiKey?: string): TravelSearchProvider {
  return {
    source: 'tavily',
    async search(query, signal): Promise<ProviderSearchResponse> {
      if (!apiKey) return { available: false, results: [], error: 'Tavily search is not configured' };
      const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          query,
          topic: 'general',
          search_depth: 'advanced',
          max_results: 6,
          include_answer: false,
          include_raw_content: false,
        }),
        signal,
      });
      if (!response.ok) throw new Error(`Tavily search failed (${response.status})`);
      const payload = await response.json() as { results?: Array<Record<string, unknown>> };
      const results = (payload.results || []).flatMap((item) => {
        const title = typeof item.title === 'string' ? item.title.trim() : '';
        const url = typeof item.url === 'string' ? item.url.trim() : '';
        if (!title || !/^https?:\/\//i.test(url)) return [];
        return [{
          source: 'tavily' as const,
          kind: 'web' as const,
          reliability: 'web' as const,
          title: title.slice(0, 180),
          url,
          snippet: typeof item.content === 'string' ? item.content.trim().slice(0, 600) : undefined,
          publishedAt: typeof item.published_date === 'string' ? item.published_date : undefined,
          score: typeof item.score === 'number' ? item.score : undefined,
        }];
      });
      return { available: true, results };
    },
  };
}
