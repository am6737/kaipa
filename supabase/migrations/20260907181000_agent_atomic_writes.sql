begin;
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
  if call.tool_name = 'add_itinerary_items' then
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
commit;
