import { Tone } from './tones';
import { useData } from './DataContext';

export type NotifKind = 'invite' | 'join' | 'photo' | 'trip' | 'like' | 'system' | 'safety';

export interface Notif {
  id: string;
  kind: NotifKind;
  cat: 'social' | 'system';
  bucket: 'today' | 'earlier';
  time: string;
  who?: string;
  avatar?: string;
  color?: string;
  verb: string;
  target?: string;
  targetId?: string;
  action?: string;
  thumb?: Tone;
  read?: boolean;
}

interface NotifValue {
  list: Notif[];
  unread: number;
  markRead: (id: string) => void;
  markAllRead: () => void;
}

export function useNotifCenter(): NotifValue {
  try {
    const data = useData();
    return {
      list: data.notifList,
      unread: data.notifUnread,
      markRead: data.markNotifRead,
      markAllRead: data.markAllNotifsRead,
    };
  } catch {
    return { list: [], unread: 0, markRead: () => {}, markAllRead: () => {} };
  }
}
