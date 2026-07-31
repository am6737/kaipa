import { File as FSFile } from 'expo-file-system';
import { supabase } from './supabase';

const BUCKET = 'kaipa';

const MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  heic: 'image/heic', webp: 'image/webp', gif: 'image/gif',
  mp4: 'video/mp4', mov: 'video/quicktime', m4v: 'video/x-m4v',
};

function extFromUri(uri: string): string {
  const match = uri.match(/\.(\w+)(?:\?.*)?$/);
  return match ? match[1].toLowerCase() : 'jpg';
}

export async function uploadMedia(
  localUri: string,
  userId: string,
  journeyId: string,
): Promise<string> {
  const ext = extFromUri(localUri);
  const contentType = MIME[ext] || 'application/octet-stream';
  const filename = `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}.${ext}`;
  const storagePath = `moments/${userId}/${journeyId}/${filename}`;

  const file = new FSFile(localUri);
  const buffer = await file.arrayBuffer();

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType, upsert: false });
  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}


export function isCloudUri(uri: string): boolean {
  return /^https?:\/\//i.test(uri);
}

export async function ensureCloudMedia(
  uris: string[] | undefined,
  userId: string,
  scopeId: string,
): Promise<string[] | undefined> {
  if (!uris) return undefined;
  return Promise.all(uris.map((uri) => isCloudUri(uri) ? uri : uploadMedia(uri, userId, scopeId)));
}

export async function uploadCover(
  localUri: string,
  journeyId: string,
): Promise<string> {
  const ext = extFromUri(localUri);
  const contentType = MIME[ext] || 'image/jpeg';
  const storagePath = `covers/${journeyId}.jpg`;

  const file = new FSFile(localUri);
  const buffer = await file.arrayBuffer();

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType, upsert: true });
  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  return data.publicUrl + `?t=${Date.now()}`;
}

function storagePathFromUrl(publicUrl: string): string | null {
  const marker = `/object/public/${BUCKET}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx < 0) return null;
  return publicUrl.slice(idx + marker.length);
}

export async function removeMedia(publicUrls: string[]): Promise<void> {
  const paths = publicUrls
    .map(storagePathFromUrl)
    .filter((p): p is string => p !== null);
  if (paths.length === 0) return;
  await supabase.storage.from(BUCKET).remove(paths);
}
