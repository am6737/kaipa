import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { WeightUnit } from '../data/gear';

export interface UserProfile {
  nick: string;
  username: string;
  bio: string;
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
      supabase.from('profiles').select('nick, username, bio, created_at, gear_weight_unit').eq('id', userId).single(),
      supabase.auth.getUser(),
    ]);

    setProfile({
      nick: row?.nick || '',
      username: row?.username || '',
      bio: row?.bio || '',
      phone: user?.phone || '',
      email: user?.email || '',
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
      const dbField = field === 'gearWeightUnit' ? 'gear_weight_unit' : field;
      await supabase.from('profiles').update({ [dbField]: value }).eq('id', userId);
    }

    setProfile((p) => ({ ...p, [field]: value }));
  }, [userId]);

  return { profile, loading, updateProfile, refetch: fetch };
}
