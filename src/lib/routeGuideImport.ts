import * as Crypto from 'expo-crypto';
import { supabase } from './supabase';
import { refetchJourneyTimeline } from '../hooks/useTimeline';
import type { PublishedItinerary } from './officialItinerary';

export type GuideEntry = 'guide' | 'chat' | 'form';

export async function createJourneyFromGuide(
  source: { kind: 'official'; plan: PublishedItinerary; trekStartDate?: string | null } | { kind: 'community'; guideId: string },
  entry: GuideEntry,
  requestId: string = Crypto.randomUUID(),
): Promise<string> {
  const result = source.kind === 'official'
    ? await supabase.rpc('create_journey_from_itinerary', {
        p_itinerary_id: source.plan.id, p_version: source.plan.version,
        p_trek_start_date: source.trekStartDate ?? null, p_include_access: true,
        p_request_id: requestId, p_entry: entry,
      })
    : await supabase.rpc('create_journey_from_route_guide', {
        p_guide_id: source.guideId, p_request_id: requestId,
        p_trek_start_date: null, p_entry: entry,
      });
  if (result.error) throw result.error;
  if (typeof result.data !== 'string' || !result.data) throw new Error('journey_create_empty_result');
  const journeyId = String(result.data);
  await refetchJourneyTimeline(journeyId);
  return journeyId;
}
