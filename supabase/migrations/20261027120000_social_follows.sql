begin;

-- 关注体系第一批：关注 / 拉黑 / 私密账号，以及按「一次出行」读取主页内容。
-- 设计见 docs/me-social-profile.md。
--
-- 原则：
--   * 可见范围默认「仅自己」，上线后老数据不会突然公开。
--   * 别人主页的内容一律经由下面的 security definer RPC 读取，不放开 tracks /
--     journeys / inspo_media 的表级 RLS，规则只在 can_view_profile_content 一处判断。
--   * 公开轨迹返回给别人之前，在服务端裁掉起终点各 200 m 并抽稀，完整坐标不出库。

-- ── 1. 字段 ──
alter table public.profiles
  add column if not exists is_private boolean not null default false;

alter table public.journeys
  add column if not exists visibility text not null default 'private';
alter table public.tracks
  add column if not exists visibility text not null default 'private';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'journeys_visibility_check') then
    alter table public.journeys add constraint journeys_visibility_check
      check (visibility in ('private', 'followers', 'public'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tracks_visibility_check') then
    alter table public.tracks add constraint tracks_visibility_check
      check (visibility in ('private', 'followers', 'public'));
  end if;
end $$;

-- ── 2. 关注与拉黑 ──
create table if not exists public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  followee_id uuid not null references public.profiles(id) on delete cascade,
  -- 私密账号收到的是 pending，对方通过后变 accepted；只有 accepted 才算粉丝。
  status      text not null default 'accepted' check (status in ('pending', 'accepted')),
  created_at  timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index if not exists follows_followee_idx
  on public.follows (followee_id, status, created_at desc);
create index if not exists follows_follower_idx
  on public.follows (follower_id, status, created_at desc);

alter table public.follows enable row level security;
-- 只能直接读到和自己有关的行；别人的粉丝列表走 profile_follow_list。写入只走 RPC。
drop policy if exists follows_select_own on public.follows;
create policy follows_select_own on public.follows for select to authenticated
  using (follower_id = auth.uid() or followee_id = auth.uid());

create table if not exists public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index if not exists user_blocks_blocked_idx on public.user_blocks (blocked_id);

alter table public.user_blocks enable row level security;
drop policy if exists user_blocks_select_own on public.user_blocks;
create policy user_blocks_select_own on public.user_blocks for select to authenticated
  using (blocker_id = auth.uid());

-- ── 3. 判断工具 ──
create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select a is not null and b is not null and exists (
    select 1 from public.user_blocks
     where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  );
$$;

create or replace function public.is_accepted_follower(p_follower uuid, p_followee uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.follows
     where follower_id = p_follower and followee_id = p_followee and status = 'accepted'
  );
$$;

-- 当前用户能不能看到 p_owner 的某条可见范围为 p_visibility 的内容。
-- 私密账号的「公开」内容也只给已通过的粉丝看。
create or replace function public.can_view_profile_content(p_owner uuid, p_visibility text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select case
    when auth.uid() is null or p_owner is null then false
    when p_owner = auth.uid() then true
    when public.is_blocked_between(p_owner, auth.uid()) then false
    when p_visibility = 'public' then
      not coalesce((select is_private from public.profiles where id = p_owner), false)
      or public.is_accepted_follower(auth.uid(), p_owner)
    when p_visibility = 'followers' then public.is_accepted_follower(auth.uid(), p_owner)
    else false
  end;
$$;

-- 能不能看主页本身（列表、计数之外的内容区）。
create or replace function public.can_view_profile(p_owner uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.can_view_profile_content(p_owner, 'public');
$$;

-- 坐标 [[lng,lat,...], ...]：裁掉起终点各 p_trim_m 米，再抽稀到最多 p_max 个点。
-- p_trim_m = 0 时只抽稀（本人看自己的）。轨迹太短、裁完不剩两个点时返回空数组。
create or replace function public.outing_preview_coords(p_coords jsonb, p_trim_m numeric, p_max int)
returns jsonb
language plpgsql immutable
as $$
declare
  n int;
  cum numeric[] := array[0::numeric];
  total numeric;
  i int;
  lng1 double precision; lat1 double precision; lng2 double precision; lat2 double precision;
  d numeric;
  first_i int; last_i int;
  kept int;
  step numeric;
  result jsonb := '[]'::jsonb;
  j int;
begin
  if p_coords is null or jsonb_typeof(p_coords) <> 'array' then return '[]'::jsonb; end if;
  n := jsonb_array_length(p_coords);
  if n < 2 then return '[]'::jsonb; end if;

  for i in 1 .. n - 1 loop
    lng1 := (p_coords -> (i - 1) ->> 0)::double precision;
    lat1 := (p_coords -> (i - 1) ->> 1)::double precision;
    lng2 := (p_coords -> i ->> 0)::double precision;
    lat2 := (p_coords -> i ->> 1)::double precision;
    d := 2 * 6371000 * asin(sqrt(
      power(sin(radians(lat2 - lat1) / 2), 2)
      + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
    ));
    cum := cum || (cum[i] + coalesce(d, 0));
  end loop;
  total := cum[n];

  first_i := 1;
  last_i := n;
  if coalesce(p_trim_m, 0) > 0 then
    if total <= p_trim_m * 2 then return '[]'::jsonb; end if;
    while first_i < n and cum[first_i] < p_trim_m loop first_i := first_i + 1; end loop;
    while last_i > 1 and total - cum[last_i] < p_trim_m loop last_i := last_i - 1; end loop;
    if last_i - first_i < 1 then return '[]'::jsonb; end if;
  end if;

  kept := last_i - first_i + 1;
  step := greatest(1, kept::numeric / greatest(p_max, 2));
  j := 0;
  while first_i + floor(j * step)::int <= last_i loop
    result := result || jsonb_build_array(jsonb_build_array(
      p_coords -> (first_i + floor(j * step)::int - 1) -> 0,
      p_coords -> (first_i + floor(j * step)::int - 1) -> 1));
    j := j + 1;
  end loop;
  -- 抽稀可能跳过最后一个保留点，补上，让线画到裁剪处为止。
  if (result -> -1) is distinct from jsonb_build_array(p_coords -> (last_i - 1) -> 0, p_coords -> (last_i - 1) -> 1) then
    result := result || jsonb_build_array(jsonb_build_array(p_coords -> (last_i - 1) -> 0, p_coords -> (last_i - 1) -> 1));
  end if;
  return result;
end $$;

-- ── 4. 通知 ──
-- 文案和 notify_helpful 一致存库；推送由 trg_notifications_enqueue_push 自动入队。
create or replace function public.notify_follow_event(p_recipient uuid, p_actor uuid, p_kind text, p_verb text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  -- 同一个人 24 小时内反复关注 / 取消，只提醒一次。
  perform public.notify_helpful(p_recipient, p_actor, p_kind, p_verb, null, p_actor::text);
end $$;
revoke all on function public.notify_follow_event(uuid, uuid, text, text) from public;

-- ── 5. 写操作 ──
create or replace function public.follow_user(p_target uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  target_private boolean;
  existing text;
  next_status text;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if p_target is null or p_target = me then raise exception 'cannot follow yourself'; end if;
  select is_private into target_private from public.profiles where id = p_target;
  if not found then raise exception 'profile not found'; end if;
  if public.is_blocked_between(me, p_target) then raise exception 'blocked'; end if;

  select status into existing from public.follows where follower_id = me and followee_id = p_target;
  if existing is not null then return existing; end if;

  next_status := case when target_private then 'pending' else 'accepted' end;
  insert into public.follows (follower_id, followee_id, status, accepted_at)
  values (me, p_target, next_status, case when next_status = 'accepted' then now() end)
  on conflict do nothing;

  if next_status = 'accepted' then
    perform public.notify_follow_event(p_target, me, 'follow', '关注了你');
  else
    perform public.notify_follow_event(p_target, me, 'follow_request', '请求关注你');
  end if;
  return next_status;
end $$;

-- 取消关注，也用来撤回还没通过的请求。
create or replace function public.unfollow_user(p_target uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  delete from public.follows where follower_id = auth.uid() and followee_id = p_target;
end $$;

create or replace function public.respond_follow_request(p_follower uuid, p_accept boolean)
returns void
language plpgsql security definer set search_path = public
as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;
  if p_accept then
    update public.follows set status = 'accepted', accepted_at = now()
     where follower_id = p_follower and followee_id = me and status = 'pending';
    if found then
      perform public.notify_follow_event(p_follower, me, 'follow_accepted', '通过了你的关注请求');
    end if;
  else
    delete from public.follows
     where follower_id = p_follower and followee_id = me and status = 'pending';
  end if;
end $$;

create or replace function public.remove_follower(p_follower uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  delete from public.follows where follower_id = p_follower and followee_id = auth.uid();
end $$;

-- 拉黑会同时解除双方的关注和待处理请求。
create or replace function public.block_user(p_target uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;
  if p_target is null or p_target = me then raise exception 'cannot block yourself'; end if;
  insert into public.user_blocks (blocker_id, blocked_id) values (me, p_target) on conflict do nothing;
  delete from public.follows
   where (follower_id = me and followee_id = p_target) or (follower_id = p_target and followee_id = me);
end $$;

create or replace function public.unblock_user(p_target uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  delete from public.user_blocks where blocker_id = auth.uid() and blocked_id = p_target;
end $$;

-- 关掉私密账号时，待处理的请求一并通过，不让它们悬着。
create or replace function public.set_account_private(p_private boolean)
returns void
language plpgsql security definer set search_path = public
as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;
  update public.profiles set is_private = coalesce(p_private, false) where id = me;
  if not coalesce(p_private, false) then
    update public.follows set status = 'accepted', accepted_at = now()
     where followee_id = me and status = 'pending';
  end if;
end $$;

-- ── 6. 读：主页 ──
create or replace function public.profile_relation(p_user uuid)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'self', p_user = auth.uid(),
    'following', coalesce((select status from public.follows where follower_id = auth.uid() and followee_id = p_user), 'none'),
    'followedBy', public.is_accepted_follower(p_user, auth.uid()),
    'blocked', exists (select 1 from public.user_blocks where blocker_id = auth.uid() and blocked_id = p_user)
  );
$$;

-- 一次出行：有旅程就以旅程为准（已完成，或挂了轨迹）；没有挂到任何旅程上的
-- 「录制」轨迹（file_format 为空）自己算一条。导入的轨迹文件只有挂到旅程上才算。
create or replace function public.profile_outing_rows(p_user uuid)
returns table (
  outing_id text, kind text, journey_id text, track_id uuid, visibility text,
  title text, route_id text, region text, date_label text, occurred_at timestamptz,
  total_days int, dist_m bigint, asc_m bigint, duration_ms bigint, coords jsonb
)
language sql stable security definer set search_path = public
as $$
  select 'j:' || j.id,
         case when t.id is not null then 'both' else 'journey' end,
         j.id, t.id, j.visibility,
         j.name, j.route_id, j.region, nullif(j.date, ''),
         coalesce(t.started_at, j.created_at),
         j.total_days, t.dist_m, t.asc_m, t.duration_ms, t.coords
    from public.journeys j
    left join public.tracks t on t.id = j.track_id
   where j.user_id = p_user and j.deleted_at is null
     and (j.status = 'completed' or j.track_id is not null)
  union all
  select 't:' || t.id::text, 'track', null, t.id, t.visibility,
         t.name, null, null, null,
         coalesce(t.started_at, t.created_at),
         null, t.dist_m, t.asc_m, t.duration_ms, t.coords
    from public.tracks t
   where t.user_id = p_user and t.file_format is null
     and not exists (
       select 1 from public.journeys j
        where j.track_id = t.id and j.user_id = p_user and j.deleted_at is null
     );
$$;
revoke all on function public.profile_outing_rows(uuid) from public, anon, authenticated;

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
       where public.can_view_profile_content(p_user, o.visibility)) end
  );
end $$;

create or replace function public.profile_outings(
  p_user uuid, p_before timestamptz default null, p_limit int default 20
)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  is_self boolean := p_user = auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;
  if not public.can_view_profile(p_user) then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(row_to_json(x)::jsonb order by x."occurredAt" desc)
      from (
        select o.outing_id as id, o.kind, o.journey_id as "journeyId", o.track_id as "trackId",
               o.visibility, o.title, o.route_id as "routeId", r.name as "routeName",
               coalesce(o.region, r.region) as region, o.date_label as "dateLabel",
               o.occurred_at as "occurredAt", o.total_days as "totalDays",
               o.dist_m as "distM", o.asc_m as "ascM", o.duration_ms as "durationMs",
               case when o.coords is not null
                 then public.outing_preview_coords(o.coords, case when is_self then 0 else 200 end, 160) end as coords,
               not is_self as "endsHidden",
               (select count(*) from public.companions c
                 where c.journey_id = o.journey_id and not coalesce(c.is_self, false)) as companions,
               (select count(*) from public.inspo_media m
                 where m.journey_id = o.journey_id and m.user_id = p_user
                   and (is_self or m.moderation_status = 'approved')) as "photoCount",
               coalesce((select jsonb_agg(jsonb_build_object(
                          'id', m.id, 'uri', m.uri, 'thumbnail', m.thumbnail, 'kind', m.kind) order by m.created_at)
                  from (select * from public.inspo_media m
                         where m.journey_id = o.journey_id and m.user_id = p_user
                           and (is_self or m.moderation_status = 'approved')
                         order by m.created_at limit 6) m), '[]'::jsonb) as photos
          from public.profile_outing_rows(p_user) o
          left join public.routes r on r.id = o.route_id
         where public.can_view_profile_content(p_user, o.visibility)
           and (p_before is null or o.occurred_at < p_before)
         order by o.occurred_at desc
         limit least(greatest(coalesce(p_limit, 20), 1), 50)
      ) x
  ), '[]'::jsonb);
end $$;

-- 一次出行的全部照片（照片标签点进某一组时用）。只看上传人本人的照片。
create or replace function public.profile_outing_photos(p_user uuid, p_journey_id text)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  is_self boolean := p_user = auth.uid();
  vis text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select visibility into vis from public.journeys
   where id = p_journey_id and user_id = p_user and deleted_at is null;
  if not found or not public.can_view_profile_content(p_user, vis) then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', m.id, 'uri', m.uri, 'thumbnail', m.thumbnail, 'kind', m.kind,
             'pairedVideoUri', m.paired_video_uri, 'caption', m.caption,
             'createdAt', m.created_at, 'moderationStatus', case when is_self then m.moderation_status end)
           order by m.created_at)
      from public.inspo_media m
     where m.journey_id = p_journey_id and m.user_id = p_user
       and (is_self or m.moderation_status = 'approved')
  ), '[]'::jsonb);
end $$;

-- 粉丝 / 关注列表。私密账号未通过时看不到对方的列表。
create or replace function public.profile_follow_list(
  p_user uuid, p_kind text, p_offset int default 0, p_limit int default 30
)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_kind not in ('followers', 'following') then raise exception 'invalid kind'; end if;
  if not public.can_view_profile(p_user) then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(public.profile_card(x.uid) order by x.created_at desc)
      from (
        select case when p_kind = 'followers' then f.follower_id else f.followee_id end as uid, f.created_at
          from public.follows f
         where f.status = 'accepted'
           and (case when p_kind = 'followers' then f.followee_id else f.follower_id end) = p_user
           and not public.is_blocked_between(auth.uid(),
                 case when p_kind = 'followers' then f.follower_id else f.followee_id end)
         order by f.created_at desc
         offset greatest(coalesce(p_offset, 0), 0)
         limit least(greatest(coalesce(p_limit, 30), 1), 100)
      ) x
  ), '[]'::jsonb);
end $$;

-- 列表里的一行：头像、昵称、用户名，以及和当前用户的关系。
create or replace function public.profile_card(p_user uuid)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'id', p.id,
    'nick', coalesce(nullif(trim(p.nick), ''), nullif(trim(p.display_name), ''), ''),
    'username', p.username,
    'avatarUrl', p.avatar_url,
    'avatarIni', p.avatar_ini,
    'avatarColor', p.avatar_color,
    'isPrivate', p.is_private,
    'relation', public.profile_relation(p.id)
  )
  from public.profiles p where p.id = p_user;
$$;

create or replace function public.follow_requests()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select coalesce(jsonb_agg(public.profile_card(f.follower_id) order by f.created_at desc), '[]'::jsonb)
    from public.follows f
   where f.followee_id = auth.uid() and f.status = 'pending';
$$;

create or replace function public.search_profiles(p_query text, p_limit int default 20)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare q text := trim(coalesce(p_query, ''));
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if q = '' then return '[]'::jsonb; end if;
  q := replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_');
  return coalesce((
    select jsonb_agg(public.profile_card(x.id))
      from (
        select p.id
          from public.profiles p
         where p.id <> auth.uid()
           and not public.is_blocked_between(auth.uid(), p.id)
           and (p.nick ilike '%' || q || '%' or p.display_name ilike '%' || q || '%'
                or (p.username <> '' and p.username ilike q || '%'))
         order by (p.username = trim(p_query)) desc, (p.nick = trim(p_query)) desc, p.created_at
         limit least(greatest(coalesce(p_limit, 20), 1), 50)
      ) x
  ), '[]'::jsonb);
end $$;

-- 可能认识的人：一起走过同一段旅程、还没关注的人。
create or replace function public.suggested_profiles(p_limit int default 20)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select coalesce(jsonb_agg(public.profile_card(x.uid)), '[]'::jsonb)
    from (
      select c.user_id as uid, count(*) as shared
        from public.companions c
       where c.user_id is not null and c.user_id <> auth.uid()
         and c.journey_id in (
           select id from public.journeys where user_id = auth.uid() and deleted_at is null
           union
           select c2.journey_id from public.companions c2 where c2.user_id = auth.uid()
         )
         and not exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = c.user_id)
         and not public.is_blocked_between(auth.uid(), c.user_id)
       group by c.user_id
       order by shared desc
       limit least(greatest(coalesce(p_limit, 20), 1), 50)
    ) x;
$$;

-- ── 7. 权限 ──
revoke all on function public.follow_user(uuid) from public, anon;
revoke all on function public.unfollow_user(uuid) from public, anon;
revoke all on function public.respond_follow_request(uuid, boolean) from public, anon;
revoke all on function public.remove_follower(uuid) from public, anon;
revoke all on function public.block_user(uuid) from public, anon;
revoke all on function public.unblock_user(uuid) from public, anon;
revoke all on function public.set_account_private(boolean) from public, anon;
revoke all on function public.profile_summary(uuid) from public, anon;
revoke all on function public.profile_outings(uuid, timestamptz, int) from public, anon;
revoke all on function public.profile_outing_photos(uuid, text) from public, anon;
revoke all on function public.profile_follow_list(uuid, text, int, int) from public, anon;
revoke all on function public.profile_card(uuid) from public, anon;
revoke all on function public.follow_requests() from public, anon;
revoke all on function public.search_profiles(text, int) from public, anon;
revoke all on function public.suggested_profiles(int) from public, anon;

grant execute on function public.follow_user(uuid) to authenticated;
grant execute on function public.unfollow_user(uuid) to authenticated;
grant execute on function public.respond_follow_request(uuid, boolean) to authenticated;
grant execute on function public.remove_follower(uuid) to authenticated;
grant execute on function public.block_user(uuid) to authenticated;
grant execute on function public.unblock_user(uuid) to authenticated;
grant execute on function public.set_account_private(boolean) to authenticated;
grant execute on function public.profile_summary(uuid) to authenticated;
grant execute on function public.profile_outings(uuid, timestamptz, int) to authenticated;
grant execute on function public.profile_outing_photos(uuid, text) to authenticated;
grant execute on function public.profile_follow_list(uuid, text, int, int) to authenticated;
grant execute on function public.profile_card(uuid) to authenticated;
grant execute on function public.follow_requests() to authenticated;
grant execute on function public.search_profiles(text, int) to authenticated;
grant execute on function public.suggested_profiles(int) to authenticated;

commit;
