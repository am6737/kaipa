#!/usr/bin/env node
import { readFile, readdir } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const allowed = (value, choices) => choices.includes(value);

export function validateItineraryPayload(payload) {
  const errors = [];
  const add = (path, message) => errors.push(`${path} ${message}`);
  const keys = (value, path, names) => {
    if (!object(value)) { add(path, 'must be an object'); return false; }
    for (const key of Object.keys(value)) if (!names.includes(key)) add(`${path}.${key}`, 'unknown field');
    return true;
  };
  const str = (value, path, min = 1, max = Infinity, required = false) => {
    if (value == null) { if (required) add(path, 'required'); return; }
    if (typeof value !== 'string' || value.trim().length < min || [...value].length > max) add(path, `must be ${min}-${max} characters`);
  };
  const enumValue = (value, path, choices) => { if (!allowed(value, choices)) add(path, `must be one of ${choices.join(', ')}`); };
  const number = (value, path, integer = false) => {
    if (value == null) return;
    if (typeof value !== 'number' || !Number.isFinite(value) || (integer && !Number.isInteger(value))) add(path, integer ? 'must be an integer or null' : 'must be a finite number or null');
  };
  const scanStrings = (value, path) => {
    if (typeof value === 'string') {
      if (!value.trim()) add(path, 'must not be empty');
      if (value.includes('·')) add(path, 'must not contain ·');
    } else if (Array.isArray(value)) value.forEach((item, i) => scanStrings(item, `${path}[${i}]`));
    else if (object(value)) for (const [key, item] of Object.entries(value)) scanStrings(item, path ? `${path}.${key}` : key);
  };
  if (!keys(payload, 'payload', ['name', 'direction', 'lodging', 'difficulty', 'audience', 'summary', 'notes', 'bestMonths', 'seasonNote', 'days'])) return errors;
  scanStrings(payload, '');
  str(payload.name, 'name', 1, 40, true);
  str(payload.direction, 'direction');
  enumValue(payload.lodging, 'lodging', ['camp', 'lodge', 'mixed']);
  enumValue(payload.difficulty, 'difficulty', ['易', '中', '中高', '高']);
  str(payload.audience, 'audience', 1, 40, true);
  str(payload.summary, 'summary', 1, 150, true);
  if (!Array.isArray(payload.notes) || payload.notes.length > 5) add('notes', 'must be an array of at most 5 items');
  else payload.notes.forEach((note, i) => str(note, `notes[${i}]`, 1, 40, true));
  if (payload.bestMonths != null) {
    if (!Array.isArray(payload.bestMonths)) add('bestMonths', 'must be null or an array');
    else payload.bestMonths.forEach((month, i) => { if (!Number.isInteger(month) || month < 1 || month > 12) add(`bestMonths[${i}]`, 'must be an integer from 1 to 12'); });
  }
  str(payload.seasonNote, 'seasonNote');
  if (!Array.isArray(payload.days) || payload.days.length < 1 || payload.days.length > 30) {
    add('days', 'must contain 1-30 days'); return errors;
  }
  let phase = 'in'; let coreDays = 0;
  payload.days.forEach((day, i) => {
    const path = `days[${i}]`;
    if (!keys(day, path, ['kind', 'title', 'distanceKm', 'ascentM', 'descentM', 'duration', 'transfers', 'stay', 'supply', 'tip', 'bailout', 'source'])) return;
    enumValue(day.kind, `${path}.kind`, ['access_in', 'hike', 'rest', 'access_out']);
    if (day.kind === 'access_in' && phase !== 'in') add(`${path}.kind`, 'access_in must be contiguous at start');
    else if (day.kind === 'access_out') phase = 'out';
    else if (day.kind === 'hike' || day.kind === 'rest') { if (phase === 'out') add(`${path}.kind`, 'access_out must be contiguous at end'); phase = 'core'; coreDays++; }
    str(day.title, `${path}.title`, 1, 80, true);
    number(day.distanceKm, `${path}.distanceKm`);
    number(day.ascentM, `${path}.ascentM`, true);
    number(day.descentM, `${path}.descentM`, true);
    str(day.duration, `${path}.duration`);
    if (!Array.isArray(day.transfers)) add(`${path}.transfers`, 'must be an array');
    else day.transfers.forEach((transfer, j) => {
      const tp = `${path}.transfers[${j}]`;
      if (!keys(transfer, tp, ['from', 'to', 'mode', 'duration', 'costRef', 'booking', 'position'])) return;
      str(transfer.from, `${tp}.from`, 1, Infinity, true);
      str(transfer.to, `${tp}.to`, 1, Infinity, true);
      enumValue(transfer.mode, `${tp}.mode`, ['charter', 'shared', 'bus', 'shuttle']);
      str(transfer.duration, `${tp}.duration`);
      str(transfer.costRef, `${tp}.costRef`);
      str(transfer.booking, `${tp}.booking`);
      enumValue(transfer.position, `${tp}.position`, ['start', 'end']);
    });
    if (day.stay != null) {
      const sp = `${path}.stay`;
      if (keys(day.stay, sp, ['name', 'type', 'altitudeM', 'water', 'costRef', 'signal'])) {
        str(day.stay.name, `${sp}.name`, 1, Infinity, true);
        enumValue(day.stay.type, `${sp}.type`, ['camp', 'homestay', 'inn', 'hotel']);
        number(day.stay.altitudeM, `${sp}.altitudeM`);
        str(day.stay.water, `${sp}.water`);
        str(day.stay.costRef, `${sp}.costRef`);
        str(day.stay.signal, `${sp}.signal`);
      }
    } else if (i < payload.days.length - 1) add(`${path}.stay`, 'required');
    str(day.supply, `${path}.supply`);
    str(day.tip, `${path}.tip`, 1, 100);
    str(day.bailout, `${path}.bailout`);
    enumValue(day.source, `${path}.source`, ['official', 'kb_generated', 'user_track']);
    if (day.kind === 'access_in' || day.kind === 'access_out') {
      if (!Array.isArray(day.transfers) || day.transfers.length === 0) add(`${path}.transfers`, 'requires at least one transfer');
      if (day.distanceKm != null) add(`${path}.distanceKm`, 'not allowed on access days');
    }
    if (day.kind === 'rest' && (typeof day.tip !== 'string' || !day.tip.trim())) add(`${path}.tip`, 'required for rest day');
  });
  if (!coreDays) add('days', 'requires at least one hike or rest day');
  return errors;
}

export function validateItineraryFile(file) {
  const errors = [];
  if (!object(file)) return ['file must be an object'];
  for (const key of Object.keys(file)) if (!['routeId', 'plans'].includes(key)) errors.push(`${key} unknown field`);
  if (typeof file.routeId !== 'string' || !file.routeId.trim()) errors.push('routeId required');
  if (!Array.isArray(file.plans) || file.plans.length === 0) return [...errors, 'plans must be a nonempty array'];
  const ids = new Set(); let defaults = 0;
  file.plans.forEach((plan, i) => {
    const p = `plans[${i}]`;
    if (!object(plan)) { errors.push(`${p} must be an object`); return; }
    for (const key of Object.keys(plan)) if (!['id', 'isDefault', 'origin', 'status', 'payload', 'draftSources', 'reviewNotes'].includes(key)) errors.push(`${p}.${key} unknown field`);
    if (typeof plan.id !== 'string' || !UUID.test(plan.id)) errors.push(`${p}.id must be a UUID`);
    else if (ids.has(plan.id.toLowerCase())) errors.push(`${p}.id duplicate`);
    else ids.add(plan.id.toLowerCase());
    if (typeof plan.isDefault !== 'boolean') errors.push(`${p}.isDefault must be boolean`);
    if (plan.isDefault === true) defaults++;
    if (!allowed(plan.origin, ['ai_draft', 'manual'])) errors.push(`${p}.origin must be ai_draft or manual`);
    if (!allowed(plan.status, ['draft', 'review'])) errors.push(`${p}.status must be draft or review`);
    errors.push(...validateItineraryPayload(plan.payload).map(error => `${p}.payload.${error}`));
    if (!Array.isArray(plan.draftSources)) errors.push(`${p}.draftSources must be an array`);
    else {
      const paths = new Set();
      plan.draftSources.forEach((source, j) => {
        const sp = `${p}.draftSources[${j}]`;
        if (!object(source) || Object.keys(source).some(key => !['path', 'ref'].includes(key)) || typeof source.path !== 'string' || !source.path.trim() || typeof source.ref !== 'string' || !source.ref.trim()) errors.push(`${sp} must contain nonempty path and ref`);
        else paths.add(source.path);
      });
      if (plan.origin === 'ai_draft') {
        const walk = (value, path) => {
          if (typeof value === 'number' && Number.isFinite(value) && !paths.has(path)) errors.push(`${p}.draftSources missing ${path}`);
          else if (Array.isArray(value)) value.forEach((item, j) => walk(item, `${path}[${j}]`));
          else if (object(value)) for (const [key, item] of Object.entries(value)) walk(item, path ? `${path}.${key}` : key);
        };
        walk(plan.payload, '');
      }
    }
    if (!Array.isArray(plan.reviewNotes) || plan.reviewNotes.some(note => typeof note !== 'string' || !note.trim())) errors.push(`${p}.reviewNotes must be an array of nonempty strings`);
  });
  if (defaults > 1) errors.push('plans may have at most one isDefault');
  return errors;
}

export function planUpsert(plan, existingRows) {
  const versions = existingRows.filter(row => row.id === plan.id);
  const latest = versions.reduce((best, row) => !best || row.version > best.version ? row : best, null);
  const insert = !latest || versions.some(row => row.status === 'published') || !['draft', 'review'].includes(latest.status);
  const version = insert ? (latest?.version ?? 0) + 1 : latest.version;
  return { action: insert ? 'insert' : 'update', row: { id: plan.id, version, route_id: plan.routeId, status: plan.status, is_default: plan.isDefault, origin: plan.origin, payload: plan.payload, draft_sources: plan.draftSources } };
}

async function loadEnv(path) {
  const content = await readFile(path, 'utf8');
  return Object.fromEntries(content.split(/\r?\n/).filter(line => line && !line.startsWith('#')).map(line => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1).replace(/^['"]|['"]$/g, '')]; }));
}

export async function main(args = process.argv.slice(2)) {
  const apply = args.includes('--apply');
  const files = args.filter(arg => arg !== '--apply');
  const dir = resolve(ROOT, 'data/route-itineraries');
  const paths = files.length ? files.map(file => resolve(file)) : (await readdir(dir, { withFileTypes: true })).filter(entry => entry.isFile() && entry.name.endsWith('.json')).map(entry => resolve(dir, entry.name)).sort();
  const plans = []; let invalid = false;
  for (const path of paths) {
    let file;
    try { file = JSON.parse(await readFile(path, 'utf8')); }
    catch (error) { console.error(`${path}: ${error.message}`); invalid = true; continue; }
    const errors = validateItineraryFile(file);
    if (file.routeId !== basename(path, '.json')) errors.push(`routeId must match filename ${basename(path, '.json')}`);
    for (const error of errors) console.error(`${path}: ${error}`);
    if (errors.length) { invalid = true; continue; }
    for (const plan of file.plans) {
      console.log(`${file.routeId} ${plan.id} ${plan.status} ${plan.origin} ${plan.payload.name} ${plan.payload.days.length} days`);
      plans.push({ ...plan, routeId: file.routeId });
    }
  }
  if (invalid) { process.exitCode = 1; return; }
  if (!apply) { console.log(`Dry run: ${plans.length} valid plans.`); return plans; }
  const env = await loadEnv(resolve(ROOT, 'infra/supabase/docker/.env'));
  const key = env.SERVICE_ROLE_KEY;
  if (!key) throw new Error('SERVICE_ROLE_KEY is missing from infra/supabase/docker/.env');
  const base = `${env.SUPABASE_URL || 'http://localhost:8010'}/rest/v1/route_itineraries`;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  for (const plan of plans) {
    const id = encodeURIComponent(plan.id);
    const lookup = await fetch(`${base}?id=eq.${id}&select=id,version,status`, { headers });
    if (!lookup.ok) throw new Error(`lookup failed: ${lookup.status}`);
    const decision = planUpsert(plan, await lookup.json());
    const url = decision.action === 'update' ? `${base}?id=eq.${id}&version=eq.${decision.row.version}` : base;
    const response = await fetch(url, { method: decision.action === 'update' ? 'PATCH' : 'POST', headers: { ...headers, Prefer: 'return=minimal' }, body: JSON.stringify(decision.row) });
    if (!response.ok) throw new Error(`write failed: ${response.status}`);
  }
  console.log(`Imported ${plans.length} route itineraries.`);
  return plans;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
