import { File as FSFile } from 'expo-file-system';
import { supabase } from './supabase';

const BUCKET = 'kaipa';
const PRIVATE_BUCKET = 'kaipa-private';

const MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  heic: 'image/heic', webp: 'image/webp', gif: 'image/gif',
  mp4: 'video/mp4', mov: 'video/quicktime', m4v: 'video/x-m4v',
  gpx: 'application/gpx+xml', kml: 'application/vnd.google-earth.kml+xml', kmz: 'application/vnd.google-earth.kmz',
};

function extFromUri(uri: string): string {
  const dataType = uri.match(/^data:image\/(png|jpeg|jpg|webp|gif);base64,/i)?.[1]?.toLowerCase();
  if (dataType) return dataType === 'jpeg' ? 'jpg' : dataType;
  const match = uri.match(/\.(\w+)(?:\?.*)?$/);
  return match ? match[1].toLowerCase() : 'jpg';
}

function dataUriBytes(uri: string): Uint8Array | null {
  const match = uri.match(/^data:[^;]+;base64,(.+)$/s);
  if (!match) return null;
  const binary = atob(match[1]);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
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

  const inlineBytes = dataUriBytes(localUri);
  const buffer = inlineBytes ?? await new FSFile(localUri).arrayBuffer();

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType, upsert: false });
  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}

// Track files live outside the journey that happens to use them: a track can
// exist unattached, and several journeys may share one file.
export async function uploadTrackFile(
  localUri: string,
  userId: string,
  fileName?: string,
): Promise<string> {
  const ext = (fileName?.match(/\.([a-z0-9]{1,10})$/i)?.[1] || extFromUri(localUri)).toLowerCase();
  const contentType = MIME[ext] || 'application/octet-stream';
  const filename = `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}.${ext}`;
  const storagePath = `tracks/${userId}/${filename}`;

  const inlineBytes = dataUriBytes(localUri);
  const buffer = inlineBytes ?? await new FSFile(localUri).arrayBuffer();

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType, upsert: false });
  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}

export async function uploadAgentAttachment(
  localUri: string,
  userId: string,
  name: string,
  mimeType: string,
): Promise<string> {
  const ext = (name.match(/\.([a-z0-9]{1,10})$/i)?.[1] || extFromUri(localUri) || 'bin').toLowerCase();
  const filename = `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}.${ext}`;
  const storagePath = `assistant/${userId}/${filename}`;
  const inlineBytes = dataUriBytes(localUri);
  const buffer = inlineBytes ?? await new FSFile(localUri).arrayBuffer();

  const { error } = await supabase.storage
    .from(PRIVATE_BUCKET)
    .upload(storagePath, buffer, { contentType: mimeType || MIME[ext] || 'application/octet-stream', upsert: false });
  if (error) throw error;

  const { data, error: signedUrlError } = await supabase.storage
    .from(PRIVATE_BUCKET)
    .createSignedUrl(storagePath, 60 * 60 * 24 * 7);
  if (signedUrlError || !data?.signedUrl) throw signedUrlError || new Error('Unable to create attachment URL');
  return data.signedUrl;
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

export async function uploadAvatar(localUri: string, userId: string): Promise<string> {
  const storagePath = `avatars/${userId}/avatar.jpg`;
  const buffer = await new FSFile(localUri).arrayBuffer();

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: 'image/jpeg', upsert: true });
  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  return `${data.publicUrl}?t=${Date.now()}`;
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

function storageLocationFromUrl(publicUrl: string): { bucket: string; path: string } | null {
  const match = publicUrl.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+?)(?:\?.*)?$/);
  if (!match || ![BUCKET, PRIVATE_BUCKET].includes(decodeURIComponent(match[1]))) return null;
  return { bucket: decodeURIComponent(match[1]), path: decodeURIComponent(match[2]) };
}

export async function removeMedia(publicUrls: string[]): Promise<void> {
  const grouped = new Map<string, string[]>();
  for (const url of publicUrls) {
    const location = storageLocationFromUrl(url);
    if (!location) continue;
    const paths = grouped.get(location.bucket) || [];
    paths.push(location.path);
    grouped.set(location.bucket, paths);
  }
  await Promise.all([...grouped].map(([bucket, paths]) => supabase.storage.from(bucket).remove(paths)));
}
