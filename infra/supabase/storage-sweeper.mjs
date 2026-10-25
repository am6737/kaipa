import { readdir, readFile, rmdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

// Storage's resumable (TUS) uploads never expire on the file backend: an
// abandoned upload keeps its partial file forever, and every finished or
// deleted one leaves a small `<version>.json` record beside the object. Once an
// hour this removes records older than a day, together with any data file no
// stored object owns. A finished upload's data file IS the object, so whether
// to keep it is decided by the database, never by the record.

const url = process.env.SUPABASE_URL || 'http://kong:8000';
const serviceKey = process.env.SERVICE_ROLE_KEY;
if (!serviceKey) throw new Error('Sweeper credentials are missing');
const root = path.join(process.env.STORAGE_ROOT || '/var/lib/storage', process.env.GLOBAL_S3_BUCKET || 'stub');
const dryRun = process.env.SWEEP_DRY_RUN === '1';
// Clients resume for up to 6 hours (the ticket's longest life); a day is margin.
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const INTERVAL_MS = 60 * 60 * 1000;
const BATCH = 200;

let stopping = false;
process.on('SIGTERM', () => { stopping = true; });
process.on('SIGINT', () => { stopping = true; });

async function presentObjects(candidates) {
  const present = new Set();
  for (let i = 0; i < candidates.length; i += BATCH) {
    const p_objects = candidates.slice(i, i + BATCH).map(({ bucket, name, version }) => ({ bucket, name, version }));
    const response = await fetch(`${url}/rest/v1/rpc/storage_objects_present`, {
      method: 'POST', headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_objects }), signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`storage_objects_present: HTTP ${response.status}`);
    for (const o of await response.json()) present.add(`${o.bucket}/${o.name}/${o.version}`);
  }
  return present;
}

async function candidates() {
  const now = Date.now();
  const found = [];
  let entries;
  try { entries = await readdir(root, { recursive: true }); }
  catch (error) { if (error.code === 'ENOENT') return found; throw error; }
  for (const rel of entries) {
    if (!rel.endsWith('.json')) continue;
    const record = path.join(root, rel);
    let info;
    try { info = JSON.parse(await readFile(record, 'utf8')); } catch { continue; }
    // Only a TUS record names itself: <tenant>/<bucket>/<object name>/<version>.
    if (typeof info?.id !== 'string' || `${info.id}.json` !== rel.split(path.sep).join('/')) continue;
    const parts = info.id.split('/');
    if (parts.length < 4 || info.metadata?.bucketName !== parts[1]) continue;
    const created = Date.parse(info.creation_date);
    if (!Number.isFinite(created) || now - created < MAX_AGE_MS) continue;
    found.push({ record, data: record.slice(0, -'.json'.length), bucket: parts[1], name: parts.slice(2, -1).join('/'), version: parts.at(-1) });
  }
  return found;
}

async function sweep() {
  const found = await candidates();
  if (!found.length) return;
  const present = await presentObjects(found);
  let records = 0, partials = 0, bytes = 0;
  for (const item of found) {
    if (stopping) break;
    const size = await stat(item.data).then(s => s.size, () => null);
    const abandoned = size !== null && !present.has(`${item.bucket}/${item.name}/${item.version}`);
    if (dryRun) {
      console.log(`[dry run] ${abandoned ? `partial ${size} B` : 'record'} ${item.bucket}/${item.name}/${item.version}`);
      continue;
    }
    try {
      if (abandoned) { await unlink(item.data); partials++; bytes += size; }
      await unlink(item.record);
      records++;
      // The object's directory is empty once its last version is gone.
      await rmdir(path.dirname(item.record)).catch(() => {});
    } catch (error) {
      console.warn(`Sweep ${item.bucket}/${item.name}: ${String(error).slice(0, 160)}`);
    }
  }
  if (records || partials) console.log(`Swept ${records} upload records, ${partials} partial uploads (${(bytes / 1048576).toFixed(1)} MB)`);
}

// SWEEP_ONCE=1 runs a single pass and exits, for a manual run:
//   docker compose ... run --rm -e SWEEP_ONCE=1 storage-sweeper
if (process.env.SWEEP_ONCE === '1') {
  await sweep();
  process.exit(0);
}

console.log(`Kaipa storage sweeper started${dryRun ? ' (dry run)' : ''}`);
await sleep(60_000);
while (!stopping) {
  try { await sweep(); }
  catch (error) { console.warn(`Storage sweep skipped: ${String(error).slice(0, 160)}`); }
  for (let waited = 0; waited < INTERVAL_MS && !stopping; waited += 5_000) await sleep(5_000);
}
