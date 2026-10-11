-- ════════════════════════════════════════════════════════════
-- push_devices — 设备 token ↔ 用户 映射（DooPush 定向发送用）
--
-- 应用方式：infra/supabase/apply-migration.sh supabase/migrations/<本文件>。幂等。
--
-- 说明：
--   device_id = DooPush 服务端分配的 deviceId（DooPush.getDeviceId()），
--               即 /apps/{appId}/push/single 的 device_id 目标值。
--   lang      = 该设备的界面语言（客户端只存在本地，故落到设备上），
--               决定推送用 zh / en 模板。
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.push_devices (
  device_id   TEXT PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token       TEXT,
  platform    TEXT,
  lang        TEXT NOT NULL DEFAULT 'zh',
  tz_offset   INT NOT NULL DEFAULT 0,   -- JS getTimezoneOffset()：UTC−本地 的分钟数（中国为 -480）
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_push_devices_user ON public.push_devices (user_id);

ALTER TABLE public.push_devices ENABLE ROW LEVEL SECURITY;

-- 直连 RLS：每人只能看/改/删自己名下的设备行（登记走下面的 definer 函数，不走直连写）。
DROP POLICY IF EXISTS "push_devices_own"    ON public.push_devices;
DROP POLICY IF EXISTS "push_devices_select" ON public.push_devices;
DROP POLICY IF EXISTS "push_devices_insert" ON public.push_devices;
DROP POLICY IF EXISTS "push_devices_update" ON public.push_devices;
DROP POLICY IF EXISTS "push_devices_delete" ON public.push_devices;

CREATE POLICY "push_devices_select" ON public.push_devices
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "push_devices_insert" ON public.push_devices
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "push_devices_update" ON public.push_devices
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "push_devices_delete" ON public.push_devices
  FOR DELETE USING (user_id = auth.uid());

-- 登记设备走 SECURITY DEFINER 函数，而非客户端直连 upsert。
-- 原因：device_id 由 DooPush 按物理设备分配、跨账号复用。换账号后认领同一台设备会命中
-- ON CONFLICT→UPDATE，而旧归属行对当前用户不可见（SELECT 策略 user_id=auth.uid()），
-- Postgres 的冲突检查（既要可见又要可改）因此失败（42501 …USING expression）。
-- definer 函数以属主身份绕过 RLS 可见性，但函数内强制 user_id = auth.uid()，
-- 用户只能把设备登记到自己名下（device_id 仅在本机可得、不可猜）。
CREATE OR REPLACE FUNCTION public.register_push_device(
  p_device_id text,
  p_token     text,
  p_platform  text,
  p_lang      text DEFAULT 'zh',
  p_tz_offset int  DEFAULT 0
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.push_devices (device_id, user_id, token, platform, lang, tz_offset, updated_at)
  VALUES (p_device_id, auth.uid(), p_token, p_platform, COALESCE(p_lang, 'zh'), COALESCE(p_tz_offset, 0), now())
  ON CONFLICT (device_id) DO UPDATE
    SET user_id    = auth.uid(),
        token      = EXCLUDED.token,
        platform   = EXCLUDED.platform,
        lang       = EXCLUDED.lang,
        tz_offset  = EXCLUDED.tz_offset,
        updated_at = now();
$$;
REVOKE ALL     ON FUNCTION public.register_push_device(text, text, text, text, int) FROM public;
GRANT  EXECUTE ON FUNCTION public.register_push_device(text, text, text, text, int) TO authenticated;

-- 登出时解绑设备：否则旧账号的推送会继续打到这台已登出/换人的设备（旅程名、旅伴名泄露）。
-- 客户端在 signOut 流程里带会话调用（auth.uid() 仍在）；也兼容 userId 变化时以
-- p_user_id 兜底校验。device_id 仅本机 SDK 可得、不可猜，删自己设备无需额外权限。
CREATE OR REPLACE FUNCTION public.unregister_push_device(
  p_device_id text,
  p_user_id   uuid
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.push_devices
   WHERE device_id = p_device_id
     AND user_id = p_user_id
     AND (auth.uid() IS NULL OR auth.uid() = p_user_id);
$$;
REVOKE ALL     ON FUNCTION public.unregister_push_device(text, uuid) FROM public;
GRANT  EXECUTE ON FUNCTION public.unregister_push_device(text, uuid) TO anon, authenticated;
