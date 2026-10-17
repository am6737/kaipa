import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import { useOfflineState } from '../lib/offlineCache';
import { toNotif } from '../lib/mappers';
import { getDooPush } from '../lib/doopushNative';
import type { Notif } from '../data/notifications';

// notifications.avatar is a snapshot taken when the row was written, and avatar
// uploads always mint a new storage path, so it goes stale the moment someone
// changes their picture. Resolve the actor's current one and keep the snapshot
// only for rows whose profile no longer exists.
async function withLiveAvatars(rows: Notif[]): Promise<Notif[]> {
  const ids = Array.from(new Set(rows.map((r) => r.actorUserId).filter((id): id is string => !!id)));
  if (!ids.length) return rows;
  const { data, error } = await supabase.from('profiles').select('id, avatar_url').in('id', ids);
  if (error) {
    console.warn('[useNotifications] avatar lookup failed:', error.message);
    return rows;
  }
  const urls = new Map((data ?? []).map((p) => [p.id as string, p.avatar_url as string | null]));
  return rows.map((r) => (r.actorUserId && urls.has(r.actorUserId)
    ? { ...r, avatar: urls.get(r.actorUserId) || undefined }
    : r));
}

export function useNotifications(userId: string | undefined) {
  const [list, setList] = useOfflineState<Notif[]>(userId, 'notifications', []);
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
      setList(await withLiveAvatars(data.map(toNotif)));
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
            void withLiveAvatars([toNotif(payload.new)]).then(([next]) => {
              setList((current) => current.some((item) => item.id === next.id) ? current : [next, ...current]);
            });
          } else if (payload.eventType === 'UPDATE') {
            void withLiveAvatars([toNotif(payload.new)]).then(([next]) => {
              setList((current) => current.map((item) => item.id === next.id ? next : item));
            });
          } else if (payload.eventType === 'DELETE') {
            setList((current) => current.filter((item) => item.id !== payload.old.id));
          }
        },
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [fetchNotifs, userId]);

  const unread = list.filter(n => !n.read).length;

  // 桌面角标由推送 SDK 在投递时累加，读消息不会自动回写，所以它只涨不落。
  // 以本地真实的未读数为准重新设置；loading 结束前不动，避免清掉旧角标又立刻重设。
  useEffect(() => {
    if (loading || Platform.OS === 'web') return;
    const DooPush = getDooPush();
    if (!DooPush) return;
    const sync = unread > 0 ? DooPush.setBadge(unread) : DooPush.clearBadge();
    sync.catch((e) => console.warn('[useNotifications] badge sync failed:', e));
  }, [unread, loading]);

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
