import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { toNotif } from '../lib/mappers';
import type { Notif } from '../data/notifications';

export function useNotifications(userId: string | undefined) {
  const [list, setList] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifs = useCallback(async () => {
    if (!userId) {
      setList([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) {
      console.warn('[useNotifications] fetch error:', error.message);
    } else if (data) {
      setList(data.map(toNotif));
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void fetchNotifs();
    if (!userId) return undefined;

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const next = toNotif(payload.new);
            setList((current) => current.some((item) => item.id === next.id) ? current : [next, ...current]);
          } else if (payload.eventType === 'UPDATE') {
            const next = toNotif(payload.new);
            setList((current) => current.map((item) => item.id === next.id ? next : item));
          } else if (payload.eventType === 'DELETE') {
            setList((current) => current.filter((item) => item.id !== payload.old.id));
          }
        },
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [fetchNotifs, userId]);

  const unread = list.filter(n => !n.read).length;

  const markRead = async (id: string) => {
    const previous = list;
    setList(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    const { error } = await supabase.from('notifications').update({ read: true }).eq('id', id).eq('user_id', userId ?? '');
    if (error) {
      console.warn('[useNotifications] mark read failed:', error.message);
      setList(previous);
    }
  };

  const markAllRead = async () => {
    if (!userId) return;
    const previous = list;
    setList(prev => prev.map(n => ({ ...n, read: true })));
    const { error } = await supabase.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false);
    if (error) {
      console.warn('[useNotifications] mark all read failed:', error.message);
      setList(previous);
    }
  };

  return { list, unread, loading, markRead, markAllRead };
}
