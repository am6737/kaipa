-- Restoring a version stored before the tracks migration detached the journey
-- from its track. Those snapshots have no track_id key -- the geometry was an
-- inline column then -- so `payload ->> 'track_id'` was null, and the restore
-- wrote that null over the link. 146 stored versions across 40 currently tracked
-- journeys are in that shape, and their inline geometry matches the library row
-- the journey holds now point for point, so there was nothing to fall back to and
-- nothing gained by dropping it.
--
-- A version that does name a track which has since been deleted still clears the
-- link: that is deliberate, and this keeps it.
--
-- Body copied from 20260923160000_journey_parent_lock_no_key.sql with only that
-- change, so the lock mode it set stays as it is.

create or replace function public.restore_journey_version(target_version_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_version public.journey_versions%rowtype;
  current_journey public.journeys%rowtype;
  restored public.journeys%rowtype;
  snapshot jsonb;
  payload jsonb;
begin
  if auth.uid() is null then
    raise exception 'JOURNEY_VERSION_AUTH_REQUIRED';
  end if;

  select * into target_version
  from public.journey_versions
  where id = target_version_id;
  if not found then raise exception 'JOURNEY_VERSION_NOT_FOUND'; end if;

  select * into current_journey
  from public.journeys
  where id = target_version.journey_id
  for no key update;
  if not found or current_journey.user_id <> auth.uid() then
    raise exception 'JOURNEY_VERSION_RESTORE_FORBIDDEN';
  end if;

  snapshot := target_version.snapshot;
  payload := coalesce(snapshot -> 'journey', snapshot);
  perform set_config('app.journey_version_suppressed', 'true', true);
  perform set_config('app.journey_change_kind', 'restore', true);

  delete from public.journey_packing_items
  where list_id in (select id from public.journey_packing_lists where journey_id = target_version.journey_id);
  delete from public.journey_packing_lists where journey_id = target_version.journey_id;
  delete from public.timeline_rows where journey_id = target_version.journey_id;
  delete from public.timeline_groups where journey_id = target_version.journey_id;
  delete from public.inspo_media where journey_id = target_version.journey_id;
  delete from public.companions where journey_id = target_version.journey_id;

  update public.journeys set
    route_id = payload ->> 'route_id',
    name = coalesce(payload ->> 'name', ''),
    region = coalesce(payload ->> 'region', ''),
    coord = payload ->> 'coord',
    lng = coalesce((payload ->> 'lng')::float8, 0),
    lat = coalesce((payload ->> 'lat')::float8, 0),
    dist = payload ->> 'dist',
    asc_ = payload ->> 'asc_',
    diff = payload ->> 'diff',
    tone = coalesce(payload ->> 'tone', 'forest'),
    "desc" = payload ->> 'desc',
    date = payload ->> 'date',
    days = payload ->> 'days',
    planned_date = payload ->> 'planned_date',
    countdown = (payload ->> 'countdown')::int4,
    day_index = (payload ->> 'day_index')::int4,
    total_days = (payload ->> 'total_days')::int4,
    fav = coalesce((payload ->> 'fav')::boolean, false),
    -- Null when the track has since been deleted, so an old version cannot trip
    -- the FK. A version stored before tracks moved into their own table cannot
    -- name one at all, and taking the journey's track away because of that would
    -- lose it silently: those snapshots carry the same geometry inline, and the
    -- library row it became is what the journey holds now.
    track_id = case when payload ? 'track_id'
                    then (select t.id from public.tracks t where t.id = nullif(payload ->> 'track_id', '')::uuid)
                    else current_journey.track_id end,
    hero_mode = payload ->> 'hero_mode',
    track_public = coalesce((payload ->> 'track_public')::boolean, false),
    route_show_photos = coalesce((payload ->> 'route_show_photos')::boolean, true),
    route_show_timeline = coalesce((payload ->> 'route_show_timeline')::boolean, true),
    participant_permissions = coalesce(nullif(payload -> 'participant_permissions', 'null'::jsonb), current_journey.participant_permissions),
    photo_uris = nullif(payload -> 'photo_uris', 'null'::jsonb),
    updated_at = now()
  where id = target_version.journey_id
  returning * into restored;

  insert into public.companions
  select * from jsonb_populate_recordset(
    null::public.companions,
    coalesce(snapshot -> 'companions', '[]'::jsonb)
  );

  if exists (select 1 from public.companions) then
    perform setval(
      pg_get_serial_sequence('public.companions', 'id'),
      greatest((select max(id) from public.companions), (select last_value from public.companions_id_seq)),
      true
    );
  end if;

  insert into public.timeline_groups
  select * from jsonb_populate_recordset(
    null::public.timeline_groups,
    coalesce(snapshot -> 'timelineGroups', '[]'::jsonb)
  );
  insert into public.timeline_rows
  select * from jsonb_populate_recordset(
    null::public.timeline_rows,
    coalesce(snapshot -> 'timelineRows', '[]'::jsonb)
  );
  insert into public.inspo_media
  select * from jsonb_populate_recordset(
    null::public.inspo_media,
    coalesce(snapshot -> 'moments', '[]'::jsonb)
  );
  insert into public.journey_packing_lists
  select * from jsonb_populate_recordset(
    null::public.journey_packing_lists,
    coalesce(snapshot -> 'packingLists', '[]'::jsonb)
  );
  insert into public.journey_packing_items
  select * from jsonb_populate_recordset(
    null::public.journey_packing_items,
    coalesce(snapshot -> 'packingItems', '[]'::jsonb)
  );

  perform set_config('app.journey_version_suppressed', 'false', true);
  perform public.save_journey_version(target_version.journey_id, array['restore'], 'restore');
  return public.build_journey_version_snapshot(restored.id);
end;
$$;
