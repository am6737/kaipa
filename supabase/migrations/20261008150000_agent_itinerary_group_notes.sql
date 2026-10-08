begin;

-- Save daily summaries atomically with itinerary rows, using existing write receipts.
create or replace function public.apply_agent_itinerary(p_itinerary_rows jsonb, p_itinerary_groups jsonb)
returns void language plpgsql set search_path = public as $$
begin
  if exists (select 1 from jsonb_array_elements(coalesce(p_itinerary_groups, '[]'::jsonb)) g
    where char_length(coalesce(g->>'note', '')) > 1000) then
    raise exception 'Group note exceeds 1000 characters';
  end if;
  insert into timeline_groups (journey_id, user_id, name, deleted, sort_order, note, updated_at)
  select journey_id, user_id, name, deleted, sort_order, nullif(btrim(note), ''), updated_at
  from jsonb_to_recordset(coalesce(p_itinerary_groups, '[]'::jsonb)) as item(
    journey_id text, user_id uuid, name text, deleted boolean, sort_order int4, note text, updated_at timestamptz
  )
  on conflict (journey_id, name) do update set
    note = excluded.note, updated_at = excluded.updated_at
  where nullif(btrim(timeline_groups.note), '') is null
    and not timeline_groups.deleted and excluded.note is not null;

  insert into timeline_rows (id, journey_id, user_id, title, day, time_mins, time_end_mins, item_kind, location, route_id, is_synth, is_custom, checked, sort_order)
  select id, journey_id, user_id, title, day, time_mins, time_end_mins, coalesce(item_kind, 'activity'), location, route_id, is_synth, is_custom, checked, sort_order
  from jsonb_to_recordset(coalesce(p_itinerary_rows, '[]'::jsonb)) as item(
    id text, journey_id text, user_id uuid, title text, day text, time_mins int4, time_end_mins int4,
    item_kind text, location jsonb, route_id text, is_synth boolean, is_custom boolean, checked boolean, sort_order int4
  );
end;
$$;


-- Keep the existing undo semantics and add summary restoration/conflict protection.
CREATE OR REPLACE FUNCTION public.undo_agent_run(target_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  call_record record;
  payload jsonb;
  undo_time timestamptz := now();
  previous_undo_time timestamptz;
  affected_count int := 0;
  affected_journey_id text;
begin
  if not exists (select 1 from agent_runs where id = target_run_id and user_id = auth.uid() and status = 'completed') then
    raise exception 'Agent run is not available for undo';
  end if;
  for call_record in
    select id, undo_payload from agent_tool_calls
    where run_id = target_run_id and user_id = auth.uid() and status = 'completed' and undo_payload is not null and undone_at is null
    order by created_at desc, id desc for update
  loop
    payload := call_record.undo_payload;
    affected_journey_id := coalesce(payload->>'journeyId', affected_journey_id);
    if payload->>'kind' = 'update_journey_schedule' then
      perform public.agent_undo_schedule(payload);
    elsif payload->>'kind' = 'set_journey_map_location' then
      if exists (
        select 1
        from journeys current_journey
        where current_journey.id = payload->>'journeyId'
          and (
            current_journey.region is distinct from payload->'applied'->>'region'
            or current_journey.coord is distinct from payload->'applied'->>'coord'
            or current_journey.lng is distinct from (payload->'applied'->>'lng')::float8
            or current_journey.lat is distinct from (payload->'applied'->>'lat')::float8
          )
      ) then
        raise exception 'Journey map location changed after this agent run';
      end if;
      update journeys
      set region = payload->'previous'->>'region',
          coord = payload->'previous'->>'coord',
          lng = (payload->'previous'->>'lng')::float8,
          lat = (payload->'previous'->>'lat')::float8,
          updated_at = undo_time
      where id = payload->>'journeyId';
    elsif payload->>'kind' = 'add_packing_items' then
      delete from journey_packing_items where list_id = (payload->>'listId')::uuid and id in (select value::uuid from jsonb_array_elements_text(payload->'itemIds'));
      if coalesce((payload->>'createdList')::boolean, false) then
        delete from journey_packing_lists list where list.id = (payload->>'listId')::uuid and not exists (select 1 from journey_packing_items item where item.list_id = list.id);
      end if;
    elsif payload->>'kind' = 'set_itinerary_group_endpoints' then
      if exists (
        select 1
        from jsonb_to_recordset(payload->'applied') as expected(name text, route_end_meters float8, route_end_lng float8, route_end_lat float8, route_end_track_index int4, route_end_track_fraction float8, route_end_source text, route_location_name text)
        left join timeline_groups current_group on current_group.journey_id = payload->>'journeyId' and current_group.name = expected.name
        where current_group.name is null
          or current_group.route_end_meters is distinct from expected.route_end_meters
          or current_group.route_end_lng is distinct from expected.route_end_lng
          or current_group.route_end_lat is distinct from expected.route_end_lat
          or current_group.route_end_track_index is distinct from expected.route_end_track_index
          or current_group.route_end_track_fraction is distinct from expected.route_end_track_fraction
          or current_group.route_end_source is distinct from expected.route_end_source
          or current_group.route_location_name is distinct from expected.route_location_name
      ) then
        raise exception 'Itinerary endpoints changed after this agent run';
      end if;
      update timeline_groups group_row
      set route_end_meters = previous.route_end_meters, route_end_lng = previous.route_end_lng, route_end_lat = previous.route_end_lat,
          route_end_track_index = previous.route_end_track_index, route_end_track_fraction = previous.route_end_track_fraction,
          route_end_source = previous.route_end_source, route_location_name = previous.route_location_name, updated_at = undo_time
      from jsonb_to_recordset(payload->'previous') as previous(name text, route_end_meters float8, route_end_lng float8, route_end_lat float8, route_end_track_index int4, route_end_track_fraction float8, route_end_source text, route_location_name text)
      where group_row.journey_id = payload->>'journeyId' and group_row.name = previous.name;
    elsif payload->>'kind' = 'add_itinerary_items' then
      -- Refuse undo if a person changed a generated summary after this run.
      if exists (
        select 1 from jsonb_to_recordset(coalesce(payload->'groupNotes', '[]'::jsonb)) n(name text, previous text, applied text)
        join timeline_groups g on g.journey_id = payload->>'journeyId' and g.name = n.name
        where g.note is distinct from n.applied
      ) then
        raise exception 'Itinerary group notes changed after this agent run';
      end if;
      update timeline_groups g set note = n.previous, updated_at = undo_time
      from jsonb_to_recordset(coalesce(payload->'groupNotes', '[]'::jsonb)) n(name text, previous text, applied text)
      where g.journey_id = payload->>'journeyId' and g.name = n.name and g.note = n.applied;
      delete from timeline_rows where journey_id = payload->>'journeyId' and id in (select value from jsonb_array_elements_text(payload->'rowIds'));
      delete from timeline_groups group_row
      where group_row.journey_id = payload->>'journeyId'
        and group_row.name in (select value from jsonb_array_elements_text(payload->'createdGroupNames'))
        and group_row.route_end_meters is null
        and not exists (select 1 from timeline_rows row_item where row_item.journey_id = group_row.journey_id and row_item.day = group_row.name);
    else
      raise exception 'Unsupported agent undo operation';
    end if;
    update agent_tool_calls set undone_at = undo_time, updated_at = undo_time where id = call_record.id;
    affected_count := affected_count + 1;
  end loop;
  if affected_count = 0 then
    select max(undone_at) into previous_undo_time from agent_tool_calls where run_id = target_run_id and user_id = auth.uid() and undo_payload is not null;
    if previous_undo_time is null then raise exception 'Agent run has no reversible changes'; end if;
    undo_time := previous_undo_time;
  end if;
  update agent_messages
  set ui = jsonb_set(ui, '{undoAction,undoneAt}', to_jsonb(undo_time::text), true)
  where thread_id = (select thread_id from agent_runs where id = target_run_id) and ui->'undoAction'->>'runId' = target_run_id::text;
  return jsonb_build_object('undone', true, 'undoneAt', undo_time, 'journeyId', affected_journey_id, 'affectedOperations', affected_count);
end;
$function$;


-- Include saved summaries in the versioned itinerary context for follow-up turns.
CREATE OR REPLACE FUNCTION public.read_agent_journey_sections(p_journey_id text, p_sections text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
      from (select name,note,sort_order,route_end_meters,route_end_track_index,route_end_source,route_location_name,route_id from public.timeline_groups where journey_id=p_journey_id and not deleted) t;
    result := result || jsonb_build_object('itineraryGroups', data);
  end if;
  if 'packing' = any(p_sections) then
    select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'kind',l.kind,'owner_companion_id',l.owner_companion_id,'journey_packing_items',coalesce((select jsonb_agg(to_jsonb(i) order by i.sort_order,i.id) from (select id,name,category_name,quantity,weight_kg,weight_estimated,attrs,note,packed,sort_order from public.journey_packing_items where list_id=l.id) i),'[]')) order by l.created_at,l.id),'[]') into data
      from public.journey_packing_lists l where journey_id=p_journey_id;
    result := result || jsonb_build_object('packingLists', data);
  end if;
  return result;
end;
$function$;

notify pgrst, 'reload schema';
commit;
