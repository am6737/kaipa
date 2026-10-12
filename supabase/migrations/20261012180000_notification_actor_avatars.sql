-- 通知头像改为实时读取。
-- notifications.avatar 一直是写入时抄下的显示快照，而头像每次上传都会生成新的
-- 存储路径（avatars/<uid>/<ticket>.jpg），用户换头像后旧通知就永远指向老图；
-- 「加入旅程」的触发器更夸张，抄的是姓名缩写。这里补一列触发者 id，前端按 id
-- 现取 profiles.avatar_url，avatar 列退化为取不到实时值时的兜底。
-- 应用：infra/supabase/apply-migration.sh supabase/migrations/<本文件>。幂等。

alter table public.notifications
  add column if not exists actor_user_id uuid references public.profiles(id) on delete set null;

-- ── 1. 旅伴加入旅程 → 房主 ──
CREATE OR REPLACE FUNCTION public.notify_journey_owner_on_companion_join()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  journey_owner UUID;
  journey_name  TEXT;
BEGIN
  IF new.user_id IS NULL THEN
    RETURN new;
  END IF;

  SELECT j.user_id, j.name
    INTO journey_owner, journey_name
    FROM public.journeys j
   WHERE j.id = new.journey_id;

  IF journey_owner IS NULL OR journey_owner = new.user_id THEN
    RETURN new;
  END IF;

  INSERT INTO public.notifications (
    user_id, actor_user_id, kind, cat, bucket, time, who, avatar, color, verb,
    target, target_id, action, created_at
  ) VALUES (
    journey_owner,
    new.user_id,
    'join',
    'social',
    'today',
    '刚刚',
    COALESCE(new.name, '旅程伙伴'),
    NULLIF(new.avatar_url, ''),
    COALESCE(new.color, '#2E7D5B'),
    '加入了你的旅程',
    journey_name,
    new.journey_id,
    '查看',
    now()
  );

  RETURN new;
END $$;

REVOKE ALL ON FUNCTION public.notify_journey_owner_on_companion_join() FROM PUBLIC;

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
  IF old.user_id IS NULL THEN
    RETURN old;  -- 无账号的旅伴行
  END IF;
  SELECT j.user_id, j.name INTO journey_owner, journey_name
    FROM public.journeys j WHERE j.id = old.journey_id;
  IF journey_owner IS NULL OR journey_owner = old.user_id THEN
    RETURN old;  -- 旅程已不存在（级联删除）或房主自己
  END IF;
  INSERT INTO public.notifications (
    user_id, actor_user_id, kind, cat, bucket, time, who, avatar, color, verb,
    target, target_id, action, created_at
  ) VALUES (
    journey_owner,
    old.user_id,
    'companion_leave',
    'social',
    'today',
    '刚刚',
    COALESCE(old.name, '旅程伙伴'),
    NULLIF(old.avatar_url, ''),
    COALESCE(old.color, '#2E7D5B'),
    '离开了你的旅程',
    journey_name,
    old.journey_id,
    '查看',
    now()
  );
  RETURN old;
END $$;

-- ── 3. 装备未准备提醒 → 被提醒的旅伴 ──
CREATE OR REPLACE FUNCTION public.send_journey_packing_reminder(target_companion_id integer, remaining_count integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_companion companions%rowtype;
  source_companion companions%rowtype;
  target_journey journeys%rowtype;
BEGIN
  SELECT * INTO target_companion FROM companions WHERE id = target_companion_id;
  IF target_companion.id IS NULL OR target_companion.user_id IS NULL THEN RETURN; END IF;
  IF NOT public.is_journey_member(target_companion.journey_id) THEN
    RAISE EXCEPTION 'not a journey member';
  END IF;
  SELECT * INTO target_journey FROM journeys WHERE id = target_companion.journey_id;
  SELECT * INTO source_companion FROM companions WHERE journey_id = target_companion.journey_id AND user_id = auth.uid() LIMIT 1;
  INSERT INTO notifications (user_id, actor_user_id, kind, cat, bucket, time, who, avatar, color, verb, target, target_id, action)
  VALUES (
    target_companion.user_id,
    source_companion.user_id,
    'trip',
    'social',
    'today',
    '刚刚',
    COALESCE(source_companion.name, '旅程伙伴'),
    source_companion.avatar_url,
    source_companion.color,
    '提醒你还有 ' || GREATEST(remaining_count, 0) || ' 件装备未准备',
    target_journey.name,
    target_journey.id,
    '查看装备清单'
  );
END $$;

GRANT EXECUTE ON FUNCTION public.send_journey_packing_reminder(integer, integer) TO authenticated;

-- ── 4. 回填历史记录的触发者 id ──
-- 只回填「同一旅程内该姓名只对应一个有账号的旅伴」的行，同名歧义的保持 NULL，
-- 前端继续用写入时的那份快照头像。离开旅程的通知旅伴行已删除，无法回填。
UPDATE public.notifications n
  SET actor_user_id = m.user_id
  FROM (
    -- uuid has no min() aggregate; the users = 1 filter below makes the first
    -- aggregated id the only one.
    SELECT c.journey_id, c.name, (ARRAY_AGG(c.user_id))[1] AS user_id, COUNT(DISTINCT c.user_id) AS users
      FROM public.companions c
     WHERE c.user_id IS NOT NULL
     GROUP BY c.journey_id, c.name
  ) m
  WHERE n.kind IN ('join', 'trip')
    AND n.actor_user_id IS NULL
    AND m.users = 1
    AND n.target_id = m.journey_id::text
    AND n.who = m.name;

-- 已存成姓名缩写的旧快照换不成头像 URL，置空让前端显示默认灰色头像。
UPDATE public.notifications
  SET avatar = NULL
  WHERE avatar IS NOT NULL AND avatar !~ '^https?://';
