-- Remove the dedicated transport itinerary type. Transport planning remains an
-- assistant capability, but saved itinerary rows are ordinary place/activity rows.
-- Preserve old destinations as first-class locations before dropping the leg data.
update public.timeline_rows
set location = coalesce(location, transport -> 'to')
where location is null
  and jsonb_typeof(transport) = 'object'
  and jsonb_typeof(transport -> 'to') = 'object';

update public.timeline_rows
set item_kind = 'activity'
where item_kind = 'transport';

alter table public.timeline_rows drop constraint if exists timeline_rows_item_kind_check;
alter table public.timeline_rows
  add constraint timeline_rows_item_kind_check check (item_kind in ('activity', 'stay', 'custom'));

drop index if exists public.timeline_rows_transport_kind_idx;

-- The structured columns are no longer part of the row model.
alter table public.timeline_rows drop column if exists transport;

create or replace function public.apply_agent_itinerary(p_itinerary_rows jsonb, p_itinerary_groups jsonb)
returns void language plpgsql set search_path = public as $$
begin
  insert into timeline_groups (journey_id, user_id, name, deleted, sort_order, updated_at)
  select journey_id, user_id, name, deleted, sort_order, updated_at
  from jsonb_to_recordset(coalesce(p_itinerary_groups, '[]'::jsonb)) as item(
    journey_id text, user_id uuid, name text, deleted boolean, sort_order int4, updated_at timestamptz
  )
  on conflict (journey_id, name) do nothing;

  insert into timeline_rows (id, journey_id, user_id, title, day, time_mins, time_end_mins, item_kind, location, route_id, is_synth, is_custom, checked, sort_order)
  select id, journey_id, user_id, title, day, time_mins, time_end_mins, coalesce(item_kind, 'activity'), location, route_id, is_synth, is_custom, checked, sort_order
  from jsonb_to_recordset(coalesce(p_itinerary_rows, '[]'::jsonb)) as item(
    id text, journey_id text, user_id uuid, title text, day text, time_mins int4, time_end_mins int4,
    item_kind text, location jsonb, route_id text, is_synth boolean, is_custom boolean, checked boolean, sort_order int4
  );
end;
$$;

grant execute on function public.apply_agent_itinerary(jsonb, jsonb) to authenticated;

create or replace function public.journey_save_timeline_item(
  p_id text, p_journey_id text, p_is_new boolean, p_fields jsonb
) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare saved public.timeline_rows%rowtype; group_name text;
begin
  if p_is_new then
    insert into public.timeline_rows (
      id, journey_id, user_id, title, day, media, time_mins, time_end_mins,
      is_synth, is_custom, checked, item_kind, location, sort_order
    ) values (
      p_id, p_journey_id, auth.uid(), coalesce(p_fields->>'title', ''), coalesce(p_fields->>'day', ''),
      nullif(p_fields->'media', 'null'::jsonb), (p_fields->>'timeStart')::int4, (p_fields->>'timeEnd')::int4,
      false, true, false, coalesce(p_fields->>'kind', 'activity'),
      nullif(p_fields->'location', 'null'::jsonb), coalesce((p_fields->>'sortOrder')::int4, 0)
    ) returning * into saved;
  else
    update public.timeline_rows target set
      title = coalesce(p_fields->>'title', title),
      day = coalesce(p_fields->>'day', day),
      media = case when jsonb_exists(p_fields, 'media') then nullif(p_fields->'media', 'null'::jsonb) else media end,
      time_mins = case when jsonb_exists(p_fields, 'timeStart') then (p_fields->>'timeStart')::int4 else time_mins end,
      time_end_mins = case when jsonb_exists(p_fields, 'timeEnd') then (p_fields->>'timeEnd')::int4 else time_end_mins end,
      item_kind = coalesce(p_fields->>'kind', item_kind),
      location = case when jsonb_exists(p_fields, 'location') then nullif(p_fields->'location', 'null'::jsonb) else location end,
      sort_order = coalesce((p_fields->>'sortOrder')::int4, sort_order)
    where target.id = p_id and target.journey_id = p_journey_id
    returning * into saved;
    if not found then raise exception 'Timeline row is not writable by this user' using errcode = '42501'; end if;
  end if;
  group_name := nullif(saved.day, '');
  if group_name is not null then
    insert into public.timeline_groups (journey_id, user_id, name, deleted, updated_at)
    values (p_journey_id, auth.uid(), group_name, false, now())
    on conflict (journey_id, name) do update set deleted = false, updated_at = now();
  end if;
  return to_jsonb(saved);
end;
$$;

revoke execute on function public.journey_save_timeline_item(text, text, boolean, jsonb) from public, anon;
grant execute on function public.journey_save_timeline_item(text, text, boolean, jsonb) to authenticated;

create or replace function public.read_agent_journey_sections(p_journey_id text, p_sections text[]) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare result jsonb := '{}'; data jsonb;
begin
  perform public.agent_lock_context(p_journey_id);
  result := jsonb_build_object('journeyId', p_journey_id, 'versions', public.agent_context_versions(p_journey_id));
  if 'journey' = any(p_sections) then
    select jsonb_build_object('id',id,'name',name,'region',region,'lng',lng,'lat',lat,'coord',coord,'planned_date',planned_date,'date',date,'days',days,'total_days',total_days,'diff',diff,'desc',"desc")
      into data from public.journeys where id=p_journey_id;
    result := result || jsonb_build_object('journey', data);
  end if;
  if 'track' = any(p_sections) then
    select track_summary into data from public.agent_journey_revisions where journey_id=p_journey_id;
    result := result || jsonb_build_object('trackSummary', data);
  end if;
  if 'itinerary' = any(p_sections) then
    select coalesce(jsonb_agg(to_jsonb(t) order by sort_order,id),'[]') into data
      from (select id,title,day,time_mins,time_end_mins,item_kind,location,route_id,checked,sort_order from public.timeline_rows where journey_id=p_journey_id) t;
    result := result || jsonb_build_object('itinerary', data);
    select coalesce(jsonb_agg(to_jsonb(t) order by sort_order,name),'[]') into data
      from (select name,sort_order,route_end_meters,route_end_track_index,route_end_source,route_location_name,route_id from public.timeline_groups where journey_id=p_journey_id and not deleted) t;
    result := result || jsonb_build_object('itineraryGroups', data);
  end if;
  if 'packing' = any(p_sections) then
    select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'kind',l.kind,'owner_companion_id',l.owner_companion_id,'journey_packing_items',coalesce((select jsonb_agg(to_jsonb(i) order by i.sort_order,i.id) from (select id,name,category_name,quantity,weight_kg,weight_estimated,attrs,note,packed,sort_order from public.journey_packing_items where list_id=l.id) i),'[]')) order by l.created_at,l.id),'[]') into data
      from public.journey_packing_lists l where journey_id=p_journey_id;
    result := result || jsonb_build_object('packingLists', data);
  end if;
  return result;
end;
$$;
