-- Apply as supabase_admin (resource ticket functions are owned by supabase_admin).
-- Large files now go up as resumable uploads, which survive dropped connections
-- but can outlive the ticket's 30 minutes on a weak link. Storage refuses to
-- complete an object whose ticket has expired, so while bytes are still moving
-- the client renews the ticket here. Only large tickets renew, each renewal
-- reaches at most 30 minutes ahead, and no ticket lives past 6 hours, so a
-- leaked ticket still frees its admission slot.
begin;

create or replace function public.extend_resource_upload(p_id uuid,p_user uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.resource_upload_tickets%rowtype;
begin
  select * into t from public.resource_upload_tickets where id=p_id and actor_id=p_user for update;
  if not found or t.state<>'reserved' or t.expires_at<=now() then return jsonb_build_object('expires_at',null); end if;
  if t.max_bytes>20971520 then
    update public.resource_upload_tickets
      set expires_at=greatest(expires_at,least(created_at+interval '6 hours',now()+interval '30 minutes'))
      where id=t.id returning * into t;
    update public.resource_reservations set expires_at=greatest(expires_at,t.expires_at)
      where id=t.reservation_id and state='reserved';
  end if;
  return jsonb_build_object('expires_at',t.expires_at);
end $$;

revoke all on function public.extend_resource_upload(uuid,uuid) from public,anon,authenticated;
grant execute on function public.extend_resource_upload(uuid,uuid) to service_role;

notify pgrst,'reload schema';
commit;
