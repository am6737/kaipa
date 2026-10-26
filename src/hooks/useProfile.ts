import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { supabase } from '../lib/supabase';
import { readOfflineCache, useOfflineState, writeOfflineCache } from '../lib/offlineCache';
import { uploadAvatar as uploadAvatarFile, removeMedia } from '../lib/storage';
import type { WeightUnit } from '../data/gear';

export class AvatarUpdateError extends Error {
  constructor(public readonly stage: 'upload' | 'profile', public readonly cause: unknown) {
    super(stage === 'upload' ? 'Avatar upload failed' : 'Avatar profile update failed');
    this.name = 'AvatarUpdateError';
  }
}

export interface UserProfile {
  nick: string;
  username: string;
  bio: string;
  avatarUrl: string;
  phone: string;
  email: string;
  uid: string;
  createdAt: string;
  gearWeightUnit: WeightUnit;
  onboardedAt: string;
}

const EMPTY: UserProfile = {
  nick: '',
  username: '',
  bio: '',
  avatarUrl: '',
  phone: '',
  email: '',
  uid: '',
  createdAt: '',
  gearWeightUnit: 'kg',
  onboardedAt: '',
};

/** Offline profile edits keyed by UserProfile field, waiting for the network. */
type PendingEdits = Record<string, string>;
const PENDING_CACHE = 'profilePendingEdits';

function dbPatch(field: string, value: string): Record<string, string> {
  if (field === 'nick') return { nick: value, display_name: value };
  if (field === 'gearWeightUnit') return { gear_weight_unit: value };
  if (field === 'avatarUrl') return { avatar_url: value };
  return { [field]: value };
}

export function useProfile(userId: string | undefined) {
  const [profile, setProfile, cached] = useOfflineState<UserProfile>(userId, 'profile', EMPTY);
  const [loading, setLoading] = useState(true);
  // The last read failed for a reason other than "no such row" — offline,
  // most often. The profile on screen (cached or empty) is not authoritative.
  const [stale, setStale] = useState(false);
  // Local-first writes that the server has not accepted yet. They win over any
  // row we read, and go out as soon as a read proves the network is back.
  const pendingEdits = useRef<PendingEdits>({});
  const flushing = useRef(false);

  const savePendingEdits = useCallback((field: string, value: string) => {
    if (!userId) return;
    const next = { ...pendingEdits.current, [field]: value };
    pendingEdits.current = next;
    writeOfflineCache(userId, PENDING_CACHE, next);
  }, [userId]);

  const discardPendingEdit = useCallback((field: string) => {
    if (!userId || !(field in pendingEdits.current)) return;
    const next = { ...pendingEdits.current };
    delete next[field];
    pendingEdits.current = next;
    writeOfflineCache(userId, PENDING_CACHE, next);
  }, [userId]);

  const flushPendingEdits = useCallback(async () => {
    if (!userId || flushing.current) return;
    const fields = Object.keys(pendingEdits.current);
    if (!fields.length) return;
    const patch: Record<string, string> = {};
    for (const field of fields) Object.assign(patch, dbPatch(field, pendingEdits.current[field]));
    flushing.current = true;
    try {
      const { error } = await supabase.from('profiles').update(patch).eq('id', userId);
      // Still unreachable — keep them queued for the next chance.
      if (error) return;
      fields.forEach(discardPendingEdit);
    } finally {
      flushing.current = false;
    }
  }, [userId, discardPendingEdit]);

  const fetch = useCallback(async () => {
    if (!userId) return;

    const [stored, { data: row, error: rowError }, { data: { user } }] = await Promise.all([
      readOfflineCache<PendingEdits>(userId, PENDING_CACHE),
      supabase.from('profiles').select('display_name, nick, username, bio, avatar_url, created_at, gear_weight_unit, onboarded_at').eq('id', userId).single(),
      supabase.auth.getUser(),
    ]);
    // Anything queued this session is fresher than what is on disk.
    if (stored) pendingEdits.current = { ...stored, ...pendingEdits.current };

    if (rowError && rowError.code !== 'PGRST116') {
      setStale(true);
      setLoading(false);
      return;
    }
    setStale(false);

    const metadata = user?.user_metadata as { guest_email?: string; nickname?: string } | undefined;
    setProfile({
      nick: row?.nick || row?.display_name || metadata?.nickname || '',
      username: row?.username || '',
      bio: row?.bio || '',
      avatarUrl: row?.avatar_url || '',
      phone: user?.phone || '',
      email: user?.email || metadata?.guest_email || '',
      uid: userId,
      createdAt: row?.created_at || '',
      gearWeightUnit: (row?.gear_weight_unit || 'kg') as WeightUnit,
      onboardedAt: row?.onboarded_at || '',
      ...pendingEdits.current,
    });
    setLoading(false);
    void flushPendingEdits();
  }, [userId, flushPendingEdits]);

  useEffect(() => { fetch(); }, [fetch]);

  // Coming back to the foreground is the first moment a queued edit can be
  // retried without waiting for the next app start.
  useEffect(() => {
    if (!userId) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void flushPendingEdits();
    });
    return () => { subscription.remove(); };
  }, [userId, flushPendingEdits]);

  const updateProfile = useCallback(async (field: string, value: string) => {
    if (!userId) return;

    if (field === 'username') {
      value = value.replace(/^@/, '');
    }

    if (field === 'password') {
      const { error } = await supabase.auth.updateUser({ password: value });
      if (error) throw error;
      return;
    } else if (field === 'email') {
      const { error } = await supabase.auth.updateUser({ email: value });
      if (error) throw error;
    } else if (field === 'phone') {
      const { error } = await supabase.auth.updateUser({ phone: value });
      if (error) throw error;
    } else {
      const { error } = await supabase.from('profiles').update(dbPatch(field, value)).eq('id', userId);
      if (error) throw error;
    }

    setProfile((p) => ({ ...p, [field]: value }));
  }, [userId]);

  // A preference the user should see take effect now, whether or not there is
  // a network: apply it locally, queue it, and let the sync attempt fail quietly.
  const updateProfileOffline = useCallback(async (field: string, value: string) => {
    if (!userId) return;
    savePendingEdits(field, value);
    setProfile((p) => ({ ...p, [field]: value }));
    const { error } = await supabase.from('profiles').update(dbPatch(field, value)).eq('id', userId);
    if (error) return;
    discardPendingEdit(field);
  }, [userId, savePendingEdits, discardPendingEdit]);

  // 引导完成标记写库，跨设备、跨登录方式跟随账号（null 表示还没走完引导）。
  const completeOnboarding = useCallback(async () => {
    if (!userId) return;
    const onboardedAt = new Date().toISOString();
    const { error } = await supabase.from('profiles').update({ onboarded_at: onboardedAt }).eq('id', userId);
    if (error) throw error;
    setProfile((current) => ({ ...current, onboardedAt }));
  }, [userId]);

  const updateAvatar = useCallback(async (localUri: string) => {
    if (!userId) return;

    let avatarUrl: string;
    try {
      avatarUrl = await uploadAvatarFile(localUri, userId);
    } catch (error) {
      throw new AvatarUpdateError('upload', error);
    }

    const { error } = await supabase.from('profiles').update({ avatar_url: avatarUrl }).eq('id', userId).select('id').single();
    if (error) { if (/^[0-9A-Z]{5}$/.test(error.code)) await removeMedia([avatarUrl]).catch(()=>{}); throw new AvatarUpdateError('profile',error); }
    setProfile((current) => ({ ...current, avatarUrl }));
  }, [userId]);

  return { profile, loading: loading && !cached, stale, updateProfile, updateProfileOffline, completeOnboarding, updateAvatar, refetch: fetch };
}
