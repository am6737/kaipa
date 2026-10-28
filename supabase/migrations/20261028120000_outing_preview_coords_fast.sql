begin;

-- 时间线卡片的缩略线：原来逐点 `p_coords -> i` 取坐标，每次都把整段压缩过的
-- jsonb 解开一遍，累计距离又用 `cum || x` 每轮复制数组。几千个点的轨迹一条就要
-- 好几秒，蓝莓派的 7 条加起来 29 秒，超过 authenticated 的 8 秒语句超时，
-- profile_outings 直接报错，时间线显示成「还没有出行」。
--
-- 改成一次展开坐标、用窗口函数累加距离，后面只在本地数组上走。输出和原来一致：
-- 两端各裁掉 p_trim_m 米，均匀抽到不超过 p_max 个点，末尾补上最后一个保留点。

create or replace function public.outing_preview_coords(p_coords jsonb, p_trim_m numeric, p_max integer)
returns jsonb
language plpgsql
immutable
as $$
declare
  n int;
  cum numeric[];
  pts jsonb[];
  total numeric;
  first_i int; last_i int;
  kept int;
  step numeric;
  result jsonb := '[]'::jsonb;
  j int;
begin
  if p_coords is null or jsonb_typeof(p_coords) <> 'array' then return '[]'::jsonb; end if;
  n := jsonb_array_length(p_coords);
  if n < 2 then return '[]'::jsonb; end if;

  select array_agg(c order by k), array_agg(p order by k)
    into cum, pts
    from (
      select k,
             jsonb_build_array(e -> 0, e -> 1) as p,
             coalesce(sum(d) over (order by k rows unbounded preceding), 0)::numeric as c
        from (
          select k, e,
                 2 * 6371000 * asin(sqrt(
                   power(sin(radians(lat - lag(lat) over w) / 2), 2)
                   + cos(radians(lag(lat) over w)) * cos(radians(lat))
                     * power(sin(radians(lng - lag(lng) over w) / 2), 2)
                 )) as d
            from (
              select k, e, (e ->> 0)::double precision as lng, (e ->> 1)::double precision as lat
                from jsonb_array_elements(p_coords) with ordinality as a(e, k)
            ) s
          window w as (order by k)
        ) t
    ) u;
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
    result := result || jsonb_build_array(pts[first_i + floor(j * step)::int]);
    j := j + 1;
  end loop;
  -- 抽稀可能跳过最后一个保留点，补上，让线画到裁剪处为止。
  if (result -> -1) is distinct from pts[last_i] then
    result := result || jsonb_build_array(pts[last_i]);
  end if;
  return result;
end $$;

commit;
