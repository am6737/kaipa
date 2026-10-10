#!/usr/bin/env node
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
// Keep this schema in sync with GUIDE_SECTIONS in the shared loader.
const SECTIONS = [
  ['overview', '概览'], ['itinerary', '行程'], ['access', '交通'],
  ['overnight', '住宿与营地'], ['costs', '费用'], ['water_supply', '补给与水源'],
  ['season_risk', '季节与风险'], ['gear', '装备建议'], ['tips', '注意事项'],
];
const PLATFORMS = new Set(['xiaohongshu', 'douyin', 'web', 'official', 'firsthand', 'social']);
const GUIDE_FIELDS = new Set(['routeId', 'title', 'variant', 'asOf', 'sources']);
const SOURCE_FIELDS = new Set(['id', 'platform', 'title', 'url', 'author', 'observedOn', 'retrievedAt']);

function fail(message) { throw new Error(message); }

// Only the flat scalars and indented sources list in the guide contract are supported.
// Comments start at an unquoted # preceded by whitespace (URL fragments survive).
function scalar(input) {
  let quote = null;
  let end = input.length;
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quote === '"' && char === '\\') { i++; continue; }
    if (quote === "'" && char === "'" && input[i + 1] === "'") { i++; continue; }
    if (quote && char === quote) quote = null;
    else if (!quote && i === 0 && (char === '"' || char === "'")) quote = char;
    else if (!quote && char === '#' && (i === 0 || /\s/.test(input[i - 1]))) { end = i; break; }
  }
  if (quote) fail('unterminated quoted frontmatter value');
  const value = input.slice(0, end).trim();
  if (value === '' || value === 'null' || value === '~') return null;
  if (value.startsWith('"')) {
    try { return JSON.parse(value); } catch { fail('invalid double-quoted frontmatter value'); }
  }
  if (value.startsWith("'")) {
    if (!/^'(?:[^']|'')*'$/.test(value)) fail('invalid single-quoted frontmatter value');
    return value.slice(1, -1).replaceAll("''", "'");
  }
  if (/^[>|\[{&*!]/.test(value)) fail('unsupported YAML value; use a plain or quoted scalar');
  return value;
}

function assign(target, key, value, allowed) {
  if (!allowed.has(key)) fail(`unknown frontmatter field: ${key}`);
  if (Object.hasOwn(target, key)) fail(`duplicate frontmatter field: ${key}`);
  target[key] = scalar(value);
}

function frontmatter(lines) {
  const guide = {};
  let inSources = false;
  let currentSource = null;
  for (const [index, line] of lines.entries()) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    if (line.includes('\t')) fail(`frontmatter line ${index + 2}: tabs are unsupported`);
    const top = /^([A-Za-z][A-Za-z0-9]*):(?:\s+(.*))?$/.exec(line);
    if (top) {
      const [, key, raw = ''] = top;
      if (key === 'sources') {
        if (Object.hasOwn(guide, key)) fail('duplicate frontmatter field: sources');
        const value = raw.replace(/\s+#.*$/, '').trim();
        if (value && value !== '[]' && !value.startsWith('#')) fail('sources must be an indented list');
        guide.sources = [];
        inSources = value !== '[]';
        currentSource = null;
      } else {
        assign(guide, key, raw, GUIDE_FIELDS);
        inSources = false;
      }
      continue;
    }
    const item = /^  - ([A-Za-z][A-Za-z0-9]*):(?:\s+(.*))?$/.exec(line);
    const field = /^    ([A-Za-z][A-Za-z0-9]*):(?:\s+(.*))?$/.exec(line);
    if (inSources && item) {
      currentSource = {};
      guide.sources.push(currentSource);
      assign(currentSource, item[1], item[2] ?? '', SOURCE_FIELDS);
    } else if (inSources && currentSource && field) {
      assign(currentSource, field[1], field[2] ?? '', SOURCE_FIELDS);
    } else fail(`unsupported frontmatter syntax at line ${index + 2}`);
  }
  return guide;
}

function nonempty(value, field) {
  if (typeof value !== 'string' || !value.trim()) fail(`missing or invalid ${field}`);
}

function date(value, field, allowMonth = false) {
  const pattern = allowMonth ? /^(\d{4})-(\d{2})(?:-(\d{2}))?$/ : /^(\d{4})-(\d{2})-(\d{2})$/;
  const match = typeof value === 'string' && pattern.exec(value);
  if (!match) fail(`bad date for ${field}: expected ${allowMonth ? 'YYYY-MM or YYYY-MM-DD' : 'YYYY-MM-DD'}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3] ?? 1);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]) fail(`bad date for ${field}: ${value}`);
}

function parseSections(markdown, sourceIds) {
  const found = new Map();
  let section = null;
  let fence = null;
  for (const line of markdown.split('\n')) {
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (marker) {
      if (!fence) fence = { char: marker[1][0], length: marker[1].length };
      else if (marker[1][0] === fence.char && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
      if (section) section.lines.push(line);
      continue;
    }
    if (!fence && /^ {0,3}##(?:\s|$)/.test(line)) {
      const text = line.trim().replace(/^##\s*/, '').replace(/\s+#+\s*$/, '');
      const headingMatch = /^(.*?)(?:\s+\[([^\]]*)\])?$/.exec(text);
      const heading = headingMatch[1].trim();
      const spec = SECTIONS.find(([, name]) => name === heading);
      if (!spec) fail(`unknown heading: ${heading || '(empty)'}`);
      if (found.has(spec[0])) fail(`duplicate section heading: ${heading}`);
      const cited = headingMatch[2] === undefined ? [] : headingMatch[2].split(',').map((id) => id.trim());
      for (const id of cited) if (!sourceIds.has(id)) fail(`section ${heading} cites undefined source id: ${id || '(empty)'}`);
      section = { key: spec[0], heading, sourceIds: cited, lines: [] };
      found.set(spec[0], section);
    } else if (section) section.lines.push(line);
  }
  return SECTIONS.flatMap(([key]) => {
    const section = found.get(key);
    if (!section) return [];
    const body = section.lines.join('\n').trim();
    if (!body) fail(`empty section body: ${section.heading}`);
    return [{ key, heading: section.heading, sourceIds: section.sourceIds, body }];
  });
}

function parseGuide(input, filename) {
  const lines = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
  if (lines[0] !== '---') fail('missing YAML frontmatter opening ---');
  const end = lines.indexOf('---', 1);
  if (end < 0) fail('missing YAML frontmatter closing ---');
  const meta = frontmatter(lines.slice(1, end));
  nonempty(meta.routeId, 'routeId');
  if (meta.routeId !== basename(filename, '.md')) fail(`routeId ${meta.routeId} mismatches filename ${basename(filename)}`);
  nonempty(meta.title, 'title');
  nonempty(meta.asOf, 'asOf');
  date(meta.asOf, 'asOf');
  if (!Array.isArray(meta.sources)) fail('missing sources');
  if (meta.variant !== undefined && meta.variant !== null) nonempty(meta.variant, 'variant');
  const ids = new Set();
  const sources = meta.sources.map((source) => {
    nonempty(source.id, 'source id');
    if (!/^[A-Za-z0-9_-]+$/.test(source.id)) fail(`invalid source id: ${source.id}`);
    if (ids.has(source.id)) fail(`duplicate source id: ${source.id}`);
    ids.add(source.id);
    if (!PLATFORMS.has(source.platform)) fail(`unknown platform: ${source.platform}`);
    nonempty(source.title, `source ${source.id} title`);
    for (const key of ['url', 'author', 'observedOn']) {
      if (!Object.hasOwn(source, key)) fail(`missing source ${source.id} ${key} (use null when unknown)`);
      if (source[key] !== null) nonempty(source[key], `source ${source.id} ${key}`);
    }
    if (source.url !== null) {
      try { new URL(source.url); } catch { fail(`invalid URL for source ${source.id}: ${source.url}`); }
    }
    if (source.observedOn !== null) date(source.observedOn, `source ${source.id} observedOn`, true);
    date(source.retrievedAt, `source ${source.id} retrievedAt`);
    return { id: source.id, platform: source.platform, title: source.title, url: source.url,
      author: source.author, observedOn: source.observedOn, retrievedAt: source.retrievedAt };
  });
  const markdown = lines.slice(end + 1).join('\n').trim();
  return { routeId: meta.routeId, title: meta.title, variant: meta.variant ?? null,
    asOf: meta.asOf, sources, sections: parseSections(markdown, ids), markdown };
}

async function main() {
  let dir = resolve(ROOT, 'data/route-guides');
  let out = resolve(ROOT, 'supabase/functions/_shared/route-guides.generated.ts');
  let check = false;
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--check') check = true;
    else if (args[i] === '--dir' || args[i] === '--out') {
      const flag = args[i];
      const value = args[++i];
      if (!value || value.startsWith('--')) fail(`${flag} requires a path`);
      if (flag === '--dir') dir = resolve(value);
      else out = resolve(value);
    } else fail(`unknown argument: ${args[i]}`);
  }
  const entries = await readdir(dir, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.md') &&
    !entry.name.startsWith('_') && entry.name !== 'README.md').map((entry) => entry.name).sort();
  const guides = [];
  const errors = [];
  for (const file of files) {
    const path = resolve(dir, file);
    try { guides.push(parseGuide(await readFile(path, 'utf8'), file)); }
    catch (error) { errors.push(`${path}: ${error.message}`); }
  }
  if (errors.length) fail(errors.join('\n'));
  const map = Object.fromEntries(guides.map((guide) => [guide.routeId, guide]));
  // A type-only import ensures generated data is checked by Deno without runtime I/O.
  const generated = '// Generated by scripts/build-route-guides.mjs. DO NOT EDIT.\n' +
    "import type { RouteGuide } from './route-guides.ts';\n\n" +
    `export const ROUTE_GUIDES: Readonly<Record<string, RouteGuide>> = ${JSON.stringify(map, null, 2)};\n`;
  if (check) {
    let existing;
    try { existing = await readFile(out, 'utf8'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (existing !== generated) fail(`${out}: generated file is out of date; run node scripts/build-route-guides.mjs`);
    console.log(`Route guides up to date (${guides.length} guides).`);
  } else {
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, generated, 'utf8');
    console.log(`Built ${guides.length} route guides: ${out}`);
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
