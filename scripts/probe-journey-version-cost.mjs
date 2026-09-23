// Read-only probe: why does a manual timeline save hit 57014 statement timeout?
// It times the trigger-side snapshot rebuild, sizes what it has to serialize, and
// watches pg_stat_activity for the journey row lock that save_journey_version takes.
//
//   SERVICE_ROLE_KEY=... node scripts/probe-journey-version-cost.mjs [--watch=60] [--journey=<id>]
//
// Reads the URL from .env.development.local / .env.local / .env; KAIPA_BASE_URL wins.
// SERVICE_ROLE_KEY is not in those files — pass it in the environment.
import process from 'node:process';
import { readFileSync } from 'node:fs';

const loadEnv = (file) => {
  let text = '';
  try { text = readFileSync(file, 'utf8'); } catch { text = ''; }
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, '');
  }
};
for (const file of ['.env.development.local', '.env.local', '.env']) loadEnv(file);

const url = process.env.KAIPA_BASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Need KAIPA_BASE_URL or EXPO_PUBLIC_SUPABASE_URL, plus SERVICE_ROLE_KEY.');
  process.exit(1);
}

const sql = async (query) => {
  const response = await fetch(`${url}/pg/query`, {
    method: 'POST',
    headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${response.status} ${text.slice(0, 300)}`);
  return JSON.parse(text);
};

const table = (rows) => {
  if (!rows.length) return '(no rows)';
  const keys = Object.keys(rows[0]);
  const widths = keys.map((k) => Math.max(k.length, ...rows.map((r) => String(r[k] ?? '').length)));
  return [keys.join(' | '), widths.map(() => '---').join('-')]
    .concat(rows.map((r) => keys.map((k, i) => String(r[k] ?? '').padEnd(widths[i])).join(' | ')))
    .join('\n');
};

console.log('== timeouts in effect (the ceiling a manual save has to fit under)');
console.log(await sql(`
  select name, setting, unit, source
  from pg_settings
  where name in ('statement_timeout','lock_timeout','idle_in_transaction_session_timeout')
  order by name
`));
console.log(await sql(`
  select r.rolname, d.datname, s.setconfig
  from pg_db_role_setting s
  left join pg_roles r on r.oid = s.setrole
  left join pg_database d on d.oid = s.setdatabase
  where exists (select 1 from unnest(s.setconfig) c where c ilike '%timeout%')
`));

console.log('\n== what a snapshot has to serialize, per journey (bytes)');
console.log(await sql(`
  select j.id, left(j.name, 18) as name,
    (select count(*) from timeline_rows t where t.journey_id = j.id) as rows,
    (select coalesce(sum(octet_length(t.transport::text)), 0) from timeline_rows t where t.journey_id = j.id) as transport_bytes,
    (select coalesce(sum(octet_length(t.media::text)), 0) from timeline_rows t where t.journey_id = j.id) as media_bytes,
    (select count(*) from journey_versions v where v.journey_id = j.id) as versions,
    (select coalesce(max(octet_length(v.snapshot::text)), 0) from journey_versions v where j.id = v.journey_id) as max_snapshot_bytes
  from journeys j
  where j.deleted_at is null
  order by transport_bytes desc, max_snapshot_bytes desc
  limit 8
`));

console.log('\n== per-role overrides (PostgREST runs writes as `authenticated`; a low timeout there is the ceiling)');
console.log(await sql(`
  select rolname, rolconfig from pg_roles
  where rolname in ('authenticated','anon','service_role','authenticator','postgres')
  order by rolname
`));

console.log('\n== who is touching the database right now (the null case is evidence too)');
console.log(await sql(`
  select pid, usename, state, wait_event_type, wait_event,
         round(extract(epoch from (now() - xact_start)) * 1000) as xact_ms,
         left(query, 90) as query
  from pg_stat_activity
  where datname = current_database() and pid <> pg_backend_pid()
    and xact_start is not null
  order by xact_start
`));
console.log(await sql(`
  select count(*) filter (where cardinality(pg_blocking_pids(pid)) > 0) as lock_waiters,
         count(*) filter (where state = 'idle in transaction') as idle_in_transaction
  from pg_stat_activity
  where datname = current_database()
`));

const candidates = await sql(`
  select j.id, j.name from journeys j
  where j.deleted_at is null
  order by (select coalesce(sum(octet_length(t.transport::text)), 0) from timeline_rows t where t.journey_id = j.id) desc
  limit 3
`);

console.log('\n== time the snapshot rebuild itself (this is what the timeline_rows trigger runs per save)');
for (const journey of candidates) {
  const [row] = await sql(`
    with start as (select clock_timestamp() as s)
    select octet_length(public.build_journey_version_snapshot('${journey.id}')::text) as snapshot_bytes,
           round(extract(epoch from (clock_timestamp() - s)) * 1000) as build_ms
    from start
  `);
  console.log(`${journey.name} (${journey.id}): ${row?.build_ms} ms, ${row?.snapshot_bytes} bytes`);
}

const journeyArg = process.argv.find((a) => a.startsWith('--journey='))?.slice(10);
if (journeyArg && !/^[\w-]+$/.test(journeyArg)) {
  console.error('--journey must be a bare journey id (letters, digits, _ or -).');
  process.exit(1);
}
if (journeyArg) {
  // save_journey_version takes `for update` on the journeys row, so a writer that
  // holds it across slow work is what stalls a manual tap. nowait turns that into
  // an instant yes/no instead of waiting for the statement timeout.
  try {
    await sql(`begin; select id from journeys where id = '${journeyArg}' for update nowait; rollback;`);
    console.log(`\n== journeys row lock test ${journeyArg}: FREE — nobody is holding it right now`);
  } catch (error) {
    const lockConflict = String(error.message).includes('55P03') || /lock_not_available|could not obtain lock/i.test(String(error.message));
    console.log(`\n== journeys row lock test ${journeyArg}: ${lockConflict ? 'HELD BY ANOTHER TRANSACTION — contention, not cost' : `probe failed: ${error.message}`}`);
  }
}

const watchArg = process.argv.find((a) => a.startsWith('--watch='))?.slice(8);
const seconds = watchArg === undefined ? 30 : Number(watchArg);
console.log(`\n== blocking writers for ${seconds}s — tap 完成 on the journey item during this window`);
const deadline = Date.now() + seconds * 1000;
while (Date.now() < deadline) {
  const rows = await sql(`
    select pid, usename, state, wait_event_type, wait_event,
           left(query, 90) as query,
           round(extract(epoch from (now() - xact_start)) * 1000) as xact_ms,
           pg_blocking_pids(pid) as blocked_by
    from pg_stat_activity
    where datname = current_database()
      and pid <> pg_backend_pid()
      and (state <> 'idle' or xact_start is not null)
    order by xact_start nulls last
  `);
  if (rows.length) console.log(`\n${new Date().toISOString()}\n${table(rows)}`);
  // The root of the chain: whoever holds the journeys row `for update`. A holder
  // that is already 'idle in transaction' committed nothing — it parked the lock.
  const roots = await sql(`
    select holder.pid, holder.usename, holder.state,
           round(extract(epoch from (now() - holder.xact_start)) * 1000) as xact_ms,
           left(holder.query, 160) as last_query,
           count(*) as blocking_whom
    from pg_stat_activity waiter
    join lateral unnest(pg_blocking_pids(waiter.pid)) as b(pid) on true
    join pg_stat_activity holder on holder.pid = b.pid
    where waiter.datname = current_database()
    group by holder.pid, holder.usename, holder.state, holder.xact_start, holder.query
    order by blocking_whom desc
    limit 5
  `);
  if (roots.length) console.log(`ROOT HOLDER:\n${table(roots)}`);
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
console.log('\nwatch window ended; if nothing printed above, the failing save never met a lock — the timeout is cost, not contention.');
