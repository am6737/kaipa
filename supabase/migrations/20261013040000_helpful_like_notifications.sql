begin;

-- 点赞通知：实况与路书的「有用」原本只改计数，作者收不到任何反馈。
-- 通知文案存在库里（与 guide_review 等一致），所以在这里写入 notifications，
-- 推送由 trg_notifications_enqueue_push 自动入队。

-- ── 1. 共用的点赞通知 ──
CREATE OR REPLACE FUNCTION public.notify_helpful(
  p_recipient uuid,
  p_actor     uuid,
  p_kind      text,
  p_verb      text,
  p_target    text,
  p_target_id text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor public.profiles%rowtype;
BEGIN
  -- 自己点赞自己的内容不打扰。
  IF p_recipient IS NULL OR p_actor IS NULL OR p_recipient = p_actor THEN
    RETURN;
  END IF;

  -- notifications.user_id / actor_user_id 都外键到 profiles，任一方缺档案行时
  -- 插入会报错并连带回滚整次点赞，所以这里直接放弃通知而不是冒这个风险。
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_recipient) THEN
    RETURN;
  END IF;

  -- 同一个人对同一条内容 24 小时内只提醒一次，反复取消再点赞不重复推送。
  IF EXISTS (
    SELECT 1 FROM public.notifications n
     WHERE n.kind = p_kind
       AND n.user_id = p_recipient
       AND n.actor_user_id = p_actor
       AND n.target_id IS NOT DISTINCT FROM p_target_id
       AND n.created_at > now() - interval '24 hours'
  ) THEN
    RETURN;
  END IF;

  SELECT * INTO actor FROM public.profiles WHERE id = p_actor;
  IF NOT FOUND THEN
    actor.id := NULL;
  END IF;

  INSERT INTO public.notifications (
    user_id, actor_user_id, kind, cat, bucket, time, who, avatar, color, verb,
    target, target_id, action, created_at
  ) VALUES (
    p_recipient,
    actor.id,
    p_kind,
    'social',
    'today',
    '刚刚',
    COALESCE(NULLIF(TRIM(actor.display_name), ''), NULLIF(TRIM(actor.nick), ''), '有人'),
    NULLIF(actor.avatar_url, ''),
    NULL,
    p_verb,
    NULLIF(TRIM(COALESCE(p_target, '')), ''),
    p_target_id,
    '查看',
    now()
  );
END $$;

REVOKE ALL ON FUNCTION public.notify_helpful(uuid, uuid, text, text, text, text) FROM PUBLIC;

-- ── 2. 近期实况点赞 → 作者 ──
CREATE OR REPLACE FUNCTION public.route_observation_helpful(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  observation public.route_observations%rowtype;
  route_name  text;
  removed boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT * INTO observation
    FROM public.route_observations
   WHERE id = p_id
     AND (moderation_status = 'approved' OR (user_id = auth.uid() AND moderation_status = 'pending'))
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'observation not found';
  END IF;

  DELETE FROM public.route_observation_helpful_votes
   WHERE observation_id = p_id AND user_id = auth.uid();
  removed := found;

  IF removed THEN
    UPDATE public.route_observations
       SET helpful_count = greatest(0, helpful_count - 1), updated_at = now()
     WHERE id = p_id;
    RETURN false;
  END IF;

  INSERT INTO public.route_observation_helpful_votes (observation_id, user_id)
  VALUES (p_id, auth.uid());
  UPDATE public.route_observations
     SET helpful_count = helpful_count + 1, updated_at = now()
   WHERE id = p_id;

  SELECT name INTO route_name FROM public.routes WHERE id = observation.route_id;
  PERFORM public.notify_helpful(
    observation.user_id, auth.uid(), 'observation_like',
    '觉得你的路线实况有用', route_name, observation.route_id
  );

  RETURN true;
END $$;

-- ── 3. 路书点赞 → 作者 ──
CREATE OR REPLACE FUNCTION public.route_guide_helpful(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  guide_author uuid;
  guide_route  text;
  guide_title  text;
  removed boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT author_id, route_id, title
    INTO guide_author, guide_route, guide_title
    FROM public.route_guides
   WHERE id = p_id
     AND (status = 'approved' OR author_id = auth.uid())
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'guide not found';
  END IF;

  DELETE FROM public.route_guide_helpful_votes
   WHERE guide_id = p_id AND user_id = auth.uid();
  removed := found;

  IF removed THEN
    UPDATE public.route_guides
       SET helpful_count = greatest(0, helpful_count - 1)
     WHERE id = p_id;
    RETURN false;
  END IF;

  INSERT INTO public.route_guide_helpful_votes (guide_id, user_id)
  VALUES (p_id, auth.uid());
  UPDATE public.route_guides
     SET helpful_count = helpful_count + 1
   WHERE id = p_id;

  PERFORM public.notify_helpful(
    guide_author, auth.uid(), 'guide_like', '觉得你的路书有用', guide_title, guide_route
  );

  RETURN true;
END $$;

GRANT EXECUTE ON FUNCTION public.route_observation_helpful(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.route_guide_helpful(uuid) TO authenticated;

notify pgrst, 'reload schema';
commit;
