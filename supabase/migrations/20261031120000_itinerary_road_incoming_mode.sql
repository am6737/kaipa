-- itinerary_road_incoming_mode.sql — a plan's shared ride says how you get there.
--
-- The app map only distinguishes a walk from a vehicle leg when the row's
-- location carries incomingMode. Smart planning marks its 包车/拼车/班车/景区观光车
-- legs as 'road'; the guide RPC wrote these rows without any location at all,
-- so a 56 km ride out of the valley walked itself across the map.
-- Body is create_journey_from_itinerary_legacy as renamed by
-- 20261030140000_itinerary_template_notes.sql, with a location on the two
-- transfer inserts and nothing else changed. The public
-- create_journey_from_itinerary wrapper is untouched: it only calls this and
-- rewrites the day notes.

begin;

create or replace function public.create_journey_from_itinerary_legacy(
  p_itinerary_id uuid, p_version int, p_trek_start_date date,
  p_include_access boolean, p_request_id uuid, p_entry text default null
) returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing_journey_id text;
  v_journey_id text := 'j_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  v_itinerary public.route_itineraries%rowtype;
  v_route public.routes%rowtype;
  v_track_id uuid;
  v_days jsonb;
  v_day jsonb;
  v_transfer jsonb;
  v_node text;
  v_node_index int;
  v_day_number int := 0;
  v_row_order int := 0;
  v_access_in_count int := 0;
  v_group_note text;
  v_title text;
  v_mode text;
  v_old_suppression text;
  v_note record;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_request_id is null then raise exception 'request_id required' using errcode = '22023'; end if;
  if p_include_access is null or (p_entry is not null and p_entry not in ('guide','form','chat')) then
    raise exception 'Invalid save options' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  select imports.journey_id into v_existing_journey_id
    from public.journey_guide_imports imports
    where imports.request_id = p_request_id and imports.user_id = v_user_id;
  if found then return v_existing_journey_id; end if;
  if exists (select 1 from public.journey_guide_imports imports where imports.request_id = p_request_id) then
    raise exception 'request_id already used' using errcode = '42501';
  end if;

  select * into v_itinerary from public.route_itineraries itinerary
    where itinerary.id = p_itinerary_id and itinerary.version = p_version
      and itinerary.status = 'published';
  if not found then raise exception 'itinerary_not_published' using errcode = 'P0001'; end if;
  select * into v_route from public.routes route where route.id = v_itinerary.route_id;

  v_days := v_itinerary.payload->'days';
  if not p_include_access then
    while jsonb_array_length(v_days) > 0 and v_days->0->>'kind' = 'access_in' loop
      v_days := v_days - 0;
    end loop;
    while jsonb_array_length(v_days) > 0 and v_days->(jsonb_array_length(v_days)-1)->>'kind' = 'access_out' loop
      v_days := v_days - (jsonb_array_length(v_days)-1);
    end loop;
  else
    select count(*) into v_access_in_count
    from jsonb_array_elements(v_days) with ordinality as included(day, ordinal)
    where included.day->>'kind' = 'access_in';
  end if;

  v_old_suppression := coalesce(current_setting('app.journey_version_suppressed', true), 'false');
  perform set_config('app.journey_version_suppressed', 'true', true);
  if jsonb_typeof(v_route.track_coords) = 'array' and jsonb_array_length(v_route.track_coords) > 1 then
    insert into public.tracks(user_id,name,file_name,file_format,coords,elevation,duration_ms,waypoints,dist_m,asc_m,point_count)
    values (v_user_id,v_route.name,coalesce(v_route.track_file_name,v_route.name||'.kml'),'kml',
      v_route.track_coords,v_route.track_elevation,v_route.track_duration_ms,v_route.track_waypoints,
      case when substring(coalesce(v_route.dist,'') from '[0-9]+(\.[0-9]+)?') is not null
        then round(substring(v_route.dist from '[0-9]+(\.[0-9]+)?')::numeric*1000)::bigint end,
      case when substring(coalesce(v_route.asc_,'') from '[0-9]+(\.[0-9]+)?') is not null
        then round(substring(v_route.asc_ from '[0-9]+(\.[0-9]+)?')::numeric)::bigint end,
      jsonb_array_length(v_route.track_coords)) returning id into v_track_id;
  end if;
  insert into public.journeys(id,user_id,route_id,track_id,name,region,coord,lng,lat,dist,asc_,diff,tone,"desc",planned_date,total_days,days)
  values (v_journey_id,v_user_id,v_route.id,v_track_id,v_route.name,v_route.region,v_route.coord,
    v_route.lng,v_route.lat,v_route.dist,v_route.asc_,v_route.diff,v_route.tone,v_route."desc",
    case when p_trek_start_date is not null then (p_trek_start_date-v_access_in_count)::text end,
    jsonb_array_length(v_days),jsonb_array_length(v_days)::text);
  insert into public.companions(journey_id,user_id,ini,name,color,is_host,is_self,sort_order)
    select v_journey_id,v_user_id,
      left(coalesce(nullif(profile.avatar_ini,''),nullif(profile.nick,''),nullif(profile.display_name,''),'我'),1),
      coalesce(nullif(profile.nick,''),nullif(profile.display_name,''),'我'),
      coalesce(nullif(profile.avatar_color,''),'#FF5C3A'),true,true,0
    from public.profiles profile where profile.id = v_user_id;

  for v_day in select value from jsonb_array_elements(v_days) loop
    v_day_number := v_day_number+1;
    v_group_note := nullif(v_day->>'tip','');
    if v_day_number = 1 then
      v_group_note := v_itinerary.payload->>'summary';
      for v_note in select ordinal, value #>> '{}' as note_text
        from jsonb_array_elements(v_itinerary.payload->'notes') with ordinality as notes(value,ordinal)
      loop
        v_group_note := v_group_note || E'\n' || v_note.ordinal || '. ' || v_note.note_text;
      end loop;
      v_group_note := concat_ws(E'\n\n',v_group_note,nullif(v_day->>'tip',''));
    end if;
    insert into public.timeline_groups(journey_id,user_id,name,note,deleted,sort_order)
      values(v_journey_id,v_user_id,'Day '||v_day_number,v_group_note,false,v_day_number-1);

    for v_transfer in select value from jsonb_array_elements(v_day->'transfers')
      where value->>'position' = 'start' loop
      v_mode := case v_transfer->>'mode' when 'charter' then '包车' when 'shared' then '拼车'
        when 'bus' then '班车' when 'shuttle' then '景区观光车' end;
      v_title := concat_ws(' ',v_mode,concat_ws(' → ',v_transfer->>'from',v_transfer->>'to'));
      if nullif(v_transfer->>'duration','') is not null then v_title := v_title||'（'||(v_transfer->>'duration')||'）'; end if;
      if nullif(v_transfer->>'costRef','') is not null then v_title := v_title||'（参考 '||(v_transfer->>'costRef')||'）'; end if;
      insert into public.timeline_rows(id,journey_id,user_id,title,day,item_kind,is_synth,is_custom,checked,sort_order,location)
        values('itinerary_'||gen_random_uuid()::text,v_journey_id,v_user_id,v_title,'Day '||v_day_number,'activity',false,true,false,v_row_order,
          jsonb_build_object('name',left(v_transfer->>'to',160),'source','custom','incomingMode','road'));
      v_row_order := v_row_order+1;
    end loop;
    v_node_index := 0;
    for v_node in select btrim(node) from regexp_split_to_table(v_day->>'title','→') as node loop
      v_node_index := v_node_index+1;
      if v_node = '' or exists (
        select 1 from jsonb_array_elements(v_day->'transfers') transfer
        where transfer->>'position' = 'start' and v_node in (transfer->>'from', transfer->>'to'))
      or (v_node_index = array_length(regexp_split_to_array(v_day->>'title','→'),1)
        and v_node = v_day->'stay'->>'name') then continue; end if;
      insert into public.timeline_rows(id,journey_id,user_id,title,day,item_kind,is_synth,is_custom,checked,sort_order)
        values('itinerary_'||gen_random_uuid()::text,v_journey_id,v_user_id,v_node,'Day '||v_day_number,'activity',false,true,false,v_row_order);
      v_row_order := v_row_order+1;
    end loop;
    for v_transfer in select value from jsonb_array_elements(v_day->'transfers')
      where value->>'position' = 'end' loop
      v_mode := case v_transfer->>'mode' when 'charter' then '包车' when 'shared' then '拼车'
        when 'bus' then '班车' when 'shuttle' then '景区观光车' end;
      v_title := concat_ws(' ',v_mode,concat_ws(' → ',v_transfer->>'from',v_transfer->>'to'));
      if nullif(v_transfer->>'duration','') is not null then v_title := v_title||'（'||(v_transfer->>'duration')||'）'; end if;
      if nullif(v_transfer->>'costRef','') is not null then v_title := v_title||'（参考 '||(v_transfer->>'costRef')||'）'; end if;
      insert into public.timeline_rows(id,journey_id,user_id,title,day,item_kind,is_synth,is_custom,checked,sort_order,location)
        values('itinerary_'||gen_random_uuid()::text,v_journey_id,v_user_id,v_title,'Day '||v_day_number,'activity',false,true,false,v_row_order,
          jsonb_build_object('name',left(v_transfer->>'to',160),'source','custom','incomingMode','road'));
      v_row_order := v_row_order+1;
    end loop;
    if jsonb_typeof(v_day->'stay') = 'object' then
      insert into public.timeline_rows(id,journey_id,user_id,title,day,item_kind,is_synth,is_custom,checked,sort_order)
        values('itinerary_'||gen_random_uuid()::text,v_journey_id,v_user_id,v_day->'stay'->>'name','Day '||v_day_number,'stay',false,true,false,v_row_order);
      v_row_order := v_row_order+1;
    end if;
  end loop;

  insert into public.journey_guide_imports(journey_id,user_id,template_id,payload_hash,request_id)
    values(v_journey_id,v_user_id,p_itinerary_id::text||'@'||p_version,md5(v_itinerary.payload::text),p_request_id);
  insert into public.itinerary_events(user_id,event,itinerary_id,version,route_id,entry,include_access,journey_id)
    values(v_user_id,'saved',p_itinerary_id,p_version,v_route.id,p_entry,p_include_access,v_journey_id);
  perform set_config('app.journey_version_suppressed','false',true);
  perform public.save_journey_version(v_journey_id,array['journey','timeline'],'create');
  perform set_config('app.journey_version_suppressed',v_old_suppression,true);
  return v_journey_id;
end;
$$;
revoke all on function public.create_journey_from_itinerary_legacy(uuid,int,date,boolean,uuid,text) from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
