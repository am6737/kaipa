import { createClient } from '@supabase/supabase-js';
import type { Session, SupabaseClient, User } from '@supabase/supabase-js';
import { supabase, supabaseAnonKey, supabaseUrl } from './supabase';

export async function signInWithEmail(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signUpWithEmail(email: string, password: string) {
  return supabase.auth.signUp({ email, password });
}

const GUEST_ADJECTIVES = ['山野', '清风', '星河', '云端', '松林', '晨雾', '远峰', '溪谷'];
const GUEST_NOUNS = ['旅人', '行者', '向导', '背包客', '探路者'];
const GUEST_EMAIL_RE = /^[a-f0-9]{32}@guest\.kaipa\.app$/;

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
