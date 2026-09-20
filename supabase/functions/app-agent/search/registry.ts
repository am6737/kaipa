import { createMediaCrawlerProvider } from './providers/mediacrawler.ts';
import { createTavilyProvider, tavilyApiKeys } from './providers/tavily.ts';
import type { TravelSearchProvider, TravelSearchSource } from './types.ts';
import type { SearchPurpose } from './routing.ts';

type EnvGetter = (name: string) => string | undefined;

const supportedSources = new Set<TravelSearchSource>(['tavily', 'xhs', 'douyin']);

function enabledSources(getEnv: EnvGetter) {
  const configured = getEnv('TRAVEL_SEARCH_SOURCES')?.trim() || 'tavily';
  return [...new Set(configured.split(',').map((value) => value.trim().toLocaleLowerCase()))]
    .filter((value): value is TravelSearchSource => supportedSources.has(value as TravelSearchSource));
}

export function createTravelSearchProviders(getEnv: EnvGetter, purpose: SearchPurpose = 'guide'): TravelSearchProvider[] {
  const tavilyKeys = tavilyApiKeys(getEnv('TAVILY_API_KEYS'), getEnv('TAVILY_API_KEY'));
  // Transport evidence never fans out to community crawlers, regardless of config.
  if (purpose === 'transport') return [createTavilyProvider(tavilyKeys, true)];
  const endpoint = getEnv('MEDIACRAWLER_SEARCH_URL')?.trim();
  const apiKey = getEnv('MEDIACRAWLER_API_KEY')?.trim();
  const maxResults = travelSearchNumberSetting(getEnv, 'TRAVEL_SEARCH_MAX_RESULTS', 10, 1, 30);
  return enabledSources(getEnv).map((source) => {
    if (source === 'tavily') return createTavilyProvider(tavilyKeys);
    return createMediaCrawlerProvider({ source, endpoint, apiKey, maxResults });
  });
}

export function travelSearchNumberSetting(getEnv: EnvGetter, name: string, fallback: number, min: number, max: number) {
  const value = Number(getEnv(name));
  return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;
}
