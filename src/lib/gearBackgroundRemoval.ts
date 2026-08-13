import { File as FSFile } from 'expo-file-system';
import { supabase } from './supabase';

type GearBackgroundRemovalResponse = {
  imageBase64?: string;
  contentType?: string;
  error?: { code?: string; message?: string };
};

export class GearBackgroundRemovalError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

export async function removeGearImageBackground(source: { uri: string; mimeType?: string | null }): Promise<string> {
  const remote = /^https?:\/\//i.test(source.uri);
  const imageBase64 = remote ? undefined : await new FSFile(source.uri).base64();

  if (imageBase64 && imageBase64.length > 20_000_000) {
    throw new GearBackgroundRemovalError('image_too_large', '图片过大，请选择尺寸较小的图片');
  }

  const { data, error } = await supabase.functions.invoke<GearBackgroundRemovalResponse>('gear-background-removal', {
    body: remote
      ? { imageUrl: source.uri }
      : { imageBase64, contentType: source.mimeType || contentTypeFromUri(source.uri) },
  });

  if (error) {
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const body = await context.clone().json() as GearBackgroundRemovalResponse;
        if (body.error?.message) throw new GearBackgroundRemovalError(body.error.code || 'request_failed', body.error.message);
      } catch (parsedError) {
        if (parsedError instanceof GearBackgroundRemovalError) throw parsedError;
      }
    }
    throw new GearBackgroundRemovalError('request_failed', error.message || '抠图失败');
  }

  if (data?.error) throw new GearBackgroundRemovalError(data.error.code || 'request_failed', data.error.message || '抠图失败');
  if (!data?.imageBase64) throw new GearBackgroundRemovalError('empty_result', '没有生成可用的抠图结果');

  return `data:${data.contentType || 'image/png'};base64,${data.imageBase64}`;
}

function contentTypeFromUri(uri: string): string {
  const ext = uri.match(/\.(\w+)(?:\?.*)?$/)?.[1]?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'heic' || ext === 'heif') return 'image/heic';
  return 'image/jpeg';
}
