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
  track_duration_ms: number | null;
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

export function useGuestData(slug: string, code: string) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [share, setShare] = useState<ShareData | null>(null);
  const [journey, setJourney] = useState<JourneyData | null>(null);
  const [host, setHost] = useState<HostData | null>(null);
  const [companions, setCompanions] = useState<CompanionData[]>([]);
  const [moments, setMoments] = useState<GuestMoment[]>([]);
  const [media, setMedia] = useState<InspoMedia[]>([]);

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

        const [journeyRes, companionsRes, momentsRes, inspoRes] = await Promise.all([
          guestSupabase
            .from('journeys')
            .select('name, region, tone, date, days, total_days, track_duration_ms, photo_uris')
            .eq('id', shareRow.journey_id)
            .is('deleted_at', null)
            .single(),
          guestSupabase
            .from('companions')
            .select('id, ini, name, color, tone, is_host, is_self')
            .eq('journey_id', shareRow.journey_id)
            .order('sort_order', { ascending: true }),
          guestSupabase
            .from('shared_moments')
            .select('*')
            .eq('share_id', shareRow.id)
            .order('created_at', { ascending: false }),
          guestSupabase
            .from('inspo_media')
            .select('id, uri, kind, thumbnail, paired_video_uri, created_at')
            .eq('journey_id', shareRow.journey_id)
            .order('created_at', { ascending: true }),
        ]);

        if (journeyRes.data) {
          const uris: string[] = journeyRes.data.photo_uris || [];
          const cover = uris.find((u: string) => u.startsWith('http')) || null;
          const { photo_uris: _, ...rest } = journeyRes.data;
          setJourney({ ...rest, coverUrl: cover });
        }
        if (companionsRes.data) {
          setCompanions(companionsRes.data);
          const hostComp = companionsRes.data.find((c: any) => c.is_host || c.is_self);
          if (hostComp) {
            setHost({
              display_name: hostComp.name,
              avatar_ini: hostComp.ini,
              avatar_color: hostComp.color,
            });
          }
        }
        if (momentsRes.data) setMoments(momentsRes.data);
        if (inspoRes.data) setMedia(inspoRes.data);
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

  return { loading, error, share, journey, host, companions, moments, media, addMoment, deleteMoment };
}
