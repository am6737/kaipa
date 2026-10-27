begin;

-- 关注体系第 3 批补充：
--   * relation 增加 requestedMe：对方向我发了还没处理的关注请求，主页上直接给「接受 / 拒绝」。
--   * profile_summary 增加 hiddenOutings：只给粉丝看、当前用户还看不到的出行数，
--     用来提示「还有 TA 只给粉丝看的出行，关注后可见」。

create or replace function public.profile_relation(p_user uuid)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'self', p_user = auth.uid(),
    'following', coalesce((select status from public.follows where follower_id = auth.uid() and followee_id = p_user), 'none'),
    'followedBy', public.is_accepted_follower(p_user, auth.uid()),
    'requestedMe', exists (
      select 1 from public.follows where follower_id = p_user and followee_id = auth.uid() and status = 'pending'
    ),
    'blocked', exists (select 1 from public.user_blocks where blocker_id = auth.uid() and blocked_id = p_user)
  );
$$;

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
       where o.visibility = 'followers' and not public.can_view_profile_content(p_user, o.visibility)) end
  );
end $$;

commit;
