begin;

create table public.journey_guide_gear_imports (
  journey_id text primary key references public.journeys(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  request_id uuid not null unique,
  item_count integer not null,
  created_at timestamptz not null default now()
);
revoke all on public.journey_guide_gear_imports from public, anon, authenticated;

create or replace function public.create_journey_from_route_guide(
  p_guide_id uuid, p_request_id uuid, p_trek_start_date date default null, p_entry text default null
) returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing text;
  v_journey_id text := 'j_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  v_guide public.route_guides%rowtype;
  v_route public.routes%rowtype;
  v_track_id uuid;
  v_day jsonb;
  v_item jsonb;
  v_day_number integer := 0;
  v_row_order integer := 0;
  v_days_count integer;
  v_title text;
  v_old_suppression text;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_request_id is null or (p_entry is not null and p_entry not in ('guide','chat','form')) then
    raise exception 'Invalid save options' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  select journey_id into v_existing from public.journey_guide_imports
    where request_id = p_request_id and user_id = v_user_id;
  if found then return v_existing; end if;
  if exists (select 1 from public.journey_guide_imports where request_id = p_request_id) then
    raise exception 'request_id already used' using errcode = '42501';
  end if;
  select * into v_guide from public.route_guides where id = p_guide_id and status = 'approved';
  if not found then raise exception 'route_guide_not_published' using errcode = 'P0001'; end if;
  select * into v_route from public.routes where id = v_guide.route_id;
  v_days_count := case when jsonb_typeof(v_guide.plan->'days') = 'array'
    then jsonb_array_length(v_guide.plan->'days') else 0 end;
  if v_days_count not between 1 and 14 then raise exception 'Invalid guide days' using errcode = '22023'; end if;

  v_old_suppression := coalesce(current_setting('app.journey_version_suppressed', true), 'false');
  perform set_config('app.journey_version_suppressed','true',true);
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
  insert into public.journeys(id,user_id,route_id,track_id,name,region,coord,lng,lat,dist,asc_,diff,tone,"desc",date,planned_date,total_days,days,countdown)
  values (v_journey_id,v_user_id,v_route.id,v_track_id,v_route.name,v_route.region,v_route.coord,
    v_route.lng,v_route.lat,v_route.dist,v_route.asc_,v_route.diff,v_route.tone,v_route."desc",
    p_trek_start_date::text,p_trek_start_date::text,v_days_count,v_days_count||' 天',
    case when p_trek_start_date is not null then greatest(0,p_trek_start_date-current_date) end);
  insert into public.companions(journey_id,user_id,ini,name,color,is_host,is_self,sort_order)
    select v_journey_id,v_user_id,
      left(coalesce(nullif(profile.avatar_ini,''),nullif(profile.nick,''),nullif(profile.display_name,''),'我'),1),
      coalesce(nullif(profile.nick,''),nullif(profile.display_name,''),'我'),
      coalesce(nullif(profile.avatar_color,''),'#FF5C3A'),true,true,0
    from public.profiles profile where profile.id = v_user_id;
  for v_day in select value from jsonb_array_elements(v_guide.plan->'days') loop
    v_day_number := v_day_number + 1;
    if jsonb_typeof(v_day->'items') is distinct from 'array'
       or jsonb_array_length(v_day->'items') not between 1 and 20 then
      raise exception 'Invalid guide day items' using errcode = '22023';
    end if;
    insert into public.timeline_groups(journey_id,user_id,name,deleted,sort_order)
      values(v_journey_id,v_user_id,'Day '||v_day_number,false,v_day_number-1);
    for v_item in select value from jsonb_array_elements(v_day->'items') loop
      v_title := coalesce(v_item->>'zh',v_item->>'en');
      if length(btrim(coalesce(v_title,''))) not between 1 and 500 then
        raise exception 'Invalid guide item' using errcode = '22023';
      end if;
      insert into public.timeline_rows(id,journey_id,user_id,title,day,item_kind,is_synth,is_custom,checked,sort_order)
        values('guide_'||gen_random_uuid()::text,v_journey_id,v_user_id,v_title,'Day '||v_day_number,'activity',false,true,false,v_row_order);
      v_row_order := v_row_order+1;
    end loop;
  end loop;
  insert into public.journey_guide_imports(journey_id,user_id,template_id,payload_hash,request_id)
    values(v_journey_id,v_user_id,v_guide.id::text,md5(v_guide.plan::text),p_request_id);
  perform set_config('app.journey_version_suppressed','false',true);
  perform public.save_journey_version(v_journey_id,array['journey','timeline'],'create');
  perform set_config('app.journey_version_suppressed',v_old_suppression,true);
  return v_journey_id;
end;
$$;
revoke all on function public.create_journey_from_route_guide(uuid,uuid,date,text) from public, anon;
grant execute on function public.create_journey_from_route_guide(uuid,uuid,date,text) to authenticated;

create or replace function public.journey_import_route_guide_gear(p_journey_id text, p_request_id uuid)
returns integer language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_receipt public.journey_guide_imports%rowtype;
  v_guide public.route_guides%rowtype;
  v_person_id integer;
  v_list_id uuid;
  v_item jsonb;
  v_count integer := 0;
  v_previous public.journey_guide_gear_imports%rowtype;
  v_old_suppression text;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_request_id is null then raise exception 'request_id required' using errcode = '22023'; end if;
  perform 1 from public.journeys where id=p_journey_id and user_id=v_user_id and deleted_at is null for update;
  if not found then raise exception 'Owned active journey required' using errcode = '42501'; end if;
  select * into v_previous from public.journey_guide_gear_imports where request_id=p_request_id;
  if found then
    if v_previous.journey_id=p_journey_id and v_previous.user_id=v_user_id then return v_previous.item_count; end if;
    raise exception 'request_id already used' using errcode = '42501';
  end if;
  select * into v_receipt from public.journey_guide_imports where journey_id=p_journey_id;
  if not found or v_receipt.template_id !~ '^[0-9a-fA-F-]{36}$' then
    raise exception 'no_guide_gear' using errcode = 'P0001';
  end if;
  select * into v_guide from public.route_guides where id=v_receipt.template_id::uuid;
  if not found or jsonb_typeof(v_guide.plan->'gear') is distinct from 'array'
     or jsonb_array_length(v_guide.plan->'gear')=0 then
    raise exception 'no_guide_gear' using errcode = 'P0001';
  end if;
  if exists(select 1 from public.journey_guide_gear_imports where journey_id=p_journey_id) then
    raise exception 'Guide gear already imported' using errcode = '22023';
  end if;
  select id into v_person_id from public.companions
    where journey_id=p_journey_id and user_id=v_user_id order by sort_order,id limit 1;
  if v_person_id is null then raise exception 'An owner participant is required' using errcode = '22023'; end if;
  select id into v_list_id from public.journey_packing_lists
    where journey_id=p_journey_id and kind='personal' and owner_companion_id=v_person_id;
  v_old_suppression := coalesce(current_setting('app.journey_version_suppressed',true),'false');
  perform set_config('app.journey_version_suppressed','true',true);
  if v_list_id is null then
    insert into public.journey_packing_lists(journey_id,kind,owner_companion_id,created_by)
      values(p_journey_id,'personal',v_person_id,v_user_id) returning id into v_list_id;
  end if;
  for v_item in select value from jsonb_array_elements(v_guide.plan->'gear') loop
    if length(btrim(coalesce(coalesce(v_item->'name'->>'zh',v_item->'name'->>'en'),''))) not between 1 and 200
       or coalesce((v_item->>'quantity')::integer,1) not between 1 and 100 then
      raise exception 'Invalid packing item' using errcode='22023';
    end if;
    insert into public.journey_packing_items(list_id,source_type,name,category_name,quantity,note,packed,sort_order)
      values(v_list_id,'recommendedTemplate',coalesce(v_item->'name'->>'zh',v_item->'name'->>'en'),coalesce(v_item->'category'->>'zh',v_item->'category'->>'en'),
        coalesce((v_item->>'quantity')::integer,1),coalesce(v_item->'note'->>'zh',v_item->'note'->>'en'),false,v_count);
    v_count := v_count+1;
  end loop;
  insert into public.journey_guide_gear_imports(journey_id,user_id,request_id,item_count)
    values(p_journey_id,v_user_id,p_request_id,v_count);
  perform set_config('app.journey_version_suppressed','false',true);
  perform public.save_journey_version(p_journey_id,array['packing'],'update');
  perform set_config('app.journey_version_suppressed',v_old_suppression,true);
  return v_count;
end;
$$;
revoke all on function public.journey_import_route_guide_gear(text,uuid) from public, anon;
grant execute on function public.journey_import_route_guide_gear(text,uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
