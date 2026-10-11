import { supabase } from './supabase';

// 把设备登记到后端 push_devices（RPC 见 supabase/migrations/20261011140000_push_devices.sql）。
// 走 SECURITY DEFINER 函数而非直连 upsert：device_id 跨账号复用，直连会命中 RLS 可见性冲突。
export async function registerPushDevice(
  deviceId: string,
  token: string | null,
  platform: string,
  lang: string,
) {
  if (!deviceId) return;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  const { error } = await supabase.rpc('register_push_device', {
    p_device_id: deviceId,
    p_token: token,
    p_platform: platform,
    p_lang: lang,
    p_tz_offset: new Date().getTimezoneOffset(),
  });
  if (error) throw error;
}

// 登出时解绑，避免旧账号推送继续打到这台设备（见 unregister_push_device）。
export async function unregisterPushDevice(deviceId: string, userId: string) {
  if (!deviceId || !userId) return;
  const { error } = await supabase.rpc('unregister_push_device', {
    p_device_id: deviceId,
    p_user_id: userId,
  });
  if (error) throw error;
}
