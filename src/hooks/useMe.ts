import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

/** Signed-in user id for "mine" badges and owner-only actions; null when signed out. */
export function useMe(): string | null {
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setUserId(data.session?.user.id ?? null);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        setUserId(null);
        void supabase.auth.getSession().then(({ data }) => {
          if (active) setUserId(data.session?.user.id ?? null);
        });
      }
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);
  return userId;
}
