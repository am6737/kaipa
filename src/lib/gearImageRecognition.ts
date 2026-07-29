import { supabase } from './supabase';
import { GearCat, GearItem } from '../data/gear';

type GearImageRecognitionResponse = {
  item?: {
    name?: string;
    categoryId?: string;
    weightKg?: number | null;
    priceCny?: number | null;
    quantity?: number | null;
    attributes?: Array<{ key?: string; value?: string }>;
    warnings?: string[];
  };
  model?: string;
  error?: { code?: string; message?: string };
};

export class GearImageRecognitionError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

export async function recognizeGearImage(asset: { uri: string; base64?: string | null }, cats: GearCat[]): Promise<GearItem> {
  if (!asset.base64) throw new GearImageRecognitionError('image_read_failed', '无法读取所选图片，请重新选择');
  if (asset.base64.length > 12_000_000) throw new GearImageRecognitionError('image_too_large', '图片过大，请选择尺寸较小的图片');

  const { data, error } = await supabase.functions.invoke<GearImageRecognitionResponse>('gear-image-recognition', {
    body: {
      imageBase64: asset.base64,
      categories: cats.map(({ id, name }) => ({ id, name })),
    },
  });

  if (error) {
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const body = await context.clone().json() as GearImageRecognitionResponse;
        if (body.error?.message) throw new GearImageRecognitionError(body.error.code || 'request_failed', body.error.message);
      } catch (parsedError) {
        if (parsedError instanceof GearImageRecognitionError) throw parsedError;
      }
    }
    throw new GearImageRecognitionError('request_failed', error.message || '图片识别失败');
  }
  if (data?.error) throw new GearImageRecognitionError(data.error.code || 'request_failed', data.error.message || '图片识别失败');

  const result = data?.item;
  const name = result?.name?.trim();
  if (!result || !name) throw new GearImageRecognitionError('empty_result', '没有识别到装备，请换一张更清晰的图片');

  const fallbackCat = cats.find((cat) => cat.id === 'misc')?.id || cats[0]?.id || 'misc';
  const categoryId = cats.some((cat) => cat.id === result.categoryId) ? result.categoryId! : fallbackCat;
  const attrs = (result.attributes || [])
    .map(({ key, value }) => [String(key || '').trim(), String(value || '').trim()] as [string, string])
    .filter(([key, value]) => key && value)
    .slice(0, 8);

  return {
    name,
    cat: categoryId,
    w: positiveNumber(result.weightKg),
    p: positiveNumber(result.priceCny),
    qty: result.quantity && result.quantity > 1 ? Math.min(99, Math.round(result.quantity)) : undefined,
    photos: [asset.uri],
    attrs: attrs.length ? attrs : undefined,
    note: result.warnings?.filter(Boolean).join('\n') || undefined,
  };
}

function positiveNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}
