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

-- ─── authenticated app invite redemption ───────────────────────────────────
create or replace function public.join_journey_by_invite(invite_slug text, invite_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_journey_id text;
  profile_name text;
  profile_avatar text;
  next_sort_order integer;
begin
  if current_user_id is null then
    raise exception 'JOURNEY_INVITE_AUTH_REQUIRED';
  end if;

  select journey_id into target_journey_id
  from journey_shares
  where slug = invite_slug and code = invite_code and active = true
  limit 1;

  if target_journey_id is null then
    raise exception 'JOURNEY_INVITE_INVALID';
  end if;

  perform pg_advisory_xact_lock(hashtext(target_journey_id));

  if exists (
    select 1 from journeys where id = target_journey_id and user_id = current_user_id
  ) or exists (
    select 1 from companions where journey_id = target_journey_id and user_id = current_user_id
  ) then
    return jsonb_build_object('status', 'already_joined', 'journey_id', target_journey_id);
  end if;

  if (select count(*) from companions where journey_id = target_journey_id) >= 10 then
    raise exception 'JOURNEY_FULL';
  end if;

  select coalesce(nullif(nick, ''), nullif(display_name, ''), '伙伴'), avatar_url
  into profile_name, profile_avatar
  from profiles
  where id = current_user_id;

  select coalesce(max(sort_order), -1) + 1 into next_sort_order
  from companions
  where journey_id = target_journey_id;

  insert into companions (
    user_id, journey_id, ini, name, color, avatar_url, is_host, is_self, sort_order
  ) values (
    current_user_id,
    target_journey_id,
    left(coalesce(profile_name, '伙伴'), 1),
    coalesce(profile_name, '伙伴'),
    '#2E7D5B',
    profile_avatar,
    false,
    false,
    next_sort_order
  );

  return jsonb_build_object('status', 'joined', 'journey_id', target_journey_id);
end;
$$;

revoke all on function public.join_journey_by_invite(text, text) from public;
revoke all on function public.join_journey_by_invite(text, text) from anon;
grant execute on function public.join_journey_by_invite(text, text) to authenticated;
