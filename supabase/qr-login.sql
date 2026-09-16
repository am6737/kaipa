-- One-time cross-device QR login requests.
-- The table is intentionally inaccessible through PostgREST; only the
-- qr-login Edge Function (service role) may read or update these rows.
create table if not exists public.qr_login_requests (
  id uuid primary key default gen_random_uuid(),
  secret_hash text not null,
  status text not null default 'pending' check (status in ('pending', 'scanned', 'approved', 'consumed')),
  user_id uuid references auth.users(id) on delete cascade,
  token_hash text,
  verification_type text,
  expires_at timestamptz not null default (now() + interval '5 minutes'),
  scanned_at timestamptz,
  approved_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.qr_login_requests enable row level security;
revoke all on table public.qr_login_requests from anon, authenticated;

create index if not exists qr_login_requests_expires_at_idx
  on public.qr_login_requests (expires_at);


-- Upgrade existing installations created before the scanned state was added.
alter table public.qr_login_requests
  add column if not exists scanned_at timestamptz;
alter table public.qr_login_requests
  drop constraint if exists qr_login_requests_status_check;
alter table public.qr_login_requests
  add constraint qr_login_requests_status_check
  check (status in ('pending', 'scanned', 'approved', 'consumed'));
