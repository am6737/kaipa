-- One-time cross-device QR login requests.
-- The table is intentionally inaccessible through PostgREST; only the
-- qr-login Edge Function (service role) may read or update these rows.
create table if not exists public.qr_login_requests (
  id uuid primary key default gen_random_uuid(),
  secret_hash text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'consumed')),
  user_id uuid references auth.users(id) on delete cascade,
  token_hash text,
  verification_type text,
  expires_at timestamptz not null default (now() + interval '5 minutes'),
  approved_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.qr_login_requests enable row level security;
revoke all on table public.qr_login_requests from anon, authenticated;

create index if not exists qr_login_requests_expires_at_idx
  on public.qr_login_requests (expires_at);
