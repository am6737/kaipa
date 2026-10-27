import AsyncStorage from '@react-native-async-storage/async-storage';
import { File as FSFile, Paths, UploadType } from 'expo-file-system';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Platform } from 'react-native';
import { fitImage } from './imageFit';
import { resourceRequest, resourceUsageChanged } from './resourceClient';
import { supabase, supabaseAnonKey, supabaseUrl } from './supabase';

const BUCKET = 'kaipa';
const PRIVATE_BUCKET = 'kaipa-private';
const SIGNED_URL_SECONDS = 60 * 60 * 24 * 7;

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

function nativeFileSize(uri: string): number | null {
  if (Platform.OS === 'web' || /^(data|https?):/i.test(uri)) return null;
  try {
    return new FSFile(uri).size || null;
  } catch {
    return null;
  }
}

// Past this size a file goes up resumably, in chunks, so a dropped connection
// costs one chunk instead of the whole file.
const RESUMABLE_UPLOAD_BYTES = 20 * 1024 * 1024;
// Storage's resumable endpoint takes any chunk size on the file backend, but
// its S3 backend and the official clients use 6 MB.
const CHUNK_BYTES = 6 * 1024 * 1024;

async function storageHeaders(): Promise<Record<string, string>> {
  const {data} = await supabase.auth.getSession();
  return {Authorization:`Bearer ${data.session?.access_token || supabaseAnonKey}`,apikey:supabaseAnonKey};
}

const storageObjectUrl = (bucket: string, path: string) =>
  `${supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${path.split('/').map(encodeURIComponent).join('/')}`;

function uploadFailure(status: number, text: string): Error {
  let body: {message?: string; error?: string; statusCode?: string} = {};
  try { body = JSON.parse(text) || {}; } catch { /* keep the status */ }
  return Object.assign(new Error(body.message || body.error || text.slice(0,200) || `Upload failed (${status})`),{status,statusCode:body.statusCode || String(status)});
}

// Files go to Storage through the native uploader, straight from disk; reading
// a 200 MB KMZ or video into a JS ArrayBuffer is what takes the app down.
async function nativeObjectUpload(uri: string, bucket: string, path: string, mime: string): Promise<void> {
  const result = await new FSFile(uri).upload(storageObjectUrl(bucket,path),{
    httpMethod:'POST',
    uploadType:UploadType.BINARY_CONTENT,
    mimeType:mime,
    sessionType:'foreground',
    headers:{...await storageHeaders(),'Content-Type':mime,'x-upsert':'false'},
  });
  if (result.status >= 200 && result.status < 300) return;
  throw uploadFailure(result.status,result.body);
}

// The upload task rejects without a status only when no answer came back,
// which is also how a file the native side cannot read fails.
class NativeUploadUnavailable extends Error {}

const failureStatus = (error: unknown) => Number((error as {status?: number}).status) || 0;
const isConflict = (error: unknown) => failureStatus(error) === 409 || (error as {statusCode?: string}).statusCode === '409';
// Worth one more try: no answer at all, or the server was briefly unavailable.
const isTransient = (error: unknown) => {
  const status = failureStatus(error);
  return !status || status === 408 || status === 429 || status >= 500;
};

// Weak mountain networks drop the odd request, so a transient failure gets one
// retry. Ticket paths are unique and never upserted, so a conflict on the retry
// means the first attempt landed and only its reply was lost.
async function putObject(uri: string, buffer: Uint8Array | ArrayBuffer | null, bucket: string, path: string, mime: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      if (buffer) {
        const {error} = await supabase.storage.from(bucket).upload(path,buffer,{contentType:mime,upsert:false});
        if (error) throw error;
      } else {
        try {
          await nativeObjectUpload(uri,bucket,path,mime);
        } catch (error) {
          if (attempt === 0 && !failureStatus(error) && !(await nativeFileReadable(uri))) throw new NativeUploadUnavailable();
          throw error;
        }
      }
      return;
    } catch (error) {
      if (error instanceof NativeUploadUnavailable) throw error;
      if (attempt > 0 && isConflict(error)) return;
      if (attempt > 0 || !isTransient(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve,2000));
    }
  }
}

async function nativeFileReadable(uri: string): Promise<boolean> {
  try {
    const handle = new FSFile(uri).open();
    handle.close();
    return true;
  } catch {
    return false;
  }
}

type UploadTicket = {id: string; bucket: string; path: string; expires_at?: string};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve,ms));

// The failure moment is exactly when the network is least reliable, so a
// dropped cancel would strand the ticket (and its admission slot) until
// expiry. Retry once before giving up to the maintenance sweep.
async function cancelTicket(id: string): Promise<void> {
  try { await resourceRequest({action:'upload_cancel',id}); }
  catch {
    try { await sleep(2000); await resourceRequest({action:'upload_cancel',id}); } catch { /* maintenance reclaims expired tickets */ }
  }
}

// The server admits 8 open tickets per account. Small files spend most of their
// time waiting on round trips, so six run together; a large file can fill a
// phone's uplink by itself, so at most two of those run at once. The limit is
// shared by every screen, so two batches saving together still fit.
const MAX_UPLOADS = 6;
const MAX_LARGE_UPLOADS = 2;
let runningUploads = 0;
let runningLargeUploads = 0;
const waitingUploads: {large: boolean; start: () => void}[] = [];

function admitUploads() {
  for (let i = 0; i < waitingUploads.length && runningUploads < MAX_UPLOADS;) {
    const waiting = waitingUploads[i];
    if (waiting.large && runningLargeUploads >= MAX_LARGE_UPLOADS) { i++; continue; }
    waitingUploads.splice(i,1);
    runningUploads++;
    if (waiting.large) runningLargeUploads++;
    waiting.start();
  }
}

async function uploadSlot<T>(large: boolean, run: () => Promise<T>): Promise<T> {
  await new Promise<void>((start) => { waitingUploads.push({large,start}); admitUploads(); });
  try {
    return await run();
  } finally {
    runningUploads--;
    if (large) runningLargeUploads--;
    admitUploads();
  }
}

async function singleUpload(
  uri: string, buffer: Uint8Array | ArrayBuffer | null, size: number,
  purpose: string, scope: string, mime: string, checkAccount: () => Promise<void>,
): Promise<UploadTicket> {
  const ticket = await resourceRequest<UploadTicket>({action:'upload_prepare',purpose,scope,bytes:size,mime});
  try {
    await checkAccount();
    try {
      await putObject(uri,buffer,ticket.bucket,ticket.path,mime);
    } catch (error) {
      // A provider URI the native uploader cannot open still reads through the
      // JS file API; the ticket already covers the same bytes.
      if (!(error instanceof NativeUploadUnavailable)) throw error;
      await putObject(uri,await fileBytes(uri),ticket.bucket,ticket.path,mime);
    }
  } catch (error) {
    await cancelTicket(ticket.id);
    throw error;
  }
  return ticket;
}

// ---- Resumable uploads -----------------------------------------------------
//
// Large files go through Storage's TUS endpoint: the upload is created once,
// then sent in chunks, and after a dropped connection the server reports how
// many bytes it holds and sending carries on from there. Each chunk is written
// to a cache file and handed to the native uploader, so the file itself is never
// in JS memory. When the network stays down the upload is kept, ticket and all,
// so picking the same file again (even after a restart) resumes it.

const RESUMABLE_KEY = 'kaipa.resumableUploads.v1';
// Matches the server's cap on a renewed ticket's life.
const RESUMABLE_KEEP_MS = 6 * 60 * 60 * 1000;
// A stalled chunk is retried over about a minute and a half before giving up.
const STALL_DELAYS_MS = [2000,4000,8000,15000,30000,30000];
// Renew the ticket once it is this close to expiring.
const TICKET_RENEW_MS = 10 * 60 * 1000;

type ResumableRecord = {ticket: UploadTicket; uploadUrl: string; savedAt: number};

async function resumableRecords(): Promise<Record<string, ResumableRecord>> {
  try { return JSON.parse(await AsyncStorage.getItem(RESUMABLE_KEY) || '{}') || {}; }
  catch { return {}; }
}

async function updateResumableRecords(change: (records: Record<string, ResumableRecord>) => void): Promise<void> {
  try {
    const records = await resumableRecords();
    change(records);
    await AsyncStorage.setItem(RESUMABLE_KEY,JSON.stringify(records));
  } catch (error) {
    console.warn('[upload] resume record not saved:', error);
  }
}

async function deleteResumable(uploadUrl: string): Promise<void> {
  try { await fetch(uploadUrl,{method:'DELETE',headers:{...await storageHeaders(),'Tus-Resumable':'1.0.0'}}); }
  catch { /* the partial file stays until storage is cleaned */ }
}

/** A kept upload of this exact file whose ticket the server still honours. */
async function takeResumable(key: string): Promise<ResumableRecord | null> {
  const records = await resumableRecords();
  const now = Date.now();
  const stale = Object.entries(records).filter(([, record]) => now - record.savedAt > RESUMABLE_KEEP_MS);
  const record = records[key];
  if (stale.length) {
    await updateResumableRecords((current) => { for (const [k] of stale) delete current[k]; });
    for (const [, old] of stale) void deleteResumable(old.uploadUrl);
  }
  if (!record || now - record.savedAt > RESUMABLE_KEEP_MS) return null;
  try {
    const renewed = await resourceRequest<{expires_at: string | null}>({action:'upload_extend',id:record.ticket.id});
    if (renewed.expires_at) return {...record,ticket:{...record.ticket,expires_at:renewed.expires_at}};
  } catch {
    return null;
  }
  await updateResumableRecords((current) => { delete current[key]; });
  void deleteResumable(record.uploadUrl);
  return null;
}

const responseHeader = (headers: Record<string, string>, name: string) =>
  Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1];

async function createResumable(ticket: UploadTicket, size: number, mime: string): Promise<string> {
  // Bucket, path and type are all ASCII.
  const meta = (value: string) => btoa(value);
  const response = await fetch(`${supabaseUrl}/storage/v1/upload/resumable`,{
    method:'POST',
    headers:{
      ...await storageHeaders(),
      'Tus-Resumable':'1.0.0',
      'Upload-Length':String(size),
      'x-upsert':'false',
      'Upload-Metadata':`bucketName ${meta(ticket.bucket)},objectName ${meta(ticket.path)},contentType ${meta(mime)},cacheControl ${meta('3600')}`,
    },
  });
  const location = response.headers.get('location');
  if (response.status !== 201 || !location) throw uploadFailure(response.status,await response.text());
  // Storage builds the address from forwarded headers; only its id is trusted.
  const id = location.split('/upload/resumable/')[1];
  if (!id) throw new Error('Resumable upload address missing');
  return `${supabaseUrl}/storage/v1/upload/resumable/${id}`;
}

/** Bytes the server holds, or null once the upload is gone. */
async function resumableOffset(uploadUrl: string): Promise<number | null> {
  const response = await fetch(uploadUrl,{method:'HEAD',headers:{...await storageHeaders(),'Tus-Resumable':'1.0.0','Cache-Control':'no-store'}});
  if (response.status === 404 || response.status === 410) return null;
  const offset = Number(response.headers.get('upload-offset'));
  if (!response.ok || !Number.isFinite(offset)) throw uploadFailure(response.status,'');
  return offset;
}

async function objectStored(ticket: UploadTicket): Promise<boolean> {
  const response = await fetch(`${supabaseUrl}/storage/v1/object/info/${encodeURIComponent(ticket.bucket)}/${ticket.path.split('/').map(encodeURIComponent).join('/')}`,{headers:await storageHeaders()});
  return response.ok;
}

type ChunkReader = {read: (offset: number, length: number) => Uint8Array; close: () => void};

// An Android provider can hand back a stream that cannot seek; that file is
// copied to the cache first. Null when the native side cannot read it at all.
async function chunkReader(uri: string): Promise<ChunkReader | null> {
  const open = (file: FSFile) => {
    const handle = file.open();
    try { handle.offset = 0; } catch (error) { handle.close(); throw error; }
    return handle;
  };
  let copy: FSFile | undefined;
  try {
    let handle;
    try {
      handle = open(new FSFile(uri));
    } catch {
      copy = new FSFile(Paths.cache,`upload-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      await new FSFile(uri).copy(copy);
      handle = open(copy);
    }
    const opened = handle;
    return {
      read:(offset,length) => { opened.offset = offset; return opened.readBytes(length); },
      close:() => {
        try { opened.close(); } catch { /* already closed */ }
        try { copy?.delete(); } catch { /* the OS clears the cache */ }
      },
    };
  } catch {
    try { copy?.delete(); } catch { /* the OS clears the cache */ }
    return null;
  }
}

async function sendChunk(reader: ChunkReader, uploadUrl: string, offset: number, length: number): Promise<number> {
  const chunk = new FSFile(Paths.cache,`upload-chunk-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  try {
    const bytes = reader.read(offset,length);
    if (bytes.byteLength !== length) throw new Error('Short read from upload file');
    chunk.write(bytes);
    // iOS keeps a background-session chunk going while the app is suspended.
    const result = await chunk.upload(uploadUrl,{
      httpMethod:'PATCH',
      uploadType:UploadType.BINARY_CONTENT,
      mimeType:'application/offset+octet-stream',
      sessionType:'background',
      headers:{...await storageHeaders(),'Tus-Resumable':'1.0.0','Upload-Offset':String(offset),'Content-Type':'application/offset+octet-stream'},
    });
    if (result.status !== 204) throw uploadFailure(result.status,result.body);
    const next = Number(responseHeader(result.headers,'upload-offset'));
    return Number.isFinite(next) && next > offset ? next : offset + length;
  } finally {
    try { chunk.delete(); } catch { /* the OS clears the cache */ }
  }
}

/** Null when the file cannot be read natively; the caller then sends it whole. */
async function resumableUpload(
  uri: string, size: number, purpose: string, scope: string, mime: string,
  accountId: string, checkAccount: () => Promise<void>,
): Promise<UploadTicket | null> {
  const reader = await chunkReader(uri);
  if (!reader) return null;
  const key = [accountId,purpose,scope,mime,size,uri].join('|');
  try {
    const kept = await takeResumable(key);
    const ticket = kept?.ticket ?? await resourceRequest<UploadTicket>({action:'upload_prepare',purpose,scope,bytes:size,mime});
    let uploadUrl = kept?.uploadUrl;
    let expiresAt = Date.parse(ticket.expires_at || '') || Date.now() + TICKET_RENEW_MS;
    const forget = () => updateResumableRecords((records) => { delete records[key]; });
    try {
      await checkAccount();
      let offset = 0;
      if (uploadUrl) {
        const held = await resumableOffset(uploadUrl).catch(() => 0);
        if (held === null) uploadUrl = undefined;
        else offset = held;
      }
      if (!uploadUrl) {
        uploadUrl = await createResumable(ticket,size,mime);
        offset = 0;
      }
      const url = uploadUrl;
      await updateResumableRecords((records) => { records[key] = {ticket,uploadUrl:url,savedAt:Date.now()}; });
      let finished = false;
      let stalls = 0;
      while (offset < size) {
        if (expiresAt - Date.now() < TICKET_RENEW_MS) {
          try {
            const renewed = await resourceRequest<{expires_at: string | null}>({action:'upload_extend',id:ticket.id});
            if (renewed.expires_at) expiresAt = Date.parse(renewed.expires_at);
          } catch { /* still valid for now; try again before the next chunk */ }
        }
        await checkAccount();
        try {
          offset = await sendChunk(reader,url,offset,Math.min(CHUNK_BYTES,size - offset));
          finished = offset >= size;
          stalls = 0;
        } catch (error) {
          // 409: the server holds a different offset than we sent, e.g. the
          // last chunk landed but its reply was lost. Ask and carry on.
          if ((!isConflict(error) && !isTransient(error)) || stalls >= STALL_DELAYS_MS.length) throw error;
          if (!isConflict(error)) await sleep(STALL_DELAYS_MS[stalls]);
          stalls++;
          const held = await resumableOffset(url).catch(() => offset);
          if (held === null) throw Object.assign(new Error('Resumable upload expired'),{status:410});
          offset = held;
        }
      }
      // Storage creates the object when the last byte arrives. If that reply
      // was lost, the object itself says whether completion went through.
      if (!finished && !(await objectStored(ticket))) throw Object.assign(new Error('Upload did not complete'),{status:500,statusCode:'500'});
    } catch (error) {
      // Still offline: keep the ticket and the partial upload, so sending the
      // same file again picks up where this left off. The ticket lapses on its
      // own if nobody comes back.
      if (isTransient(error) && !(error as {statusCode?: string}).statusCode) throw error;
      await forget();
      if (uploadUrl) void deleteResumable(uploadUrl);
      await cancelTicket(ticket.id);
      throw error;
    }
    await forget();
    return ticket;
  } finally {
    reader.close();
  }
}

async function ticketUpload(uri: string, purpose: string, scope: string, contentType?: string, expectedUserId?: string): Promise<string> {
  const initial = await supabase.auth.getSession();
  const accountId = expectedUserId || initial.data.session?.user.id;
  const checkAccount = async () => {
    const {data} = await supabase.auth.getSession();
    if (!accountId || data.session?.user.id !== accountId) throw new Error('账号已切换，请重新操作');
  };
  await checkAccount();
  const diskSize = nativeFileSize(uri);
  let buffer = diskSize ? null : await fileBytes(uri);
  const size = diskSize || buffer!.byteLength;
  const mime = contentType || MIME[extFromUri(uri)] || 'application/octet-stream';
  const large = size > RESUMABLE_UPLOAD_BYTES;
  await checkAccount();
  const ticket = await uploadSlot(large,async () => {
    if (diskSize && large) {
      const done = await resumableUpload(uri,size,purpose,scope,mime,accountId!,checkAccount);
      if (done) return done;
      buffer = await fileBytes(uri);
    }
    return singleUpload(uri,buffer,size,purpose,scope,mime,checkAccount);
  });
  await checkAccount();
  resourceUsageChanged();
  if (ticket.bucket === PRIVATE_BUCKET) {
    const {data,error} = await supabase.storage.from(ticket.bucket).createSignedUrl(ticket.path,SIGNED_URL_SECONDS);
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
/** A photo marked on a recorded walk; kept beside the track files. */
export async function uploadTrackPhoto(localUri: string, userId: string): Promise<string> {
  return ticketUpload(localUri,'track',userId,'image/jpeg',userId);
}
// Long enough that a screenshot's small print stays legible to the model,
// which reads well under this anyway.
const AGENT_IMAGE_EDGE = 2048;

export type UploadedAttachment = { url: string; name: string; mimeType: string; size?: number };

/** Photos are re-encoded to what the model can use before they go up, so the
 *  name and type that come back may differ from the ones passed in. */
export async function uploadAgentAttachment(localUri: string, userId: string, name: string, mimeType: string): Promise<UploadedAttachment> {
  const fitted = mimeType.startsWith('image/') ? await fitImage(localUri,AGENT_IMAGE_EDGE) : null;
  if (!fitted) {
    return {url:await ticketUpload(localUri,'attachment',userId,mimeType || MIME[extFromUri(name)] || 'application/octet-stream',userId),name,mimeType};
  }
  return {
    url:await ticketUpload(fitted.uri,'attachment',userId,fitted.mimeType,userId),
    name:`${name.replace(/\.[^./]+$/,'')}.jpg`,
    mimeType:fitted.mimeType,
    size:nativeFileSize(fitted.uri) ?? undefined,
  };
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
    const size = nativeFileSize(image.uri) ?? (await fileBytes(image.uri)).byteLength;
    if (size <= 500*1024 || (transparent && size<=2*1024*1024)) return image.uri;
    edge = Math.round(edge*0.75);
  }
  if ((nativeFileSize(image.uri) ?? (await fileBytes(image.uri)).byteLength) > 2*1024*1024) throw new Error('装备图片过大，请选择尺寸较小的图片');
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

/** Items prepared at once per batch; how many actually upload together is
 *  decided by uploadSlot, by file size, across every screen. */
const UPLOAD_WORKERS = 6;

/**
 * Runs a batch of uploads several at a time. `store` wraps each upload so the batch
 * knows what it put in Storage: if any item fails, the rest finish, everything
 * this batch stored is deleted, and the first error is rethrown, so a failed
 * save leaves nothing behind (track and attachment files are never swept).
 */
export async function uploadBatch<T, R>(
  items: T[],
  each: (item: T, store: (upload: () => Promise<string>) => Promise<string>) => Promise<R>,
): Promise<R[]> {
  const stored: string[] = [];
  const store = async (upload: () => Promise<string>) => {
    const url = await upload();
    stored.push(url);
    return url;
  };
  const results = new Array<R>(items.length);
  let next = 0;
  let failure: {error: unknown} | undefined;
  const worker = async () => {
    while (!failure && next < items.length) {
      const index = next++;
      try {
        results[index] = await each(items[index], store);
      } catch (error) {
        failure ??= {error};
      }
    }
  };
  await Promise.all(Array.from({length:Math.min(UPLOAD_WORKERS,items.length)},worker));
  if (failure) {
    await removeMedia(stored).catch((error) => console.warn('[uploadBatch] cleanup failed:', error));
    throw failure.error;
  }
  return results;
}

export async function ensureCloudMedia(
  uris: string[] | undefined,
  userId: string,
  scopeId: string,
): Promise<string[] | undefined> {
  if (!uris) return undefined;
  return uploadBatch(uris, (uri, store) => isCloudUri(uri) ? Promise.resolve(uri) : store(() => uploadMedia(uri, userId, scopeId)));
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

// Signed links expire after a week, but chat history keeps them for good, so
// links read back from history are signed again once they near expiry. A
// link still good for a day is left alone to keep the image cache warm.
export async function refreshSignedUrls(items: {url: string}[]): Promise<void> {
  const stale = items.flatMap((item) => {
    const location = storageLocationFromUrl(item.url);
    if (location?.bucket !== PRIVATE_BUCKET || !/\/object\/sign\//.test(item.url)) return [];
    return signedUrlExpiry(item.url) > Date.now() + 24*60*60*1000 ? [] : [{item,path:location.path}];
  });
  if (!stale.length) return;
  try {
    const {data,error} = await supabase.storage.from(PRIVATE_BUCKET).createSignedUrls([...new Set(stale.map(({path}) => path))],SIGNED_URL_SECONDS);
    if (error || !data) return;
    const fresh = new Map(data.flatMap((entry) => entry.path && entry.signedUrl ? [[entry.path,entry.signedUrl] as const] : []));
    for (const {item,path} of stale) item.url = fresh.get(path) || item.url;
  } catch {
    // Offline: keep the old links; anything still valid keeps rendering.
  }
}

function signedUrlExpiry(url: string): number {
  try {
    const token = new URL(url).searchParams.get('token') || '';
    const payload = token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
    return (JSON.parse(atob(payload.padEnd(Math.ceil(payload.length/4)*4,'='))).exp || 0) * 1000;
  } catch {
    return 0;
  }
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
