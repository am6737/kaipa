begin;

-- 导入以前的轨迹：在别的 App 里走过的徒步，导入后也算时间线上的一次出行。
--
--   * tracks.own_outing 标记「这是本人走过的」。从时间线导入时设为 true；从
--     「我的轨迹」导入的仍是路线文件，默认 false，不进时间线。
--   * 时间线收：App 内录的（file_format 为空），或 own_outing 的导入文件。
--   * imported 告诉卡片这一条来自文件，别人看时也照样标出来。

alter table public.tracks
  add column if not exists own_outing boolean not null default false;

-- 返回列变了，create or replace 改不了，先删再建。两个调用方都是 plpgsql，
-- 不登记依赖，删掉不会连带。
drop function if exists public.profile_outing_rows(uuid);

create function public.profile_outing_rows(p_user uuid)
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
         j.name, j.route_id, j.region, nullif(j.date, ''),
         coalesce(t.started_at, j.created_at),
         j.total_days, t.dist_m, t.asc_m, t.duration_ms, t.coords,
         false
    from public.journeys j
    left join public.tracks t on t.id = j.track_id
   where j.user_id = p_user and j.deleted_at is null
     and (j.status = 'completed' or j.track_id is not null)
  union all
  select 't:' || t.id::text, 'track', null, t.id, t.visibility,
         t.name, null, null, null,
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
               o.imported,
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

commit;
