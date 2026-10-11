create table if not exists public.route_requests (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60), region text not null default '' check (length(region) <= 60),
  note text not null default '' check (length(note) <= 500), lng float8 not null, lat float8 not null, address text,
  track_id uuid references public.tracks(id) on delete set null, track_snapshot jsonb,
  status text not null default 'pending' check (status in ('pending','accepted','rejected','duplicate')),
  review_note text, route_id text references public.routes(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists route_requests_status_created_idx on public.route_requests (status, created_at desc);
create index if not exists route_requests_user_created_idx on public.route_requests (user_id, created_at desc);
alter table public.route_requests enable row level security;
drop policy if exists route_requests_select_own on public.route_requests;
create policy route_requests_select_own on public.route_requests for select to authenticated using (user_id = auth.uid());
drop policy if exists route_requests_insert_own on public.route_requests;
create policy route_requests_insert_own on public.route_requests for insert to authenticated with check (user_id = auth.uid() and status = 'pending' and route_id is null and review_note is null);
drop policy if exists route_requests_delete_pending_own on public.route_requests;
create policy route_requests_delete_pending_own on public.route_requests for delete to authenticated using (user_id = auth.uid() and status = 'pending');
create or replace function public.notify_route_request_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  display_verb text;
begin
  if new.status in ('accepted', 'rejected', 'duplicate')
     and old.status is distinct from new.status then
    display_verb := case new.status
      when 'accepted' then '你请求的路线已上线'
      when 'rejected' then '你的路线请求未通过'
      else '该路线已在路线库中'
    end;
    insert into public.notifications (
      user_id, kind, cat, bucket, time, who, avatar, color, verb,
      target, target_id, action, created_at
    ) values (
      new.user_id, 'route_request', 'system', 'today', '刚刚', 'Kaipa',
      null, null, display_verb, new.name, new.id::text, '查看', now()
    );
  end if;
  return new;
end;
$$;
drop trigger if exists route_request_review_notification on public.route_requests;
create trigger route_request_review_notification after update of status on public.route_requests for each row execute function public.notify_route_request_review();
notify pgrst, 'reload schema';
