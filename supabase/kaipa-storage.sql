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
