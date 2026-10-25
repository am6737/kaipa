-- 导入行程: saves a checked import as a journey in one transaction. The app
-- sends the day-by-day draft it showed in the report; nothing is written while
-- the user is still reading it. journey_imports is both the idempotency
-- receipt and the record of how many issues the report showed.
begin;

create table public.journey_imports (
  request_id uuid primary key,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  journey_id text not null references public.journeys(id) on delete cascade,
  route_id text references public.routes(id) on delete set null,
  sources text[] not null default '{}',
  day_count int not null,
  issue_counts jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index journey_imports_user_created on public.journey_imports (user_id, created_at desc);
alter table public.journey_imports enable row level security;
revoke all on public.journey_imports from public, anon, authenticated;
grant select on public.journey_imports to authenticated;
grant all on public.journey_imports to service_role;
create policy journey_imports_own_select on public.journey_imports
  for select to authenticated using (user_id = auth.uid());
create policy journey_imports_service_role on public.journey_imports
  for all to service_role using (true) with check (true);

create or replace function public.create_journey_from_import(
  p_request_id uuid, p_journey jsonb, p_days jsonb
) returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing_journey_id text;
  v_journey_id text := 'j_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  v_name text := left(btrim(coalesce(p_journey->>'name', '')), 60);
  v_route public.routes%rowtype;
  v_route_found boolean := false;
  v_track_id uuid;
  v_start_date date;
  v_day jsonb;
  v_item jsonb;
  v_day_number int := 0;
  v_row_order int := 0;
  v_title text;
  v_kind text;
  v_old_suppression text;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_request_id is null then raise exception 'request_id required' using errcode = '22023'; end if;
  if jsonb_typeof(p_journey) <> 'object' or jsonb_typeof(p_days) <> 'array'
    or jsonb_array_length(p_days) = 0 or jsonb_array_length(p_days) > 30 then
    raise exception 'Invalid import' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_days) day
    where jsonb_typeof(day->'items') <> 'array' or jsonb_array_length(day->'items') > 30) then
    raise exception 'Invalid import day' using errcode = '22023';
  end if;
  if nullif(p_journey->>'startDate', '') is not null then
    if (p_journey->>'startDate') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid start date' using errcode = '22023'; end if;
    v_start_date := (p_journey->>'startDate')::date;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  select imports.journey_id into v_existing_journey_id
    from public.journey_imports imports
    where imports.request_id = p_request_id and imports.user_id = v_user_id;
  if found then return v_existing_journey_id; end if;
  if exists (select 1 from public.journey_imports imports where imports.request_id = p_request_id) then
    raise exception 'request_id already used' using errcode = '42501';
  end if;

  if nullif(p_journey->>'routeId', '') is not null then
    select * into v_route from public.routes route where route.id = p_journey->>'routeId';
    v_route_found := found;
  end if;
  if v_name = '' then v_name := coalesce(v_route.name, '导入的行程'); end if;

  v_old_suppression := coalesce(current_setting('app.journey_version_suppressed', true), 'false');
  perform set_config('app.journey_version_suppressed', 'true', true);
  -- Same as create_journey_from_itinerary: a catalog route brings its track along.
  if v_route_found
    and jsonb_typeof(v_route.track_coords) = 'array' and jsonb_array_length(v_route.track_coords) > 1 then
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
  values (v_journey_id,v_user_id,case when v_route_found then v_route.id end,v_track_id,v_name,
    coalesce(v_route.region,''),coalesce(v_route.coord,''),coalesce(v_route.lng,0),coalesce(v_route.lat,0),
    coalesce(v_route.dist,''),coalesce(v_route.asc_,''),
    v_route.diff,coalesce(v_route.tone,'forest'),v_route."desc",
    v_start_date::text,jsonb_array_length(p_days),jsonb_array_length(p_days)::text);
  insert into public.companions(journey_id,user_id,ini,name,color,is_host,is_self,sort_order)
    select v_journey_id,v_user_id,
      left(coalesce(nullif(profile.avatar_ini,''),nullif(profile.nick,''),nullif(profile.display_name,''),'我'),1),
      coalesce(nullif(profile.nick,''),nullif(profile.display_name,''),'我'),
      coalesce(nullif(profile.avatar_color,''),'#FF5C3A'),true,true,0
    from public.profiles profile where profile.id = v_user_id;

  for v_day in select value from jsonb_array_elements(p_days) loop
    v_day_number := v_day_number+1;
    insert into public.timeline_groups(journey_id,user_id,name,note,deleted,sort_order)
      values(v_journey_id,v_user_id,'Day '||v_day_number,nullif(left(btrim(coalesce(v_day->>'note','')),2000),''),false,v_day_number-1);
    for v_item in select value from jsonb_array_elements(v_day->'items') loop
      v_title := left(btrim(coalesce(v_item->>'title','')), 120);
      if v_title = '' then continue; end if;
      v_kind := case when v_item->>'kind' in ('activity','transport','stay') then v_item->>'kind' else 'activity' end;
      insert into public.timeline_rows(id,journey_id,user_id,title,day,item_kind,time_mins,time_end_mins,is_synth,is_custom,checked,sort_order)
        values('import_'||gen_random_uuid()::text,v_journey_id,v_user_id,v_title,'Day '||v_day_number,v_kind,
          case when jsonb_typeof(v_item->'timeMins') = 'number' and (v_item->>'timeMins')::int between 0 and 1439 then (v_item->>'timeMins')::int end,
          case when jsonb_typeof(v_item->'timeEndMins') = 'number' and (v_item->>'timeEndMins')::int between 0 and 1439 then (v_item->>'timeEndMins')::int end,
          false,true,false,v_row_order);
      v_row_order := v_row_order+1;
    end loop;
  end loop;

  insert into public.journey_imports(request_id,user_id,journey_id,route_id,sources,day_count,issue_counts)
    values(p_request_id,v_user_id,v_journey_id,case when v_route_found then v_route.id end,
      coalesce(array(select jsonb_array_elements_text(case when jsonb_typeof(p_journey->'sources') = 'array' then p_journey->'sources' else '[]'::jsonb end)), '{}'),
      jsonb_array_length(p_days),
      case when jsonb_typeof(p_journey->'issueCounts') = 'object' then p_journey->'issueCounts' else '{}'::jsonb end);
  perform set_config('app.journey_version_suppressed','false',true);
  perform public.save_journey_version(v_journey_id,array['journey','timeline'],'create');
  perform set_config('app.journey_version_suppressed',v_old_suppression,true);
  return v_journey_id;
end;
$$;
revoke all on function public.create_journey_from_import(uuid,jsonb,jsonb) from public, anon;
grant execute on function public.create_journey_from_import(uuid,jsonb,jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;
