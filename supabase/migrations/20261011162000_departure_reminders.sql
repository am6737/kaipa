-- ════════════════════════════════════════════════════════════
-- 出发提醒（定时扫描，由 agent-worker 每分钟 rpc 调用）
--   day_before：出发前一天（Asia/Shanghai 本地 ≥20:00 触发）
--   day_of    ：出发当天（本地 ≥08:00 触发）
-- 幂等：departure_reminders 按 (journey_id, bucket, planned_date) 占坑——同一出发日只提醒
-- 一次，改期后（planned_date 变化）会按新日期重新提醒；
-- notification id 用 'departure-<journey>-<bucket>-<planned_date>' 做二次兜底。
-- 通知写入后由 push_outbox 触发器自动进入推送链路。
-- 应用：infra/supabase/apply-migration.sh supabase/migrations/<本文件>。幂等，可重复执行。
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.departure_reminders (
  journey_id   TEXT NOT NULL REFERENCES public.journeys(id) ON DELETE CASCADE,
  bucket       TEXT NOT NULL CHECK (bucket IN ('day_before','day_of')),
  planned_date TEXT NOT NULL DEFAULT '',
  sent_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.departure_reminders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.departure_reminders FROM anon, authenticated;

-- 旧版本 PK 是 (journey_id, bucket)：改期后不再提醒。升级为含 planned_date 的三元组。
ALTER TABLE public.departure_reminders ADD COLUMN IF NOT EXISTS planned_date TEXT NOT NULL DEFAULT '';
UPDATE public.departure_reminders dr SET planned_date = COALESCE(
  (SELECT j.planned_date FROM public.journeys j WHERE j.id = dr.journey_id), ''
) WHERE dr.planned_date = '';
ALTER TABLE public.departure_reminders DROP CONSTRAINT IF EXISTS departure_reminders_pkey;
CREATE UNIQUE INDEX IF NOT EXISTS departure_reminders_pkey
  ON public.departure_reminders (journey_id, bucket, planned_date);

CREATE OR REPLACE FUNCTION public.scan_departure_reminders()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_local  TIMESTAMP := (now() AT TIME ZONE 'Asia/Shanghai');
  v_today  DATE := v_local::date;
  v_hhmm   TEXT := to_char(v_local, 'HH24:MI');
  v_count  INT := 0;
  v_added  INT := 0;
BEGIN
  -- 前一天 20:00 起
  IF v_hhmm >= '20:00' THEN
    WITH claimed AS (
      INSERT INTO public.departure_reminders (journey_id, bucket, planned_date)
      SELECT j.id, 'day_before', j.planned_date
        FROM public.journeys j
       WHERE j.deleted_at IS NULL
         AND j.planned_date = (v_today + 1)::text
      ON CONFLICT (journey_id, bucket, planned_date) DO NOTHING
      RETURNING journey_id, planned_date
    )
    INSERT INTO public.notifications (
      id, user_id, kind, cat, bucket, time, who, avatar, color, verb,
      target, target_id, action, created_at
    )
    SELECT 'departure-' || c.journey_id || '-day_before-' || c.planned_date,
           j.user_id, 'departure', 'system', 'today', '明天出发', '开爬',
           NULL, NULL,
           '明天就要出发了，记得检查装备清单和天气',
           j.name, j.id, '查看', now()
      FROM claimed c JOIN public.journeys j ON j.id = c.journey_id
    ON CONFLICT (id) DO NOTHING;
    GET DIAGNOSTICS v_added = ROW_COUNT;
    v_count := v_count + v_added;
  END IF;

  -- 当天 08:00 起
  IF v_hhmm >= '08:00' THEN
    WITH claimed AS (
      INSERT INTO public.departure_reminders (journey_id, bucket, planned_date)
      SELECT j.id, 'day_of', j.planned_date
        FROM public.journeys j
       WHERE j.deleted_at IS NULL
         AND j.planned_date = v_today::text
      ON CONFLICT (journey_id, bucket, planned_date) DO NOTHING
      RETURNING journey_id, planned_date
    )
    INSERT INTO public.notifications (
      id, user_id, kind, cat, bucket, time, who, avatar, color, verb,
      target, target_id, action, created_at
    )
    SELECT 'departure-' || c.journey_id || '-day_of-' || c.planned_date,
           j.user_id, 'departure', 'system', 'today', '今天', '开爬',
           NULL, NULL,
           '今天是你计划的出发日，一路顺利',
           j.name, j.id, '查看', now()
      FROM claimed c JOIN public.journeys j ON j.id = c.journey_id
    ON CONFLICT (id) DO NOTHING;
    GET DIAGNOSTICS v_added = ROW_COUNT;
    v_count := v_count + v_added;
  END IF;

  RETURN v_count;
END $$;

REVOKE ALL ON FUNCTION public.scan_departure_reminders() FROM public;
GRANT EXECUTE ON FUNCTION public.scan_departure_reminders() TO service_role;

NOTIFY pgrst, 'reload schema';
