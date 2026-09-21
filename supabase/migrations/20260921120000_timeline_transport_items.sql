-- Structured itinerary items. Existing free-text rows remain activity items.
alter table public.timeline_rows
  add column if not exists item_kind text not null default 'activity'
    check (item_kind in ('activity', 'transport', 'stay', 'custom'));

alter table public.timeline_rows
  add column if not exists transport jsonb;

alter table public.timeline_rows
  add column if not exists route_id text;

create index if not exists timeline_rows_transport_kind_idx
  on public.timeline_rows (journey_id, item_kind)
  where item_kind = 'transport';

-- Preserve structured rows when the staged agent commits an itinerary.
create or replace function public.apply_agent_itinerary(p_itinerary_rows jsonb, p_itinerary_groups jsonb)
returns void language plpgsql set search_path = public as $$
begin
  insert into timeline_groups (journey_id, user_id, name, deleted, sort_order, updated_at)
  select journey_id, user_id, name, deleted, sort_order, updated_at
  from jsonb_to_recordset(coalesce(p_itinerary_groups, '[]'::jsonb)) as item(
    journey_id text, user_id uuid, name text, deleted boolean, sort_order int4, updated_at timestamptz
  )
  on conflict (journey_id, name) do nothing;

  insert into timeline_rows (id, journey_id, user_id, title, day, time_mins, time_end_mins, item_kind, route_id, transport, is_synth, is_custom, checked, sort_order)
  select id, journey_id, user_id, title, day, time_mins, time_end_mins, coalesce(item_kind, 'activity'), route_id, transport, is_synth, is_custom, checked, sort_order
  from jsonb_to_recordset(coalesce(p_itinerary_rows, '[]'::jsonb)) as item(
    id text, journey_id text, user_id uuid, title text, day text, time_mins int4, time_end_mins int4,
    item_kind text, route_id text, transport jsonb, is_synth boolean, is_custom boolean, checked boolean, sort_order int4
  );
end;
$$;
grant execute on function public.apply_agent_itinerary(jsonb, jsonb) to authenticated;

-- Include structured rows in the assistant's version-checked itinerary context.
create or replace function public.read_agent_journey_sections(p_journey_id text, p_sections text[]) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare result jsonb := '{}'; data jsonb;
begin
  perform public.agent_lock_context(p_journey_id);
  result := jsonb_build_object('journeyId',p_journey_id,'versions',public.agent_context_versions(p_journey_id));
  if 'journey' = any(p_sections) then
    select jsonb_build_object('id',id,'name',name,'region',region,'lng',lng,'lat',lat,'coord',coord,'planned_date',planned_date,'date',date,'days',days,'total_days',total_days,'diff',diff,'desc',"desc") into data from public.journeys where id=p_journey_id;
    result := result || jsonb_build_object('journey',data);
  end if;
  if 'track' = any(p_sections) then
    select track_summary into data from public.agent_journey_revisions where journey_id=p_journey_id;
    result := result || jsonb_build_object('trackSummary',data);
  end if;
  if 'itinerary' = any(p_sections) then
    select coalesce(jsonb_agg(to_jsonb(t) order by sort_order,id),'[]') into data
      from (select id,title,day,time_mins,time_end_mins,item_kind,route_id,transport,checked,sort_order from public.timeline_rows where journey_id=p_journey_id) t;
    result := result || jsonb_build_object('itinerary',data);
    select coalesce(jsonb_agg(to_jsonb(t) order by sort_order,name),'[]') into data
      from (select name,sort_order,route_end_meters,route_location_name from public.timeline_groups where journey_id=p_journey_id and not deleted) t;
    result := result || jsonb_build_object('itineraryGroups',data);
  end if;
  if 'packing' = any(p_sections) then
    select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'kind',l.kind,'owner_companion_id',l.owner_companion_id,
      'journey_packing_items',coalesce((select jsonb_agg(to_jsonb(i) order by i.sort_order,i.id) from
        (select id,name,category_name,quantity,weight_kg,weight_estimated,attrs,note,packed,sort_order from public.journey_packing_items where list_id=l.id) i),'[]')) order by l.created_at,l.id),'[]') into data
      from public.journey_packing_lists l where journey_id=p_journey_id;
    result := result || jsonb_build_object('packingLists',data);
  end if;
  return result;
end;
$$;
