begin;

-- Separate concurrency tokens from the user-facing, run-grouped version history.
create table if not exists public.agent_journey_revisions (
  journey_id text primary key references public.journeys(id) on delete cascade,
  journey bigint not null default 1,
  track bigint not null default 1,
  itinerary bigint not null default 1,
  packing bigint not null default 1,
  track_summary jsonb
);
alter table public.agent_journey_revisions enable row level security;
drop policy if exists agent_revisions_read on public.agent_journey_revisions;
create policy agent_revisions_read on public.agent_journey_revisions for select to authenticated
  using (public.is_journey_member(journey_id));
grant select on public.agent_journey_revisions to authenticated;
revoke insert, update, delete on public.agent_journey_revisions from authenticated, anon;

create table if not exists public.agent_personal_revisions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  gear bigint not null default 1
);
alter table public.agent_personal_revisions enable row level security;
drop policy if exists agent_personal_revisions_read on public.agent_personal_revisions;
create policy agent_personal_revisions_read on public.agent_personal_revisions for select to authenticated using (user_id = auth.uid());
grant select on public.agent_personal_revisions to authenticated;
revoke insert, update, delete on public.agent_personal_revisions from authenticated, anon;

create table if not exists public.agent_context_cache (
  thread_id uuid not null references public.agent_threads(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  resource_key text not null,
  revision text not null,
  data jsonb not null,
  primary key(thread_id, resource_key)
);
alter table public.agent_context_cache enable row level security;
drop policy if exists agent_context_cache_owner on public.agent_context_cache;
create policy agent_context_cache_owner on public.agent_context_cache for all to authenticated
  using (user_id = auth.uid() and exists(select 1 from public.agent_threads t where t.id = thread_id and t.user_id = auth.uid()))
  with check (user_id = auth.uid() and exists(select 1 from public.agent_threads t where t.id = thread_id and t.user_id = auth.uid()));
grant select, insert, update, delete on public.agent_context_cache to authenticated;

create table if not exists public.agent_session_memory (
  thread_id uuid primary key references public.agent_threads(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  through_id bigint not null,
  summary text not null check(length(summary) <= 12000),
  updated_at timestamptz not null default now()
);
alter table public.agent_session_memory enable row level security;
drop policy if exists agent_session_memory_owner on public.agent_session_memory;
create policy agent_session_memory_owner on public.agent_session_memory for all to authenticated
  using (user_id = auth.uid() and exists(select 1 from public.agent_threads t where t.id = thread_id and t.user_id = auth.uid()))
  with check (user_id = auth.uid() and exists(select 1 from public.agent_threads t where t.id = thread_id and t.user_id = auth.uid()));
grant select, insert, update, delete on public.agent_session_memory to authenticated;

create or replace function public.agent_track_summary(coords jsonb, waypoints jsonb, distance text, ascent text)
returns jsonb language sql immutable set search_path = public as $$
  with points as (
    select ord, (point->>0)::double precision as lng, (point->>1)::double precision as lat
    from jsonb_array_elements(case when jsonb_typeof(coords) = 'array' then coords else '[]'::jsonb end) with ordinality as p(point, ord)
    where jsonb_typeof(point) = 'array' and jsonb_typeof(point->0) = 'number' and jsonb_typeof(point->1) = 'number'
      and abs((point->>0)::double precision) <= 180 and abs((point->>1)::double precision) <= 90
  ), segments as (
    select *, lag(lng) over(order by ord) as prev_lng, lag(lat) over(order by ord) as prev_lat from points
  )
  select case when count(*) < 2 then null else jsonb_build_object(
    'hasTrack', true, 'distance', distance, 'ascent', ascent, 'coordinateSystem', 'WGS84',
    'totalKm', coalesce(sum(6371 * 2 * asin(sqrt(least(1.0,
      power(sin(radians(lat-prev_lat)/2),2) + cos(radians(lat))*cos(radians(prev_lat))*power(sin(radians(lng-prev_lng)/2),2))))),0),
    'start', (select jsonb_build_array(lng,lat) from points order by ord limit 1),
    'end', (select jsonb_build_array(lng,lat) from points order by ord desc limit 1),
    'waypoints', coalesce(waypoints,'[]'::jsonb)
  ) end from segments;
$$;

insert into public.agent_journey_revisions(journey_id, track_summary)
select id, public.agent_track_summary(track_coords, track_waypoints, dist, asc_) from public.journeys on conflict(journey_id) do nothing;
insert into public.agent_personal_revisions(user_id) select id from public.profiles on conflict(user_id) do nothing;

create or replace function public.agent_bump_journey_revision() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  before_data jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) else '{}'::jsonb end;
  after_data jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) else '{}'::jsonb end;
  target text;
  old_target text;
  new_target text;
  track_keys text[] := array['track_coords','track_elevation','track_duration_ms','track_waypoints','track_file_url','track_file_name','dist','asc_'];
  track_changed boolean;
begin
  if tg_op = 'UPDATE' and before_data - 'updated_at' = after_data - 'updated_at' then return new; end if;
  if tg_table_name = 'journeys' then
    -- Related-row cascade triggers can queue an AFTER UPDATE after the parent
    -- has already been deleted in the same statement. Never resurrect its state.
    if not exists(select 1 from public.journeys where id=new.id) then return new; end if;
    track_changed := tg_op = 'INSERT' or exists(select 1 from unnest(track_keys) k where before_data->k is distinct from after_data->k);
    insert into public.agent_journey_revisions(journey_id, track_summary)
      values(new.id, case when track_changed then public.agent_track_summary(new.track_coords,new.track_waypoints,new.dist,new.asc_) end)
      on conflict(journey_id) do update set
        journey = agent_journey_revisions.journey + case when before_data - track_keys - 'updated_at' is distinct from after_data - track_keys - 'updated_at' then 1 else 0 end,
        track = agent_journey_revisions.track + case when track_changed then 1 else 0 end,
        track_summary = case when track_changed then excluded.track_summary else agent_journey_revisions.track_summary end;
    return new;
  end if;
  if tg_table_name = 'journey_packing_items' then
    select journey_id into old_target from public.journey_packing_lists where id = (before_data->>'list_id')::uuid;
    select journey_id into new_target from public.journey_packing_lists where id = (after_data->>'list_id')::uuid;
  else
    old_target := before_data->>'journey_id'; new_target := after_data->>'journey_id';
  end if;
  -- Every writer (App, collaborator, restore, agent) takes the same parent lock.
  for target in select distinct id from unnest(array[old_target,new_target]) id where id is not null order by id loop
    perform 1 from public.journeys where id = target for update;
    -- The parent may already be gone during ON DELETE CASCADE. Its revision
    -- row will be cascaded too; updating it now would recheck a missing FK.
    if not found then continue; end if;
    update public.agent_journey_revisions set
      itinerary = itinerary + case when tg_table_name in ('timeline_rows','timeline_groups') then 1 else 0 end,
      packing = packing + case when tg_table_name in ('journey_packing_lists','journey_packing_items','companions') then 1 else 0 end,
      journey = journey + case when tg_table_name = 'companions' then 1 else 0 end
    where journey_id = target;
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
drop trigger if exists agent_journey_revision on public.journeys;
create trigger agent_journey_revision after insert or update on public.journeys for each row execute function public.agent_bump_journey_revision();
do $$ declare tab text; begin
  foreach tab in array array['timeline_rows','timeline_groups','journey_packing_lists','journey_packing_items','companions'] loop
    execute format('drop trigger if exists agent_revision on public.%I',tab);
    execute format('create trigger agent_revision before insert or update or delete on public.%I for each row execute function public.agent_bump_journey_revision()',tab);
  end loop;
end $$;

create or replace function public.agent_bump_personal_revision() returns trigger
language plpgsql security definer set search_path = public as $$
declare u uuid; begin
  if tg_op = 'UPDATE' and to_jsonb(old) - 'updated_at' = to_jsonb(new) - 'updated_at' then return new; end if;
  for u in select distinct id from unnest(array[
    case when tg_op <> 'INSERT' then (case when tg_table_name = 'profiles' then to_jsonb(old)->>'id' else to_jsonb(old)->>'user_id' end)::uuid end,
    case when tg_op <> 'DELETE' then (case when tg_table_name = 'profiles' then to_jsonb(new)->>'id' else to_jsonb(new)->>'user_id' end)::uuid end
  ]) id where id is not null order by id loop
    insert into public.agent_personal_revisions(user_id) select u where exists(select 1 from public.profiles where id=u)
    on conflict(user_id) do update set gear = agent_personal_revisions.gear + 1;
  end loop;
  if tg_op = 'DELETE' then return old; end if; return new;
end;
$$;
drop trigger if exists agent_profile_revision on public.profiles;
create trigger agent_profile_revision after insert or update on public.profiles for each row execute function public.agent_bump_personal_revision();
drop trigger if exists agent_gear_revision on public.gear_items;
create trigger agent_gear_revision before insert or update or delete on public.gear_items for each row execute function public.agent_bump_personal_revision();
drop trigger if exists agent_category_revision on public.gear_categories;
create trigger agent_category_revision before insert or update or delete on public.gear_categories for each row execute function public.agent_bump_personal_revision();

create or replace function public.agent_context_versions(p_journey_id text default null) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare v jsonb; g text; begin
  select gear::text into g from public.agent_personal_revisions where user_id = auth.uid();
  if p_journey_id is not null then
    select jsonb_build_object('journey',r.journey::text,'track',r.track::text,'itinerary',r.itinerary::text,'packing',r.packing::text)
      into v from public.agent_journey_revisions r join public.journeys j on j.id=r.journey_id where j.id=p_journey_id and j.deleted_at is null;
    if v is null then raise exception 'Journey unavailable'; end if;
  end if;
  return coalesce(v,'{}') || jsonb_build_object('gear',coalesce(g,'1'));
end;
$$;

create or replace function public.agent_lock_context(p_journey_id text default null) returns void
language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_journey_id is not null then
    if not public.is_journey_member(p_journey_id) then raise exception 'Journey unavailable'; end if;
    perform 1 from public.journeys where id=p_journey_id and deleted_at is null for update;
    if not found then raise exception 'Journey unavailable'; end if;
  end if;
  perform 1 from public.agent_personal_revisions where user_id=auth.uid() for update;
end $$;

create or replace function public.read_agent_journey_sections(p_journey_id text, p_sections text[]) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare result jsonb := '{}'; data jsonb; begin
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
    select coalesce(jsonb_agg(to_jsonb(t) order by sort_order,id),'[]') into data from (select id,title,day,time_mins,time_end_mins,checked,sort_order from public.timeline_rows where journey_id=p_journey_id) t;
    result := result || jsonb_build_object('itinerary',data);
    select coalesce(jsonb_agg(to_jsonb(t) order by sort_order,name),'[]') into data from (select name,sort_order,route_end_meters,route_location_name from public.timeline_groups where journey_id=p_journey_id and not deleted) t;
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
create or replace function public.read_agent_gear() returns jsonb language plpgsql security invoker set search_path=public as $$
declare items jsonb; categories jsonb; rev text; begin
  perform public.agent_lock_context();
  select gear::text into rev from public.agent_personal_revisions where user_id=auth.uid();
  select coalesce(jsonb_agg(to_jsonb(i) order by i.id),'[]') into items from (select id,name,cat_id,weight,price,qty,status,note from public.gear_items where user_id=auth.uid() order by id limit 100) i;
  select coalesce(jsonb_agg(to_jsonb(c) order by c.id),'[]') into categories from (select id,name,color from public.gear_categories where user_id=auth.uid() or user_id is null) c;
  return jsonb_build_object('version',coalesce(rev,'1'),'items',items,'categories',categories);
end $$;

revoke all on function public.agent_lock_context(text), public.agent_context_versions(text), public.read_agent_journey_sections(text,text[]), public.read_agent_gear() from public, anon;
grant execute on function public.agent_lock_context(text), public.agent_context_versions(text), public.read_agent_journey_sections(text,text[]), public.read_agent_gear() to authenticated;
commit;
