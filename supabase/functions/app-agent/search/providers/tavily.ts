import type { ProviderSearchResponse, TravelSearchProvider } from '../types.ts';

export function tavilyApiKeys(...values: Array<string | undefined>): string[] {
  return [...new Set(values.flatMap((value) => (value || '').split(/[\s,]+/).map((key) => key.trim()).filter(Boolean)))];
}

export function createTavilyProvider(apiKey?: string | string[], transportEvidence = false): TravelSearchProvider {
  const apiKeys = Array.isArray(apiKey) ? tavilyApiKeys(...apiKey) : tavilyApiKeys(apiKey);
  return {
    source: 'tavily',
    async search(query, signal): Promise<ProviderSearchResponse> {
      if (!apiKeys.length) return { available: false, results: [], error: 'Tavily search is not configured' };
      let lastError = 'Tavily search failed';
      for (const key of apiKeys) {
        try {
          const response = await fetch('https://api.tavily.com/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
            body: JSON.stringify({
              query,
              topic: 'general',
              search_depth: 'advanced',
              max_results: 6,
              include_answer: false,
              include_raw_content: false,
              ...(transportEvidence ? { exclude_domains: ['xiaohongshu.com', 'xhslink.com', 'douyin.com', 'tiktok.com'] } : {}),
            }),
            signal,
          });
          if (!response.ok) {
            lastError = `Tavily search failed (${response.status})`;
            await response.body?.cancel();
            continue;
          }
          const payload = await response.json() as { results?: Array<Record<string, unknown>> };
          const results = (payload.results || []).flatMap((item) => {
            const title = typeof item.title === 'string' ? item.title.trim() : '';
            const url = typeof item.url === 'string' ? item.url.trim() : '';
            if (!title || !/^https?:\/\//i.test(url)) return [];
            if (transportEvidence) {
              try {
                const host = new URL(url).hostname.toLowerCase();
                if (['xiaohongshu.com', 'xhslink.com', 'douyin.com', 'tiktok.com'].some(domain => host === domain || host.endsWith(`.${domain}`))) return [];
              } catch { return []; }
            }
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
        } catch (error) {
          if (signal.aborted) throw error;
          lastError = error instanceof Error ? error.message : String(error);
        }
      }
      throw new Error(lastError);
    },
  };
}
