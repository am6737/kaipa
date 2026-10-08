-- Apply as supabase_admin: Storage tables are owned by supabase_storage_admin.
begin;
create table public.resource_guest_sessions (
  id uuid primary key default gen_random_uuid(),
  share_id text not null references public.journey_shares(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null default now()+interval '90 days'
);
create table public.resource_upload_tickets (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  guest_session_id uuid references public.resource_guest_sessions(id) on delete cascade,
  reservation_id uuid not null references public.resource_reservations(id) on delete cascade,
  bucket text not null,
  path text not null,
  purpose text not null,
  mime_type text not null,
  max_bytes bigint not null check(max_bytes>0),
  expires_at timestamptz not null default now()+interval '10 minutes',
  state text not null default 'reserved' check(state in ('reserved','completed','cancelled')),
  created_at timestamptz not null default now(),
  unique(bucket,path)
);
create table public.resource_file_accounts (
  bucket text not null,
  path text not null,
  user_id uuid references public.profiles(id) on delete cascade,
  bytes bigint not null check(bytes>=0),
  ticket_id uuid references public.resource_upload_tickets(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key(bucket,path)
);
create index resource_file_accounts_user on public.resource_file_accounts(user_id);
do $$ declare t text; begin
  foreach t in array array['resource_guest_sessions','resource_upload_tickets','resource_file_accounts'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant all on public.%I to service_role',t);
  end loop;
end $$;
alter table public.shared_moments add column guest_session_id uuid references public.resource_guest_sessions(id) on delete set null;
alter table public.shared_moments add column request_key text;
create unique index shared_moments_request on public.shared_moments(guest_session_id,request_key) where request_key is not null;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('kaipa-gear','kaipa-gear',true,2097152,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
update storage.buckets set file_size_limit=209715200 where id='kaipa';
update storage.buckets set file_size_limit=20971520 where id='kaipa-private';
update storage.buckets set file_size_limit=26214400,allowed_mime_types=array['image/jpeg','image/png','image/webp'] where id='shared-moments';
insert into public.service_budgets(service,daily_units,per_run_units) values
  ('stored_bytes',21474836480,2147483648),('stored_objects',500000,50000),('guest_requests',10000,1000);

-- Backfill based on server metadata, not photo URL arrays. Unknown platform
-- files still count toward global capacity but cannot be charged to strangers.
lock table storage.objects in share row exclusive mode;
do $$ begin
  if exists(select 1 from storage.objects where metadata->>'size' is null or not(metadata->>'size' ~ '^[0-9]+$')) then
    raise exception 'Storage metadata contains unknown sizes; reconcile physical objects before quota installation';
  end if;
end $$;
insert into public.resource_file_accounts(bucket,path,user_id,bytes)
select o.bucket_id,o.name,coalesce(
  (select p.id from public.profiles p where p.id::text=coalesce(o.owner_id,o.owner::text) limit 1),
  (select p.id from public.profiles p where p.id::text=split_part(o.name,'/',2) and split_part(o.name,'/',1) in ('moments','tracks','assistant','avatars','gear','media','attachment','avatar','cover') limit 1),
  (select j.user_id from public.journeys j where o.name='covers/'||j.id||'.jpg' limit 1),
  (select s.user_id from public.journey_shares s where o.bucket_id='shared-moments' and s.id=split_part(o.name,'/',1) limit 1)
),case when o.metadata->>'size' ~ '^[0-9]+$' then (o.metadata->>'size')::bigint else 0 end
from storage.objects o;
insert into public.resource_usage(user_id,resource,period_key,used)
select user_id,'storage_bytes','lifetime',sum(bytes) from public.resource_file_accounts where user_id is not null group by user_id
on conflict(user_id,resource,period_key) do update set used=excluded.used;
insert into public.resource_usage(user_id,resource,period_key,used) select user_id,'file_objects','lifetime',count(*) from public.resource_file_accounts where user_id is not null group by user_id;
insert into public.service_budget_usage(service,day,used)
select 'stored_bytes','2000-01-01'::date,coalesce(sum(bytes),0) from public.resource_file_accounts;
insert into public.service_budget_usage(service,day,used) select 'stored_objects','2000-01-01',count(*) from public.resource_file_accounts;

create function public.prepare_resource_upload(p_user uuid,p_purpose text,p_scope text,p_bytes bigint,p_mime text,p_guest_token text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare bucket text; suffix text; subject uuid:=p_user; session_id uuid; reservation jsonb; ticket public.resource_upload_tickets%rowtype; max_size bigint;
begin
  if p_bytes is null or p_bytes<=0 or p_scope is null or length(p_scope)>200 then raise exception 'Invalid upload'; end if;
  if p_purpose='guest' then
    select gs.id,s.user_id into session_id,subject from public.resource_guest_sessions gs
      join public.journey_shares s on s.id=gs.share_id join public.journeys j on j.id=s.journey_id
      where gs.token_hash=encode(sha256(convert_to(coalesce(p_guest_token,''),'UTF8')),'hex') and gs.expires_at>now()
        and s.id=p_scope and s.active and j.deleted_at is null;
    if subject is null then raise exception using message='guest_session_invalid',errcode='42501'; end if;
    perform pg_advisory_xact_lock(hashtextextended('guest-share:'||p_scope,0));
    bucket:='shared-moments'; max_size:=26214400;
    if (select coalesce(sum(max_bytes),0) from public.resource_upload_tickets where guest_session_id=session_id and created_at>now()-interval '1 day')+p_bytes>104857600 then
      raise exception using message='quota_exceeded',errcode='P0001'; end if;
    if (select coalesce(sum(t.max_bytes),0) from public.resource_upload_tickets t join public.resource_guest_sessions gs on gs.id=t.guest_session_id
      where gs.share_id=p_scope and t.created_at>now()-interval '1 day')+p_bytes>524288000 then raise exception using message='quota_exceeded',errcode='P0001'; end if;
  else
    if p_user is null then raise exception using errcode='42501',message='Authentication required'; end if;
    case p_purpose
      when 'gear' then bucket:='kaipa-gear';max_size:=2097152;
      when 'attachment' then bucket:='kaipa-private';max_size:=15728640;
      when 'track' then bucket:='kaipa';max_size:=20971520;
      when 'media' then bucket:='kaipa';max_size:=case when p_mime like 'video/%' then 209715200 else 26214400 end;
      when 'avatar' then bucket:='kaipa';max_size:=2097152;
      when 'cover' then
        if not exists(select 1 from public.journeys where id=p_scope and user_id=p_user and deleted_at is null) then raise exception using errcode='42501',message='Journey owner required'; end if;
        bucket:='kaipa';max_size:=26214400;
      else raise exception 'Unknown upload purpose';
    end case;
  end if;
  if p_bytes>max_size then raise exception using message='file_too_large',errcode='22023'; end if;
  if (p_purpose in ('gear','guest','avatar','cover') and p_mime not in ('image/jpeg','image/png','image/webp'))
    or p_mime not in ('image/jpeg','image/png','image/webp','image/heic','image/heif','image/gif','video/mp4','video/quicktime','video/x-m4v',
      'application/gpx+xml','application/vnd.google-earth.kml+xml','application/vnd.google-earth.kmz','application/octet-stream','application/pdf','text/plain') then raise exception 'Unsupported content type'; end if;
  suffix:=case p_mime when 'image/png' then 'png' when 'image/webp' then 'webp' when 'image/jpeg' then 'jpg' when 'application/vnd.google-earth.kmz' then 'kmz'
    when 'application/gpx+xml' then 'gpx' when 'application/vnd.google-earth.kml+xml' then 'kml' when 'video/mp4' then 'mp4' else 'bin' end;
  perform pg_advisory_xact_lock(hashtextextended('upload-admission:'||subject::text,0));
  if (select count(*) from public.resource_upload_tickets where user_id=subject and state='reserved' and expires_at>now())>=4 then
    raise exception using message='concurrency_exceeded',errcode='P0001'; end if;
  ticket.id:=gen_random_uuid();
  reservation:=public.reserve_resource(subject,'storage_bytes','upload:'||ticket.id::text,p_bytes,600);
  perform public.reserve_service_budget('upload_requests',subject::text||':'||to_char(now() at time zone 'UTC','YYYY-MM-DD'),1);
  perform public.reserve_service_budget('upload_bytes',subject::text||':'||to_char(now() at time zone 'UTC','YYYY-MM-DD'),p_bytes);
  insert into public.resource_upload_tickets(id,actor_id,user_id,guest_session_id,reservation_id,bucket,path,purpose,mime_type,max_bytes)
    values(ticket.id,p_user,subject,session_id,(reservation->>'id')::uuid,bucket,
      (case p_purpose when 'attachment' then 'assistant' when 'track' then 'tracks' when 'media' then 'moments' when 'avatar' then 'avatars' when 'cover' then 'covers' else p_purpose end)||'/'||subject::text||'/'||ticket.id::text||'.'||suffix,p_purpose,p_mime,p_bytes) returning * into ticket;
  return to_jsonb(ticket)-'user_id'-'reservation_id'-'actor_id';
end $$;

create function public.can_upload_resource(p_bucket text,p_path text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.resource_upload_tickets t where t.bucket=p_bucket and t.path=p_path
    and t.actor_id=auth.uid() and t.state='reserved' and t.expires_at>now());
$$;
create function public.can_delete_resource(p_bucket text,p_path text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.resource_file_accounts f where f.bucket=p_bucket and f.path=p_path and f.user_id=auth.uid());
$$;
-- Replace every broad policy for these buckets; SELECT stays available for
-- public assets and for a user's own private attachments.
drop policy if exists kaipa_auth_all on storage.objects;
drop policy if exists kaipa_private_owner_insert on storage.objects;
drop policy if exists kaipa_private_owner_delete on storage.objects;
drop policy if exists shared_moments_anon_insert on storage.objects;
drop policy if exists shared_moments_auth_all on storage.objects;
create policy resource_ticket_insert on storage.objects for insert to authenticated
  with check(public.can_upload_resource(bucket_id,name));
create policy resource_owner_delete on storage.objects for delete to authenticated
  using(public.can_delete_resource(bucket_id,name));
create policy resource_public_select on storage.objects for select to authenticated
  using(bucket_id in ('kaipa','kaipa-gear','shared-moments'));

-- Storage permission preflight is rolled back. Actual completion is made by
-- Storage as its DB superuser and includes trusted measured size/mimetype.
create function public.account_storage_object()
returns trigger language plpgsql security definer set search_path='' as $$
declare t public.resource_upload_tickets%rowtype; f public.resource_file_accounts%rowtype;
  size bigint; delta bigint; cap bigint; total bigint; subject uuid; lim jsonb; budget_enabled boolean; object_delta bigint; object_cap bigint; object_total bigint; object_enabled boolean; user_object_cap bigint; user_objects bigint;
begin
  if tg_op='DELETE' then
    select * into f from public.resource_file_accounts where bucket=old.bucket_id and path=old.name for update;
    if not found then
      -- Account deletion normally removes files first. If a privileged caller
      -- deleted Auth directly, metadata still carries the measured global size.
      f.bytes:=case when old.metadata->>'size' ~ '^[0-9]+$' then (old.metadata->>'size')::bigint else 0 end;
      f.user_id:=null;
    end if;
    delta:=-f.bytes; subject:=f.user_id;
  else
    if tg_op='UPDATE' and new.name=old.name and new.bucket_id=old.bucket_id and new.metadata is not distinct from old.metadata then return new; end if;
    select * into t from public.resource_upload_tickets where bucket=new.bucket_id and path=new.name for update;
    if new.bucket_id in ('kaipa','kaipa-gear','kaipa-private','shared-moments') and t.id is null then
      -- A legacy object's harmless metadata/access-time update is allowed.
      if tg_op='UPDATE' and new.name=old.name and new.bucket_id=old.bucket_id and new.metadata is not distinct from old.metadata then return new; end if;
      raise exception using errcode='42501',message='Upload ticket required';
    end if;
    if t.id is not null then
      if t.state<>'reserved' or t.expires_at<=now() then raise exception 'Upload ticket expired or consumed'; end if;
      if new.owner_id is not null and t.actor_id is not null and new.owner_id<>t.actor_id::text then raise exception using errcode='42501',message='Upload owner mismatch'; end if;
    end if;
    -- Permission test has no measured metadata; do not spend its reservation.
    if new.metadata is null or new.metadata->>'size' is null then return new; end if;
    if not (new.metadata->>'size' ~ '^[0-9]+$') then raise exception 'Invalid measured size'; end if;
    size:=(new.metadata->>'size')::bigint;
    if t.id is not null and (size>t.max_bytes or new.metadata->>'mimetype' is distinct from t.mime_type) then raise exception using errcode='22023',message='Upload exceeds ticket'; end if;
    select * into f from public.resource_file_accounts where bucket=new.bucket_id and path=new.name for update;
    delta:=size-coalesce(f.bytes,0);subject:=coalesce(t.user_id,f.user_id);
  end if;
  select daily_units,enabled into strict cap,budget_enabled from public.service_budgets where service='stored_bytes';
  select used into strict total from public.service_budget_usage where service='stored_bytes' and day='2000-01-01' for update;
  if delta>0 and (not budget_enabled or delta>cap-total) then raise exception using message='service_budget_exceeded',errcode='P0001'; end if;
  object_delta:=case when tg_op='DELETE' then -1 when f.path is null then 1 else 0 end;
  select daily_units,per_run_units,enabled into strict object_cap,user_object_cap,object_enabled from public.service_budgets where service='stored_objects';
  select used into strict object_total from public.service_budget_usage where service='stored_objects' and day='2000-01-01' for update;
  if object_delta>0 and (not object_enabled or object_total>=object_cap) then raise exception using message='service_budget_exceeded',errcode='P0001'; end if;
  if subject is not null then
    insert into public.resource_usage(user_id,resource,period_key) values(subject,'file_objects','lifetime') on conflict do nothing;
    select used into strict user_objects from public.resource_usage where user_id=subject and resource='file_objects' and period_key='lifetime' for update;
    if object_delta>0 and user_objects>=user_object_cap then raise exception using message='quota_exceeded',errcode='P0001'; end if;
    update public.resource_usage set used=greatest(0,used+object_delta),updated_at=now() where user_id=subject and resource='file_objects' and period_key='lifetime';
  end if;
  update public.service_budget_usage set used=greatest(0,used+object_delta) where service='stored_objects' and day='2000-01-01';
  update public.service_budget_usage set used=greatest(0,used+delta) where service='stored_bytes'  and day='2000-01-01';
  if tg_op='DELETE' then
    if subject is not null then
      update public.resource_usage set used=greatest(0,used+delta),updated_at=now() where user_id=subject and resource='storage_bytes' and period_key='lifetime';
    end if;
    delete from public.resource_file_accounts where bucket=old.bucket_id and path=old.name;
    return old;
  end if;
  if t.id is not null then
    perform public.finish_resource_reservation(t.reservation_id,size);
    update public.resource_upload_tickets set state='completed' where id=t.id;
  elsif subject is not null and delta<>0 then
    -- All new writes in protected buckets require tickets. This branch only
    -- accounts for legacy/unprotected platform objects with a known owner.
    lim:=public.membership_resource_limit(subject,'storage_bytes');
    update public.resource_usage set used=greatest(0,used+delta),updated_at=now() where user_id=subject and resource='storage_bytes' and period_key='lifetime';
  end if;
  insert into public.resource_file_accounts(bucket,path,user_id,bytes,ticket_id) values(new.bucket_id,new.name,subject,size,t.id)
    on conflict(bucket,path) do update set bytes=excluded.bytes,user_id=excluded.user_id,ticket_id=excluded.ticket_id;
  return new;
end $$;
create trigger account_storage_object after insert or update or delete on storage.objects for each row execute function public.account_storage_object();

create function public.cancel_resource_upload(p_id uuid,p_user uuid)
returns void language plpgsql security definer set search_path='' as $$
declare t public.resource_upload_tickets%rowtype;
begin
  select * into strict t from public.resource_upload_tickets where id=p_id and (actor_id=p_user or p_user is null) for update;
  if t.state<>'reserved' then return; end if;
  if exists(select 1 from public.resource_file_accounts where bucket=t.bucket and path=t.path) then return; end if;
  -- Any in-flight completion now fails and Storage schedules physical cleanup.
  update public.resource_upload_tickets set state='cancelled' where id=t.id;
  perform public.finish_resource_reservation(t.reservation_id,0,true);
end $$;

-- Guest writes are scoped to a high-entropy session, never a nickname.
drop policy if exists moments_anon_insert on public.shared_moments;
drop policy if exists moments_anon_delete on public.shared_moments;
drop policy if exists shares_anon_select on public.journey_shares;
drop policy if exists journeys_anon_via_share on public.journeys;
drop policy if exists companions_anon_via_share on public.companions;
drop policy if exists profiles_anon_via_share on public.profiles;
drop policy if exists inspo_anon_via_share on public.inspo_media;
drop policy if exists moments_anon_select on public.shared_moments;

create function public.open_resource_guest_session(p_slug text,p_code text,p_token text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare share public.journey_shares%rowtype; token text:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''); v_id uuid;
begin
  select s.* into strict share from public.journey_shares s join public.journeys j on j.id=s.journey_id
    where s.slug=p_slug and s.code=p_code and s.active and j.deleted_at is null;
  if p_token is not null then
    update public.resource_guest_sessions set expires_at=now()+interval '90 days' where share_id=share.id and token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') returning id into v_id;
    if found then return jsonb_build_object('sessionId',v_id,'token',p_token,'shareId',share.id); end if;
  end if;
  insert into public.resource_guest_sessions(share_id,token_hash) values(share.id,encode(sha256(convert_to(token,'UTF8')),'hex')) returning id into v_id;
  return jsonb_build_object('sessionId',v_id,'token',token,'shareId',share.id);
end $$;
create function public.resource_guest_snapshot(p_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare gs public.resource_guest_sessions%rowtype; share public.journey_shares%rowtype; j public.journeys%rowtype; host jsonb;
begin
  select * into strict gs from public.resource_guest_sessions where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and expires_at>now();
  select * into strict share from public.journey_shares where id=gs.share_id and active;
  select * into strict j from public.journeys where id=share.journey_id and deleted_at is null;
  select jsonb_build_object('display_name',coalesce(nullif(nick,''),display_name),'avatar_ini',avatar_ini,'avatar_color',avatar_color) into host from public.profiles where id=share.user_id;
  return jsonb_build_object('sessionId',gs.id,'share',jsonb_build_object('id',share.id,'journey_id',j.id,'user_id',share.user_id),
    'journey',jsonb_build_object('name',j.name,'region',j.region,'tone',j.tone,'date',j.date,'days',j.days,'total_days',j.total_days,'coverUrl',j.photo_uris->>0),
    'host',host,
    'companions',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'ini',c.ini,'name',c.name,'color',c.color,'tone',c.tone,'is_host',c.is_host,'is_self',c.is_self) order by c.sort_order),'[]') from public.companions c where journey_id=j.id),
    'moments',(select coalesce(jsonb_agg(m order by m.created_at desc),'[]') from public.shared_moments m where share_id=share.id),
    'media',(select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'uri',i.uri,'kind',i.kind,'thumbnail',i.thumbnail,'paired_video_uri',i.paired_video_uri,'created_at',i.created_at) order by i.created_at),'[]') from public.inspo_media i where journey_id=j.id));
end $$;
create function public.write_resource_guest_moment(p_token text,p_request text,p_moment jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare snap jsonb; session_id uuid; t public.resource_upload_tickets%rowtype; m public.shared_moments%rowtype; uri text:=coalesce(p_moment->>'uri','');
begin
  snap:=public.resource_guest_snapshot(p_token); session_id:=(snap->>'sessionId')::uuid;
  if p_request is null or length(p_request) not between 1 and 100 or octet_length(p_moment::text)>16384 then raise exception 'Invalid guest content'; end if;
  if uri<>'' then
    select * into t from public.resource_upload_tickets where guest_session_id=session_id and state='completed'
      and uri like '%/storage/v1/object/public/'||bucket||'/'||path;
    if t.id is null then raise exception using errcode='42501',message='Guest photo ownership mismatch'; end if;
  end if;
  insert into public.shared_moments(share_id,journey_id,guest_session_id,request_key,guest_name,guest_ini,guest_tone,uri,caption,day,is_text)
  values(snap->'share'->>'id',snap->'share'->>'journey_id',session_id,p_request,
    left(coalesce(p_moment->>'guest_name','伙伴'),32),left(coalesce(p_moment->>'guest_ini',''),4),left(coalesce(p_moment->>'guest_tone','river'),32),
    uri,left(coalesce(p_moment->>'caption',''),2000),greatest(1,least(365,coalesce((p_moment->>'day')::integer,1))),coalesce((p_moment->>'is_text')::boolean,false))
  on conflict(guest_session_id,request_key) where request_key is not null do update set request_key=excluded.request_key returning * into m;
  return to_jsonb(m);
end $$;
create function public.delete_resource_guest_moment(p_token text,p_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare snap jsonb; uri text;
begin
  snap:=public.resource_guest_snapshot(p_token);
  delete from public.shared_moments where id=p_id and guest_session_id=(snap->>'sessionId')::uuid returning shared_moments.uri into uri;
  if not found then raise exception using errcode='42501',message='Guest cannot delete another session content'; end if;
  return jsonb_build_object('uri',uri);
end $$;

-- Observe drift without deleting data or guessing at unknown byte counts.
-- This function runs from one MVCC snapshot; concurrent legitimate writes do
-- not create false discrepancies between table counts and their ledger rows.
create function public.reconcile_resource_usage()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_report jsonb;
begin
  with actual as (
    select user_id,'gear_items' as resource,count(*)::bigint as used from public.gear_items group by user_id union all
    select user_id,'gear_sets',count(*) from public.gear_sets group by user_id union all
    select user_id,'journeys',count(*) from public.journeys group by user_id union all
    select user_id,'tracks',count(*) from public.tracks group by user_id union all
    select user_id,'file_objects',count(*) from public.resource_file_accounts where user_id is not null group by user_id union all
    select user_id,'storage_bytes',sum(bytes)::bigint from public.resource_file_accounts where user_id is not null group by user_id
  ), discrepancies as (
    select coalesce(a.user_id,u.user_id) as user_id,coalesce(a.resource,u.resource) as resource,
      coalesce(a.used,0) as actual,coalesce(u.used,0) as ledger
    from actual a full join (select * from public.resource_usage where period_key='lifetime') u on a.user_id=u.user_id and a.resource=u.resource
    where coalesce(a.used,0)<>coalesce(u.used,0)
  ) select jsonb_build_object('usageMismatchCount',(select count(*) from discrepancies),
    'usageSamples',(select coalesce(jsonb_agg(d),'[]') from (select * from discrepancies limit 100) d),
    'fileMismatchCount',(select count(*) from storage.objects o full join public.resource_file_accounts f on o.bucket_id=f.bucket and o.name=f.path
      where o.id is null or f.path is null or o.metadata->>'size' is null or o.metadata->>'size' !~ '^[0-9]+$' or (case when o.metadata->>'size' ~ '^[0-9]+$' then (o.metadata->>'size')::numeric end)<>f.bytes),
    'reservedMismatchCount',(select count(*) from public.resource_usage u where u.reserved<>coalesce((select sum(r.amount) from public.resource_reservations r where r.user_id=u.user_id and r.resource=u.resource and r.period_key=u.period_key and r.state='reserved'),0)),
    'globalObjectsMismatch',coalesce((select used from public.service_budget_usage where service='stored_objects' and day='2000-01-01'),0)<>(select count(*) from public.resource_file_accounts),
    'globalStoredMismatch',coalesce((select used from public.service_budget_usage where service='stored_bytes' and day='2000-01-01'),0)<>(select coalesce(sum(bytes),0) from public.resource_file_accounts)) into v_report;
  update public.resource_maintenance_state set checked_at=now(),report=v_report where id=true;
  return v_report;
end $$;
revoke all on function public.reconcile_resource_usage() from public,anon,authenticated;
grant execute on function public.reconcile_resource_usage() to service_role;

create function public.resource_maintenance_candidates()
returns jsonb language plpgsql security definer set search_path='' as $$
declare expired_entry record;
begin
  for expired_entry in select id from public.resource_upload_tickets where state='reserved' and expires_at<now() limit 100 loop
    perform public.cancel_resource_upload(expired_entry.id,null);
  end loop;
  for expired_entry in select id from public.resource_reservations where resource in ('gear_recognition','gear_cutouts') and state='reserved' and expires_at<now()-interval '1 hour' limit 100 loop
    perform public.finish_resource_reservation(expired_entry.id,0,true);
  end loop;
  delete from public.resource_admission_events where created_at<now()-interval '180 days';
  delete from public.resource_usage_events where created_at<now()-interval '180 days';
  delete from public.qr_login_requests where expires_at<now()-interval '1 day';
  delete from public.resource_rate_windows where window_start<now()-interval '2 days';
  -- Old unassociated media is cleaned through the Storage API, not by SQL
  -- deleting its metadata. References protect historical versions as well.
  return (select coalesce(jsonb_agg(jsonb_build_object('bucket',f.bucket,'path',f.path)),'[]') from (
    select a.* from public.resource_file_accounts a join public.resource_upload_tickets t on t.id=a.ticket_id
    where t.created_at<now()-interval '7 days' and t.purpose not in ('attachment','track')
      and not exists(select 1 from public.gear_items g where g.photo_uris::text like '%'||a.path||'%')
      and not exists(select 1 from public.journeys j where j.photo_uris::text like '%'||a.path||'%')
      and not exists(select 1 from public.profiles p where p.avatar_url like '%'||a.path||'%')
      and not exists(select 1 from public.inspo_media i where i.uri like '%'||a.path||'%' or i.thumbnail like '%'||a.path||'%' or i.paired_video_uri like '%'||a.path||'%')
      and not exists(select 1 from public.shared_moments m where m.uri like '%'||a.path||'%')
      and not exists(select 1 from public.journey_versions v where v.snapshot::text like '%'||a.path||'%') limit 100
  ) f);
end $$;
create function public.resource_account_files(p_user uuid)
returns table(bucket text,path text) language sql security definer set search_path='' as $$
  select f.bucket,f.path from public.resource_file_accounts f where f.user_id=p_user;
$$;

do $$ declare r record; begin
  for r in select p.oid::regprocedure f from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
    and p.proname in ('prepare_resource_upload','can_upload_resource','can_delete_resource','account_storage_object','cancel_resource_upload',
      'open_resource_guest_session','resource_guest_snapshot','write_resource_guest_moment','delete_resource_guest_moment','resource_maintenance_candidates','resource_account_files') loop
    execute format('revoke all on function %s from public,anon,authenticated',r.f);
    execute format('grant execute on function %s to service_role',r.f);
  end loop;
end $$;
grant execute on function public.can_upload_resource(text,text),public.can_delete_resource(text,text) to authenticated;
notify pgrst,'reload schema';
commit;
