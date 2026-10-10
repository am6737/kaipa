import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export type JourneyHomeTab = { id: string; label: string; filter?: 'all' | 'planned' | 'active' | 'completed' };
export type JourneyHomeCard = {
  id: string;
  title: string;
  subtitle?: string;
  imageUrl?: string;
  prompt?: string;
  routeId?: string;
};
export type JourneyHomeContent = {
  title: string;
  tabs: JourneyHomeTab[];
  cards: JourneyHomeCard[];
};

export const DEFAULT_JOURNEY_HOME_CONTENT: JourneyHomeContent = {
  title: '我的旅程',
  tabs: [
    { id: 'all', label: '全部', filter: 'all' },
    { id: 'planned', label: '待出发', filter: 'planned' },
  ],
  cards: [],
};

function normalize(value: unknown): JourneyHomeContent {
  if (!value || typeof value !== 'object') return DEFAULT_JOURNEY_HOME_CONTENT;
  const input = value as Record<string, unknown>;
  const tabs = Array.isArray(input.tabs) ? input.tabs.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object')).map((item, index) => ({
    id: typeof item.id === 'string' && item.id ? item.id : `tab-${index}`,
    label: typeof item.label === 'string' && item.label ? item.label : `选项 ${index + 1}`,
    filter: ['all', 'planned', 'active', 'completed'].includes(String(item.filter)) ? item.filter as JourneyHomeTab['filter'] : undefined,
  })).slice(0, 6) : [];
  const cards = Array.isArray(input.cards) ? input.cards.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object')).map((item, index) => ({
    id: typeof item.id === 'string' && item.id ? item.id : `card-${index}`,
    title: typeof item.title === 'string' ? item.title : '',
    subtitle: typeof item.subtitle === 'string' ? item.subtitle : undefined,
    imageUrl: typeof item.imageUrl === 'string' ? item.imageUrl : undefined,
    prompt: typeof item.prompt === 'string' ? item.prompt : undefined,
    routeId: typeof item.routeId === 'string' ? item.routeId : undefined,
  })).filter((item) => item.title).slice(0, 12) : [];
  return {
    // Keep the product copy consistent for content rows created before this label
    // was renamed in the journey tab.
    title: input.title === '我的计划' || typeof input.title !== 'string' || !input.title
      ? DEFAULT_JOURNEY_HOME_CONTENT.title
      : input.title,
    tabs: tabs.length ? tabs : DEFAULT_JOURNEY_HOME_CONTENT.tabs,
    cards,
  };
}

export function useJourneyHomeContent() {
  const [content, setContent] = useState<JourneyHomeContent>(DEFAULT_JOURNEY_HOME_CONTENT);
  const [loading, setLoading] = useState(true);
  const refetch = useCallback(async () => {
    const { data, error } = await supabase.from('journey_home_content').select('title,tabs,cards').eq('key', 'default').eq('enabled', true).maybeSingle();
    if (error) console.warn('[useJourneyHomeContent] fetch error:', error.message);
    if (data) setContent(normalize(data));
    setLoading(false);
  }, []);
  useEffect(() => { void refetch(); }, [refetch]);
  return { content, loading, refetch };
}
