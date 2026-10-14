-- Private, leased device sessions. No client table/RPC write or Realtime publication.
begin;
create table public.journey_location_sessions (
  id uuid primary key default gen_random_uuid(),
  journey_id text not null references public.journeys(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  closed boolean not null default false,
  sequence bigint not null default 0,
  longitude double precision check(longitude between -180 and 180),
  latitude double precision check(latitude between -90 and 90),
  published_at timestamptz,
  expires_at timestamptz not null default now()+interval '40 seconds'
);
create index journey_location_sessions_roster on public.journey_location_sessions(journey_id,expires_at);
alter table public.journey_location_sessions enable row level security;
revoke all on public.journey_location_sessions from public,anon,authenticated;
grant all on public.journey_location_sessions to service_role;

create function public.require_journey_location_member(p_actor uuid,p_journey text)
returns void language plpgsql security definer set search_path='' as $$
declare owner_id uuid;
begin
  -- Real Auth row as well as verified JWT; never anonymous Auth membership.
  perform 1 from auth.users where id=p_actor and not coalesce(is_anonymous,false) for share;
  if not found then raise exception using errcode='42501',message='Real account required'; end if;
  select user_id into owner_id from public.journeys where id=p_journey and deleted_at is null for share;
  if not found then raise exception using errcode='42501',message='Journey unavailable'; end if;
  if owner_id=p_actor then return; end if;
  -- Hold membership until commit: a deletion either precedes this check or
  -- waits for the accepted publish. A long-lived session never caches access.
  perform 1 from public.companions where journey_id=p_journey and user_id=p_actor for share;
  if not found then raise exception using errcode='42501',message='Journey member required'; end if;
end $$;
revoke all on function public.require_journey_location_member(uuid,text) from public,anon,authenticated,service_role;

create function public.journey_location_request(p_actor uuid,p_journey text,p_action text,p_session uuid default null,
  p_sequence bigint default null,p_longitude double precision default null,p_latitude double precision default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.journey_location_sessions%rowtype; roster jsonb;
begin
  perform public.require_journey_location_member(p_actor,p_journey);
  if p_action='open' then
    -- Bound abandoned devices and prevent unbounded session growth per actor.
    delete from public.journey_location_sessions where user_id=p_actor and expires_at<clock_timestamp()-interval '1 minute';
    perform pg_advisory_xact_lock(hashtextextended('location:'||p_actor::text,0));
    if (select count(*) from public.journey_location_sessions where user_id=p_actor and not closed and expires_at>clock_timestamp())>=8 then
      raise exception using errcode='P0001',message='concurrency_exceeded'; end if;
    insert into public.journey_location_sessions(journey_id,user_id) values(p_journey,p_actor) returning * into s;
    return jsonb_build_object('sessionId',s.id);
  elsif p_action in ('publish','close') then
    select * into s from public.journey_location_sessions where id=p_session and user_id=p_actor and journey_id=p_journey for update;
    if not found then raise exception using errcode='42501',message='Location session invalid'; end if;
    if p_action='close' then
      update public.journey_location_sessions set closed=true,longitude=null,latitude=null where id=s.id;
      return jsonb_build_object('closed',true);
    end if;
    if s.closed or s.expires_at<=clock_timestamp() then raise exception using errcode='42501',message='Location session expired'; end if;
    if p_sequence is null or p_sequence<=s.sequence or p_sequence>9007199254740991 then
      raise exception using errcode='22023',message='Invalid location sequence'; end if;
    if p_longitude is null or p_latitude is null or not(p_longitude between -180 and 180) or not(p_latitude between -90 and 90) then
      raise exception using errcode='22023',message='Invalid location coordinates'; end if;
    update public.journey_location_sessions set sequence=p_sequence,longitude=p_longitude,latitude=p_latitude,
      published_at=clock_timestamp(),expires_at=clock_timestamp()+interval '40 seconds' where id=s.id returning * into s;
    return jsonb_build_object('userId',s.user_id,'longitude',s.longitude,'latitude',s.latitude,
      'fixedAt',floor(extract(epoch from s.published_at)*1000));
  elsif p_action='snapshot' then
    -- Every snapshot is a fresh authorization boundary, including each peer.
    -- Identity/time are database-generated. No client can publish a snapshot.
    select coalesce(jsonb_agg(jsonb_build_object('userId',r.user_id,'longitude',r.longitude,'latitude',r.latitude,
      'fixedAt',floor(extract(epoch from r.published_at)*1000)) order by r.user_id),'[]'::jsonb) into roster from (
      select distinct on(l.user_id) l.* from public.journey_location_sessions l
      join auth.users u on u.id=l.user_id and not coalesce(u.is_anonymous,false)
      join public.journeys j on j.id=l.journey_id and j.deleted_at is null
      where l.journey_id=p_journey and not l.closed and l.expires_at>clock_timestamp() and l.published_at is not null
        and (j.user_id=l.user_id or exists(select 1 from public.companions c where c.journey_id=j.id and c.user_id=l.user_id))
      order by l.user_id,l.published_at desc,l.id
    ) r;
    return jsonb_build_object('peers',roster);
  end if;
  raise exception using errcode='22023',message='Invalid location action';
end $$;
revoke all on function public.journey_location_request(uuid,text,text,uuid,bigint,double precision,double precision) from public,anon,authenticated;
grant execute on function public.journey_location_request(uuid,text,text,uuid,bigint,double precision,double precision) to service_role;

-- Tombstone the removed device sessions, so rejoining cannot revive a lease.
create function public.revoke_journey_location_sessions()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='DELETE' or old.journey_id is distinct from new.journey_id or old.user_id is distinct from new.user_id then
    update public.journey_location_sessions set closed=true,longitude=null,latitude=null
      where journey_id=old.journey_id and user_id=old.user_id;
  end if;
  return old;
end $$;
revoke all on function public.revoke_journey_location_sessions() from public,anon,authenticated,service_role;
create trigger revoke_journey_location_sessions after delete or update of user_id,journey_id on public.companions
  for each row execute function public.revoke_journey_location_sessions();
create function public.close_changed_journey_locations()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.deleted_at is not null or new.user_id is distinct from old.user_id then
    update public.journey_location_sessions set closed=true,longitude=null,latitude=null where journey_id=old.id;
  end if;
  return new;
end $$;
revoke all on function public.close_changed_journey_locations() from public,anon,authenticated,service_role;
create trigger close_changed_journey_locations after update of deleted_at,user_id on public.journeys
  for each row execute function public.close_changed_journey_locations();
notify pgrst,'reload schema';
commit;
