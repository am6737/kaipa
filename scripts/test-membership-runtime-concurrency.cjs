// Clone schema only, reuse cluster roles, and always destroy the test database.
const fs=require('node:fs');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {spawn,spawnSync}=require('node:child_process');
const db='kaipa_runtime_test_'+randomUUID().replaceAll('-','');
function sql(database,input){return new Promise((resolve,reject)=>{
 const child=spawn('docker',['exec','-i','kaipa-supabase-db','psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d',database]);let output='',error='';
 child.stdout.on('data',b=>{output+=b;});child.stderr.on('data',b=>{error+=b;});child.on('error',reject);child.on('close',code=>code===0?resolve(output.trim()):reject(new Error(error || 'SQL failed')));child.stdin.end(input);
});}
async function main(){
 await sql('postgres',`create database ${db};`);
 try {
  const schema=spawnSync('docker',['exec','kaipa-supabase-db','pg_dump','--schema-only','--schema=public','--schema=auth','--schema=storage','-U','supabase_admin','-d','postgres'],{encoding:'utf8',maxBuffer:32*1024*1024});
  if(schema.status!==0) throw new Error('Schema clone failed');
  // pg_dump schema-only does not include private account/route/storage data.
  await sql(db,`create schema extensions;create extension pgcrypto with schema extensions;create extension "uuid-ossp" with schema extensions;create extension pgjwt with schema extensions;create extension pg_net with schema extensions;`);
  await sql(db,'drop schema public;');
  await sql(db,schema.stdout);
  const entries=[['membership_runtime','20261008120000_membership_foundation.sql'],['resource_rate_rules','20261008130000_membership_runtime.sql'],['resource_upload_tickets','20261008140000_resource_uploads.sql']];
  const installed=(await sql('postgres',entries.map(([table])=>"select to_regclass('public."+table+"') is not null;").join(''))).split('\n');
  const candidates=['resource_policies','resource_policy_limits','membership_runtime','operation_campaigns','resource_rate_rules','service_budgets','membership_products'];
  const existing=(await sql('postgres',"select tablename from pg_tables where schemaname='public' and tablename in ("+candidates.map(t=>"'"+t+"'").join(',')+");")).split('\n').filter(Boolean);
  const seed=spawnSync('docker',['exec','kaipa-supabase-db','pg_dump','--data-only','-U','supabase_admin','-d','postgres',...existing.map(t=>'--table=public.'+t),'--table=storage.buckets'],{encoding:'utf8',maxBuffer:8*1024*1024});
  if(seed.status!==0) throw new Error('Configuration seed clone failed');
  // Disable only the disposable clone's publication triggers while loading
  // historical published policy versions in pg_dump's dependency order.
  await sql(db,"set session_replication_role='replica';"+seed.stdout+"set session_replication_role='origin';");
  for(let i=0;i<entries.length;i++) if(installed[i]!=='t') await sql(db,fs.readFileSync('supabase/migrations/'+entries[i][1],'utf8'));
  await sql(db,"insert into public.service_budget_usage(service,day,used) values('stored_bytes','2000-01-01',0),('stored_objects','2000-01-01',0) on conflict do nothing;insert into public.resource_maintenance_state(id) values(true) on conflict do nothing;update public.service_budgets set enabled=true;update public.membership_runtime set free_policy='free-v1';update public.operation_campaigns set state='active',starts_at=now(),ends_at=null where id='initial-open-access';");
  const users=Array.from({length:12},()=>randomUUID());
  await sql(db,`insert into auth.users(id,raw_user_meta_data) values ${users.map(id=>`('${id}','{}')`).join(',')};update public.service_budgets set daily_units=100 where service='stored_bytes';`);
  const tickets=await Promise.all(users.map(id=>sql(db,`select public.prepare_resource_upload('${id}','gear','test',100,'image/jpeg');`).then(JSON.parse)));
  const uploads=await Promise.allSettled(tickets.map(t=>sql(db,`insert into storage.objects(bucket_id,name,metadata) values('${t.bucket}','${t.path}','{"size":100,"mimetype":"image/jpeg"}');`)));
  assert.equal(uploads.filter(r=>r.status==='fulfilled').length,1,'Only one upload fits the global capacity');
  for(const r of uploads) if(r.status==='rejected') assert.match(r.reason.message,/service_budget_exceeded/);
  assert.equal(await sql(db,"select used from public.service_budget_usage where service='stored_bytes';"),'100');
  assert.equal(await sql(db,"select sum(used) from public.resource_usage where resource='storage_bytes';"),'100');
  const extra=randomUUID();await sql(db,`insert into auth.users(id,raw_user_meta_data) values('${extra}','{}');`);
  const admissions=await Promise.allSettled(Array.from({length:12},()=>sql(db,`select public.prepare_resource_upload('${extra}','gear','test',100,'image/jpeg');`)));
  assert.equal(admissions.filter(r=>r.status==='fulfilled').length,4,'Per-account upload concurrency escaped the hard limit');
  for(const r of admissions) if(r.status==='rejected') assert.match(r.reason.message,/concurrency_exceeded/);
  await sql(db,"update public.resource_rate_rules set max_requests=1 where scope='gear';update public.service_budgets set daily_units=3,per_run_units=3 where service='gear_requests';");
  const rates=await Promise.all(Array.from({length:12},()=>sql(db,"select public.consume_resource_rate('gear','parallel-test');").then(JSON.parse)));
  assert.equal(rates.filter(r=>r.allowed).length,1);
  assert.equal(await sql(db,"select requests from public.resource_rate_windows where subject='parallel-test';"),'12');
  const costs=await Promise.allSettled(Array.from({length:12},(_,i)=>sql(db,`select public.reserve_service_budget('gear_requests','parallel-${i}',1);`)));
  assert.equal(costs.filter(r=>r.status==='fulfilled').length,3,'Concurrent provider calls escaped daily budget');
  for(const r of costs) if(r.status==='rejected') assert.match(r.reason.message,/service_budget_exceeded/);
  await sql(db,"select set_config('storage.allow_delete_query','true',false);delete from storage.objects;");
  await sql(db,`delete from auth.users where id in (${[...users,extra].map(id=>`'${id}'`).join(',')});`);
  assert.equal(await sql(db,'select count(*) from public.resource_upload_tickets;'),'0');
  assert.equal(await sql(db,'select count(*) from public.resource_reservations;'),'0');
  assert.equal(await sql(db,"select used from public.service_budget_usage where service='stored_bytes';"),'0');
  console.log('12-way global storage, per-account upload concurrency, durable rate windows, provider budgets and full-runtime account cleanup passed.');
 } finally {await sql('postgres',`drop database ${db} with(force);`);}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
