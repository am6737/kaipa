begin;

-- 时间线卡片第二行显示「日期 地点」。旅程有自己的地区，单独的轨迹（App 里录的、
-- 导入的）原来没有，这里给轨迹加一个。
--
--   * tracks.region 是「城市 区县」，比如「桂林市 阳朔县」。客户端在轨迹保存后
--     拿轨迹中段的一个点反查高德写进来，不用起点，免得落到住处附近。
--   * 高德查不到的地方（国外）留空，卡片就只显示日期。
--   * 旅程没填地区时也用它垫上。

alter table public.tracks
  add column if not exists region text;

create or replace function public.profile_outing_rows(p_user uuid)
returns table (
  outing_id text, kind text, journey_id text, track_id uuid, visibility text,
  title text, route_id text, region text, date_label text, occurred_at timestamptz,
  total_days int, dist_m bigint, asc_m bigint, duration_ms bigint, coords jsonb,
  imported boolean
)
language sql stable security definer set search_path = public
as $$
  select 'j:' || j.id,
         case when t.id is not null then 'both' else 'journey' end,
         j.id, t.id, j.visibility,
         j.name, j.route_id, coalesce(nullif(j.region, ''), nullif(t.region, '')), nullif(j.date, ''),
         coalesce(t.started_at, j.created_at),
         j.total_days, t.dist_m, t.asc_m, t.duration_ms, t.coords,
         false
    from public.journeys j
    left join public.tracks t on t.id = j.track_id
   where j.user_id = p_user and j.deleted_at is null
     and (j.status = 'completed' or j.track_id is not null)
  union all
  select 't:' || t.id::text, 'track', null, t.id, t.visibility,
         t.name, null, nullif(t.region, ''), null,
         coalesce(t.started_at, t.created_at),
         null, t.dist_m, t.asc_m, t.duration_ms, t.coords,
         t.file_format is not null
    from public.tracks t
   where t.user_id = p_user and (t.file_format is null or t.own_outing)
     and not exists (
       select 1 from public.journeys j
        where j.track_id = t.id and j.user_id = p_user and j.deleted_at is null
     );
$$;
revoke all on function public.profile_outing_rows(uuid) from public, anon, authenticated;

commit;
