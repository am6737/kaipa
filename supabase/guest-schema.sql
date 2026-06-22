-- guest-schema.sql — tables for the browser-based guest journey page.
-- Apply: docker exec supabase-db psql -U postgres -d postgres < supabase/guest-schema.sql

-- ─── journey_shares ─────────────────────────────────────────────────────────
-- Maps an invite slug+code to a journey so the guest web page can resolve it.
create table if not exists journey_shares (
  id          text primary key default 'js_' || gen_random_uuid()::text,
  journey_id  text not null references journeys(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  slug        text not null,
  code        text not null,
  active      boolean default true,
  created_at  timestamptz default now(),
  unique(slug, code)
);
alter table journey_shares enable row level security;
create policy "shares_owner" on journey_shares for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "shares_anon_select" on journey_shares for select to anon
  using (active = true);

-- ─── shared_moments ─────────────────────────────────────────────────────────
-- Photos/notes uploaded by guests (or app users) via the web link.
create table if not exists shared_moments (
  id          text primary key default 'sm_' || gen_random_uuid()::text,
  share_id    text not null references journey_shares(id) on delete cascade,
  journey_id  text not null references journeys(id) on delete cascade,
  guest_name  text not null,
  guest_ini   text not null default '',
  guest_tone  text not null default 'river',
  uri         text not null default '',
  caption     text default '',
  day         int4 default 1,
  is_text     boolean default false,
  created_at  timestamptz default now()
);
alter table shared_moments enable row level security;
create policy "moments_anon_select" on shared_moments for select to anon
  using (share_id in (select id from journey_shares where active = true));
create policy "moments_anon_insert" on shared_moments for insert to anon
  with check (share_id in (select id from journey_shares where active = true));
create policy "moments_anon_delete" on shared_moments for delete to anon
  using (share_id in (select id from journey_shares where active = true));
create policy "moments_owner_all" on shared_moments for all to authenticated
  using (journey_id in (select id from journeys where user_id = auth.uid()));

-- ─── anon read policies on existing tables ──────────────────────────────────
-- Guests need journey metadata, companion roster, and host profile.

create policy "journeys_anon_via_share" on journeys for select to anon
  using (id in (select journey_id from journey_shares where active = true));

create policy "companions_anon_via_share" on companions for select to anon
  using (journey_id in (select journey_id from journey_shares where active = true));

create policy "profiles_anon_via_share" on profiles for select to anon
  using (id in (select user_id from journey_shares where active = true));

create policy "inspo_anon_via_share" on inspo_media for select to anon
  using (journey_id in (select journey_id from journey_shares where active = true));

-- ─── storage bucket ─────────────────────────────────────────────────────────
-- Create the shared-moments bucket if it doesn't exist.
insert into storage.buckets (id, name, public)
values ('shared-moments', 'shared-moments', true)
on conflict (id) do nothing;

-- Allow anon uploads and reads
create policy "shared_moments_anon_insert" on storage.objects for insert to anon
  with check (bucket_id = 'shared-moments');
create policy "shared_moments_anon_select" on storage.objects for select to anon
  using (bucket_id = 'shared-moments');
create policy "shared_moments_auth_all" on storage.objects for all to authenticated
  using (bucket_id = 'shared-moments');
