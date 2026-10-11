#!/usr/bin/env node
import { readFile, readdir } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const SECTIONS = [
  ['overview', '概览'], ['itinerary', '行程'], ['access', '交通'], ['overnight', '住宿与营地'], ['costs', '费用'], ['water_supply', '补给与水源'], ['season_risk', '季节与风险'], ['gear', '装备建议'], ['tips', '注意事项'],
];
const PLATFORMS = new Set(['xiaohongshu', 'douyin', 'web', 'official', 'firsthand', 'social']);
const GUIDE_FIELDS = new Set(['routeId', 'title', 'variant', 'asOf', 'sources']);
const SOURCE_FIELDS = new Set(['id', 'platform', 'title', 'url', 'author', 'observedOn', 'retrievedAt']);
const fail = message => { throw new Error(message); };
function scalar(input) {
  let quote = null; let end = input.length;
  for (let i = 0; i < input.length; i++) { const c = input[i]; if (quote === '"' && c === '\\') { i++; continue; } if (quote === "'" && c === "'" && input[i + 1] === "'") { i++; continue; } if (quote && c === quote) quote = null; else if (!quote && i === 0 && (c === '"' || c === "'")) quote = c; else if (!quote && c === '#' && (i === 0 || /\s/.test(input[i - 1]))) { end = i; break; } }
  if (quote) fail('unterminated quoted frontmatter value');
  const value = input.slice(0, end).trim();
  if (!value || value === 'null' || value === '~') return null;
  if (value.startsWith('"')) { try { return JSON.parse(value); } catch { fail('invalid double-quoted frontmatter value'); } }
  if (value.startsWith("'")) { if (!/^'(?:[^']|'')*'$/.test(value)) fail('invalid single-quoted frontmatter value'); return value.slice(1, -1).replaceAll("''", "'"); }
  if (/^[>\|\[{&*!]/.test(value)) fail('unsupported YAML value');
  return value;
}
function assign(target, key, value, allowed) { if (!allowed.has(key)) fail(`unknown frontmatter field: ${key}`); if (Object.hasOwn(target, key)) fail(`duplicate frontmatter field: ${key}`); target[key] = scalar(value); }
function parseFrontmatter(lines) {
  const guide = {}; let inSources = false; let current = null;
  for (const [index, line] of lines.entries()) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue; if (line.includes('\t')) fail(`frontmatter line ${index + 2}: tabs are unsupported`);
    const top = /^([A-Za-z][A-Za-z0-9]*):(?:\s+(.*))?$/.exec(line);
    if (top) { const [, key, raw = ''] = top; if (key === 'sources') { if (Object.hasOwn(guide, key)) fail('duplicate frontmatter field: sources'); guide.sources = []; const value = raw.replace(/\s+#.*$/, '').trim(); if (value && value !== '[]' && !value.startsWith('#')) fail('sources must be an indented list'); inSources = value !== '[]'; current = null; } else { assign(guide, key, raw, GUIDE_FIELDS); inSources = false; } continue; }
    const item = /^  - ([A-Za-z][A-Za-z0-9]*):(?:\s+(.*))?$/.exec(line); const field = /^    ([A-Za-z][A-Za-z0-9]*):(?:\s+(.*))?$/.exec(line);
    if (inSources && item) { current = {}; guide.sources.push(current); assign(current, item[1], item[2] ?? '', SOURCE_FIELDS); }
    else if (inSources && current && field) assign(current, field[1], field[2] ?? '', SOURCE_FIELDS);
    else fail(`unsupported frontmatter syntax at line ${index + 2}`);
  }
  return guide;
}
const nonempty = (v, f) => { if (typeof v !== 'string' || !v.trim()) fail(`missing or invalid ${f}`); };
function date(value, field, month = false) { const m = typeof value === 'string' && new RegExp(month ? '^(\\d{4})-(\\d{2})(?:-(\\d{2}))?$' : '^(\\d{4})-(\\d{2})-(\\d{2})$').exec(value); if (!m) fail(`bad date for ${field}`); const y = +m[1], mo = +m[2], d = +(m[3] || 1), days = [31, y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : 28,31,30,31,30,31,31,30,31,30,31]; if (y < 1 || mo < 1 || mo > 12 || d < 1 || d > days[mo - 1]) fail(`bad date for ${field}`); }
function parseSections(markdown, sourceIds) {
  const found = new Map(); let section = null; let fence = null;
  for (const line of markdown.split('\n')) { const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line); if (marker) { if (!fence) fence = { char: marker[1][0], length: marker[1].length }; else if (marker[1][0] === fence.char && marker[1].length >= fence.length && !marker[2].trim()) fence = null; if (section) section.lines.push(line); continue; }
    if (!fence && /^ {0,3}##(?:\s|$)/.test(line)) { const text = line.trim().replace(/^##\s*/, '').replace(/\s+#+\s*$/, ''); const match = /^(.*?)(?:\s+\[([^\]]*)\])?$/.exec(text); const heading = match[1].trim(); const spec = SECTIONS.find(([, h]) => h === heading); if (!spec) fail(`unknown heading: ${heading || '(empty)'}`); if (found.has(spec[0])) fail(`duplicate section heading: ${heading}`); const cited = match[2] === undefined ? [] : match[2].split(',').map(id => id.trim()); for (const id of cited) if (!sourceIds.has(id)) fail(`section ${heading} cites undefined source id: ${id}`); section = { key: spec[0], heading, sourceIds: cited, lines: [] }; found.set(spec[0], section); } else if (section) section.lines.push(line);
  }
  return SECTIONS.flatMap(([key]) => { const item = found.get(key); if (!item) return []; const body = item.lines.join('\n').trim(); if (!body) fail(`empty section body: ${item.heading}`); return [{ key, heading: item.heading, sourceIds: item.sourceIds, body }]; });
}
export function parseGuide(input, filename = 'guide.md') {
  const lines = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n'); if (lines[0] !== '---') fail('missing YAML frontmatter opening ---'); const end = lines.indexOf('---', 1); if (end < 0) fail('missing YAML frontmatter closing ---'); const meta = parseFrontmatter(lines.slice(1, end)); const routeId = basename(filename, '.md');
  nonempty(meta.routeId, 'routeId'); if (meta.routeId !== routeId) fail(`routeId ${meta.routeId} mismatches filename ${routeId}`); nonempty(meta.title, 'title'); nonempty(meta.asOf, 'asOf'); date(meta.asOf, 'asOf'); if (!Array.isArray(meta.sources)) fail('missing sources');
  const ids = new Set(); const sources = meta.sources.map(source => { nonempty(source.id, 'source id'); if (!/^[A-Za-z0-9_-]+$/.test(source.id)) fail(`invalid source id: ${source.id}`); if (ids.has(source.id)) fail(`duplicate source id: ${source.id}`); ids.add(source.id); if (!PLATFORMS.has(source.platform)) fail(`unknown platform: ${source.platform}`); nonempty(source.title, `source ${source.id} title`); for (const key of ['url','author','observedOn']) { if (!Object.hasOwn(source, key)) fail(`missing source ${source.id} ${key}`); if (source[key] !== null) nonempty(source[key], `source ${source.id} ${key}`); } if (source.url !== null) { try { new URL(source.url); } catch { fail(`invalid URL for source ${source.id}`); } } if (source.observedOn !== null) date(source.observedOn, `source ${source.id} observedOn`, true); date(source.retrievedAt, `source ${source.id} retrievedAt`); return { id: source.id, platform: source.platform, title: source.title, url: source.url, author: source.author, observedOn: source.observedOn, retrievedAt: source.retrievedAt }; });
  const markdown = lines.slice(end + 1).join('\n').trim(); return { routeId, title: meta.title, variant: meta.variant ?? null, asOf: meta.asOf, sources, sections: parseSections(markdown, ids), markdown };
}
export function splitGuide(guide) { return guide.sections.map(section => ({ route_id: guide.routeId, region: null, section: section.key, title: guide.title, body: section.body, sources: guide.sources.filter(source => section.sourceIds.includes(source.id)), as_of: guide.asOf, status: 'published', origin: 'import' })); }
async function loadGuides(dir = resolve(ROOT, 'data/route-guides')) { const names = (await readdir(dir, { withFileTypes: true })).filter(e => e.isFile() && e.name.endsWith('.md') && !e.name.startsWith('_') && e.name !== 'README.md').map(e => e.name).sort(); const rows = []; for (const name of names) rows.push(...splitGuide(parseGuide(await readFile(resolve(dir, name), 'utf8'), name))); return rows; }
function loadEnv(path) { return readFile(path, 'utf8').then(text => Object.fromEntries(text.split(/\r?\n/).filter(line => line && !line.startsWith('#')).map(line => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1).replace(/^['"]|['"]$/g, '')]; }))); }
export async function main(args = process.argv.slice(2)) { const rows = await loadGuides(); if (!args.includes('--apply')) { const summary = rows.reduce((map, row) => { map[row.route_id] = (map[row.route_id] || 0) + 1; return map; }, {}); console.log(JSON.stringify({ summary, rows }, null, 2)); return rows; }
  const env = await loadEnv(resolve(ROOT, 'infra/supabase/docker/.env')); const base = `${env.SUPABASE_URL || 'http://localhost:8010'}/rest/v1/route_knowledge_entries`; const key = env.SERVICE_ROLE_KEY; if (!key) fail('SERVICE_ROLE_KEY is missing from infra/supabase/docker/.env');
  for (const row of rows) { const q = `${base}?route_id=eq.${encodeURIComponent(row.route_id)}&section=eq.${encodeURIComponent(row.section)}&origin=eq.import&select=id`; const existing = await fetch(q, { headers: { apikey: key, Authorization: `Bearer ${key}` } }); if (!existing.ok) fail(`lookup failed: ${existing.status}`); const found = await existing.json(); const response = found[0]?.id ? await fetch(`${base}?id=eq.${found[0].id}`, { method: 'PATCH', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(row) }) : await fetch(base, { method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(row) }); if (!response.ok) fail(`write failed: ${response.status} ${await response.text()}`); }
  console.log(`Imported ${rows.length} route knowledge entries.`); return rows;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
