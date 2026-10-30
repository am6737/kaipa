-- route_tracks_out_of_library.sql — a journey's route track is not a 「我的轨迹」 entry.
--
-- Creating a journey from a catalog route copied the route's line into the
-- user's library so the journey could point at it through track_id (time-line
-- anchors, the agent's distances and the hero map all read that row). The copy
-- then sat in 「我的轨迹」 as if the user had saved it. Adding a track to the
-- library has to be something the user does on purpose, so:
--
--   * tracks.in_library marks a library entry. Route copies made for a journey
--     are false: the journey still points at them, the library views skip them.
--   * Only library entries count against the tracks quota, so the stock trigger
--     counts by in_library and moves the count when it flips.
--   * Existing route copies are taken out of the library, matched strictly (see
--     the backfill below).
--
-- Applied as supabase_admin: track_membership_stock and reconcile_resource_usage
-- belong to it. The insert-side changes are in the next migration, applied as
-- postgres. This one goes first so the new column is counted correctly from the
-- moment anything writes it.

begin;

alter table public.tracks
  add column if not exists in_library boolean not null default true;

-- Body copied from 20261008120000_membership_foundation.sql. Changes: rows of a
-- table with in_library count only while it is true, and an update that flips
-- it moves the stock by one. Tables without the column read as always counted.
create or replace function public.track_membership_stock()
returns trigger language plpgsql security definer set search_path = '' as $$
declare subject uuid; d bigint; lim jsonb; u public.resource_usage%rowtype; exceeded boolean := false;
  counted_old boolean; counted_new boolean;
begin
  if tg_op = 'UPDATE' then
    if new.user_id <> old.user_id then raise exception 'Resource ownership transfer requires a dedicated operation'; end if;
    counted_old := coalesce((to_jsonb(old)->>'in_library')::boolean, true);
    counted_new := coalesce((to_jsonb(new)->>'in_library')::boolean, true);
    if counted_old = counted_new then return new; end if;
    subject := new.user_id; d := case when counted_new then 1 else -1 end;
  elsif tg_op = 'DELETE' then
    if not coalesce((to_jsonb(old)->>'in_library')::boolean, true) then return old; end if;
    subject := old.user_id; d := -1;
  else
    if not coalesce((to_jsonb(new)->>'in_library')::boolean, true) then return new; end if;
    subject := new.user_id; d := 1;
  end if;
  -- Parent account deletion may already have cascaded away its usage row.
  if not exists(select 1 from public.profiles where id = subject) then
    if tg_op = 'DELETE' then return old; end if;
    raise exception 'Unknown resource owner';
  end if;
  insert into public.resource_usage(user_id,resource,period_key) values(subject,tg_table_name,'lifetime') on conflict do nothing;
  select * into strict u from public.resource_usage where user_id=subject and resource=tg_table_name and period_key='lifetime' for update;
  lim := public.membership_resource_limit(subject, tg_table_name);
  if lim is null then raise exception 'Resource policy unavailable'; end if;
  if d > 0 and d > (lim->>'enforcedLimit')::bigint-u.used-u.reserved then
    raise exception using errcode='P0001', message='quota_exceeded', detail=lim::text;
  end if;
  exceeded := d > 0 and u.used+d > (lim->>'limit')::bigint;
  update public.resource_usage set used=greatest(0,used+d), updated_at=now()
    where user_id=subject and resource=tg_table_name and period_key='lifetime';
  insert into public.resource_usage_events(user_id,resource,period_key,action,delta,policy_versions,shadow_exceeded)
    values(subject,tg_table_name,'lifetime','stock',d,lim->'policyVersions',exceeded);
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
revoke all on function public.track_membership_stock() from public, anon, authenticated;

drop trigger if exists membership_stock on public.tracks;
create trigger membership_stock after insert or delete or update of user_id, in_library on public.tracks
  for each row execute function public.track_membership_stock();

-- Body copied from 20261008140000_resource_uploads.sql; tracks count only library entries.
create or replace function public.reconcile_resource_usage()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_report jsonb;
begin
  with actual as (
    select user_id,'gear_items' as resource,count(*)::bigint as used from public.gear_items group by user_id union all
    select user_id,'gear_sets',count(*) from public.gear_sets group by user_id union all
    select user_id,'journeys',count(*) from public.journeys group by user_id union all
    select user_id,'tracks',count(*) from public.tracks where in_library group by user_id union all
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

-- Existing route copies. A row counts only when every sign of the automatic copy
-- holds and none of the user's own touches does: no uploaded file, not marked as
-- walked, never published, still private, still named after the route, its line
-- identical to the route's, and a journey on that route points at it. Anything
-- the user renamed, shared or uploaded stays in the library. On 2026-10-30 this
-- matched 18 of 71 tracks across 7 users. The update goes through the stock
-- trigger above, so each one releases its quota.
update public.tracks t
   set in_library = false
 where t.in_library
   and t.file_url is null
   and not t.own_outing
   and t.published_at is null
   and t.visibility = 'private'
   and t.file_format is not null
   and exists (
     select 1 from public.journeys j
       join public.routes r on r.id = j.route_id
      where j.track_id = t.id and r.name = t.name and r.track_coords = t.coords
   );

commit;
