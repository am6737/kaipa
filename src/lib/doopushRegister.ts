import * as Network from 'expo-network';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { getDooPush, hasDooPushNative } from './doopushNative';

type PushRegistration = { token: string; deviceId: string; vendor?: string };

let registerInFlight: Promise<PushRegistration> | null = null;
let configured = false;

export function markDooPushConfigured() {
  configured = true;
}

export function markDooPushUnconfigured() {
  configured = false;
  registerInFlight = null;
}

export function describeDooPushError(error: unknown) {
  const e = error as any;
  const own: Record<string, unknown> = {};
  if (e && (typeof e === 'object' || typeof e === 'function')) {
    for (const key of Object.getOwnPropertyNames(e)) {
      try { own[key] = e[key]; } catch { own[key] = '<unreadable>'; }
    }
  }
  return {
    message: e?.message ?? String(error),
    name: e?.name,
    code: e?.code,
    domain: e?.domain,
    userInfo: e?.userInfo,
    nativeStackAndroid: e?.nativeStackAndroid,
    stack: e?.stack,
    own,
  };
}

export function formatDooPushError(error: unknown) {
  try {
    return JSON.stringify(describeDooPushError(error), null, 2);
  } catch {
    return String(error);
  }
}

function getRuntimeDooPushConfig(): { appId?: string; appKey?: string } {
  return (Constants.expoConfig?.extra?.doopush ?? {}) as { appId?: string; appKey?: string };
}

function logDooPushRuntimeState(stage: string) {
  const cfg = getRuntimeDooPushConfig();
  console.log('[DooPush] runtime state', {
    stage,
    platform: Platform.OS,
    configured,
    nativeAvailable: hasDooPushNative(),
    hasAppId: Boolean(cfg.appId),
    appId: cfg.appId,
    hasAppKey: Boolean(cfg.appKey),
  });
}

async function getCachedRegistration(): Promise<PushRegistration | null> {
  const DooPush = getDooPush();
  if (!DooPush) return null;
  const [token, deviceId] = await Promise.all([
    DooPush.getDeviceToken().catch(() => null),
    DooPush.getDeviceId().catch(() => null),
  ]);

  if (!token || !deviceId) return null;
  // The native getters do not expose the vendor consistently; callers in this app only need
  // token + deviceId. Use fcm as Android/default-compatible fallback for the SDK result shape.
  return { token, deviceId, vendor: 'fcm' };
}

async function assertNetworkAvailable() {
  const state = await Network.getNetworkStateAsync().catch(() => null);
  if (state && state.isConnected === false) {
    throw new Error('当前网络不可用，跳过推送注册');
  }
  if (state && state.isInternetReachable === false) {
    throw new Error('当前网络无法访问互联网，跳过推送注册');
  }
}

/**
 * App-side guard for DooPush.register().
 *
 * The Android SDK can leave duplicate register callers pending, and slow native registration
 * may later invoke callbacks more than once. Keep the app to one register attempt at a time
 * and reuse cached registration whenever native already has token + deviceId.
 */
export async function safeDooPushRegister(): Promise<PushRegistration> {
  logDooPushRuntimeState('safeDooPushRegister:start');
  const DooPush = getDooPush();
  if (!DooPush) {
    // 上层（PushBootstrap）已先门槛过；走到这里说明调用方绕过了门槛，宁可失败得清楚。
    throw new Error('当前安装包不含 DooPush 原生模块，已跳过注册：JS 比安装包新，重装 dev 变体后再验证推送');
  }
  if (!configured) {
    const cfg = getRuntimeDooPushConfig();
    if (!cfg.appId || !cfg.appKey) {
      throw new Error('DooPush 尚未初始化，请先检查 EXPO_PUBLIC_DOOPUSH_APP_ID / EXPO_PUBLIC_DOOPUSH_APP_KEY 是否已注入并成功 configure');
    }
    try {
      DooPush.configure({ appId: cfg.appId, appKey: cfg.appKey });
      markDooPushConfigured();
      logDooPushRuntimeState('safeDooPushRegister:configured-fallback');
    } catch (e) {
      console.warn('[DooPush] fallback configure failed', formatDooPushError(e));
      throw e;
    }
  }
  if (registerInFlight) {
    console.log('[DooPush] register already in flight, reuse promise');
    return registerInFlight;
  }

  registerInFlight = (async () => {
    const cached = await getCachedRegistration();
    if (cached) {
      console.log('[DooPush] 使用缓存注册信息', { deviceId: cached.deviceId, vendor: cached.vendor, hasToken: Boolean(cached.token) });
      return cached;
    }

    await assertNetworkAvailable();
    console.log('[DooPush] calling native register');
    try {
      const result = await DooPush.register();
      console.log('[DooPush] native register resolved', { deviceId: result.deviceId, vendor: result.vendor, hasToken: Boolean(result.token) });
      return result;
    } catch (e) {
      console.warn('[DooPush] native register rejected detail', formatDooPushError(e));
      throw e;
    }
  })();

  try {
    return await registerInFlight;
  } finally {
    registerInFlight = null;
    logDooPushRuntimeState('safeDooPushRegister:end');
  }
}
