import { createClient } from '@supabase/supabase-js';
import type { Session, SupabaseClient, User, UserIdentity } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { supabase, supabaseAnonKey, supabaseUrl } from './supabase';

function isNetworkAuthError(error: unknown) {
  const message = error instanceof Error ? error.message : String((error as { message?: unknown } | null)?.message ?? error);
  const normalized = message.toLowerCase();
  return normalized.includes('network') || normalized.includes('fetch') || normalized.includes('timeout') || normalized.includes('econnrefused');
}

async function withNetworkRetry<T extends { error: unknown }>(operation: () => Promise<T>) {
  let result = await operation();
  // iOS may finish the local-network permission prompt after the first
  // request has already failed. Retry only transport failures, never auth
  // failures such as invalid credentials.
  for (const delayMs of [500, 1500]) {
    if (!result.error || !isNetworkAuthError(result.error)) return result;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    result = await operation();
  }
  return result;
}

export async function signInWithEmail(email: string, password: string) {
  return withNetworkRetry(() => supabase.auth.signInWithPassword({ email, password }));
}

export async function signUpWithEmail(email: string, password: string) {
  return supabase.auth.signUp({ email, password });
}

/** Send a Supabase GoTrue SMS OTP. The phone must be E.164 (for example +8613812345678). */
export async function sendPhoneOtp(phone: string) {
  return withNetworkRetry(() => supabase.auth.signInWithOtp({
    phone,
    options: { shouldCreateUser: true },
  }));
}

/** Verify the SMS OTP and establish the session returned by GoTrue. */
export async function verifyPhoneOtp(phone: string, token: string) {
  return withNetworkRetry(() => supabase.auth.verifyOtp({ phone, token, type: 'sms' }));
}

const GUEST_ADJECTIVES = ['清风', '星河', '云端', '松林', '晨雾', '远峰', '溪谷'];
const GUEST_NOUNS = ['旅人', '行者', '向导', '背包客', '探路者'];
const GUEST_EMAIL_RE = /^[a-f0-9]{32}@guest\.kaipa\.app$/;

/** 游客账号的占位邮箱：没人知道它的密码，所以不算可用的登录方式。 */
export function isGuestEmail(email: string | null | undefined) {
  return GUEST_EMAIL_RE.test((email ?? '').trim().toLowerCase());
}

type GuestAccountResponse = {
  session?: { access_token?: string; refresh_token?: string };
  error?: { code?: string; message?: string };
};

function randomIndex(length: number) {
  return Math.floor(Math.random() * length);
}

function createGuestIdentity() {
  const randomId = Array.from({ length: 4 }, () => Math.random().toString(16).slice(2).padEnd(8, '0').slice(0, 8)).join('');
  const nickname = `${GUEST_ADJECTIVES[randomIndex(GUEST_ADJECTIVES.length)]}${GUEST_NOUNS[randomIndex(GUEST_NOUNS.length)]}${String(randomIndex(1000)).padStart(3, '0')}`;
  return { email: `${randomId}@guest.kaipa.app`, nickname };
}

async function readFunctionError(error: unknown) {
  const context = (error as { context?: Response } | null)?.context;
  if (context) {
    try {
      const body = await context.clone().json() as GuestAccountResponse;
      if (body.error?.message) return new Error(body.error.message);
    } catch {
      // Fall through to the function client error.
    }
  }
  return error instanceof Error ? error : new Error('游客登录失败');
}

async function completeGuestAccount(client: SupabaseClient) {
  const { data, error } = await client.functions.invoke<GuestAccountResponse>('create-guest-account', { body: {} });
  if (error) return { data: null, error: await readFunctionError(error) };
  if (data?.error) return { data: null, error: new Error(data.error.message || '游客登录失败') };

  const accessToken = data?.session?.access_token;
  const refreshToken = data?.session?.refresh_token;
  if (!accessToken || !refreshToken) return { data: null, error: new Error('游客登录返回的会话无效') };
  return supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
}

export async function signInAnonymously() {
  const identity = createGuestIdentity();
  const bootstrap = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: anonymous, error: anonymousError } = await bootstrap.auth.signInAnonymously({
    options: {
      data: {
        guest_email: identity.email,
        nickname: identity.nickname,
        display_name: identity.nickname,
      },
    },
  });
  if (anonymousError || !anonymous.session) return { data: anonymous, error: anonymousError };
  return completeGuestAccount(bootstrap);
}

export async function upgradeCurrentAnonymousSession() {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return { data: null, error: userError || new Error('游客会话无效') };
  if (!user.is_anonymous) return supabase.auth.getSession();

  const metadata = user.user_metadata as { guest_email?: unknown; nickname?: unknown };
  const currentEmail = typeof metadata.guest_email === 'string' ? metadata.guest_email.trim().toLowerCase() : '';
  const currentNickname = typeof metadata.nickname === 'string' ? metadata.nickname.trim() : '';
  if (!GUEST_EMAIL_RE.test(currentEmail) || !currentNickname) {
    const identity = createGuestIdentity();
    const { error } = await supabase.auth.updateUser({
      data: {
        ...user.user_metadata,
        guest_email: identity.email,
        nickname: identity.nickname,
        display_name: identity.nickname,
      },
    });
    if (error) return { data: null, error };
  }
  return completeGuestAccount(supabase);
}

// ── Apple 登录（iOS 原生 ID token 流程）───────────────────────────────────────
// raw nonce 自己留着，SHA-256 后交给 Apple 写进 identityToken 的 nonce 声明，
// Supabase 侧用 raw nonce 校验。仅在 iOS 上可用（其它平台入口不展示）。
const APPLE_CANCELED = 'ERR_REQUEST_CANCELED';

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function firstGlyph(name: string) {
  return Array.from(name)[0] ?? '';
}

// Apple 只在「首次授权」返回姓名，之后拿不到，所以拿到就写进资料（尽力而为，失败不影响登录）。
async function applyAppleName(fullName: AppleAuthentication.AppleAuthenticationFullName | null) {
  if (!fullName) return;
  try {
    const name = AppleAuthentication.formatFullName(fullName).trim();
    if (!name) return;
    const { data } = await supabase.auth.getUser();
    const userId = data.user?.id;
    if (!userId) return;
    await supabase.auth.updateUser({ data: { nickname: name, display_name: name } });
    await supabase.from('profiles').update({ nick: name, display_name: name, avatar_ini: firstGlyph(name) }).eq('id', userId);
  } catch {
    // 资料补齐失败不阻断登录。
  }
}

export async function isAppleSignInAvailable() {
  if (Platform.OS !== 'ios') return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

export function isAppleSignInCanceled(error: unknown) {
  return (error as { code?: string } | null)?.code === APPLE_CANCELED;
}

async function requestAppleCredential() {
  const rawNonce = toHex(Crypto.getRandomBytes(32));
  const nonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);

  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
      nonce,
    });
  } catch (error) {
    // 用户取消时 error.code === 'ERR_REQUEST_CANCELED'，原样返回给 UI 决定是否提示。
    return { credential: null, error: error instanceof Error ? error : new Error('Apple 登录失败') };
  }

  const identityToken = credential.identityToken;
  if (!identityToken) return { credential: null, error: new Error('Apple 未返回 identityToken') };
  return { credential: { identityToken, rawNonce, fullName: credential.fullName }, error: null };
}

// onAuthorized 在原生面板收起、拿到凭证后调用：面板展示期间 JS 收不到任何事件，
// UI 借此在卡片消失后恢复「正在连接」态（展示期间不显示加载层）。
export async function signInWithApple(onAuthorized?: () => void) {
  const { credential, error } = await requestAppleCredential();
  if (!credential) return { data: null, error };
  onAuthorized?.();

  const result = await supabase.auth.signInWithIdToken({ provider: 'apple', token: credential.identityToken, nonce: credential.rawNonce });
  if (!result.error) await applyAppleName(credential.fullName);
  return result;
}

// ── 绑定 / 解绑登录方式 ───────────────────────────────────────────────────────
// 一个账号（auth.users 一行）可以挂多个 identity：apple / email / phone，任何一个都能登进
// 同一个账号。绑定都发生在已登录会话上：Apple 用 linkIdentity，邮箱和手机号走 GoTrue 的
// email_change / phone_change 验证码。GoTrue 自己拒绝解绑最后一个 identity；游客的占位邮箱
// 不算可用的登录方式，那一层由 UI 判断。

/** 给当前账号补绑 Apple。这个 Apple ID 已属于别的账号时 GoTrue 返回 identity_already_exists。 */
export async function linkApple(onAuthorized?: () => void) {
  const { credential, error } = await requestAppleCredential();
  if (!credential) return { data: null, error };
  onAuthorized?.();
  return supabase.auth.linkIdentity({ provider: 'apple', token: credential.identityToken, nonce: credential.rawNonce });
}

/** 向新邮箱发绑定验证码（关闭了 secure email change，只发给新邮箱）。 */
export async function sendBindEmailCode(email: string) {
  return withNetworkRetry(() => supabase.auth.updateUser({ email }));
}

/** 校验邮箱验证码，成功后再设登录密码：邮箱登录走的是邮箱 + 密码。 */
export async function verifyBindEmail(email: string, token: string, password: string) {
  const verified = await withNetworkRetry(() => supabase.auth.verifyOtp({ email, token, type: 'email_change' }));
  if (verified.error) return verified;
  const updated = await supabase.auth.updateUser({ password });
  // 更换邮箱时填回原密码，GoTrue 报 same_password；邮箱已经绑上了，按成功处理。
  if ((updated.error as { code?: string } | null)?.code === 'same_password') return { data: verified.data, error: null };
  return updated;
}

/** 向新手机号发绑定验证码。手机号必须是 E.164（例如 +8613812345678）。 */
export async function sendBindPhoneCode(phone: string) {
  return withNetworkRetry(() => supabase.auth.updateUser({ phone }));
}

export async function verifyBindPhone(phone: string, token: string) {
  return withNetworkRetry(() => supabase.auth.verifyOtp({ phone, token, type: 'phone_change' }));
}

export async function unlinkLoginMethod(identity: UserIdentity) {
  const result = await supabase.auth.unlinkIdentity(identity);
  if (result.error) return result;
  // 解绑会改写 auth.users 上的 email / phone，刷新会话让本地 user 跟上。
  await supabase.auth.refreshSession();
  return result;
}

export async function getLoginIdentities() {
  return supabase.auth.getUserIdentities();
}

export async function signOut() {
  return supabase.auth.signOut();
}

export async function getSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export function getUser(session: Session | null): User | null {
  return session?.user ?? null;
}

export function onAuthChange(cb: (session: Session | null) => void) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    cb(session);
  });
  return data.subscription;
}
