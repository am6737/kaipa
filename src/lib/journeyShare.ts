// journeyShare.ts - share/join plumbing for the 4-character passphrase channel.
// Codes use uppercase 0-9A-Z characters, expire after seven days, and are
// generated and rotated server-side.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { supabase } from './supabase';

export const JOURNEY_CODE_PATTERN = /^[0-9A-Z]{4}$/;
export type JourneyShareInfo = {
  code: string;
  expiresAt: string;
};
export type JourneyShareResult =
  | { status: 'active'; code: string; expiresAt: string }
  | { status: 'disabled' }
  | { status: 'no_permission' };

export function normalizeJourneyCode(value: string): string {
  return value.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 4);
}

export function journeyShareUrl(share: JourneyShareInfo): string {
  const base = process.env.EXPO_PUBLIC_WEB_URL || 'https://kaipa.app';
  return `${base}/j/${share.code}`;
}

type ShareRpcRow = {
  status?: string;
  code?: string;
  expires_at?: string;
} | null;
function mapShare(data: unknown): JourneyShareResult | null {
  const row = data as ShareRpcRow;
  if (row?.status === 'disabled' || row?.status === 'no_permission') return { status: row.status };
  if (!row?.code || !row.expires_at) return null;
  return { status: 'active', code: normalizeJourneyCode(row.code), expiresAt: row.expires_at };
}

export async function ensureJourneyShare(journeyId: string): Promise<JourneyShareResult | null> {
  const { data, error } = await supabase.rpc('ensure_journey_share', { p_journey_id: journeyId });
  if (error) {
    console.warn('[journeyShare] ensure share error:', error);
    return null;
  }
  return mapShare(data);
}

export async function rotateJourneyShare(journeyId: string): Promise<JourneyShareResult | null> {
  const { data, error } = await supabase.rpc('rotate_journey_share', { p_journey_id: journeyId });
  if (error) {
    console.warn('[journeyShare] rotate share error:', error);
    return null;
  }
  return mapShare(data);
}

export async function setJourneyInviteEnabled(journeyId: string, enabled: boolean): Promise<boolean> {
  const { data, error } = await supabase.rpc('set_journey_invite_enabled', { p_journey_id: journeyId, p_enabled: enabled });
  return !error && (data as { invite_enabled?: boolean } | null)?.invite_enabled === enabled;
}

const DEVICE_KEY = 'kaipa_journey_join_device_id_v1';
function randomId(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch {}
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
async function deviceId(): Promise<string> {
  if (Platform.OS === 'web') {
    try {
      const existing = localStorage.getItem(DEVICE_KEY);
      if (existing) return existing;
      const id = randomId();
      localStorage.setItem(DEVICE_KEY, id);
      return id;
    } catch {
      return randomId();
    }
  }
  const existing = await AsyncStorage.getItem(DEVICE_KEY);
  if (existing) return existing;
  const id = randomId();
  await AsyncStorage.setItem(DEVICE_KEY, id);
  return id;
}

export type CodeJoinResult = {
  status: 'joined' | 'already_joined' | 'full' | 'auth_required' | 'busy';
  journeyId?: string;
};
export async function joinJourneyByCode(value: string): Promise<CodeJoinResult> {
  const code = normalizeJourneyCode(value);
  if (!JOURNEY_CODE_PATTERN.test(code)) return { status: 'busy' };
  const id = await deviceId();
  const { data, error } = await supabase.functions.invoke('journey-join', {
    body: { code },
    headers: { 'x-device-id': id },
  });
  if (error) throw error;
  const result = data as {
    status?: CodeJoinResult['status'];
    journeyId?: string;
  } | null;
  if (!result?.status) throw new Error('JOURNEY_JOIN_BUSY');
  return { status: result.status, journeyId: result.journeyId };
}
