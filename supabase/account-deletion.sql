-- Allow deleting an account that created a public route. The route remains in
-- the shared catalog, but no longer points at the deleted profile.
alter table routes drop constraint if exists routes_created_by_fkey;
alter table routes
  add constraint routes_created_by_fkey
  foreign key (created_by) references profiles(id) on delete set null;

-- The Edge Function uses these paths to remove the physical Storage objects
-- before deleting Auth and profile rows. Only the service role may enumerate
-- another user's objects.
create or replace function public.account_storage_paths(account_id uuid)
returns table(path text)
language sql
security definer
set search_path = ''
as $$
  select objects.name
  from storage.objects
  where objects.bucket_id = 'kaipa'
    and (objects.owner_id = account_id::text or objects.owner = account_id);
$$;

revoke all on function public.account_storage_paths(uuid) from public, anon, authenticated;
grant execute on function public.account_storage_paths(uuid) to service_role;
