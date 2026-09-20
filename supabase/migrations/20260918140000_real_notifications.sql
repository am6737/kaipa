-- Remove the deterministic demo notifications that were inserted by seed.sql.
delete from public.notifications where id in ('n1', 'n2', 'n3', 'n4', 'n5', 'n6');

-- Notify a journey owner when another authenticated user joins the journey.
create or replace function public.notify_journey_owner_on_companion_join()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  journey_owner uuid;
  journey_name text;
begin
  if new.user_id is null then
    return new;
  end if;

  select j.user_id, j.name
    into journey_owner, journey_name
    from public.journeys j
   where j.id = new.journey_id;

  if journey_owner is null or journey_owner = new.user_id then
    return new;
  end if;

  insert into public.notifications (
    user_id, kind, cat, bucket, time, who, avatar, color, verb,
    target, target_id, action, created_at
  ) values (
    journey_owner,
    'join',
    'social',
    'today',
    '刚刚',
    coalesce(new.name, '旅程伙伴'),
    coalesce(new.ini, left(coalesce(new.name, '伙'), 1)),
    coalesce(new.color, '#2E7D5B'),
    '加入了你的旅程',
    journey_name,
    new.journey_id,
    '查看',
    now()
  );

  return new;
end;
$$;

drop trigger if exists companions_notify_journey_owner on public.companions;
create trigger companions_notify_journey_owner
after insert on public.companions
for each row execute function public.notify_journey_owner_on_companion_join();

revoke all on function public.notify_journey_owner_on_companion_join() from public;
