export type TravelSearchSource = 'tavily' | 'xhs' | 'douyin';

export type TravelSearchKind = 'web' | 'guide' | 'video';

export type TravelSearchReliability = 'web' | 'community';

export type TravelSearchResult = {
  source: TravelSearchSource;
  kind: TravelSearchKind;
  reliability: TravelSearchReliability;
  title: string;
  url: string;
  snippet?: string;
  publishedAt?: string;
  score?: number;
};

export type ProviderSearchResponse = {
  available: boolean;
  results: TravelSearchResult[];
  error?: string;
};

export type TravelSearchProvider = {
  source: TravelSearchSource;
  concurrencyGroup?: string;
  search(query: string, signal: AbortSignal): Promise<ProviderSearchResponse>;
};

export type ProviderReport = {
  source: TravelSearchSource;
  status: 'completed' | 'unavailable' | 'failed' | 'timed_out';
  resultCount: number;
  error?: string;
};

export type AggregatedTravelSearch = {
  available: boolean;
  query: string;
  results: TravelSearchResult[];
  sources: ProviderReport[];
  error?: string;
};
