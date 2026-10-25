-- Apply as supabase_admin (prepare_resource_upload is owned by supabase_admin).
-- Large KMZ archives: a KMZ is big because of the photos, voice notes and video
-- packed beside its track, not because of the track. Up to 20 MB everyone keeps
-- the original; past that, the largeTrackArchive feature (members and the
-- open-access campaign) keeps the original up to 200 MB, and the client stores
-- a track-only KMZ for everyone else. GPX and KML stay at 20 MB.
begin;

-- Published policies are immutable; add the feature on new versions.
insert into public.resource_policies(version, features)
select replace(version, '-v3', '-v4'), features || '{"largeTrackArchive": true}'::jsonb
from public.resource_policies
where version in ('member-v3', 'open-v3');

insert into public.resource_policy_limits
  (policy_version, resource, period, commercial_limit, hard_limit, mode)
select replace(policy_version, '-v3', '-v4'), resource, period, commercial_limit, hard_limit, mode
from public.resource_policy_limits
where policy_version in ('member-v3', 'open-v3');

update public.resource_policies set published_at=now()
where version in ('member-v4', 'open-v4');

update public.membership_runtime
set member_policy='member-v4', updated_at=now()
where member_policy='member-v3';

update public.operation_campaigns set policy_version='open-v4'
where id='initial-open-access' and policy_version='open-v3';

create or replace function public.prepare_resource_upload(p_user uuid,p_purpose text,p_scope text,p_bytes bigint,p_mime text,p_guest_token text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare bucket text; suffix text; subject uuid:=p_user; session_id uuid; reservation jsonb; ticket public.resource_upload_tickets%rowtype; max_size bigint; ttl interval; reserve_seconds integer;
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
      -- Members (and the open-access campaign) keep a full KMZ up to 200 MB,
      -- photos and voice notes included; everyone else stores up to 20 MB.
      when 'track' then bucket:='kaipa';max_size:=case when p_mime='application/vnd.google-earth.kmz' and exists(
        select 1 from public.resource_policies p where p.version=any(public.membership_policy_versions(p_user))
          and coalesce((p.features->>'largeTrackArchive')::boolean,false)) then 209715200 else 20971520 end;
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

notify pgrst,'reload schema';
commit;
