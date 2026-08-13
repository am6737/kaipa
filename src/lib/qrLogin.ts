import { supabase } from './supabase';

const QR_PREFIX = 'kaipa://auth/qr?';

export type QrLoginPayload = { id: string; secret: string };

type QrLoginResponse = {
  id?: string;
  secret?: string;
  expires_at?: string;
  status?: 'pending' | 'approved' | 'consumed' | 'expired';
  token_hash?: string;
  type?: 'magiclink';
  error?: { message?: string };
};

async function invoke(body: Record<string, string>) {
  const { data, error } = await supabase.functions.invoke<QrLoginResponse>('qr-login', { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.error.message || '扫码登录失败');
  return data || {};
}

export function encodeQrLoginPayload(payload: QrLoginPayload) {
  return `${QR_PREFIX}id=${encodeURIComponent(payload.id)}&secret=${encodeURIComponent(payload.secret)}`;
}

export function parseQrLoginPayload(value: string): QrLoginPayload | null {
  if (!value.startsWith(QR_PREFIX)) return null;
  const params = new URLSearchParams(value.slice(QR_PREFIX.length));
  const id = params.get('id')?.trim();
  const secret = params.get('secret')?.trim();
  return id && secret ? { id, secret } : null;
}

export async function createQrLoginRequest() {
  const data = await invoke({ action: 'create' });
  if (!data.id || !data.secret || !data.expires_at) throw new Error('扫码登录请求无效');
  return { id: data.id, secret: data.secret, expiresAt: data.expires_at };
}

export async function approveQrLoginRequest(payload: QrLoginPayload) {
  return invoke({ action: 'approve', ...payload });
}

export async function consumeQrLoginRequest(payload: QrLoginPayload) {
  const data = await invoke({ action: 'consume', ...payload });
  if (data.status !== 'approved' || !data.token_hash) return data.status || 'pending';
  const { error } = await supabase.auth.verifyOtp({ token_hash: data.token_hash, type: 'magiclink' });
  if (error) throw error;
  return 'signed_in' as const;
}
