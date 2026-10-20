begin;

-- A gear set lists library items, so filling one with gear the user does not
-- have needs library rows for it. owned=false keeps those rows out of "what I
-- own": the agent supplements a set with them, and the user marks one owned
-- once bought. Existing rows and app inserts default to owned.
alter table public.gear_items add column if not exists owned boolean not null default true;

create or replace function public.read_agent_gear()
 returns jsonb
 language plpgsql
 set search_path to 'public'
as $function$
declare items jsonb; categories jsonb; rev text; begin
  perform public.agent_lock_context();
  select gear::text into rev from public.agent_personal_revisions where user_id=auth.uid();
  select coalesce(jsonb_agg(to_jsonb(i) order by i.id),'[]') into items from (select id,name,cat_id,weight,price,qty,status,note,owned from public.gear_items where user_id=auth.uid() order by id limit 100) i;
  select coalesce(jsonb_agg(to_jsonb(c) order by c.id),'[]') into categories from (select id,name,color from public.gear_categories where user_id=auth.uid() or user_id is null) c;
  return jsonb_build_object('version',coalesce(rev,'1'),'items',items,'categories',categories);
end $function$;

-- Adds items to one of the caller's gear sets, creating the set when no set
-- of that name exists. Additive only: existing links are never changed.
-- An item names a library row (gearItemId) or is matched by exact name, and
-- otherwise becomes a new owned=false row. Returns the undo payload consumed
-- by undo_agent_run.
create or replace function public.agent_add_gear_set_items(p_set_id text, p_set_name text, p_description text, p_items jsonb)
 returns jsonb
 language plpgsql
 set search_path to ''
as $function$
declare
  v_user uuid := auth.uid();
  v_set public.gear_sets%rowtype;
  v_created boolean := false;
  v_item jsonb;
  v_name text;
  v_item_id integer;
  v_owned boolean;
  v_cat text;
  v_status text;
  v_qty integer;
  v_added_owned jsonb := '[]';
  v_added_to_buy jsonb := '[]';
  v_skipped jsonb := '[]';
  v_linked integer[] := '{}';
  v_created_items integer[] := '{}';
begin
  if v_user is null then raise exception using errcode='42501', message='Authentication required'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 80 then
    raise exception using errcode='22023', message='gear_set_items_invalid';
  end if;
  if p_set_id is not null then
    select * into v_set from public.gear_sets where id=p_set_id and user_id=v_user for update;
    if not found then raise exception using errcode='22023', message='gear_set_not_found'; end if;
  else
    v_name := btrim(coalesce(p_set_name, ''));
    if length(v_name) not between 1 and 200 then raise exception using errcode='22023', message='gear_set_name_invalid'; end if;
    select * into v_set from public.gear_sets
      where user_id=v_user and lower(btrim(name))=lower(v_name) order by created_at, id limit 1 for update;
    if not found then
      insert into public.gear_sets(user_id, name, description)
        values (v_user, v_name, nullif(btrim(coalesce(p_description, '')), '')) returning * into v_set;
      v_created := true;
    end if;
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_name := btrim(coalesce(v_item->>'name', ''));
    v_status := nullif(v_item->>'status', '');
    if v_status is not null and v_status not in ('packed','worn','consumable','optional') then v_status := null; end if;
    v_qty := case when coalesce(v_item->>'quantity', '') ~ '^[0-9]{1,3}$' and (v_item->>'quantity')::integer > 0 then (v_item->>'quantity')::integer end;
    v_item_id := null;
    if nullif(v_item->>'gearItemId', '') is not null then
      select id into v_item_id from public.gear_items where id=(v_item->>'gearItemId')::integer and user_id=v_user;
      if v_item_id is null then raise exception using errcode='22023', message='gear_item_not_found'; end if;
    else
      if length(v_name) not between 1 and 120 then raise exception using errcode='22023', message='gear_item_name_invalid'; end if;
      -- An exact name match is the same gear; repeated runs must not duplicate it.
      select id into v_item_id from public.gear_items
        where user_id=v_user and lower(btrim(name))=lower(v_name) order by owned desc, id limit 1;
      if v_item_id is null then
        select id into v_cat from public.gear_categories
          where id=nullif(v_item->>'categoryId', '') and (user_id=v_user or user_id is null);
        insert into public.gear_items(user_id, name, cat_id, weight, price, qty, status, note, owned)
          values (v_user, v_name, v_cat, 0, 0, 1, coalesce(v_status, 'packed'), nullif(btrim(coalesce(v_item->>'note', '')), ''), false)
          returning id into v_item_id;
        v_created_items := v_created_items || v_item_id;
      end if;
    end if;
    select name, owned into v_name, v_owned from public.gear_items where id=v_item_id;
    if exists (select 1 from public.gear_set_items where set_id=v_set.id and item_id=v_item_id) then
      v_skipped := v_skipped || jsonb_build_object('id', v_item_id, 'name', v_name);
      continue;
    end if;
    insert into public.gear_set_items(set_id, item_id, qty, status) values (v_set.id, v_item_id, v_qty, v_status);
    v_linked := v_linked || v_item_id;
    if v_owned then v_added_owned := v_added_owned || jsonb_build_object('id', v_item_id, 'name', v_name);
    else v_added_to_buy := v_added_to_buy || jsonb_build_object('id', v_item_id, 'name', v_name); end if;
  end loop;

  return jsonb_build_object(
    'set', jsonb_build_object('id', v_set.id, 'name', v_set.name),
    'createdSet', v_created,
    'addedOwned', v_added_owned,
    'addedToBuy', v_added_to_buy,
    'skipped', v_skipped,
    'undo', jsonb_build_object('kind', 'add_gear_set_items', 'setId', v_set.id, 'createdSet', v_created,
      'linkedItemIds', to_jsonb(v_linked), 'createdItemIds', to_jsonb(v_created_items)));
end $function$;

revoke all on function public.agent_add_gear_set_items(text, text, text, jsonb) from public, anon;
grant execute on function public.agent_add_gear_set_items(text, text, text, jsonb) to authenticated, service_role;

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
    elsif payload->>'kind' = 'add_gear_set_items' then
      -- Only the links and to-buy items this run created are removed; an item
      -- the user has since marked owned or placed in another set stays.
      delete from gear_set_items
      where set_id = payload->>'setId'
        and item_id in (select value::int from jsonb_array_elements_text(payload->'linkedItemIds'));
      delete from gear_items item
      where item.user_id = auth.uid() and not item.owned
        and item.id in (select value::int from jsonb_array_elements_text(payload->'createdItemIds'))
        and not exists (select 1 from gear_set_items link where link.item_id = item.id);
      if coalesce((payload->>'createdSet')::boolean, false) then
        delete from gear_sets gear_set
        where gear_set.id = payload->>'setId' and gear_set.user_id = auth.uid()
          and not exists (select 1 from gear_set_items link where link.set_id = gear_set.id);
      end if;
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

commit;
