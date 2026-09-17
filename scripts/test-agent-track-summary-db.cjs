// Live trigger test for the agent's derived track summary cache.
//
// The subject is the invalidation contract, not the summary function itself
// (supabase/tests/agent-track-summary.sql covers that):
//   - a journey linked to a track caches the track's geometry
//   - editing the track refreshes every referrer and bumps only its track counter
//   - editing dist/asc_ does the same, because the summary embeds them
//   - a track edit never rewrites the journey row itself
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const tests = fs.readFileSync('supabase/tests/agent-track-summary.sql', 'utf8');
const result = spawnSync('docker', ['exec', '-i', 'kaipa-supabase-db', 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'], {
  input: `begin;
    select set_config('test.journey','track-summary-test-' || gen_random_uuid()::text,true);
    select set_config('test.track',gen_random_uuid()::text,true);
    insert into public.tracks(id,user_id,name,file_name,file_format,coords,waypoints,dist_m,asc_m,point_count)
    values(current_setting('test.track')::uuid,(select id from public.profiles order by id limit 1),
      'Track summary test','test.gpx','gpx','[[0,0],[1,0]]','[]'::jsonb,111195,10,2);
    insert into public.journeys(id,user_id,name,region,lng,lat,tone,total_days,track_id,dist,asc_)
    values(current_setting('test.journey'),(select id from public.profiles order by id limit 1),
      'Track summary test','Test',0,0,'forest',1,current_setting('test.track')::uuid,'111 km','+10 m');
    ${tests}
    select pg_temp.check((select abs((track_summary->>'totalKm')::float8 - 6371*pi()/180) < 1e-9
      from public.agent_journey_revisions where journey_id=current_setting('test.journey')),
      'Linking a track must cache its geometry');
    update public.agent_journey_revisions set track=7,journey=3,itinerary=4,packing=5
      where journey_id=current_setting('test.journey');
    create temp table unchanged_journey as select to_jsonb(j) as data from public.journeys j where id=current_setting('test.journey');
    update public.tracks set coords='[[0,0],[2,0]]' where id=current_setting('test.track')::uuid;
    select pg_temp.check((select track=8 and journey=3 and itinerary=4 and packing=5
      and abs((track_summary->>'totalKm')::float8 - 6371*pi()/90) < 1e-9
      from public.agent_journey_revisions where journey_id=current_setting('test.journey')),
      'Editing a track must refresh its referrers and bump only the track revision');
    select pg_temp.check((select to_jsonb(j)=u.data from public.journeys j cross join unchanged_journey u
      where j.id=current_setting('test.journey')),'Editing a track changed journey data');
    update public.tracks set coords='[[0,0],[2,0]]' where id=current_setting('test.track')::uuid;
    select pg_temp.check((select track=8 and abs((track_summary->>'totalKm')::float8 - 6371*pi()/90) < 1e-9
      from public.agent_journey_revisions where journey_id=current_setting('test.journey')),
      'An unchanged geometry write must not bump the revision');
    update public.journeys set dist='222 km' where id=current_setting('test.journey');
    select pg_temp.check((select track=9 and journey=3 and itinerary=4 and packing=5
      and track_summary->>'distance'='222 km'
      from public.agent_journey_revisions where journey_id=current_setting('test.journey')),
      'A distance edit belongs to the track revision and must not touch journey or itinerary counters');
    update public.journeys set track_id=null where id=current_setting('test.journey');
    select pg_temp.check((select track_summary is null
      from public.agent_journey_revisions where journey_id=current_setting('test.journey')),
      'Unlinking the track must drop the stale summary');
    rollback;
  `, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
});
if (result.status !== 0) { process.stderr.write(result.stderr || result.stdout); process.exit(result.status || 1); }
console.log('Track summary linking, geometry refresh, revision isolation and unlink tests passed; all changes rolled back.');
