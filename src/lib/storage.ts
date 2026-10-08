import { File as FSFile } from 'expo-file-system';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Platform } from 'react-native';
import { resourceRequest, resourceUsageChanged } from './resourceClient';
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

async function fileBytes(uri: string): Promise<Uint8Array | ArrayBuffer> {
  const inline = dataUriBytes(uri);
  if (inline) return inline;
  if (Platform.OS === 'web' || /^https?:/i.test(uri)) {
    const response = await fetch(uri);
    if (!response.ok) throw new Error('无法读取图片，请重新选择');
    return response.arrayBuffer();
  }
  return new FSFile(uri).arrayBuffer();
}

async function ticketUpload(uri: string, purpose: string, scope: string, contentType?: string, expectedUserId?: string): Promise<string> {
  const initial = await supabase.auth.getSession();
  const accountId = expectedUserId || initial.data.session?.user.id;
  const checkAccount = async () => {
    const {data} = await supabase.auth.getSession();
    if (!accountId || data.session?.user.id !== accountId) throw new Error('账号已切换，请重新操作');
  };
  await checkAccount();
  const buffer = await fileBytes(uri);
  const mime = contentType || MIME[extFromUri(uri)] || 'application/octet-stream';
  await checkAccount();
  const ticket = await resourceRequest<{id:string;bucket:string;path:string}>({action:'upload_prepare',purpose,scope,bytes:buffer.byteLength,mime});
  try {
    await checkAccount();
    const {error} = await supabase.storage.from(ticket.bucket).upload(ticket.path,buffer,{contentType:mime,upsert:false});
    if (error) throw error;
  } catch (error) {
    try { await resourceRequest({action:'upload_cancel',id:ticket.id}); } catch { /* server maintenance retries expiry */ }
    throw error;
  }
  await checkAccount();
  resourceUsageChanged();
  if (ticket.bucket === PRIVATE_BUCKET) {
    const {data,error} = await supabase.storage.from(ticket.bucket).createSignedUrl(ticket.path,60*60*24*7);
    if (error || !data) throw error || new Error('附件链接生成失败');
    return data.signedUrl;
  }
  return supabase.storage.from(ticket.bucket).getPublicUrl(ticket.path).data.publicUrl;
}

export async function uploadMedia(localUri: string, userId: string, journeyId: string): Promise<string> {
  return ticketUpload(localUri,'media',journeyId,undefined,userId);
}
export async function uploadTrackFile(localUri: string, userId: string, fileName?: string): Promise<string> {
  const ext = (fileName?.match(/\.([a-z0-9]{1,10})$/i)?.[1] || extFromUri(localUri)).toLowerCase();
  return ticketUpload(localUri,'track',userId,MIME[ext] || 'application/octet-stream',userId);
}
export async function uploadAgentAttachment(localUri: string, userId: string, name: string, mimeType: string): Promise<string> {
  return ticketUpload(localUri,'attachment',userId,mimeType || MIME[extFromUri(name)] || 'application/octet-stream',userId);
}

// Display-sized gear images; PNG keeps transparency, JPEG compresses photos.
export async function compressGearImage(uri: string): Promise<string> {
  const transparent = /(?:\.(?:png|webp)(?:\?|$)|^data:image\/(?:png|webp))/i.test(uri);
  const format = transparent ? SaveFormat.PNG : SaveFormat.JPEG;
  let image = await manipulateAsync(uri,[],{format,compress:0.8});
  let edge = Math.min(1600,Math.max(image.width,image.height));
  for (let attempt=0;attempt<5;attempt++) {
    const scale = edge/Math.max(image.width,image.height);
    image = await manipulateAsync(image.uri,[{resize:{width:Math.max(1,Math.round(image.width*scale)),height:Math.max(1,Math.round(image.height*scale))}}],{format,compress:Math.max(0.45,0.8-attempt*0.08)});
    const size = (await fileBytes(image.uri)).byteLength;
    if (size <= 500*1024 || (transparent && size<=2*1024*1024)) return image.uri;
    edge = Math.round(edge*0.75);
  }
  if ((await fileBytes(image.uri)).byteLength > 2*1024*1024) throw new Error('装备图片过大，请选择尺寸较小的图片');
  return image.uri;
}
export async function ensureCloudGearMedia(uris: string[] | undefined, userId: string, scope: string, existing: string[] = []): Promise<string[] | undefined> {
  if (!uris) return undefined;
  if (uris.length>5 && uris.length>existing.length) throw new Error('每件装备最多上传 5 张图片');
  const uploaded: string[] = [];
  try {
    const output: string[] = [];
    for (const uri of uris) {
      if (existing.includes(uri)) { output.push(uri); continue; }
      const cloud = await ticketUpload(await compressGearImage(uri),'gear',scope,undefined,userId);
      uploaded.push(cloud); output.push(cloud);
    }
    return output;
  } catch (error) {
    await removeMedia(uploaded).catch(()=>{});
    throw error;
  }
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
  return ticketUpload(await compressGearImage(localUri),'avatar',userId,undefined,userId);
}
export async function uploadCover(localUri: string, journeyId: string): Promise<string> {
  return ticketUpload(await compressGearImage(localUri),'cover',journeyId);
}

function storageLocationFromUrl(publicUrl: string): { bucket: string; path: string } | null {
  const match = publicUrl.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+?)(?:\?.*)?$/);
  if (!match || ![BUCKET, PRIVATE_BUCKET, 'kaipa-gear'].includes(decodeURIComponent(match[1]))) return null;
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
  await Promise.all([...grouped].map(async ([bucket, paths]) => {
    const {error} = await supabase.storage.from(bucket).remove(paths);
    if (error) throw error;
  }));
  resourceUsageChanged();
}
