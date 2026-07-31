-- Persist itinerary group names, including empty groups and deleted defaults.
create table if not exists timeline_groups (
  id         text primary key default 'tg_' || gen_random_uuid()::text,
  journey_id text not null references journeys(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  name       text not null,
  deleted    boolean not null default false,
  sort_order int4 not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (journey_id, name)
);

alter table timeline_groups enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'timeline_groups'
      and policyname = 'timeline_groups_all'
  ) then
    create policy "timeline_groups_all" on timeline_groups for all to authenticated
      using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
end
$$;
