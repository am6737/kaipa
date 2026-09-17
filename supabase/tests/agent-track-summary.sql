create function pg_temp.check(ok boolean, message text) returns void language plpgsql as $$ begin
  if ok is distinct from true then raise exception '%', message; end if;
end $$;

select pg_temp.check(public.agent_track_summary(null,null,null,null) is null,'Missing track must be null');
select pg_temp.check(public.agent_track_summary('[]',null,null,null) is null,'Empty track must be null');
select pg_temp.check(public.agent_track_summary('[[110,25]]',null,null,null) is null,'One point must not form a track');
select pg_temp.check((public.agent_track_summary('[[110,25],[110,25]]',null,null,null)->>'totalKm')::float8 = 0,
  'Identical points must have zero length, not half the earth circumference');
select pg_temp.check(abs((public.agent_track_summary('[[0,0],[1,0]]',null,null,null)->>'totalKm')::float8 - 6371*pi()/180) < 1e-9,
  'One equatorial degree length is incorrect');
select pg_temp.check(abs((public.agent_track_summary('[[0,0],[1,0],[1,0],[2,0]]',null,null,null)->>'totalKm')::float8 - 6371*pi()/90) < 1e-9,
  'Multiple segments or repeated points change the total incorrectly');
select pg_temp.check(abs((public.agent_track_summary('[[0,0],null,["bad",0],[181,0],[0,91],[1,0]]',null,null,null)->>'totalKm')::float8 - 6371*pi()/180) < 1e-9,
  'Invalid points must be excluded');
select pg_temp.check(public.agent_track_summary('[[0,0],[1,0]]','[{"name":"End","km":111}]','111 km','+10 m') - 'totalKm'
  = '{"hasTrack":true,"distance":"111 km","ascent":"+10 m","coordinateSystem":"WGS84","start":[0,0],"end":[1,0],"waypoints":[{"name":"End","km":111}]}'::jsonb,
  'Summary metadata changed');
