alter table public.inspo_media
  add column if not exists moderation_status text not null default 'pending'
    check (moderation_status in ('pending', 'approved', 'rejected'));
alter table public.inspo_media add column if not exists moderation_reason text;
alter table public.inspo_media add column if not exists reviewed_by uuid references auth.users(id) on delete set null;
alter table public.inspo_media add column if not exists reviewed_at timestamptz;
create index if not exists inspo_media_moderation_idx on public.inspo_media (moderation_status, created_at desc);
