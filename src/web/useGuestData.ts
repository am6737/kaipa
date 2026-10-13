import { useState, useEffect, useCallback, useRef } from 'react';
import { guestRequest } from './guestResources';
import { uploadGuestPhoto } from './guestStorage';

export interface GuestMoment {
  id: string;
  share_id: string;
  guest_session_id: string | null;
  guest_name: string;
  guest_ini: string;
  guest_tone: string;
  uri: string;
  caption: string;
  day: number;
  is_text: boolean;
  created_at: string;
}

export interface ShareData {
  id: string;
  journey_id: string;
  user_id: string;
}

export interface JourneyData {
  name: string;
  region: string;
  tone: string;
  date: string | null;
  days: string | null;
  total_days: number | null;
  coverUrl: string | null;
}

export interface InspoMedia {
  id: string;
  uri: string;
  kind: string;
  thumbnail: string | null;
  paired_video_uri: string | null;
  created_at: string;
}

export interface HostData {
  display_name: string;
  avatar_ini: string;
  avatar_color: string;
}

export interface CompanionData {
  id: number;
  ini: string;
  name: string;
  color: string;
  tone: string | null;
  is_host: boolean;
  is_self: boolean;
}

type GuestSnapshot = { sessionId:string; share:ShareData; journey:JourneyData; host:HostData; companions:CompanionData[]; moments:GuestMoment[]; media:InspoMedia[] };
type MomentInput = Omit<GuestMoment,'id'|'share_id'|'guest_session_id'|'created_at'>;
type PendingMoment = { requestKey: string; fingerprint: string; uri?: string; inFlight?: Promise<void> };
export function useGuestData(code: string) {
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState<string|null>(null);
  const [snapshot,setSnapshot] = useState<GuestSnapshot|null>(null);
  const [token,setToken] = useState('');
  // Entries survive a failed response and React renders, but never cross a session.
  const pending = useRef(new Map<string, PendingMoment>());
  useEffect(() => {
    let cancelled = false;
    pending.current = new Map();
    setLoading(true);
    setError(null);
    setSnapshot(null);
    setToken('');
    if (!code) {
      setError('invalid');
      setLoading(false);
      return;
    }
    const key = `kaipa_guest_session_v1:${code}`;
    (async()=>{
      try {
        let previous:string|null = null;
        try {
          previous = localStorage.getItem(key);
        } catch { /* memory-only session */ }
        const session = await guestRequest<{ sessionId: string; token: string }>(
          { action: 'guest_open', code },
          previous || undefined,
        );
        if (cancelled) return;
        try {
          localStorage.setItem(key, session.token);
        } catch { /* memory-only session */ }
        const next = await guestRequest<GuestSnapshot>({ action: 'guest_snapshot' }, session.token);
        if (!cancelled) {
          setToken(session.token);
          setSnapshot(next);
        }
      } catch {
        if (!cancelled) setError('busy');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      pending.current = new Map();
    };
  }, [code]);
  const addMoment = useCallback(async (m:MomentInput, requestKey?: string) => {
    if (!snapshot || !token) throw new Error('访客会话不可用，请刷新页面');
    const entries = pending.current;
    // UI supplies one key per submission/item. The implicit path also retains a
    // failed operation for callers retrying the same input without an explicit key.
    const input = { ...m };
    const fingerprint = JSON.stringify([
      m.guest_name, m.guest_ini, m.guest_tone, m.uri, m.caption, m.day, m.is_text,
    ]);
    const slot = requestKey ? `key:${requestKey}` : `input:${fingerprint}`;
    let operation = entries.get(slot);
    if (!operation) {
      operation = { requestKey: requestKey || crypto.randomUUID(), fingerprint };
      entries.set(slot, operation);
    }
    if (operation.fingerprint !== fingerprint) throw new Error('请重新打开发布页面后提交新内容');
    if (operation.inFlight) return operation.inFlight;
    const current = operation;
    current.inFlight = (async () => {
      // Keep a completed upload through a lost guest_add response as well.
      if (current.uri === undefined) {
        current.uri = !input.is_text && input.uri
          ? await uploadGuestPhoto(input.uri, snapshot.share.id, token) : '';
      }
      const data = await guestRequest<GuestMoment>({
        action: 'guest_add', requestKey: current.requestKey, moment: { ...input, uri: current.uri },
      }, token);
      if (pending.current === entries) {
        setSnapshot(prev => prev ? {
          ...prev, moments: [data, ...prev.moments.filter(row => row.id !== data.id)],
        } : prev);
      }
      // An explicit batch may replay already completed items after a later item
      // failed. Retain their uploaded URI; SQL returns the original row by key.
      if (!requestKey) entries.delete(slot);
    })();
    try {
      await current.inFlight;
    } finally {
      // Failure does not prove that no row was committed: keep key and upload.
      current.inFlight = undefined;
    }
  },[snapshot,token]);
  const deleteMoment = useCallback(async (id:string)=>{
    if (!token) throw new Error('访客会话不可用，请刷新页面');
    await guestRequest({action:'guest_delete',id},token);
    setSnapshot(prev=>prev?{...prev,moments:prev.moments.filter(m=>m.id!==id)}:prev);
  },[token]);
  return {loading,error,share:snapshot?.share || null,journey:snapshot?.journey || null,host:snapshot?.host || null,
    companions:snapshot?.companions || [],moments:snapshot?.moments || [],media:snapshot?.media || [],sessionId:snapshot?.sessionId || '',addMoment,deleteMoment};
}
