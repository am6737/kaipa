-- Companion inserts from the passphrase join flow notify the journey owner.
create or replace function public.notify_journey_owner_on_companion_join()
returns trigger language plpgsql security definer set search_path = public as $$
declare journey_owner uuid; journey_name text;
begin
  if new.user_id is null then return new; end if;
  select j.user_id, j.name into journey_owner, journey_name from public.journeys j where j.id = new.journey_id;
  if journey_owner is null or journey_owner = new.user_id then return new; end if;
  insert into public.notifications (user_id, actor_user_id, kind, cat, bucket, time, who, avatar, color, verb, target, target_id, action, created_at)
  values (journey_owner, new.user_id, 'join', 'social', 'today', '刚刚', coalesce(new.name, '旅程伙伴'), nullif(new.avatar_url, ''), coalesce(new.color, '#2E7D5B'), '通过口令加入了你的旅程', journey_name, new.journey_id, '查看成员', now());
  return new;
end;
$$;
revoke all on function public.notify_journey_owner_on_companion_join() from public;
