import type { Poi } from '../data/pois';
import { toJourneyPoi } from './mappers';
import { supabase } from './supabase';

const JOURNEY_INVITE_PATH = /^\/j\/(.+)-(\d{4})\/?$/;

export type JourneyInvite = {
  url: string;
  slug: string;
  code: string;
};

export function parseJourneyInviteUrl(value: string): JourneyInvite | null {
  try {
    const url = new URL(value.trim());
    const configuredWebUrl = process.env.EXPO_PUBLIC_WEB_URL || 'https://kaipa.app';
    const allowedOrigin = new URL(configuredWebUrl).origin;
    const match = decodeURIComponent(url.pathname).match(JOURNEY_INVITE_PATH);
    if (url.origin !== allowedOrigin || !match) return null;
    return { url: url.toString(), slug: match[1], code: match[2] };
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

export async function joinJourneyBySlugCode(slug: string, code: string): Promise<Poi> {
  const { data: result, error: joinError } = await supabase.rpc('join_journey_by_invite', {
    invite_slug: slug,
    invite_code: code,
  });
  if (joinError) throw joinError;

  const journeyId = (result as { journey_id?: string } | null)?.journey_id;
  if (!journeyId) throw new Error('JOURNEY_INVITE_INVALID');

  return fetchJourneyPoiById(journeyId);
}

export async function joinJourneyByInvite(invite: JourneyInvite): Promise<Poi> {
  return joinJourneyBySlugCode(invite.slug, invite.code);
}
