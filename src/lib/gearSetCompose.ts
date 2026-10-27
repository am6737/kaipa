import { supabase } from './supabase';
import type { GearCat, GearItem } from '../data/gear';

export type GearSetSuggestion = { name: string; categoryId: string; reason: string };
export type GearSetComposition = {
  name: string;
  picks: number[];
  missing: GearSetSuggestion[];
  summary: string;
};

type ComposeResponse = {
  result?: GearSetComposition;
  error?: { code?: string; message?: string };
};

export class GearSetComposeError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

/** Asks the gear-set-compose function for a draft; nothing is saved. */
export async function composeGearSet(input: {
  description: string;
  name: string;
  cats: GearCat[];
  items: GearItem[];
  keepIds: number[];
  excludeIds: number[];
}): Promise<GearSetComposition> {
  const { data, error } = await supabase.functions.invoke<ComposeResponse>('gear-set-compose', {
    body: {
      description: input.description,
      name: input.name,
      categories: input.cats.map((cat) => ({ id: cat.id, name: cat.name })),
      items: input.items.filter((item) => item.id != null).map((item) => ({
        id: item.id,
        name: item.name,
        categoryId: item.cat,
        status: item.status ?? 'packed',
        weightKg: item.w,
        owned: item.owned !== false,
      })),
      keepIds: input.keepIds,
      excludeIds: input.excludeIds,
    },
  });
  if (error) {
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const body = await context.clone().json() as ComposeResponse;
        if (body.error?.message) throw new GearSetComposeError(body.error.code || 'request_failed', body.error.message);
      } catch (parsedError) {
        if (parsedError instanceof GearSetComposeError) throw parsedError;
      }
    }
    throw new GearSetComposeError('request_failed', error.message || '搭配失败，请稍后重试');
  }
  if (data?.error) throw new GearSetComposeError(data.error.code || 'request_failed', data.error.message || '搭配失败，请稍后重试');
  if (!data?.result) throw new GearSetComposeError('empty_result', '没有得到搭配结果');
  return data.result;
}
