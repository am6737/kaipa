import type { RouteGuideJourneyTemplate } from '../data/routeGuides';
import { supabase } from './supabase';
import { refetchJourneyTimeline } from '../hooks/useTimeline';
import { refetchJourneyPacking } from '../hooks/useJourneyPacking';

export async function applyRouteGuideTemplate(journeyId: string, template: RouteGuideJourneyTemplate) {
  const { error } = await supabase.rpc('journey_import_route_guide', {
    p_journey_id: journeyId,
    p_template: template,
  });
  if (error) throw error;
  await Promise.allSettled([refetchJourneyTimeline(journeyId), refetchJourneyPacking(journeyId)]);
}
