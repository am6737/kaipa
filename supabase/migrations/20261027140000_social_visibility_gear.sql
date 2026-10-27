begin;

-- 关注体系第 4 批：
--   * 出行可见范围的写入口 set_outing_visibility；改可见范围不算旅程的一个版本。
--   * 装备清单可见范围 gear_sets.visibility，别人主页上的清单列表和详情，
--     以及「存为我的清单」copy_gear_set。
--   * profile_summary 增加 gearSets：当前用户能看到的清单数。

-- ── 出行可见范围 ─────────────────────────────────────────────────────────────

create or replace function public.set_outing_visibility(
  p_journey_id text, p_track_id uuid, p_visibility text
)
returns void
language plpgsql security definer set search_path = public
as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;
  if p_visibility is null or p_visibility not in ('private', 'followers', 'public') then
    raise exception 'invalid visibility';
  end if;
  if p_journey_id is not null then
    update public.journeys set visibility = p_visibility
     where id = p_journey_id and user_id = me and deleted_at is null;
  elsif p_track_id is not null then
    update public.tracks set visibility = p_visibility
     where id = p_track_id and user_id = me;
  else
    raise exception 'missing outing';
  end if;
  if not found then raise exception using errcode = '42501', message = 'outing owner required'; end if;
end $$;
revoke all on function public.set_outing_visibility(text, uuid, text) from public, anon;
grant execute on function public.set_outing_visibility(text, uuid, text) to authenticated;

-- 版本历史只记录行程内容；可见范围不是内容，改了也不留版本。
create or replace function public.record_journey_version()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  previous_snapshot jsonb;
  next_snapshot jsonb := to_jsonb(new);
  version_fields text[] := '{}';
begin
  if tg_op = 'UPDATE' then
    previous_snapshot := to_jsonb(old);
    select coalesce(array_agg(key order by key), '{}')
    into version_fields
    from jsonb_object_keys(next_snapshot - 'updated_at' - 'visibility') as key
    where (previous_snapshot - 'updated_at') -> key is distinct from (next_snapshot - 'updated_at') -> key;

    if coalesce(array_length(version_fields, 1), 0) = 0 then
      return new;
    end if;
  end if;

  perform public.save_journey_version(
    new.id,
    version_fields,
    case when tg_op = 'INSERT' then 'create'
         when current_setting('app.journey_change_kind', true) = 'restore' then 'restore'
         else 'update' end
  );
  return new;
end;
$function$;

-- ── 装备清单可见范围 ─────────────────────────────────────────────────────────

alter table public.gear_sets
  add column if not exists visibility text not null default 'private';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'gear_sets_visibility_check') then
    alter table public.gear_sets add constraint gear_sets_visibility_check
      check (visibility in ('private', 'followers', 'public'));
  end if;
end $$;

-- 一份清单里每件装备的对外信息。价格、备注、照片属于个人，不给别人。
create or replace function public.gear_set_public_items(p_set text)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'name', g.name,
           'category', c.name,
           'categoryColor', c.color,
           'weightKg', g.weight,
           'qty', coalesce(si.qty, g.qty, 1),
           'status', coalesce(si.status, g.status),
           'owned', g.owned
         ) order by c.name nulls last, g.name), '[]'::jsonb)
    from public.gear_set_items si
    join public.gear_items g on g.id = si.item_id
    left join public.gear_categories c on c.id = g.cat_id
   where si.set_id = p_set;
$$;
revoke all on function public.gear_set_public_items(text) from public, anon, authenticated;

create or replace function public.gear_set_card(s public.gear_sets)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'id', s.id,
    'name', s.name,
    'description', s.description,
    'visibility', s.visibility,
    'itemCount', (select count(*) from public.gear_set_items where set_id = s.id),
    'weightKg', (
      select coalesce(sum(g.weight * coalesce(si.qty, g.qty, 1)), 0)
        from public.gear_set_items si join public.gear_items g on g.id = si.item_id
       where si.set_id = s.id and coalesce(si.status, g.status) <> 'optional'
    )
  );
$$;
revoke all on function public.gear_set_card(public.gear_sets) from public, anon, authenticated;

create or replace function public.profile_gear_sets(p_user uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not public.can_view_profile(p_user) then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(public.gear_set_card(s) order by s.created_at desc)
      from public.gear_sets s
     where s.user_id = p_user and public.can_view_profile_content(p_user, s.visibility)
  ), '[]'::jsonb);
end $$;
revoke all on function public.profile_gear_sets(uuid) from public, anon;
grant execute on function public.profile_gear_sets(uuid) to authenticated;

create or replace function public.profile_gear_set(p_set text)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare s public.gear_sets%rowtype;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into s from public.gear_sets where id = p_set;
  if not found or not public.can_view_profile_content(s.user_id, s.visibility) then return null; end if;
  return public.gear_set_card(s) || jsonb_build_object(
    'ownerId', s.user_id,
    'items', public.gear_set_public_items(s.id)
  );
end $$;
revoke all on function public.profile_gear_set(text) from public, anon;
grant execute on function public.profile_gear_set(text) to authenticated;

-- 存为我的清单：按名字复用自己已有的装备，没有的新建为待购（owned = false），
-- 分类按名字对上自己的，没有就照原样建一个。返回新清单 id。
create or replace function public.copy_gear_set(p_set text)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  src public.gear_sets%rowtype;
  dst_id text;
  row record;
  my_item int;
  my_cat text;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select * into src from public.gear_sets where id = p_set;
  if not found or src.user_id = me or not public.can_view_profile_content(src.user_id, src.visibility) then
    raise exception using errcode = '42501', message = 'gear set unavailable';
  end if;

  insert into public.gear_sets(user_id, name, description)
  values (me, src.name, src.description)
  returning id into dst_id;

  for row in
    select g.name, g.weight, g.qty as item_qty, g.status as item_status, g.attrs,
           c.name as cat_name, c.color as cat_color, si.qty, si.status
      from public.gear_set_items si
      join public.gear_items g on g.id = si.item_id
      left join public.gear_categories c on c.id = g.cat_id
     where si.set_id = src.id
  loop
    select id into my_item from public.gear_items
     where user_id = me and lower(trim(name)) = lower(trim(row.name))
     order by owned desc, created_at
     limit 1;
    if my_item is null then
      my_cat := null;
      if row.cat_name is not null then
        select id into my_cat from public.gear_categories
         where user_id = me and lower(trim(name)) = lower(trim(row.cat_name))
         order by created_at limit 1;
        if my_cat is null then
          insert into public.gear_categories(user_id, name, color)
          values (me, row.cat_name, row.cat_color)
          returning id into my_cat;
        end if;
      end if;
      insert into public.gear_items(user_id, name, cat_id, weight, price, qty, status, attrs, owned)
      values (me, row.name, my_cat, row.weight, 0, coalesce(row.item_qty, 1), row.item_status, row.attrs, false)
      returning id into my_item;
    end if;
    insert into public.gear_set_items(set_id, item_id, qty, status)
    values (dst_id, my_item, coalesce(row.qty, row.item_qty), coalesce(row.status, row.item_status))
    on conflict (set_id, item_id) do nothing;
  end loop;

  return dst_id;
end $$;
revoke all on function public.copy_gear_set(text) from public, anon;
grant execute on function public.copy_gear_set(text) to authenticated;

-- ── profile_summary：加 gearSets ─────────────────────────────────────────────

create or replace function public.profile_summary(p_user uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  p public.profiles%rowtype;
  viewable boolean;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select * into p from public.profiles where id = p_user;
  -- 被对方拉黑时当作不存在，不暴露拉黑关系。
  if not found or exists (select 1 from public.user_blocks where blocker_id = p_user and blocked_id = me) then
    return null;
  end if;
  viewable := public.can_view_profile(p_user);
  return jsonb_build_object(
    'id', p.id,
    'nick', coalesce(nullif(trim(p.nick), ''), nullif(trim(p.display_name), ''), ''),
    'username', p.username,
    'bio', p.bio,
    'avatarUrl', p.avatar_url,
    'avatarIni', p.avatar_ini,
    'avatarColor', p.avatar_color,
    'isPrivate', p.is_private,
    'followers', (select count(*) from public.follows where followee_id = p_user and status = 'accepted'),
    'following', (select count(*) from public.follows where follower_id = p_user and status = 'accepted'),
    'pendingRequests', case when p_user = me
      then (select count(*) from public.follows where followee_id = me and status = 'pending') end,
    'relation', public.profile_relation(p_user),
    'canView', viewable,
    'outings', case when viewable then (
      select count(*) from public.profile_outing_rows(p_user) o
       where public.can_view_profile_content(p_user, o.visibility)) end,
    'hiddenOutings', case when p_user <> me and not public.is_blocked_between(p_user, me) then (
      select count(*) from public.profile_outing_rows(p_user) o
       where o.visibility = 'followers' and not public.can_view_profile_content(p_user, o.visibility)) end,
    'gearSets', case when viewable then (
      select count(*) from public.gear_sets s
       where s.user_id = p_user and public.can_view_profile_content(p_user, s.visibility)) end
  );
end $$;

commit;
