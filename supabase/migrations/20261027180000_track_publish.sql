begin;

-- 发布轨迹：轨迹自己的一个开关，打开后所有登录用户都能在搜索的「轨迹」标签里
-- 搜到它，并看到上传人的昵称。
--
--   * 和主页可见范围（tracks.visibility）互不影响：发布只管能不能被搜到、被打开。
--   * 发布就是作者主动公开，返回完整坐标，不裁起终点（主页预览的裁剪照旧）。
--   * 私密账号的已发布轨迹同样能搜到：发布是对这一条的明确选择。
--   * 拉黑的双方互相搜不到、打不开。
--   * 原始文件地址不返回，导出时由坐标重新生成 GPX。

alter table public.tracks
  add column if not exists published_at timestamptz;

create index if not exists tracks_published_idx
  on public.tracks (published_at desc) where published_at is not null;

-- 只有本人能开关。重复打开不刷新发布时间，排序不会因此跳动。
create or replace function public.set_track_published(p_track uuid, p_published boolean)
returns timestamptz
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  result timestamptz;
begin
  if me is null then raise exception 'not authenticated'; end if;
  update public.tracks
     set published_at = case when coalesce(p_published, false) then coalesce(published_at, now()) end
   where id = p_track and user_id = me
  returning published_at into result;
  if not found then raise exception using errcode = '42501', message = 'track owner required'; end if;
  return result;
end $$;
revoke all on function public.set_track_published(uuid, boolean) from public, anon;
grant execute on function public.set_track_published(uuid, boolean) to authenticated;

create or replace function public.published_track_owner(p_user uuid)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'id', p.id,
    'nick', coalesce(nullif(trim(p.nick), ''), nullif(trim(p.display_name), ''), ''),
    'avatarUrl', p.avatar_url,
    'avatarIni', p.avatar_ini,
    'avatarColor', p.avatar_color
  )
  from public.profiles p where p.id = p_user;
$$;
revoke all on function public.published_track_owner(uuid) from public, anon, authenticated;

-- 按轨迹名或上传人昵称搜索，新发布的在前。列表只带抽稀后的坐标，够画缩略图。
create or replace function public.search_published_tracks(
  p_query text, p_limit int default 20, p_offset int default 0
)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  q text := nullif(trim(coalesce(p_query, '')), '');
  pattern text;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if q is null then return '[]'::jsonb; end if;
  pattern := '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return coalesce((
    select jsonb_agg(row_to_json(x)::jsonb order by x."publishedAt" desc)
      from (
        select t.id, t.name, t.dist_m as "distM", t.asc_m as "ascM", t.duration_ms as "durationMs",
               t.published_at as "publishedAt",
               public.outing_preview_coords(t.coords, 0, 80) as coords,
               public.published_track_owner(t.user_id) as owner
          from public.tracks t
          join public.profiles p on p.id = t.user_id
         where t.published_at is not null
           and not public.is_blocked_between(t.user_id, me)
           and (t.name ilike pattern
                or coalesce(nullif(trim(p.nick), ''), p.display_name, '') ilike pattern)
         order by t.published_at desc
         limit least(greatest(coalesce(p_limit, 20), 1), 50)
        offset greatest(coalesce(p_offset, 0), 0)
      ) x
  ), '[]'::jsonb);
end $$;
revoke all on function public.search_published_tracks(text, int, int) from public, anon;
grant execute on function public.search_published_tracks(text, int, int) to authenticated;

-- 打开一条已发布的轨迹：完整坐标、海拔和标注点。本人的轨迹不论发布与否都能读。
create or replace function public.published_track(p_track uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  t public.tracks%rowtype;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select * into t from public.tracks where id = p_track;
  if not found then return null; end if;
  if t.user_id <> me and (t.published_at is null or public.is_blocked_between(t.user_id, me)) then
    return null;
  end if;
  return jsonb_build_object(
    'id', t.id,
    'name', t.name,
    'file_name', t.file_name,
    'file_format', t.file_format,
    'coords', t.coords,
    'elevation', t.elevation,
    'duration_ms', t.duration_ms,
    'waypoints', t.waypoints,
    'dist_m', t.dist_m,
    'asc_m', t.asc_m,
    'point_count', t.point_count,
    'started_at', t.started_at,
    'published_at', t.published_at,
    'created_at', t.created_at,
    'owner', public.published_track_owner(t.user_id)
  );
end $$;
revoke all on function public.published_track(uuid) from public, anon;
grant execute on function public.published_track(uuid) to authenticated;

commit;
