// notifications.ts — notification feed + a tiny context so the tab badge and the
// 我 screen share unread state.
import React, { createContext, useContext, useMemo, useState } from 'react';
import { Tone } from './tones';

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

export const NOTIFS: Notif[] = [
  { id: 'n1', kind: 'invite', cat: 'social', bucket: 'today', time: '刚刚', who: '林深见鹿', avatar: '林', color: '#2E7D5B', verb: '邀请你加入旅程', target: '贡嘎西坡转山', targetId: 'm3', action: '查看', thumb: 'snow' },
  { id: 'n2', kind: 'join', cat: 'social', bucket: 'today', time: '25 分钟前', who: '老周', avatar: '周', color: '#0A84FF', verb: '加入了你发起的', target: '武功山三日穿越', targetId: 'm2', action: '查看', thumb: 'ridge' },
  { id: 'n3', kind: 'photo', cat: 'social', bucket: 'today', time: '2 小时前', who: 'Mia', avatar: 'M', color: '#FF9F0A', verb: '在旅程里上传了 8 张照片', target: '武功山三日穿越', targetId: 'm2', action: '查看', thumb: 'forest' },
  { id: 'n4', kind: 'like', cat: 'social', bucket: 'earlier', time: '昨天', who: '雪线之上', avatar: '雪', color: '#5E5CE6', verb: '赞了你的路线', target: '哈巴雪山大本营', targetId: 'e5', action: '查看' },
  { id: 'n5', kind: 'safety', cat: 'system', bucket: 'earlier', time: '2 天前', verb: '武功山区域将有强降雨，注意行程安全', action: '了解' },
  { id: 'n6', kind: 'system', cat: 'system', bucket: 'earlier', time: '3 天前', verb: 'kaipa 1.2 已更新：装备库支持批量识别', action: '了解' },
];

interface NotifValue {
  list: Notif[];
  unread: number;
  markRead: (id: string) => void;
  markAllRead: () => void;
}

const NotifContext = createContext<NotifValue | null>(null);

export function NotifProvider({ children }: { children: React.ReactNode }) {
  const [list, setList] = useState<Notif[]>(NOTIFS.map((n) => ({ ...n })));
  const markRead = (id: string) =>
    setList((l) => l.map((n) => (n.id === id ? { ...n, read: true } : n)));
  const markAllRead = () => setList((l) => l.map((n) => ({ ...n, read: true })));
  const unread = list.filter((n) => !n.read).length;
  const value = useMemo<NotifValue>(() => ({ list, unread, markRead, markAllRead }), [list, unread]);
  return React.createElement(NotifContext.Provider, { value }, children);
}

export function useNotifCenter(): NotifValue {
  const v = useContext(NotifContext);
  if (!v) return { list: [], unread: 0, markRead: () => {}, markAllRead: () => {} };
  return v;
}
