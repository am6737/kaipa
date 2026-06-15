import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { toNotif } from '../lib/mappers';
import type { Notif } from '../data/notifications';

export function useNotifications(userId: string | undefined) {
  const [list, setList] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifs = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (data) setList(data.map(toNotif));
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetchNotifs(); }, [fetchNotifs]);

  const unread = list.filter(n => !n.read).length;

  const markRead = async (id: string) => {
    await supabase.from('notifications').update({ read: true }).eq('id', id);
    setList(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const markAllRead = async () => {
    if (!userId) return;
    await supabase.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false);
    setList(prev => prev.map(n => ({ ...n, read: true })));
  };

  return { list, unread, loading, markRead, markAllRead };
}
