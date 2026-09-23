-- Keep the in-app notification center in sync across signed-in devices.
-- Guarded because `replica identity full` takes ACCESS EXCLUSIVE; re-applying this
-- file must not freeze writes to notifications for nothing.
do $$
begin
  if exists (
    select 1 from pg_class
    where relnamespace = 'public'::regnamespace
      and relname = 'notifications'
      and relreplident <> 'f'
  ) then
    alter table public.notifications replica identity full;
  end if;
end;
$$;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'notifications'
    ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;
