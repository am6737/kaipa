-- Apply as supabase_admin (owner of account_storage_object).
-- Lets the media scrubber (infra/supabase/media-scrubber.mjs) rewrite an
-- existing object in place with the service role. Uploads by clients still
-- need a reserved ticket; this only exempts service-role updates of an object
-- that already exists at the same bucket/path, and keeps its original ticket.
begin;

CREATE OR REPLACE FUNCTION public.account_storage_object()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    if tg_op='UPDATE' and new.name=old.name and new.bucket_id=old.bucket_id and auth.role()='service_role' then
      -- A server job rewriting an existing object in place (the media scrubber
      -- removing location metadata). Its ticket was spent by the original
      -- upload; only the size difference is accounted, to the file's owner.
      t:=null;
    elsif new.bucket_id in ('kaipa','kaipa-gear','kaipa-private','shared-moments') and t.id is null then
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
    on conflict(bucket,path) do update set bytes=excluded.bytes,user_id=excluded.user_id,
      -- Keep the original ticket on in-place rewrites: orphan cleanup dates files by it.
      ticket_id=coalesce(excluded.ticket_id,public.resource_file_accounts.ticket_id);
  return new;
end $function$;

notify pgrst, 'reload schema';
commit;
