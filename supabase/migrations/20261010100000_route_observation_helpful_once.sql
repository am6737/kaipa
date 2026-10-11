begin;

create table if not exists public.route_observation_helpful_votes (
  observation_id uuid not null references public.route_observations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (observation_id, user_id)
);

alter table public.route_observation_helpful_votes enable row level security;

drop function if exists public.route_observation_helpful(uuid);

create or replace function public.route_observation_helpful(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted boolean;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  insert into public.route_observation_helpful_votes (observation_id, user_id)
  select o.id, auth.uid()
    from public.route_observations o
   where o.id = p_id
     and (o.moderation_status = 'approved' or o.user_id = auth.uid())
  on conflict (observation_id, user_id) do nothing;

  inserted := found;
  if inserted then
    update public.route_observations
       set helpful_count = helpful_count + 1, updated_at = now()
     where id = p_id;
  end if;

  return inserted;
end;
$$;

revoke all on function public.route_observation_helpful(uuid) from public;
grant execute on function public.route_observation_helpful(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
