import type { Poi } from '../data/pois';
import { toJourneyPoi } from './mappers';
import { normalizeJourneyCode } from './journeyShare';
import { supabase } from './supabase';

const JOURNEY_INVITE_PATH = /^\/j\/([^/]+)\/?$/i;

export type JourneyInvite = {
  url: string;
  code: string;
};

export function parseJourneyInviteUrl(value: string): JourneyInvite | null {
  try {
    const url = new URL(value.trim());
    const configuredWebUrl = process.env.EXPO_PUBLIC_WEB_URL || 'https://kaipa.app';
    const allowedOrigin = new URL(configuredWebUrl).origin;
    const match = decodeURIComponent(url.pathname).match(JOURNEY_INVITE_PATH);
    const code = match ? normalizeJourneyCode(match[1]) : '';
    if (url.origin !== allowedOrigin || !match || !/^[0-9A-Z]{4}$/.test(code)) return null;
    return { url: url.toString(), code };
  } catch {
    return null;
  }
}

export async function fetchJourneyPoiById(journeyId: string): Promise<Poi> {
  const { data, error } = await supabase
    .from('journeys')
    .select(`
      *,
      companions ( id, user_id, ini, name, role, color, tone, avatar_url, trips, is_host, is_self, sort_order )
    `)
    .eq('id', journeyId)
    .is('deleted_at', null)
    .single();
  if (error || !data) throw error || new Error('JOURNEY_INVITE_INVALID');
  const { data: { session } } = await supabase.auth.getSession();
  const viewerId = session?.user.id;
  const { data: profile } = viewerId
    ? await supabase.from('profiles').select('nick, display_name, avatar_url').eq('id', viewerId).maybeSingle()
    : { data: null };
  const viewerName = profile?.nick || profile?.display_name;
  const companions = (data.companions ?? []).map((companion: any) => (
    Boolean(viewerId) && (companion.user_id === viewerId || (data.user_id === viewerId && companion.is_self && !companion.user_id))
      ? {
          ...companion,
          name: viewerName || companion.name,
          ini: viewerName?.slice(0, 1) || companion.ini,
          avatar_url: profile ? profile.avatar_url : companion.avatar_url,
        }
      : companion
  ));
  return toJourneyPoi(
    { ...data, companions, mine: data.user_id === viewerId },
    undefined,
    viewerId,
  );
}
