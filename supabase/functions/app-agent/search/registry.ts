import { createMediaCrawlerProvider } from './providers/mediacrawler.ts';
import { createTavilyProvider } from './providers/tavily.ts';
import type { TravelSearchProvider, TravelSearchSource } from './types.ts';

type EnvGetter = (name: string) => string | undefined;

const supportedSources = new Set<TravelSearchSource>(['tavily', 'xhs', 'douyin']);

function enabledSources(getEnv: EnvGetter) {
  const configured = getEnv('TRAVEL_SEARCH_SOURCES')?.trim() || 'tavily';
  return [...new Set(configured.split(',').map((value) => value.trim().toLocaleLowerCase()))]
    .filter((value): value is TravelSearchSource => supportedSources.has(value as TravelSearchSource));
}

export function createTravelSearchProviders(getEnv: EnvGetter): TravelSearchProvider[] {
  const endpoint = getEnv('MEDIACRAWLER_SEARCH_URL')?.trim();
  const apiKey = getEnv('MEDIACRAWLER_API_KEY')?.trim();
  const maxResults = travelSearchNumberSetting(getEnv, 'TRAVEL_SEARCH_MAX_RESULTS', 10, 1, 30);
  return enabledSources(getEnv).map((source) => {
    if (source === 'tavily') return createTavilyProvider(getEnv('TAVILY_API_KEY')?.trim());
    return createMediaCrawlerProvider({ source, endpoint, apiKey, maxResults });
  });
}

export function travelSearchNumberSetting(getEnv: EnvGetter, name: string, fallback: number, min: number, max: number) {
  const value = Number(getEnv(name));
  return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;
}
