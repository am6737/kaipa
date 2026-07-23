import { supabase } from './supabase';

export type GearLinkProvider = 'taobao' | 'tmall' | 'jd' | 'dewu' | 'generic';

export interface GearLinkPreview {
  provider: GearLinkProvider;
  sourceUrl: string;
  externalId?: string;
  name: string;
  priceCny?: number;
  weightKg?: number;
  imageUrl?: string;
  brand?: string;
  category?: string;
  attrs: [string, string][];
  warnings: string[];
}

type GearLinkResponse = {
  item?: GearLinkPreview;
  error?: { code?: string; message?: string };
};

export class GearLinkPreviewError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

export async function fetchGearLinkPreview(url: string, text?: string): Promise<GearLinkPreview> {
  const { data, error } = await supabase.functions.invoke<GearLinkResponse>('gear-link-preview', {
    body: { url, text },
  });
  if (error) {
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const body = await context.clone().json() as GearLinkResponse;
        if (body.error?.message) throw new GearLinkPreviewError(body.error.code || 'request_failed', body.error.message);
      } catch (parsedError) {
        if (parsedError instanceof GearLinkPreviewError) throw parsedError;
      }
    }
    throw new GearLinkPreviewError('request_failed', error.message || '商品识别失败');
  }
  if (data?.error) throw new GearLinkPreviewError(data.error.code || 'request_failed', data.error.message || '商品识别失败');
  if (!data?.item?.name) throw new GearLinkPreviewError('empty_result', '没有识别到商品信息');
  return data.item;
}
