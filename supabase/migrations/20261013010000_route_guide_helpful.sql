begin;

create table if not exists public.route_guide_helpful_votes (
  guide_id uuid not null references public.route_guides(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (guide_id, user_id)
);

alter table public.route_guide_helpful_votes enable row level security;
drop policy if exists route_guide_helpful_votes_read_own on public.route_guide_helpful_votes;
create policy route_guide_helpful_votes_read_own
  on public.route_guide_helpful_votes
  for select to authenticated
  using (user_id = auth.uid());
grant select on public.route_guide_helpful_votes to anon, authenticated;

create or replace function public.route_guide_helpful(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  removed boolean;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  perform 1 from public.route_guides
    where id = p_id
      and (status = 'approved' or author_id = auth.uid())
    for update;
  if not found then
    raise exception 'guide not found';
  end if;

  delete from public.route_guide_helpful_votes
   where guide_id = p_id and user_id = auth.uid();
  removed := found;

  if removed then
    update public.route_guides
       set helpful_count = greatest(0, helpful_count - 1)
     where id = p_id;
    return false;
  end if;

  insert into public.route_guide_helpful_votes (guide_id, user_id)
  values (p_id, auth.uid());
  update public.route_guides
     set helpful_count = helpful_count + 1
   where id = p_id;
  return true;
end;
$$;

revoke all on function public.route_guide_helpful(uuid) from public;
grant execute on function public.route_guide_helpful(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
