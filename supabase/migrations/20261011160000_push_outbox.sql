-- ════════════════════════════════════════════════════════════
-- push_outbox — 推送发送持久化队列（Transactional Outbox + 即时分发）
--
-- 链路：notifications 表是应用内+推送的统一事件源。notifications INSERT 触发
-- 语句级 kick（唤醒 Edge Function send-push-notifications 的 drain），
-- 行级 trigger 入队 push_outbox；agent-worker 每分钟 rpc kick_push_drain() 兜底。
-- 发送、免打扰、频控逻辑都在函数侧，DB 只负责"事件一定入队 + 唤醒"。
--
-- 应用：infra/supabase/apply-migration.sh supabase/migrations/<本文件>。幂等。
-- 前置：pg_net 已装（本实例已确认）。
-- 首次配置：手工 UPSERT notify_secret（与函数校验同源，避免 env/DB 双写不一致）：
--   docker exec -i kaipa-supabase-db psql -U postgres -d postgres <<'SQL'
--   insert into public.push_runtime_config(key,value) values('notify_secret','<随机长串>')
--   on conflict(key) do update set value=excluded.value, updated_at=now();
--   SQL
-- ════════════════════════════════════════════════════════════

-- ── 0. 运行时配置（单行 key/value；不建策略：客户端一律拒绝）──
CREATE TABLE IF NOT EXISTS public.push_runtime_config (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.push_runtime_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_runtime_config FROM anon, authenticated;

-- ── 1. 发件箱（队列 + 投递台账）──
CREATE TABLE IF NOT EXISTS public.push_outbox (
  id               BIGSERIAL PRIMARY KEY,
  notification_id  TEXT NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL,
  kind             TEXT NOT NULL,          -- 冗余 notifications.kind，频控/排障用
  dedupe_key       TEXT UNIQUE,            -- 'notif:'||notification_id，幂等防重复入队
  status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','processing','done','dead')),
  attempts         INT  NOT NULL DEFAULT 0,
  max_attempts     INT  NOT NULL DEFAULT 6,
  next_attempt_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_device_ids  JSONB NOT NULL DEFAULT '[]',  -- 已实发设备（免打扰重排后不重复推送）
  sent_count       INT,
  last_error       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_push_outbox_claim ON public.push_outbox (status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_push_outbox_user_kind ON public.push_outbox (user_id, kind, processed_at DESC);
ALTER TABLE public.push_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_outbox FROM anon, authenticated;

-- ── 2. 唤醒 drain（best-effort；pg_net 失败由 agent-worker 每分钟兜底）──
CREATE OR REPLACE FUNCTION public.kick_push_drain()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret TEXT;
BEGIN
  SELECT value INTO v_secret FROM public.push_runtime_config WHERE key = 'notify_secret';
  IF v_secret IS NULL OR v_secret = '' THEN
    RETURN;  -- 未配置密钥：不 kick（fail-closed），入队仍继续，配置后由兜底 drain 消费
  END IF;
  PERFORM net.http_post(
    url     := 'http://kong:8000/functions/v1/send-push-notifications',
    body    := '{"event":"drain"}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Notify-Secret', v_secret
    ),
    timeout_milliseconds := 60000
  );
END $$;
REVOKE ALL ON FUNCTION public.kick_push_drain() FROM public;
GRANT EXECUTE ON FUNCTION public.kick_push_drain() TO service_role;

-- ── 3. 入队触发器：notifications AFTER INSERT 行级 ──
CREATE OR REPLACE FUNCTION public.enqueue_push_for_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 访客瞬间频控：同一旅程 1 小时内只推 1 条（应用内通知不受影响）。
  IF NEW.kind = 'guest_moment' AND EXISTS (
    SELECT 1 FROM public.notifications n
     WHERE n.kind = 'guest_moment'
       AND n.user_id = NEW.user_id
       AND n.target_id IS NOT DISTINCT FROM NEW.target_id
       AND n.id <> NEW.id
       AND n.created_at > now() - interval '1 hour'
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.push_outbox (notification_id, user_id, kind, dedupe_key)
  VALUES (NEW.id, NEW.user_id, NEW.kind, 'notif:' || NEW.id)
  ON CONFLICT (dedupe_key) DO NOTHING;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_notifications_enqueue_push ON public.notifications;
CREATE TRIGGER trg_notifications_enqueue_push
AFTER INSERT ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.enqueue_push_for_notification();

-- 语句级 kick：一条 INSERT…SELECT（广播/会员批量）只唤醒一次。
CREATE OR REPLACE FUNCTION public.kick_push_drain_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.kick_push_drain();
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_notifications_kick_push ON public.notifications;
CREATE TRIGGER trg_notifications_kick_push
AFTER INSERT ON public.notifications
FOR EACH STATEMENT EXECUTE FUNCTION public.kick_push_drain_on_insert();

-- ── 4. 领取一批任务（原子 + SKIP LOCKED + 卡死回收）──
CREATE OR REPLACE FUNCTION public.claim_push_jobs(p_limit INT DEFAULT 20)
RETURNS SETOF public.push_outbox
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.push_outbox o
  SET status = 'processing', attempts = attempts + 1, processed_at = now()
  FROM (
    SELECT id FROM public.push_outbox
    WHERE (status = 'pending'    AND next_attempt_at <= now())
       OR (status = 'processing' AND processed_at < now() - interval '5 minutes')
    ORDER BY id
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  ) c
  WHERE o.id = c.id
  RETURNING o.*;
$$;

-- ── 5. 收尾 ──
-- p_ok：done。p_reschedule_at：免打扰顺延。其余失败：指数退避回 pending，耗尽 max_attempts 则 dead。
-- p_attempt：claim 时自增后的 attempts 值。卡死回收（5 分钟）会让第二个 worker 再次领取并
-- 自增 attempts，迟到的第一个 worker 用旧值收尾会命中 0 行更新，从而杜绝双写/双发。
-- 顺延只在纯 quiet_hours（无发送失败）时回拨 attempts；带失败信息则保留，让重试照常计数。
DROP FUNCTION IF EXISTS public.complete_push_job(bigint,boolean,int,text,timestamptz,jsonb);
CREATE OR REPLACE FUNCTION public.complete_push_job(
  p_id                BIGINT,
  p_ok                BOOLEAN,
  p_sent              INT,
  p_error             TEXT,
  p_reschedule_at     TIMESTAMPTZ DEFAULT NULL,
  p_sent_device_ids   JSONB DEFAULT '[]',
  p_attempt           INT DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_ok THEN
    UPDATE public.push_outbox
      SET status = 'done', sent_count = p_sent, sent_device_ids = p_sent_device_ids,
          last_error = NULL, processed_at = now()
      WHERE id = p_id AND (p_attempt IS NULL OR attempts = p_attempt);
  ELSIF p_reschedule_at IS NOT NULL THEN
    UPDATE public.push_outbox
      SET status = 'pending',
          attempts = CASE WHEN coalesce(p_error, '') = 'quiet_hours'
                          THEN greatest(attempts - 1, 0) ELSE attempts END,
          next_attempt_at = p_reschedule_at,
          sent_device_ids = p_sent_device_ids,
          last_error = left(p_error, 500),
          processed_at = now()
      WHERE id = p_id AND (p_attempt IS NULL OR attempts = p_attempt);
  ELSE
    UPDATE public.push_outbox
      SET status = CASE WHEN attempts >= max_attempts THEN 'dead' ELSE 'pending' END,
          sent_device_ids = p_sent_device_ids,
          last_error = left(p_error, 500),
          next_attempt_at = now() + least(interval '30 seconds' * power(2, attempts), interval '30 minutes'),
          processed_at = now()
      WHERE id = p_id AND (p_attempt IS NULL OR attempts = p_attempt);
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.claim_push_jobs(int)                     FROM public;
REVOKE ALL ON FUNCTION public.complete_push_job(bigint,boolean,int,text,timestamptz,jsonb,int) FROM public;
GRANT EXECUTE ON FUNCTION public.claim_push_jobs(int)                     TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_push_job(bigint,boolean,int,text,timestamptz,jsonb,int) TO service_role;

-- 让 PostgREST 立即发现新函数
NOTIFY pgrst, 'reload schema';
