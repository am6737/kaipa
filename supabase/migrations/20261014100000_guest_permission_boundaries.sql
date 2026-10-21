-- One boundary for established guest sessions and already issued upload tickets.
-- Internal only: guest APIs retain their existing token/request format.
begin;
create function public.require_resource_guest(p_token text default null,p_scope text default null,p_session uuid default null)
returns public.resource_guest_sessions language plpgsql security definer set search_path='' as $$
declare gs public.resource_guest_sessions%rowtype;
begin
  select g.* into gs from public.resource_guest_sessions g
    join public.journey_shares s on s.id=g.share_id
    join public.journeys j on j.id=s.journey_id
    where (case when p_session is not null then g.id=p_session else
      g.token_hash=encode(sha256(convert_to(coalesce(p_token,''),'UTF8')),'hex') end)
      and (p_scope is null or s.id=p_scope)
      and g.expires_at>clock_timestamp() and s.active and s.expires_at>clock_timestamp()
      and j.deleted_at is null and j.invite_enabled
    for share of g,s,j;
  -- Recheck wall-clock expiry after any lock wait, not transaction-start time.
  if gs.id is null or gs.expires_at<=clock_timestamp() or not exists(
    select 1 from public.journey_shares where id=gs.share_id and expires_at>clock_timestamp()) then raise exception using message='guest_session_invalid',errcode='42501'; end if;
  return gs;
end $$;
revoke all on function public.require_resource_guest(text,text,uuid) from public,anon,authenticated,service_role;

create or replace function public.resource_guest_snapshot(p_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare gs public.resource_guest_sessions%rowtype; share public.journey_shares%rowtype; j public.journeys%rowtype; host jsonb;
begin
  gs:=public.require_resource_guest(p_token);
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

create or replace function public.prepare_resource_upload(p_user uuid,p_purpose text,p_scope text,p_bytes bigint,p_mime text,p_guest_token text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare bucket text; suffix text; subject uuid:=p_user; session_id uuid; reservation jsonb; ticket public.resource_upload_tickets%rowtype; max_size bigint; ttl interval; reserve_seconds integer; valid_guest public.resource_guest_sessions%rowtype;
begin
  if p_bytes is null or p_bytes<=0 or p_scope is null or length(p_scope)>200 then raise exception 'Invalid upload'; end if;
  if p_purpose='guest' then
    valid_guest:=public.require_resource_guest(p_guest_token,p_scope);
    session_id:=valid_guest.id;
    select user_id into strict subject from public.journey_shares where id=valid_guest.share_id;
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
  -- ~4x the wall time a 2 Mbps link needs, floored at 2 minutes and capped at
  -- 30 so a leaked ticket stops holding an admission slot for long.
  ttl:=least(interval '30 minutes',greatest(interval '2 minutes',(p_bytes/262144.0)*interval '1 second'*4));
  reserve_seconds:=ceil(extract(epoch from ttl))::integer;
  perform pg_advisory_xact_lock(hashtextextended('upload-admission:'||subject::text,0));
  if (select count(*) from public.resource_upload_tickets where user_id=subject and state='reserved' and expires_at>now())>=8 then
    raise exception using message='concurrency_exceeded',errcode='P0001'; end if;
  ticket.id:=gen_random_uuid();
  reservation:=public.reserve_resource(subject,'storage_bytes','upload:'||ticket.id::text,p_bytes,reserve_seconds);
  perform public.reserve_service_budget('upload_requests',subject::text||':'||to_char(now() at time zone 'UTC','YYYY-MM-DD'),1);
  perform public.reserve_service_budget('upload_bytes',subject::text||':'||to_char(now() at time zone 'UTC','YYYY-MM-DD'),p_bytes);
  insert into public.resource_upload_tickets(id,actor_id,user_id,guest_session_id,reservation_id,bucket,path,purpose,mime_type,max_bytes,expires_at)
    values(ticket.id,p_user,subject,session_id,(reservation->>'id')::uuid,bucket,
      (case p_purpose when 'attachment' then 'assistant' when 'track' then 'tracks' when 'media' then 'moments' when 'avatar' then 'avatars' when 'cover' then 'covers' else p_purpose end)||'/'||subject::text||'/'||ticket.id::text||'.'||suffix,p_purpose,p_mime,p_bytes,now()+ttl) returning * into ticket;
  return to_jsonb(ticket)-'user_id'-'reservation_id'-'actor_id';
end $$;

create or replace function public.account_storage_object()
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
      if t.guest_session_id is not null then perform public.require_resource_guest(p_session=>t.guest_session_id); end if;
      if t.state<>'reserved' or t.expires_at<=clock_timestamp() then raise exception using errcode='42501',message='Upload ticket expired or consumed'; end if;
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

notify pgrst,'reload schema';
commit;
