-- Apply as supabase_admin (reads storage.objects).
-- The storage sweeper (infra/supabase/storage-sweeper.mjs) removes resumable
-- upload leftovers from the file backend. A finished resumable upload's data
-- file is the stored object itself, so before deleting data the sweeper asks
-- which of its candidates are live objects; those keep their data.
begin;

create or replace function public.storage_objects_present(p_objects jsonb)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('bucket',o.bucket_id,'name',o.name,'version',o.version)),'[]'::jsonb)
  from jsonb_to_recordset(coalesce(p_objects,'[]'::jsonb)) as x(bucket text,name text,version text)
  join storage.objects o on o.bucket_id=x.bucket and o.name=x.name and o.version=x.version;
$$;

revoke all on function public.storage_objects_present(jsonb) from public,anon,authenticated;
grant execute on function public.storage_objects_present(jsonb) to service_role;

notify pgrst,'reload schema';
commit;
