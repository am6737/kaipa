import { useState, useEffect, useCallback } from 'react';
import { guestSupabase } from './supabaseGuest';
import { uploadGuestPhoto } from './guestStorage';

export interface GuestMoment {
  id: string;
  share_id: string;
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

export function useGuestData(slug: string, code: string) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [share, setShare] = useState<ShareData | null>(null);
  const [journey, setJourney] = useState<JourneyData | null>(null);
  const [host, setHost] = useState<HostData | null>(null);
  const [companions, setCompanions] = useState<CompanionData[]>([]);
  const [moments, setMoments] = useState<GuestMoment[]>([]);

  useEffect(() => {
    if (!slug || !code) {
      setError('invalid');
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const { data: shareRow, error: shareErr } = await guestSupabase
          .from('journey_shares')
          .select('id, journey_id, user_id')
          .eq('slug', slug)
          .eq('code', code)
          .eq('active', true)
          .single();

        if (shareErr || !shareRow) {
          setError('not_found');
          setLoading(false);
          return;
        }
        setShare(shareRow);

        const [journeyRes, companionsRes, hostRes, momentsRes] = await Promise.all([
          guestSupabase
            .from('journeys')
            .select('name, region, tone, date, days, total_days')
            .eq('id', shareRow.journey_id)
            .single(),
          guestSupabase
            .from('companions')
            .select('id, ini, name, color, tone, is_host, is_self')
            .eq('journey_id', shareRow.journey_id)
            .order('sort_order', { ascending: true }),
          guestSupabase
            .from('profiles')
            .select('display_name, avatar_ini, avatar_color')
            .eq('id', shareRow.user_id)
            .single(),
          guestSupabase
            .from('shared_moments')
            .select('*')
            .eq('share_id', shareRow.id)
            .order('created_at', { ascending: false }),
        ]);

        if (journeyRes.data) setJourney(journeyRes.data);
        if (companionsRes.data) setCompanions(companionsRes.data);
        if (hostRes.data) setHost(hostRes.data);
        if (momentsRes.data) setMoments(momentsRes.data);
        if (!journeyRes.data) setError('not_found');
      } catch (e) {
        console.warn('[useGuestData] fetch error:', e);
        setError('fetch_error');
      } finally {
        setLoading(false);
      }
    })();
  }, [slug, code]);

  const addMoment = useCallback(async (m: {
    guest_name: string;
    guest_ini: string;
    guest_tone: string;
    uri: string;
    caption: string;
    day: number;
    is_text: boolean;
  }) => {
    if (!share) return;

    let photoUrl = '';
    if (!m.is_text && m.uri) {
      const url = await uploadGuestPhoto(m.uri, share.id);
      if (!url) return;
      photoUrl = url;
    }

    const row = {
      share_id: share.id,
      journey_id: share.journey_id,
      guest_name: m.guest_name,
      guest_ini: m.guest_ini,
      guest_tone: m.guest_tone,
      uri: photoUrl,
      caption: m.caption,
      day: m.day,
      is_text: m.is_text,
    };

    const { data, error: insertErr } = await guestSupabase
      .from('shared_moments')
      .insert(row)
      .select()
      .single();

    if (insertErr) {
      console.warn('[useGuestData] insert error:', insertErr.message);
      return;
    }
    if (data) {
      setMoments((prev) => [data, ...prev]);
    }
  }, [share]);

  const deleteMoment = useCallback(async (id: string) => {
    const { error: delErr } = await guestSupabase
      .from('shared_moments')
      .delete()
      .eq('id', id);

    if (!delErr) {
      setMoments((prev) => prev.filter((m) => m.id !== id));
    }
  }, []);

  return { loading, error, share, journey, host, companions, moments, addMoment, deleteMoment };
}
