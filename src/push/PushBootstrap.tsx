import React, { useEffect, useRef, useState } from 'react';
import { AppState, PermissionsAndroid, Platform } from 'react-native';
import Constants from 'expo-constants';
import { useI18n } from '../i18n';
import { useNav } from '../nav/NavContext';
import { useData } from '../data/DataContext';
import { supabase } from '../lib/supabase';
import { openNotificationTargetById } from '../lib/notificationRouting';
import type { NotifKind } from '../data/notifications';
import { getDooPush } from '../lib/doopushNative';
import {
  formatDooPushError,
  markDooPushConfigured,
  markDooPushUnconfigured,
  safeDooPushRegister,
} from '../lib/doopushRegister';
import { registerPushDevice, unregisterPushDevice } from '../lib/pushDevices';
import { clearAppBadge } from '../lib/appBadge';

async function hasAndroidNotificationPermission() {
  if (Platform.OS !== 'android') return true;
  const androidVersion = Number(Platform.Version);
  if (!Number.isFinite(androidVersion) || androidVersion < 33) return true;
  return PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
}

async function requestAndroidNotificationPermission() {
  if (await hasAndroidNotificationPermission()) return true;
  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
  );
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

export type PushNotificationPayload = {
  scene?: string;
  notification_id?: string;
  target_id?: string | null;
};

// 冷启动时序：点击/打开通知可能早于 AppShell（nav 上下文）挂载。
// 无活体 handler 时先入模块级队列，PushNavigator 挂载后消费，避免丢事件。
let pendingPayloads: PushNotificationPayload[] = [];
let liveHandler: ((payload: PushNotificationPayload) => void) | null = null;

// DooPush 可能把业务字段放在 payload.data 的 JSON 串里；顶层缺失时解析补齐（同 yibai）。
export function extractPushPayload(raw: unknown): PushNotificationPayload | null {
  const sources: unknown[] = [];
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    sources.push(obj);
    if (typeof obj.data === 'string') {
      try { sources.push(JSON.parse(obj.data)); } catch { /* 忽略非 JSON */ }
    } else if (obj.data) {
      sources.push(obj.data);
    }
  } else if (typeof raw === 'string') {
    try { sources.push(JSON.parse(raw)); } catch { /* 忽略 */ }
  }
  for (const source of sources) {
    const o = source as Record<string, unknown> | null;
    if (o && (o.scene != null || o.notification_id != null || o.target_id != null)) {
      return {
        scene: o.scene != null ? String(o.scene) : undefined,
        notification_id: o.notification_id != null ? String(o.notification_id) : undefined,
        target_id: o.target_id != null ? String(o.target_id) : null,
      };
    }
  }
  return null;
}

function ingestPushPayload(raw: unknown) {
  const payload = extractPushPayload(raw);
  if (!payload) return;
  if (liveHandler) liveHandler(payload);
  else pendingPayloads.push(payload);
}

export function consumePendingPushPayloads(): PushNotificationPayload[] {
  return pendingPayloads.splice(0, pendingPayloads.length);
}

export function setLivePushHandler(handler: ((payload: PushNotificationPayload) => void) | null) {
  liveHandler = handler;
}

export function PushBootstrap({ userId }: { userId?: string }) {
  const { resolved } = useI18n();
  const [pushInfo, setPushInfo] = useState<{ token: string | null; deviceId: string } | null>(null);
  const lastUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    // 门槛一：原生模块在不在安装包里面。缺了就整条推送链路停用（Expo Go、或二进制早于
    // 推送原生依赖的旧 dev 包），App 照常启动。SDK 顶层会 requireNativeModule，所以只能
    // 靠 getDooPush() 的惰性加载越过，见 src/lib/doopushNative.ts。
    const DooPush = getDooPush();
    if (!DooPush) {
      console.warn('[DooPush] 安装包不含推送原生模块，跳过推送初始化；若刚加过推送依赖，请重装 dev 变体');
      return;
    }
    const creds = (Constants.expoConfig?.extra?.doopush ?? {}) as {
      appId?: string;
      appKey?: string;
    };
    // 门槛二：缺凭据（如未注入 EXPO_PUBLIC_DOOPUSH_*）时跳过推送初始化，
    // 否则原生 configure 同步抛错会把整个 App 拖进 ErrorBoundary 白屏。
    if (!creds.appId || !creds.appKey) {
      console.warn('[DooPush] 缺少 appId/appKey，跳过推送初始化（检查 .env 的 EXPO_PUBLIC_DOOPUSH_* 是否齐全）');
      return;
    }
    try {
      DooPush.configure({ appId: creds.appId, appKey: creds.appKey });
      markDooPushConfigured();
    } catch (e) {
      markDooPushUnconfigured();
      console.warn('[DooPush] 初始化失败，跳过推送注册', formatDooPushError(e));
      return;
    }

    const msgSub = DooPush.addMessageListener((m) => {
      console.log('[DooPush] 收到推送', m);
    });
    const clickSub = DooPush.addNotificationClickListener((m) => {
      console.log('[DooPush] 点击推送', m);
      ingestPushPayload(m?.data ?? m);
    });
    // 冷启动：从通知点开 App
    const openSub = DooPush.addNotificationOpenListener((m) => {
      console.log('[DooPush] 打开推送', m);
      ingestPushPayload(m?.data ?? m);
    });

    let cancelled = false;

    // 启动即请求系统通知权限并拿到 token，不依赖登录。
    // Android 13+ 的 POST_NOTIFICATIONS 是运行时权限；只在 manifest 声明不会弹系统授权窗。
    (async () => {
      const permissionGranted = await requestAndroidNotificationPermission();
      if (!permissionGranted) {
        console.warn('[DooPush] 用户未授权 Android 通知权限，跳过推送注册');
        return;
      }
      const { token, deviceId } = await safeDooPushRegister();
      console.log('[DooPush] 注册成功', token, deviceId);
      if (!cancelled) setPushInfo({ token, deviceId });
    })().catch((e) => {
      console.warn('[DooPush] 注册失败 detail', formatDooPushError(e));
    });

    return () => {
      cancelled = true;
      msgSub.remove();
      clickSub.remove();
      openSub.remove();
      markDooPushUnconfigured();
    };
  }, []);

  useEffect(() => {
    // 打开 App 或切回前台就清桌面角标和通知栏；排在 configure 之后，Android 的 DooPush 才认这次调用。
    void clearAppBadge();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void clearAppBadge();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    // 登录后再把设备登记到后端，供后端按用户定向发送推送
    if (userId && pushInfo) {
      registerPushDevice(pushInfo.deviceId, pushInfo.token, Platform.OS, resolved).catch((e) =>
        console.warn('[push_devices] 登记失败', e),
      );
    }
  }, [userId, pushInfo, resolved]);

  useEffect(() => {
    // 登出（或换账号）时解绑设备：否则旧账号的推送会继续打到这台设备（旅程/旅伴信息泄露）。
    const prev = lastUserIdRef.current;
    lastUserIdRef.current = userId ?? null;
    if (prev && prev !== userId && pushInfo?.deviceId) {
      unregisterPushDevice(pushInfo.deviceId, prev).catch((e) =>
        console.warn('[push_devices] 解绑失败', e),
      );
    }
  }, [userId, pushInfo]);

  return null;
}

// 挂在 NavProvider 内消费推送点击：标已读 + 按 target_id 跳转。
export function PushNavigator() {
  const nav = useNav();
  const data = useData();
  const { t } = useI18n();

  useEffect(() => {
    const route = async (payload: PushNotificationPayload) => {
      if (payload.notification_id) {
        // best-effort：已读只影响红点，失败不打断跳转
        void supabase
          .from('notifications')
          .update({ read: true })
          .eq('id', payload.notification_id)
          .then(() => {});
      }
      const ok = await openNotificationTargetById(payload.target_id, {
        nav,
        journeys: data.journeys,
        routes: data.routes,
        kind: payload.scene as NotifKind | undefined,
      });
      if (!ok && payload.target_id) nav.showToast(t('account.inbox.toastTargetUnavailable'));
    };

    setLivePushHandler((payload) => { void route(payload); });
    consumePendingPushPayloads().forEach((payload) => { void route(payload); });
    return () => setLivePushHandler(null);
  }, [nav, data.journeys, data.routes, t]);

  return null;
}
