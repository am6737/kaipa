create or replace function public.leave_journey(target_journey_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  removed_count integer;
begin
  if auth.uid() is null then
    raise exception 'JOURNEY_LEAVE_AUTH_REQUIRED';
  end if;

  delete from public.companions c
  using public.journeys j
  where c.journey_id = target_journey_id
    and c.user_id = auth.uid()
    and c.is_host is not true
    and j.id = c.journey_id
    and j.deleted_at is null;

  get diagnostics removed_count = row_count;
  return removed_count > 0;
end;
$$;

revoke all on function public.leave_journey(text) from public;
grant execute on function public.leave_journey(text) to authenticated;
