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
