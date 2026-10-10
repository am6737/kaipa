-- Server managed content for the Journey tab. The app keeps a local fallback.
create table if not exists public.journey_home_content (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  enabled boolean not null default true,
  title text not null,
  tabs jsonb not null default '[]'::jsonb,
  cards jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.journey_home_content enable row level security;
drop policy if exists journey_home_content_public_read on public.journey_home_content;
create policy journey_home_content_public_read on public.journey_home_content for select using (enabled = true);

insert into public.journey_home_content (key, title, tabs, cards)
values ('default', '我的计划', '[{"id":"all","label":"全部","filter":"all"},{"id":"planned","label":"待出发","filter":"planned"}]'::jsonb, '[]'::jsonb)
on conflict (key) do nothing;
