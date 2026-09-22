-- A day boundary is a position on one track. One trip is one journey and may
-- walk several catalog routes (hike A, transfer, hike B), so the stored
-- distance, index and fraction are only meaningful together with the route
-- they were measured on. Without that identity the first day of the second
-- route reads as a position on the first route's track.
--
-- No foreign key, matching timeline_rows.route_id: a saved plan keeps the route
-- it was planned against even if the catalog entry later changes or disappears.
alter table public.timeline_groups add column if not exists route_id text;

comment on column public.timeline_groups.route_id is
  'Catalog route whose track this day boundary is measured on; null means the journey bound track. Transfer or rest days that belong to no route leave it null.';

-- The agent's itinerary context carries the same fields the client reads, so
-- the snapshot exposes which route each day boundary belongs to. Replaces the
-- definition from 20260921120000 with only that column added.
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
      from (select name,sort_order,route_end_meters,route_end_track_index,route_end_source,route_location_name,route_id from public.timeline_groups where journey_id=p_journey_id and not deleted) t;
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
