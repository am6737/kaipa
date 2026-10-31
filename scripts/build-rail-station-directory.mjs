#!/usr/bin/env node
// build-rail-station-directory.mjs — regenerate the rail station seed migration.
//
// The app-agent transport stage settles a user's boarding station from
// public.rail_station_directory instead of asking a stage agent (~15 s of every
// official-plan run). The rows are 12306's own per-city station lists, read
// through the pinned MCP child in the rail-query container, so a station the
// railway does not know for that city never reaches the table.
//
// hub_rank is curated in scripts/rail-station-hubs.json for the cities where
// 12306's own naming misleads (广州's list leads with 广州北 and puts 广州南
// fourth, and 成都 boards at 成都东 while 12306 files 成都 as the city's
// station). Everywhere else the seed follows 12306: the station carrying the
// city's bare name leads and its 成都东-style variants follow as same-city
// alternatives, which is only the order the stage queries them in.
//
// The generated migration is committed but never applied by this script; run
//   infra/supabase/apply-migration.sh supabase/migrations/<file>
// to apply it.
//
// Usage:
//   node scripts/build-rail-station-directory.mjs [out-sql]
// Options:
//   --container <name>  rail-query container (default kaipa-rail-query)
//   --offline <file>    station JSON from a previous run, for no-network rebuilds

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const HUBS_FILE = path.join(HERE, 'rail-station-hubs.json');
const args = process.argv.slice(2);
const positional = args.filter((value, index) => !value.startsWith('--') && args[index - 1] !== '--container' && args[index - 1] !== '--offline');
const option = (name) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : null;
};
const container = option('container') ?? 'kaipa-rail-query';
const offline = option('offline');
const OUT_SQL = positional[0] ?? path.join(HERE, '..', 'supabase', 'migrations', 'REPLACE_ME_rail_station_directory.sql');

/** One MCP child session answers every city: the station dataset is fetched once
 * at startup and the tools are lookups in it afterwards. */
const PROBE = `
import { Client } from '/app/upstream/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { StdioClientTransport } from '/app/upstream/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';
const cities = ${'__CITIES__'};
const transport = new StdioClientTransport({ command: 'node', args: ['/app/upstream/build/index.js'], env: [] });
const client = new Client({ name: 'kaipa-directory', version: '1.0.0' });
await client.connect(transport);
const output = {};
for (const city of cities) {
  const result = await client.callTool({ name: 'get-stations-code-in-city', arguments: { city } });
  const text = result?.content?.[0]?.text ?? '';
  output[city] = text.startsWith('Error') ? [] : JSON.parse(text);
}
await client.close();
console.log(JSON.stringify(output));
`;

function probe(cities) {
  const run = spawnSync('docker', ['exec', '-w', '/app', container, 'node', '--input-type=module', '-e',
    PROBE.replace('__CITIES__', JSON.stringify(cities))], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (run.status !== 0) throw new Error(`station probe failed: ${(run.stderr || run.stdout || '').slice(-2000)}`);
  const line = run.stdout.split('\n').filter(Boolean).at(-1);
  return JSON.parse(line);
}

const hubs = JSON.parse(fs.readFileSync(HUBS_FILE, 'utf8')).hubs;
const seed = [...new Set([...(JSON.parse(fs.readFileSync(HUBS_FILE, 'utf8')).cities ?? []), ...Object.keys(hubs)])];
const directory = offline ? JSON.parse(fs.readFileSync(offline, 'utf8')) : probe(seed);

const observed = new Date().toISOString().slice(0, 19);
const rows = [];
const problems = [];
const skipped = [];
const owner = new Map();
for (const city of seed) {
  const listed = (directory[city] ?? []).map(row => ({ ...row, station_name: String(row.station_name ?? '') }));
  // Upstream injects a whitespace-padded duplicate for a station 12306 spells
  // oddly; only names the railway writes without spaces are queryable here.
  const stations = listed.filter(row => row.station_name && !/\s/.test(row.station_name));
  if (!stations.length) { skipped.push(`${city}: 12306 has no station list under this name`); continue; }
  const names = new Set(stations.map(row => row.station_name));
  for (const hub of hubs[city] ?? []) if (!names.has(hub)) problems.push(`${city}: curated hub ${hub} is not in 12306's list for ${city}`);
  let rank = new Map((hubs[city] ?? []).map((name, index) => [name, index + 1]));
  if (!rank.size) {
    // Without a curated order the seed follows 12306's own convention: the
    // station that carries the city's bare name is the city's station (it is
    // what the railway's own city lookup returns) and 成都东/邯郸东-style
    // variants follow it as same-city alternatives. Both ends of that pair are
    // queried by the transport stage, so the order only decides which service
    // the plan shows first, never whether a train exists.
    const own = stations.find(row => row.station_name === city);
    if (!own) { skipped.push(`${city}: 12306 lists no station named ${city}`); continue; }
    const direction = ['东', '南', '西', '北'];
    const dir = (name) => {
      const index = direction.indexOf(name.slice(city.length, city.length + 1));
      return index < 0 ? direction.length : index;
    };
    const variants = stations.map(row => row.station_name)
      .filter(name => name !== city && name.startsWith(city))
      .sort((a, b) => dir(a) - dir(b) || a.localeCompare(b, 'zh'));
    rank = new Map([[city, 1], ...variants.map((name, index) => [name, index + 2])]);
  }
  for (const station of stations) {
    const hubRank = rank.get(station.station_name) ?? 0;
    const previous = owner.get(station.station_name);
    if (previous) { problems.push(`${station.station_name}: in both ${previous} and ${city}`); continue; }
    owner.set(station.station_name, city);
    rows.push({ station_name: station.station_name, city, hub_rank: hubRank, observed_at: observed });
  }
}
if (problems.length) {
  console.error(problems.join('\n'));
  throw new Error(`${problems.length} station-directory problem(s); nothing was written`);
}
if (skipped.length) console.warn(`skipped:\n${skipped.join('\n')}`);

const quoted = (value) => `'${String(value).replace(/'/g, "''")}'`;
const values = rows
  .sort((a, b) => a.city.localeCompare(b.city, 'zh') || b.hub_rank - a.hub_rank || a.station_name.localeCompare(b.station_name, 'zh'))
  .map(row => `  (${quoted(row.station_name)}, ${quoted(row.city)}, ${row.hub_rank}, ${quoted('12306-city-directory')}, ${quoted(row.observed_at)}::timestamptz)`)
  .join(',\n');

const sql = `-- rail_station_directory.sql — where a Chinese city's trains actually board.
--
-- The app-agent transport stage asked a stage agent which station the user
-- leaves from; on the official-plan path that was the only thing the model
-- still decided (the arrival station comes from the plan itself) and it
-- measured ~15 s of every run. 12306 answers the question, so the directory
-- below lets supabase/functions/app-agent/origin-endpoints.ts look it up.
--
-- Generated by scripts/build-rail-station-directory.mjs from
-- scripts/rail-station-hubs.json plus each city's own 12306 station list.
-- hub_rank 1 is the station to board at, 2 the same-city alternative the
-- stage also queries when the first has nothing in time, 0 a station inside
-- the prefecture that is not a city choice (a county stop). Rank 1 comes from
-- the curated list where 12306's own naming misleads (成都 boards at 成都东)
-- and otherwise from 12306 itself: the station carrying the city's bare name.
-- Cities are added one at a time on purpose: an unseeded city makes the stage
-- fall back to the model, so a thin directory costs latency, never a station.
--
-- Re-run the builder after editing the hub list; the statements are upserts,
-- so applying the same file twice is a refresh of observed_at, not a repair.

begin;

create table if not exists public.rail_station_directory (
  station_name text primary key,
  city         text not null,
  hub_rank     integer not null default 0,
  source       text not null,
  observed_at  timestamptz not null default now()
);

create index if not exists rail_station_directory_city_idx
  on public.rail_station_directory (city, hub_rank);

alter table public.rail_station_directory enable row level security;
drop policy if exists rail_station_directory_service_role on public.rail_station_directory;
grant all on public.rail_station_directory to service_role;
revoke all on public.rail_station_directory from public, anon, authenticated;
create policy rail_station_directory_service_role on public.rail_station_directory
  for all to service_role using (true) with check (true);

insert into public.rail_station_directory (station_name, city, hub_rank, source, observed_at) values
${values}
on conflict (station_name) do update
  set city = excluded.city, hub_rank = excluded.hub_rank,
      source = excluded.source, observed_at = excluded.observed_at;

commit;
`;

fs.mkdirSync(path.dirname(OUT_SQL), { recursive: true });
fs.writeFileSync(OUT_SQL, sql);
const ranked = rows.filter(row => row.hub_rank > 0).length;
console.log(`${OUT_SQL}: ${rows.length} stations across ${seed.length - skipped.length} cities (${ranked} ranked hubs)`);
