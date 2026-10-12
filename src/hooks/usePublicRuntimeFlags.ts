import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export type FeatureState = 'enabled' | 'limited' | 'disabled';

export type PublicRuntimeFlags = {
  phoneLogin: FeatureState;
  emailRegister: FeatureState;
};

// 登录前的屏幕读不到会话，所以这里的兜底就是最终行为：拉取失败、超时或
// 返回残缺数据时一律按最保守的状态处理，不能因为后端不可用而放开入口。
export const DEFAULT_PUBLIC_RUNTIME_FLAGS: PublicRuntimeFlags = {
  phoneLogin: 'disabled',
  // 邮箱注册默认冻结，由运营在后台开启；邮箱密码登录不受该开关影响。
  emailRegister: 'disabled',
};

function normalize(value: unknown): PublicRuntimeFlags {
  const states: FeatureState[] = ['enabled', 'limited', 'disabled'];
  const pick = (field: string, fallback: FeatureState): FeatureState => {
    const input = value && typeof value === 'object' ? (value as Record<string, unknown>)[field] : undefined;
    return states.includes(input as FeatureState) ? (input as FeatureState) : fallback;
  };
  return {
    phoneLogin: pick('phone_login', DEFAULT_PUBLIC_RUNTIME_FLAGS.phoneLogin),
    emailRegister: pick('email_register', DEFAULT_PUBLIC_RUNTIME_FLAGS.emailRegister),
  };
}

export function usePublicRuntimeFlags() {
  const [flags, setFlags] = useState<PublicRuntimeFlags>(DEFAULT_PUBLIC_RUNTIME_FLAGS);
  const [loading, setLoading] = useState(true);
  const refetch = useCallback(async () => {
    const { data, error } = await supabase.rpc('public_runtime_flags');
    if (error) console.warn('[usePublicRuntimeFlags] fetch error:', error.message);
    if (data) setFlags(normalize(data));
    setLoading(false);
  }, []);
  useEffect(() => { void refetch(); }, [refetch]);
  return { flags, loading, refetch };
}
