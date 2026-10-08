// Uses a disposable database, never commits fixtures to the application DB.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');
const db = `kaipa_membership_test_${randomUUID().replaceAll('-', '')}`;
const subject = randomUUID();

function sql(database, input) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', ['exec', '-i', 'kaipa-supabase-db', 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', database]);
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (data) => { stdout += data; });
    child.stderr.on('data', (data) => { stderr += data; });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve(stdout.trim()) : reject(new Error(stderr.trim() || `psql exited ${code}`)));
    child.stdin.end(input);
  });
}

async function run() {
  await sql('postgres', `create database ${db};`);
  try {
    // Minimal dependencies of the foundation. Existing-cluster roles are
    // reused, but auth, policies, triggers and fixtures live only in this DB.
    await sql(db, `
      create schema auth;
      create table auth.users(id uuid primary key, raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated, service_role;
      create table public.profiles(id uuid primary key references auth.users(id) on delete cascade);
      create function public.create_test_profile() returns trigger language plpgsql as
        $$ begin insert into public.profiles(id) values(new.id); return new; end $$;
      create trigger test_profile after insert on auth.users for each row execute function public.create_test_profile();
      create table public.gear_items(id bigint generated always as identity primary key, user_id uuid not null references public.profiles(id) on delete cascade, name text, weight numeric, price integer);
      create table public.gear_sets(id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade);
      create table public.journeys(id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade);
      create table public.tracks(id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade);
    `);
    await sql(db, fs.readFileSync('supabase/migrations/20261008120000_membership_foundation.sql', 'utf8'));
    await sql(db, `
      insert into auth.users(id) values('${subject}');
      insert into public.resource_policies(version,features) values('test-concurrent','{}');
      insert into public.resource_policy_limits select 'test-concurrent',resource,period,
        case when resource in ('gear_items','ai_requests') then 1 else commercial_limit end,
        case when resource in ('gear_items','ai_requests') then 1 else hard_limit end,mode
        from public.resource_policy_limits where policy_version='free-v1';
      update public.membership_runtime set stage='paid',free_policy='test-concurrent';
    `);

    const results = await Promise.allSettled(Array.from({ length: 12 }, (_, i) => sql(db,
      `begin; insert into public.gear_items(user_id,name,weight,price) values('${subject}','Concurrent ${i}',1,1); select pg_sleep(0.02); commit;`)));
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1, 'Exactly one stock slot must win');
    for (const result of results) if (result.status === 'rejected') assert.match(result.reason.message, /quota_exceeded/);
    assert.equal(await sql(db, `select used from public.resource_usage where user_id='${subject}' and resource='gear_items';`), '1');

    const reservations = await Promise.allSettled(Array.from({ length: 12 }, (_, i) => sql(db,
      `select public.reserve_resource('${subject}','ai_requests','compete-${i}',1)->>'id';`)));
    const winners = reservations.filter((r) => r.status === 'fulfilled');
    assert.equal(winners.length, 1, 'Exactly one monthly reservation must win');
    for (const result of reservations) if (result.status === 'rejected') assert.match(result.reason.message, /quota_exceeded/);
    const reservationId = winners[0].value;
    const settlements = await Promise.allSettled(Array.from({ length: 12 }, () => sql(db,
      `select public.finish_resource_reservation('${reservationId}',1)->>'state';`)));
    assert.ok(settlements.every((r) => r.status === 'fulfilled' && r.value === 'settled'));
    assert.equal(await sql(db, `select used || ':' || reserved from public.resource_usage where user_id='${subject}' and resource='ai_requests';`), '1:0');
    assert.equal(await sql(db, `select count(*) from public.resource_usage_events where reservation_id='${reservationId}' and action='settle';`), '1');

    // Account cleanup must not strand FK references or invoke a stock trigger
    // that recreates usage after profile removal.
    await sql(db, `delete from auth.users where id='${subject}';`);
    assert.equal(await sql(db, 'select count(*) from public.resource_usage;'), '0');
    assert.equal(await sql(db, 'select count(*) from public.resource_reservations;'), '0');
    console.log('12-way stock/reservation contention, concurrent settlement replay and account cleanup passed.');
  } finally {
    await sql('postgres', `drop database ${db} with (force);`);
  }
}
run().catch((error) => { console.error(error.message); process.exitCode = 1; });
