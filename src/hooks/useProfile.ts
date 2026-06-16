import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface UserProfile {
  nick: string;
  username: string;
  bio: string;
  phone: string;
  email: string;
  uid: string;
  createdAt: string;
}

const EMPTY: UserProfile = {
  nick: '',
  username: '',
  bio: '',
  phone: '',
  email: '',
  uid: '',
  createdAt: '',
};

export function useProfile(userId: string | undefined) {
  const [profile, setProfile] = useState<UserProfile>(EMPTY);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!userId) return;

    const [{ data: row }, { data: { user } }] = await Promise.all([
      supabase.from('profiles').select('nick, username, bio, created_at').eq('id', userId).single(),
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
    });
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetch(); }, [fetch]);

  const updateProfile = useCallback(async (field: string, value: string) => {
    if (!userId) return;

    if (field === 'email') {
      await supabase.auth.updateUser({ email: value });
    } else if (field === 'phone') {
      await supabase.auth.updateUser({ phone: value });
    } else {
      await supabase.from('profiles').update({ [field]: value }).eq('id', userId);
    }

    setProfile((p) => ({ ...p, [field]: value }));
  }, [userId]);

  return { profile, loading, updateProfile, refetch: fetch };
}
