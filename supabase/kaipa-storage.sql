-- Storage used by authenticated app uploads (journey media and covers).
insert into storage.buckets (id, name, public)
values ('kaipa', 'kaipa', true)
on conflict (id) do update set public = excluded.public;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'kaipa_auth_all'
  ) then
    create policy "kaipa_auth_all" on storage.objects for all to authenticated
      using (bucket_id = 'kaipa')
      with check (bucket_id = 'kaipa');
  end if;
end
$$;

-- AI attachments may contain private planning data. Keep them out of the
-- public journey-media bucket and restrict access to the uploading account.
insert into storage.buckets (id, name, public)
values ('kaipa-private', 'kaipa-private', false)
on conflict (id) do update set public = false;

drop policy if exists "kaipa_private_owner_insert" on storage.objects;
drop policy if exists "kaipa_private_owner_select" on storage.objects;
drop policy if exists "kaipa_private_owner_delete" on storage.objects;
create policy "kaipa_private_owner_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'kaipa-private' and owner_id = auth.uid()::text);
create policy "kaipa_private_owner_select" on storage.objects for select to authenticated
  using (bucket_id = 'kaipa-private' and owner_id = auth.uid()::text);
create policy "kaipa_private_owner_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'kaipa-private' and owner_id = auth.uid()::text);
