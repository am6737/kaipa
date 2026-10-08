import { useState, useEffect, useCallback } from 'react';
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
export function useGuestData(slug: string, code: string) {
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState<string|null>(null);
  const [snapshot,setSnapshot] = useState<GuestSnapshot|null>(null);
  const [token,setToken] = useState('');
  useEffect(() => {
    let cancelled = false;
    setLoading(true);setError(null);setSnapshot(null);setToken('');
    if (!slug || !code) {setError('invalid');setLoading(false);return;}
    const key = 'kaipa_guest_session_v1:'+slug;
    (async()=>{
      try {
        let previous:string|null = null;
        try {previous=localStorage.getItem(key);} catch { /* memory-only session */ }
        const session = await guestRequest<{sessionId:string;token:string}>({action:'guest_open',slug,code},previous || undefined);
        if (cancelled) return;
        try {localStorage.setItem(key,session.token);} catch { /* memory-only session */ }
        const next = await guestRequest<GuestSnapshot>({action:'guest_snapshot'},session.token);
        if (!cancelled) {setToken(session.token);setSnapshot(next);}
      } catch (cause) {if (!cancelled) setError(cause instanceof Error?cause.message:'fetch_error');}
      finally {if (!cancelled) setLoading(false);}
    })();
    return ()=>{cancelled=true;};
  },[slug,code]);
  const addMoment = useCallback(async (m:MomentInput) => {
    if (!snapshot || !token) throw new Error('访客会话不可用，请刷新页面');
    const uri = !m.is_text && m.uri ? await uploadGuestPhoto(m.uri,snapshot.share.id,token) : '';
    const data = await guestRequest<GuestMoment>({action:'guest_add',requestKey:crypto.randomUUID(),moment:{...m,uri}},token);
    setSnapshot(prev=>prev?{...prev,moments:[data,...prev.moments.filter(row=>row.id!==data.id)]}:prev);
  },[snapshot,token]);
  const deleteMoment = useCallback(async (id:string)=>{
    if (!token) throw new Error('访客会话不可用，请刷新页面');
    await guestRequest({action:'guest_delete',id},token);
    setSnapshot(prev=>prev?{...prev,moments:prev.moments.filter(m=>m.id!==id)}:prev);
  },[token]);
  return {loading,error,share:snapshot?.share || null,journey:snapshot?.journey || null,host:snapshot?.host || null,
    companions:snapshot?.companions || [],moments:snapshot?.moments || [],media:snapshot?.media || [],sessionId:snapshot?.sessionId || '',addMoment,deleteMoment};
}
