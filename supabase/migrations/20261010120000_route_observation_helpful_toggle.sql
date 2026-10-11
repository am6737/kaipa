begin;

create or replace function public.route_observation_helpful(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  observation public.route_observations%rowtype;
  removed boolean;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select * into observation
    from public.route_observations
   where id = p_id
     and (moderation_status = 'approved' or user_id = auth.uid())
   for update;
  if not found then
    raise exception 'observation not found';
  end if;

  delete from public.route_observation_helpful_votes
   where observation_id = p_id and user_id = auth.uid();
  removed := found;

  if removed then
    update public.route_observations
       set helpful_count = greatest(0, helpful_count - 1), updated_at = now()
     where id = p_id;
    return false;
  end if;

  insert into public.route_observation_helpful_votes (observation_id, user_id)
  values (p_id, auth.uid());
  update public.route_observations
     set helpful_count = helpful_count + 1, updated_at = now()
   where id = p_id;
  return true;
end;
$$;

notify pgrst, 'reload schema';
commit;
