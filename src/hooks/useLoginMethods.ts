import { useCallback, useEffect, useRef, useState } from 'react';
import type { UserIdentity } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { getLoginIdentities, isGuestEmail } from '../lib/auth';
import type { TKey } from '../i18n';

export type LoginMethodKind = 'apple' | 'email' | 'phone';

export type LoginMethods = Record<LoginMethodKind, { identity: UserIdentity; value: string } | null>;

const EMPTY: LoginMethods = { apple: null, email: null, phone: null };

function identityValue(identity: UserIdentity, field: 'email' | 'phone') {
  const value = identity.identity_data?.[field];
  return typeof value === 'string' ? value.trim() : '';
}

function toMethods(identities: UserIdentity[] | undefined): LoginMethods {
  const methods: LoginMethods = { ...EMPTY };
  for (const identity of identities ?? []) {
    if (identity.provider === 'apple') methods.apple = { identity, value: identityValue(identity, 'email') };
    else if (identity.provider === 'phone') methods.phone = { identity, value: identityValue(identity, 'phone') };
    else if (identity.provider === 'email') {
      // 游客的占位邮箱登不进来，不当作已绑定的邮箱。
      const email = identityValue(identity, 'email');
      if (!isGuestEmail(email)) methods.email = { identity, value: email };
    }
  }
  return methods;
}

/** 当前账号挂着的登录方式。先用本地会话里的 identities（离线也能显示），再向服务端确认。 */
export function useLoginMethods() {
  const [methods, setMethods] = useState<LoginMethods>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const fetchedRef = useRef(false);

  const refetch = useCallback(async () => {
    const { data, error } = await getLoginIdentities();
    // 拉取失败（多半是离线）时保留手上的状态。
    if (error || !data) return;
    fetchedRef.current = true;
    setMethods(toMethods(data.identities));
    setLoaded(true);
  }, []);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active || !data.session || fetchedRef.current) return;
      setMethods(toMethods(data.session.user.identities));
    });
    void refetch();
    // 绑定、解绑、验证码校验都会改写会话里的 user，跟着刷新。回调里直接调 auth 接口会和
    // 会话锁互等，推到下一拍再拉。
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'USER_UPDATED' || event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') setTimeout(() => void refetch(), 0);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [refetch]);

  const usableCount = (Object.values(methods) as (LoginMethods[LoginMethodKind])[]).filter(Boolean).length;
  return { methods, usableCount, loaded, refetch };
}

/** 138****5678：只露头尾，避免截图时泄露整串号码。 */
export function maskPhone(phone: string) {
  const digits = phone.replace(/^\+?86/, '').replace(/\D/g, '');
  if (digits.length < 7) return phone;
  return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
}

/** GoTrue 错误 → 账号与安全的提示文案。 */
export function loginMethodErrorKey(error: unknown, kind: LoginMethodKind, stage: 'send' | 'verify' | 'link' | 'unbind'): TKey {
  const code = (error as { code?: string } | null)?.code ?? '';
  if (code === 'single_identity_not_deletable') return 'account.security.lastMethod';
  if (code === 'identity_already_exists') {
    return kind === 'apple' ? 'account.security.errorAppleInUse' : kind === 'email' ? 'account.security.errorEmailInUse' : 'account.security.errorPhoneInUse';
  }
  if (code === 'email_exists') return 'account.security.errorEmailInUse';
  if (code === 'phone_exists') return 'account.security.errorPhoneInUse';
  if (code === 'phone_provider_disabled') return 'account.security.phoneUnavailable';
  if (code.startsWith('over_') && code.endsWith('_rate_limit')) return 'account.security.errorRateLimited';
  if (code === 'otp_expired' || code === 'otp_disabled') return 'account.security.errorCodeInvalid';
  if (stage === 'send') return 'account.security.errorSendFailed';
  if (stage === 'unbind') return 'account.security.errorUnbindFailed';
  return 'account.security.errorBindFailed';
}
