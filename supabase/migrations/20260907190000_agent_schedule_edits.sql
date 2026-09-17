begin;

-- Capture only fields owned by schedule editing; titles, checks and endpoints
-- remain editable and are never overwritten by schedule undo.
create or replace function public.agent_schedule_snapshot(journey_id_arg text)
returns jsonb language sql security invoker set search_path=public as $$
  select jsonb_build_object(
    'journey', (select jsonb_build_object('date',date,'planned_date',planned_date,'days',days,'total_days',total_days) from journeys where id=journey_id_arg),
    'rows', (select coalesce(jsonb_agg(jsonb_build_object('id',id,'day',day) order by id),'[]') from timeline_rows where journey_id=journey_id_arg),
    'groups', (select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'sort_order',sort_order) order by id),'[]') from timeline_groups where journey_id=journey_id_arg and not deleted)
  );
$$;

create or replace function public.agent_apply_schedule(journey_id_arg text, change jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare
  previous jsonb;
  assignments jsonb := change->'dayAssignments';
  days_count integer := (change->>'totalDays')::integer;
  names_count integer;
  start_date text := change->>'plannedDate';
  temporary_prefix text := 'agent_schedule_' || gen_random_uuid()::text || '_';
begin
  perform public.agent_lock_context(journey_id_arg);
  if not exists(select 1 from journeys j where j.id=journey_id_arg and (j.user_id=auth.uid() or (public.is_journey_member(j.id) and coalesce((j.participant_permissions->>'editTimeline')::boolean,false)))) then
    raise exception 'Journey write permission denied';
  end if;
  if days_count is null or days_count < 1 or days_count > 365 or jsonb_typeof(assignments) is distinct from 'array' then
    raise exception 'Invalid schedule';
  end if;
  if change ? 'plannedDate' and (start_date is null or start_date !~ '^\d{4}-\d{2}-\d{2}$' or to_char(start_date::date,'YYYY-MM-DD') <> start_date) then
    raise exception 'Invalid start date';
  end if;
  previous := public.agent_schedule_snapshot(journey_id_arg);
  select count(*) into names_count from (
    select day from timeline_rows where journey_id=journey_id_arg
    union select name from timeline_groups where journey_id=journey_id_arg and not deleted
  ) names;
  if jsonb_array_length(assignments) <> names_count
    or exists(select 1 from jsonb_to_recordset(assignments) a("from" text,"toDay" integer) where a."from" is null or a."toDay" is null or a."toDay" < 1 or a."toDay" > days_count)
    or (select count(distinct a->>'from') from jsonb_array_elements(assignments) a) <> names_count
    or (select count(distinct (a->>'toDay')::integer) from jsonb_array_elements(assignments) a) <> names_count
    or exists(select 1 from jsonb_array_elements(assignments) a where not exists(select 1 from timeline_rows where journey_id=journey_id_arg and day=a->>'from') and not exists(select 1 from timeline_groups where journey_id=journey_id_arg and not deleted and name=a->>'from')) then
    raise exception 'Provide each existing day/group exactly once with a distinct day within totalDays';
  end if;
  if exists(select 1 from timeline_groups g join jsonb_array_elements(assignments) a on g.name='Day ' || (a->>'toDay')::integer::text where g.journey_id=journey_id_arg and g.deleted) then
    raise exception 'Target day has a deleted group; resolve the group conflict before rescheduling';
  end if;
  if exists(select 1 from (
    select g.route_end_meters,lag(g.route_end_meters) over(order by (a->>'toDay')::integer) previous_end
    from timeline_groups g join jsonb_array_elements(assignments) a on g.name=a->>'from'
    where g.journey_id=journey_id_arg and not g.deleted and g.route_end_meters is not null
  ) endpoints where route_end_meters < previous_end) then
    raise exception 'Schedule must preserve hiking route endpoint order';
  end if;
  update journeys set total_days=days_count,days=days_count::text || ' 天',
    planned_date=case when change ? 'plannedDate' then start_date else planned_date end,
    date=case when change ? 'plannedDate' then start_date else date end,updated_at=now()
    where id=journey_id_arg;
  if not found then raise exception 'Journey update denied'; end if;
  update timeline_rows t set day='Day ' || a."toDay"::text
    from jsonb_to_recordset(assignments) a("from" text,"toDay" integer)
    where t.journey_id=journey_id_arg and t.day=a."from";
  -- Temporary names avoid unique-key collisions when swapping day groups.
  update timeline_groups set name=temporary_prefix || id where journey_id=journey_id_arg and not deleted;
  update timeline_groups g set name='Day ' || a."toDay"::text,sort_order=a."toDay"-1,updated_at=now()
    from jsonb_to_recordset(previous->'groups') old(id text,name text),jsonb_to_recordset(assignments) a("from" text,"toDay" integer)
    where g.journey_id=journey_id_arg and g.id=old.id and old.name=a."from";
  return jsonb_build_object('kind','update_journey_schedule','journeyId',journey_id_arg,'previous',previous,'applied',public.agent_schedule_snapshot(journey_id_arg));
end;
$$;

create or replace function public.agent_undo_schedule(payload jsonb)
returns void language plpgsql security invoker set search_path=public as $$
declare
  journey_id_arg text := payload->>'journeyId';
  previous jsonb := payload->'previous';
begin
  perform public.agent_lock_context(journey_id_arg);
  if not exists(select 1 from journeys j where j.id=journey_id_arg and (j.user_id=auth.uid() or (public.is_journey_member(j.id) and coalesce((j.participant_permissions->>'editTimeline')::boolean,false)))) then
    raise exception 'Journey write permission denied';
  end if;
  if public.agent_schedule_snapshot(journey_id_arg) is distinct from payload->'applied' then
    raise exception 'Journey schedule changed after this agent run';
  end if;
  update journeys set date=previous->'journey'->>'date',planned_date=previous->'journey'->>'planned_date',
    days=previous->'journey'->>'days',total_days=(previous->'journey'->>'total_days')::integer,updated_at=now() where id=journey_id_arg;
  update timeline_rows t set day=old.day from jsonb_to_recordset(previous->'rows') old(id text,day text) where t.journey_id=journey_id_arg and t.id=old.id;
  update timeline_groups set name='agent_undo_' || gen_random_uuid()::text || '_' || id where journey_id=journey_id_arg and not deleted;
  update timeline_groups g set name=old.name,sort_order=old.sort_order,updated_at=now()
    from jsonb_to_recordset(previous->'groups') old(id text,name text,sort_order integer) where g.journey_id=journey_id_arg and g.id=old.id;
end;
$$;

revoke all on function public.agent_schedule_snapshot(text), public.agent_apply_schedule(text,jsonb), public.agent_undo_schedule(jsonb) from public, anon;
grant execute on function public.agent_schedule_snapshot(text), public.agent_apply_schedule(text,jsonb), public.agent_undo_schedule(jsonb) to authenticated;

create or replace function public.apply_agent_journey_change(
  p_call_id uuid, p_journey_id text, p_expected jsonb, p_change jsonb, p_output jsonb, p_undo jsonb default null
) returns jsonb language plpgsql security invoker set search_path=public as $$
declare
  call public.agent_tool_calls%rowtype;
  versions jsonb;
  dependency text;
  dependencies text[];
  list_id uuid;
  affected integer;
  requested integer;
begin
  perform public.agent_lock_context(p_journey_id);
  select * into call from public.agent_tool_calls where id=p_call_id and user_id=auth.uid() for update;
  if not found or call.arguments->>'journeyId' is distinct from p_journey_id then raise exception 'Invalid agent operation'; end if;
  if call.status = 'completed' then return jsonb_build_object('output',call.output,'versions',public.agent_context_versions(p_journey_id)); end if;
  if not exists(select 1 from public.agent_runs where id=call.run_id and user_id=auth.uid() and status='running') then raise exception 'Agent run is not active'; end if;
  dependencies := case call.tool_name
    when 'update_journey_schedule' then array['journey','itinerary']
    when 'add_itinerary_items' then array['journey','track','itinerary']
    when 'set_itinerary_group_endpoints' then array['journey','track','itinerary']
    when 'delete_itinerary_items' then array['journey','itinerary']
    when 'delete_packing_items' then array['journey','packing']
    when 'set_journey_map_location' then array['journey']
    when 'add_packing_items' then case when call.arguments->>'mode'='full' then array['journey','track','itinerary','packing','gear'] else array['journey','packing'] end
    else null end;
  if dependencies is null then raise exception 'Unsupported agent operation'; end if;
  versions := public.agent_context_versions(p_journey_id);
  foreach dependency in array dependencies loop
    if p_expected->>dependency is null or p_expected->>dependency is distinct from versions->>dependency then
      -- This is an application-level optimistic conflict, not a retryable SQL
      -- serialization error. PT409 makes PostgREST return it immediately.
      raise exception using errcode='PT409', message='agent_context_conflict: ' || dependency || ' changed; read current sections before replanning';
    end if;
  end loop;
  if not exists(select 1 from public.journeys j where j.id=p_journey_id and (j.user_id=auth.uid() or
    (public.is_journey_member(j.id) and coalesce((j.participant_permissions->>case when call.tool_name in ('add_packing_items','delete_packing_items') then 'editChecklist' else 'editTimeline' end)::boolean,false)))) then
    raise exception 'Journey write permission denied';
  end if;
  if call.tool_name = 'update_journey_schedule' then
    if p_change is distinct from call.arguments then raise exception 'Schedule arguments mismatch'; end if;
    p_undo := public.agent_apply_schedule(p_journey_id,p_change);
    p_output := p_output || jsonb_build_object('schedule',p_undo->'applied'->'journey');
  elsif call.tool_name = 'add_itinerary_items' then
    if exists(select 1 from jsonb_array_elements(coalesce(p_change->'rows','[]') || coalesce(p_change->'groups','[]')) r where r->>'journey_id' is distinct from p_journey_id) then raise exception 'Invalid journey scope'; end if;
    perform public.apply_agent_itinerary(p_change->'rows',p_change->'groups');
  elsif call.tool_name = 'set_journey_map_location' then
    update public.journeys set region=p_change->>'region',coord=p_change->>'coord',lng=(p_change->>'lng')::float8,lat=(p_change->>'lat')::float8,updated_at=now() where id=p_journey_id;
    if not found then raise exception 'Journey update denied'; end if;
  elsif call.tool_name = 'add_packing_items' then
    list_id := (p_change->>'listId')::uuid;
    if coalesce((p_change->>'createdList')::boolean,false) then
      insert into public.journey_packing_lists(id,journey_id,kind,owner_companion_id,created_by)
      values(list_id,p_journey_id,p_change->>'kind',(p_change->>'ownerCompanionId')::integer,auth.uid());
    end if;
    if not exists(select 1 from public.journey_packing_lists where id=list_id and journey_id=p_journey_id) then raise exception 'Invalid list scope'; end if;
    insert into public.journey_packing_items(id,list_id,source_type,name,category_name,quantity,weight_kg,weight_estimated,carry_status,attrs,note,packed,sort_order)
    select id,list_id,'custom',name,category_name,quantity,weight_kg,weight_estimated,carry_status,attrs,null,false,sort_order
    from jsonb_to_recordset(p_change->'items') r(id uuid,name text,category_name text,quantity integer,weight_kg numeric,weight_estimated boolean,carry_status text,attrs jsonb,sort_order integer);
  elsif call.tool_name = 'set_itinerary_group_endpoints' then
    if exists(select 1 from jsonb_array_elements(p_change->'groups') r where r->>'journey_id' is distinct from p_journey_id) then raise exception 'Invalid journey scope'; end if;
    insert into public.timeline_groups(journey_id,user_id,name,deleted,sort_order,route_end_meters,route_end_lng,route_end_lat,route_end_track_index,route_end_track_fraction,route_end_source,route_location_name,updated_at)
    select p_journey_id,auth.uid(),name,false,sort_order,route_end_meters,route_end_lng,route_end_lat,route_end_track_index,route_end_track_fraction,route_end_source,route_location_name,now()
    from jsonb_to_recordset(p_change->'groups') r(name text,sort_order integer,route_end_meters float8,route_end_lng float8,route_end_lat float8,route_end_track_index int4,route_end_track_fraction float8,route_end_source text,route_location_name text)
    on conflict(journey_id,name) do update set deleted=false,sort_order=excluded.sort_order,route_end_meters=excluded.route_end_meters,route_end_lng=excluded.route_end_lng,route_end_lat=excluded.route_end_lat,route_end_track_index=excluded.route_end_track_index,route_end_track_fraction=excluded.route_end_track_fraction,route_end_source=excluded.route_end_source,route_location_name=excluded.route_location_name,updated_at=now();
  elsif call.tool_name = 'delete_itinerary_items' then
    requested := jsonb_array_length(call.arguments->'items');
    delete from public.timeline_rows t using jsonb_to_recordset(call.arguments->'items') r(id text,title text)
      where t.journey_id=p_journey_id and t.id=r.id and t.title=r.title;
    get diagnostics affected=row_count;
    if affected <> requested then raise exception 'Itinerary deletion targets changed'; end if;
  elsif call.tool_name = 'delete_packing_items' then
    requested := jsonb_array_length(call.arguments->'items');
    delete from public.journey_packing_items i using public.journey_packing_lists l,jsonb_to_recordset(call.arguments->'items') r(id uuid,name text)
      where i.list_id=l.id and l.journey_id=p_journey_id and i.id=r.id and i.name=r.name;
    get diagnostics affected=row_count;
    if affected <> requested then raise exception 'Packing deletion targets changed'; end if;
  end if;
  -- Persist the receipt in the same transaction: a lost HTTP response cannot duplicate a write.
  update public.agent_tool_calls set status='completed',output=p_output,undo_payload=p_undo,error=null,updated_at=now() where id=p_call_id;
  return jsonb_build_object('output',p_output,'versions',public.agent_context_versions(p_journey_id));
end $$;
revoke all on function public.apply_agent_journey_change(uuid,text,jsonb,jsonb,jsonb,jsonb) from public, anon;
grant execute on function public.apply_agent_journey_change(uuid,text,jsonb,jsonb,jsonb,jsonb) to authenticated;

create or replace function public.undo_agent_run(target_run_id uuid)
returns jsonb language plpgsql set search_path = public as $$
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
$$;
grant execute on function public.undo_agent_run(uuid) to authenticated;

commit;
