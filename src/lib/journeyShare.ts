// journeyShare.ts — share/join plumbing for the 口令 (passphrase) channel.
// Codes are 4 digits, generated and rotated server-side (see
// supabase/migrations/*journey_passphrase.sql) so duplicate journey names can
// no longer collide on the old deterministic client hash.
import { supabase } from './supabase';

export type JourneyShareInfo = { slug: string; code: string };

export function journeyShareUrl(share: JourneyShareInfo): string {
  const base = process.env.EXPO_PUBLIC_WEB_URL || 'https://kaipa.app';
  return `${base}/j/${share.slug}-${share.code}`;
}

type ShareRpcRow = { slug?: string; code?: string } | null;

export async function ensureJourneyShare(journeyId: string): Promise<JourneyShareInfo | null> {
  const { data, error } = await supabase.rpc('ensure_journey_share', { p_journey_id: journeyId });
  if (error) {
    console.warn('[journeyShare] ensure share error:', error);
    return null;
  }
  const row = data as ShareRpcRow;
  if (!row?.slug || !row?.code) return null;
  return { slug: row.slug, code: row.code };
}

export async function rotateJourneyShare(journeyId: string): Promise<JourneyShareInfo | null> {
  const { data, error } = await supabase.rpc('rotate_journey_share', { p_journey_id: journeyId });
  if (error) {
    console.warn('[journeyShare] rotate share error:', error);
    return null;
  }
  const row = data as ShareRpcRow;
  if (!row?.slug || !row?.code) return null;
  return { slug: row.slug, code: row.code };
}

export type CodeJoinCandidate = { journeyId: string; slug: string; name: string };

export type CodeJoinResult =
  | { status: 'joined' | 'already_joined'; journeyId: string }
  | { status: 'ambiguous'; candidates: CodeJoinCandidate[] };

export async function joinJourneyByCode(code: string): Promise<CodeJoinResult> {
  const { data, error } = await supabase.rpc('join_journey_by_code', { p_code: code });
  if (error) throw error;
  const result = data as {
    status?: string;
    journey_id?: string;
    candidates?: { journey_id: string; slug: string; name: string }[] | null;
  } | null;
  if (result?.status === 'ambiguous' && Array.isArray(result.candidates) && result.candidates.length) {
    return {
      status: 'ambiguous',
      candidates: result.candidates.map((candidate) => ({
        journeyId: candidate.journey_id,
        slug: candidate.slug,
        name: candidate.name,
      })),
    };
  }
  if (!result?.journey_id || (result.status !== 'joined' && result.status !== 'already_joined')) {
    throw new Error('JOURNEY_INVITE_INVALID');
  }
  return { status: result.status, journeyId: result.journey_id };
}
