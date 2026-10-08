begin;

alter table public.timeline_groups add column if not exists note text;
comment on column public.timeline_groups.note is 'Optional plain-text note for an itinerary group.';

-- Security invoker keeps the existing journey/group write policies and parent
-- locking/version triggers in force. Pending items use the empty group key.
create or replace function public.journey_save_timeline_group_note(
  p_journey_id text, p_day text, p_note text
) returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  perform 1 from public.journeys
    where id = p_journey_id and user_id = auth.uid()
    for no key update;
  if not found then
    raise exception 'Journey is not writable by this user' using errcode = '42501';
  end if;
  if p_day is null or char_length(coalesce(p_note, '')) > 1000 then
    raise exception 'Invalid group note' using errcode = '22023';
  end if;
  if exists (select 1 from public.timeline_groups where journey_id = p_journey_id and name = p_day and deleted) then
    raise exception 'Timeline group is no longer available' using errcode = '22023';
  end if;
  insert into public.timeline_groups (journey_id, user_id, name, note, updated_at)
  values (p_journey_id, auth.uid(), p_day, nullif(btrim(p_note), ''), now())
  on conflict (journey_id, name) do update
    set note = excluded.note, updated_at = excluded.updated_at;
end;
$$;
revoke execute on function public.journey_save_timeline_group_note(text, text, text) from public, anon;
grant execute on function public.journey_save_timeline_group_note(text, text, text) to authenticated;

create or replace function public.journey_rename_timeline_group(
  p_journey_id text,
  p_from text,
  p_to text
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  source public.timeline_groups%rowtype;
begin
  if p_from is null or btrim(p_from) = '' or p_to is null or btrim(p_to) = '' then
    raise exception 'Both day group names are required' using errcode = '22023';
  end if;

  if btrim(p_from) = btrim(p_to) then
    return;
  end if;

  -- Serialize the source-note read with note saves and other journey writes.
  perform 1 from public.journeys where id = p_journey_id for no key update;

  update public.timeline_rows
     set day = p_to
   where journey_id = p_journey_id
     and day = p_from;

  -- RLS filters an update instead of refusing it, so the caller's own rows still
  -- carrying the old day mean the rename did not happen. Say so, rather than
  -- leaving the groups renamed over rows that stayed behind. Other members' rows
  -- on that day are theirs to move, not ours.
  if exists (
    select 1 from public.timeline_rows
    where journey_id = p_journey_id
      and day = p_from
      and user_id = auth.uid()
  ) then
    raise exception 'Timeline rows of this day are not writable by this user' using errcode = '42501';
  end if;

  select * into source
  from public.timeline_groups
  where journey_id = p_journey_id and name = p_from;

  insert into public.timeline_groups (journey_id, user_id, name, deleted, updated_at)
  values (p_journey_id, auth.uid(), p_to, false, now())
  on conflict (journey_id, name) do update set
    note = case when timeline_groups.deleted then null else timeline_groups.note end,
    deleted = false, updated_at = now();

  insert into public.timeline_groups (journey_id, user_id, name, deleted, updated_at)
  values (p_journey_id, auth.uid(), p_from, true, now())
  on conflict (journey_id, name) do update set deleted = true, note = null, updated_at = now();

  -- Preserve both notes when two groups are merged. A new name gets the
  -- source note; an existing destination keeps its note followed by the source.
  if nullif(source.note, '') is not null then
    update public.timeline_groups set
      note = concat_ws(E'\n\n', nullif(note, ''), source.note)
    where journey_id = p_journey_id and name = p_to;
  end if;

  -- A day that had a place on the route hands it to its new name. A day without
  -- one leaves the target's own route alone: renaming onto a name that already
  -- carries a route must not wipe it.
  if source.route_end_meters is not null then
    update public.timeline_groups set
      route_id = source.route_id,
      route_end_meters = source.route_end_meters,
      route_end_lng = source.route_end_lng,
      route_end_lat = source.route_end_lat,
      route_end_track_index = source.route_end_track_index,
      route_end_track_fraction = source.route_end_track_fraction,
      route_end_source = source.route_end_source,
      route_location_name = source.route_location_name
    where journey_id = p_journey_id and name = p_to;
  end if;
end;
$$;

comment on function public.journey_rename_timeline_group(text, text, text) is
  'Renames a day group in one transaction: its rows, both group rows and the day''s route end. Renaming onto a name that already exists merges the two days, and only a source that had a route end overwrites the target''s.';

revoke execute on function public.journey_rename_timeline_group(text, text, text) from public, anon;
grant execute on function public.journey_rename_timeline_group(text, text, text) to authenticated;

notify pgrst, 'reload schema';
commit;
