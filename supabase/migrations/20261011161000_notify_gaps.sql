-- ════════════════════════════════════════════════════════════
-- 补齐通知缺口触发器（应用内 + 推送共用 notifications 表）
--   1. 路书审核结果 → 作者（route_guides.status approved/rejected）
--   2. 旅伴离开旅程 → 房主（companions DELETE，跳过房主本人/旅程已不存在）
--   3. Web 访客上传瞬间 → 房主（shared_moments INSERT；推送频控在 push_outbox 入队时合并）
-- 应用：infra/supabase/apply-migration.sh supabase/migrations/<本文件>。幂等。
-- ════════════════════════════════════════════════════════════

-- ── 1. 路书审核结果 ──
CREATE OR REPLACE FUNCTION public.notify_route_guide_review()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('approved','rejected') THEN
    INSERT INTO public.notifications (
      user_id, kind, cat, bucket, time, who, avatar, color, verb,
      target, target_id, action, created_at
    ) VALUES (
      NEW.author_id,
      'guide_review',
      'system',
      'today',
      '刚刚',
      'Kaipa',
      NULL,
      NULL,
      CASE WHEN NEW.status = 'approved'
        THEN '审核通过了你的路书'
        ELSE '驳回了你的路书：' || COALESCE(LEFT(NEW.rejection_reason, 40), '内容暂不符合收录要求')
      END,
      NEW.title,
      NEW.route_id,          -- 路由到路线详情（openNotificationTarget 的 routes 分支）
      '查看',
      now()
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS route_guides_review_notification ON public.route_guides;
CREATE TRIGGER route_guides_review_notification
AFTER UPDATE OF status ON public.route_guides
FOR EACH ROW EXECUTE FUNCTION public.notify_route_guide_review();

-- ── 2. 旅伴离开旅程 → 房主 ──
CREATE OR REPLACE FUNCTION public.notify_journey_owner_on_companion_leave()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  journey_owner UUID;
  journey_name  TEXT;
BEGIN
  IF OLD.user_id IS NULL THEN
    RETURN OLD;  -- 无账号的旅伴行
  END IF;
  SELECT j.user_id, j.name INTO journey_owner, journey_name
    FROM public.journeys j WHERE j.id = OLD.journey_id;
  IF journey_owner IS NULL OR journey_owner = OLD.user_id THEN
    RETURN OLD;  -- 旅程已不存在（级联删除）或房主自己
  END IF;
  INSERT INTO public.notifications (
    user_id, kind, cat, bucket, time, who, avatar, color, verb,
    target, target_id, action, created_at
  ) VALUES (
    journey_owner,
    'companion_leave',
    'social',
    'today',
    '刚刚',
    COALESCE(OLD.name, '旅程伙伴'),
    OLD.avatar_url,
    COALESCE(OLD.color, '#2E7D5B'),
    '离开了你的旅程',
    journey_name,
    OLD.journey_id,
    '查看',
    now()
  );
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS companions_notify_journey_owner_leave ON public.companions;
CREATE TRIGGER companions_notify_journey_owner_leave
AFTER DELETE ON public.companions
FOR EACH ROW EXECUTE FUNCTION public.notify_journey_owner_on_companion_leave();

-- ── 3. Web 访客上传瞬间 → 房主 ──
CREATE OR REPLACE FUNCTION public.notify_owner_on_guest_moment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  journey_owner UUID;
  journey_name  TEXT;
BEGIN
  SELECT j.user_id, j.name INTO journey_owner, journey_name
    FROM public.journeys j
   WHERE j.id = NEW.journey_id AND j.deleted_at IS NULL;
  IF journey_owner IS NULL THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.notifications (
    user_id, kind, cat, bucket, time, who, avatar, color, verb,
    target, target_id, action, created_at
  ) VALUES (
    journey_owner,
    'guest_moment',
    'social',
    'today',
    '刚刚',
    COALESCE(NULLIF(NEW.guest_name, ''), '访客'),
    NULL,
    COALESCE(NULLIF(NEW.guest_tone, ''), '#2E7D5B'),
    CASE WHEN NEW.is_text THEN '在你的旅程里留了言' ELSE '向你的旅程上传了新瞬间' END,
    journey_name,
    NEW.journey_id,
    '查看',
    now()
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS shared_moments_notify_owner ON public.shared_moments;
CREATE TRIGGER shared_moments_notify_owner
AFTER INSERT ON public.shared_moments
FOR EACH ROW EXECUTE FUNCTION public.notify_owner_on_guest_moment();

NOTIFY pgrst, 'reload schema';
