import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { uploadAvatar as uploadAvatarFile } from '../lib/storage';
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
};

export function useProfile(userId: string | undefined) {
  const [profile, setProfile] = useState<UserProfile>(EMPTY);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!userId) return;

    const [{ data: row }, { data: { user } }] = await Promise.all([
      supabase.from('profiles').select('display_name, nick, username, bio, avatar_url, created_at, gear_weight_unit').eq('id', userId).single(),
      supabase.auth.getUser(),
    ]);

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
    });
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetch(); }, [fetch]);

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
      const dbField = field === 'gearWeightUnit' ? 'gear_weight_unit' : field === 'avatarUrl' ? 'avatar_url' : field;
      const patch = field === 'nick' ? { nick: value, display_name: value } : { [dbField]: value };
      const { error } = await supabase.from('profiles').update(patch).eq('id', userId);
      if (error) throw error;
    }

    setProfile((p) => ({ ...p, [field]: value }));
  }, [userId]);

  const updateAvatar = useCallback(async (localUri: string) => {
    if (!userId) return;

    let avatarUrl: string;
    try {
      avatarUrl = await uploadAvatarFile(localUri, userId);
    } catch (error) {
      throw new AvatarUpdateError('upload', error);
    }

    const { error } = await supabase.from('profiles').update({ avatar_url: avatarUrl }).eq('id', userId);
    if (error) throw new AvatarUpdateError('profile', error);
    setProfile((current) => ({ ...current, avatarUrl }));
  }, [userId]);

  return { profile, loading, updateProfile, updateAvatar, refetch: fetch };
}
