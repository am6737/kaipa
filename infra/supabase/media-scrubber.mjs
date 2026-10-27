import { execFile } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdtemp, open, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { setTimeout as sleep } from 'node:timers/promises';
import { promisify } from 'node:util';

// User media shown on profile pages can still carry coordinates: Live Photo
// stills (HEIC) keep an EXIF GPS sub-IFD, their paired .mov files keep
// QuickTime Keys/ItemList location entries, and some clients upload either as
// a .bin with an octet-stream mimetype, so every decision below is made on the
// bytes exiftool reads, never on the extension. Location tags are rewritten
// out in place with exiftool (a metadata-only edit; pixels and video samples
// are never re-encoded), then the object is re-uploaded to the same
// bucket/path with x-upsert so its public URL keeps working. Everything that
// was checked is remembered in public.media_location_scrub keyed by the
// object's current version, so each stored revision is looked at once.

const run = promisify(execFile);
const url = process.env.SUPABASE_URL || 'http://kong:8000';
const serviceKey = process.env.SERVICE_ROLE_KEY;
if (!serviceKey) throw new Error('Scrubber credentials are missing');
const scratchRoot = process.env.MEDIA_SCRUB_TMP || '/scratch';
const dryRun = process.env.MEDIA_SCRUB_DRY_RUN === '1';
const INTERVAL_MS = 60_000;
const BATCH = Math.max(1, Number(process.env.MEDIA_SCRUB_BATCH) || 20);
const CONCURRENCY = Math.max(1, Number(process.env.MEDIA_SCRUB_CONCURRENCY) || 2);
const MAX_BYTES = Number(process.env.MEDIA_SCRUB_MAX_BYTES) || 300 * 1024 * 1024;
const OBJECT_TIMEOUT_MS = Number(process.env.MEDIA_SCRUB_OBJECT_TIMEOUT_MS) || 10 * 60_000;
const EXIF_TIMEOUT_MS = Number(process.env.MEDIA_SCRUB_EXIF_TIMEOUT_MS) || 3 * 60_000;

const API = ['-api', 'LargeFileSupport=1'];
// Any tag naming GPS or location, from any group, plus every family-7
// location tag (derived Composite positions included). Empty stdout means
// clean; exiftool's minor warnings go to stderr and never reach this check.
const DETECT = ['exiftool', ['-a', '-G1', ...API, '-gps:all', '-location:all', '-*GPS*', '-*Location*']];
// -gps:all= deletes location tags in every container (EXIF GPS sub-IFDs of
// JPEG/HEIC, XMP-geo, QuickTime Keys:GPSCoordinates); -keys:location*= mops up
// the Apple accuracy keys that are location but not GPS.
const STRIP = ['-overwrite_original', ...API, '-gps:all=', '-location:all=', '-keys:location*='];
// FileType values worth opening. MIMEType cannot be trusted for .bin uploads.
const MEDIA_TYPES = new Set([
  'HEIC', 'HEIF', 'HIF', 'AVIF', 'JPG', 'JPEG', 'PNG', 'GIF', 'WEBP', 'TIFF', 'BMP', 'DNG', 'CR2', 'CR3',
  'MP4', 'M4V', 'MOV', 'QTV', '3GP', '3G2', 'AVI', 'MKV', 'WMV', 'FLV', 'MPG', 'MPEG', 'OGV', 'WTV',
]);

let stopping = false;
process.on('SIGTERM', () => { stopping = true; });
process.on('SIGINT', () => { stopping = true; });

const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
const objectPath = (bucket, name) => `${url}/storage/v1/object/${encodeURIComponent(bucket)}/${name.split('/').map(encodeURIComponent).join('/')}`;

async function rpc(name, body) {
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status} ${(await response.text()).slice(0, 200)}`);
  return response.json();
}

async function exiftool(args, file) {
  const { stdout } = await run(DETECT[0], [...args, file], { timeout: EXIF_TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024 });
  return stdout;
}

async function download(object, dest, signal) {
  const response = await fetch(objectPath(object.bucket_id, object.name), { headers, signal });
  if (!response.ok) throw new Error(`download: HTTP ${response.status}`);
  const file = await open(dest, 'w');
  let bytes = 0;
  try {
    for await (const chunk of response.body) {
      bytes += chunk.length;
      if (bytes > MAX_BYTES) throw new Error(`oversize: ${bytes} B streamed of ${object.name}`);
      await file.write(chunk);
    }
  } finally {
    await file.close();
  }
  return bytes;
}

async function upload(object, src, signal) {
  const response = await fetch(objectPath(object.bucket_id, object.name), {
    method: 'PUT', signal,
    headers: {
      ...headers,
      'Content-Type': object.content_type || 'application/octet-stream',
      'Cache-Control': object.cache_control || 'max-age=3600',
      'x-upsert': 'true',
    },
    body: Readable.toWeb(createReadStream(src)),
    duplex: 'half',
  });
  if (!response.ok) throw new Error(`upload: HTTP ${response.status} ${(await response.text()).slice(0, 200)}`);
}

async function inspect(file) {
  const stdout = await exiftool(['-j', ...API, '-FileType', '-MIMEType'], file);
  const parsed = JSON.parse(stdout || '[]');
  return Array.isArray(parsed) ? (parsed[0] || {}) : parsed;
}

async function scrub(object) {
  const dir = await mkdtemp(path.join(scratchRoot, 'scrub-'));
  const file = path.join(dir, 'media');
  const signal = AbortSignal.timeout(OBJECT_TIMEOUT_MS);
  const label = `${object.bucket_id}/${object.name}`;
  try {
    await download(object, file, signal);
    const info = await inspect(file);
    if (!MEDIA_TYPES.has(info.FileType) && !/^(image|video)\//.test(info.MIMEType || '')) {
      return { result: 'skipped', detail: `FileType ${info.FileType || 'unknown'}` };
    }
    const found = await exiftool(DETECT[1], file);
    if (!found.trim()) return { result: 'clean', detail: info.FileType };
    const tags = found.trim().split('\n');
    if (dryRun) {
      console.log(`[dry run] ${label}: would strip ${tags.length} location tag(s): ${tags.join(' | ').slice(0, 300)}`);
      return { result: 'dry', detail: `${tags.length} tag(s)` };
    }
    await exiftool(STRIP, file);
    if ((await exiftool(DETECT[1], file)).trim()) throw new Error('location tags survived the rewrite');
    if ((await inspect(file)).FileType !== info.FileType) throw new Error(`file type changed from ${info.FileType}`);
    if (!(await stat(file)).size) throw new Error('stripped file is empty');
    await upload(object, file, signal);
    return { result: 'stripped', detail: tags.map(t => t.split(': ').shift()).join(', ').slice(0, 400) };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function drain(objects) {
  const counts = { clean: 0, stripped: 0, skipped: 0, failed: 0, dry: 0 };
  let next = 0;
  async function worker() {
    while (!stopping) {
      const object = objects[next++];
      if (!object) return;
      let outcome;
      try { outcome = await scrub(object); }
      catch (error) { outcome = { result: 'failed', detail: String(error?.cause?.message || error.message || error).slice(0, 400) }; }
      counts[outcome.result]++;
      // Record re-reads the object's CURRENT version, so a stripped-and-
      // re-uploaded object is remembered against its new version immediately.
      if (!dryRun && outcome.result !== 'dry') {
        try { await rpc('media_scrub_record', { p_object_id: object.object_id, p_result: outcome.result, p_detail: outcome.detail }); }
        catch (error) { console.warn(`record ${object.bucket_id}/${object.name}: ${String(error).slice(0, 160)}`); }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, objects.length) }, worker));
  return counts;
}

async function tick() {
  const started = Date.now();
  const objects = await rpc('media_scrub_pending', { p_limit: BATCH });
  const counts = objects.length ? await drain(objects) : { clean: 0, stripped: 0, skipped: 0, failed: 0, dry: 0 };
  console.log(`media scrub: ${objects.length} object(s) in ${((Date.now() - started) / 1000).toFixed(0)}s — `
    + `clean ${counts.clean}, stripped ${counts.stripped}, skipped ${counts.skipped}, failed ${counts.failed}${dryRun ? `, would-strip ${counts.dry}` : ''}`);
  return counts;
}

// MEDIA_SCRUB_ONCE=1 runs a single pass and exits, for a manual run:
//   docker compose ... run --rm -e MEDIA_SCRUB_ONCE=1 media-scrubber
if (process.env.MEDIA_SCRUB_ONCE === '1') {
  await tick();
  process.exit(0);
}

console.log(`Kaipa media scrubber started${dryRun ? ' (dry run)' : ''}`);
while (!stopping) {
  try { await tick(); }
  catch (error) { console.warn(`Scrub tick failed: ${String(error).slice(0, 200)}`); }
  for (let waited = 0; waited < INTERVAL_MS && !stopping; waited += 5_000) await sleep(5_000);
}
