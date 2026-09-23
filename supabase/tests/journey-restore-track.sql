-- Run as postgres on the self-hosted database; fixtures are always rolled back.
-- Covers restore_journey_version() and the journey's track. A version stored
-- before tracks moved into their own table cannot name one, and restoring it must
-- leave the journey's track alone; a version that names a track which no longer
-- exists still clears the link.
begin;

create function pg_temp.check(ok boolean, message text) returns void language plpgsql as $$ begin
  if ok is distinct from true then raise exception '%', message; end if;
end $$;

select set_config('request.jwt.claim.sub', (select id::text from public.profiles order by id limit 1), true);

insert into public.tracks (user_id, name, coords, point_count)
values (auth.uid(), 'restore track test', '[[110,25],[110.1,25.1],[110.2,25.2]]'::jsonb, 3);
select set_config('test.track', (select id::text from public.tracks where name = 'restore track test' order by created_at desc limit 1), true);

insert into public.journeys (id, user_id, name, region, lng, lat, tone, track_id)
values ('restore-track-test', auth.uid(), 'Restore track test', 'Test', 110, 25, 'forest', current_setting('test.track')::uuid);

-- v1 as it stands now, kept aside for the second case below.
select public.save_journey_version('restore-track-test', '{}', 'update');
select set_config('test.named_snapshot', (select snapshot::text from public.journey_versions
  where journey_id = 'restore-track-test' order by version_number desc limit 1), true);

-- v1 becomes the shape 146 stored versions have: no track_id key at all, because
-- the geometry was an inline column when it was written.
update public.journey_versions
   set snapshot = jsonb_set(snapshot, '{journey}', (snapshot -> 'journey') - 'track_id')
 where journey_id = 'restore-track-test' and version_number = 1;

-- v2 names a track that no longer exists.
insert into public.journey_versions (journey_id, version_number, snapshot, changed_fields, change_kind, changed_by)
select 'restore-track-test', 2,
       jsonb_set(current_setting('test.named_snapshot')::jsonb, '{journey}',
         jsonb_set(current_setting('test.named_snapshot')::jsonb -> 'journey', '{track_id}',
                   to_jsonb('deadbeef-0000-0000-0000-000000000000'::text))),
       '{}', 'update', auth.uid();

set local role authenticated;

-- 1. The version that cannot name a track leaves the journey on the track it has.
select public.restore_journey_version((select id from public.journey_versions
  where journey_id = 'restore-track-test' and version_number = 1));
select pg_temp.check((select track_id = current_setting('test.track')::uuid from public.journeys
  where id = 'restore-track-test'), 'Restoring a version stored before tracks detached the journey from its track');

-- 2. The version that names a track which is gone still clears the link.
select public.restore_journey_version((select id from public.journey_versions
  where journey_id = 'restore-track-test' and version_number = 2));
select pg_temp.check((select track_id is null from public.journeys
  where id = 'restore-track-test'), 'Restoring a version naming a track that is gone should clear the link');

rollback;
