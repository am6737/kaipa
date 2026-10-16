import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { fromPublishedRow, sortItineraries, type PublishedItinerary, type PublishedItineraryRow } from '../lib/officialItinerary';

export function useOfficialItineraries(routeId: string | null | undefined) {
  const [plans, setPlans] = useState<PublishedItinerary[]>([]);
  const [loading, setLoading] = useState(Boolean(routeId));
  const [error, setError] = useState<string | null>(null);
  const refetch = useCallback(async () => {
    if (!routeId) { setPlans([]); setError(null); setLoading(false); return; }
    setLoading(true);
    const result = await supabase.rpc('route_itineraries_published', { p_route_id: routeId });
    if (result.error) setError(result.error.message);
    else { setPlans(sortItineraries(((result.data ?? []) as PublishedItineraryRow[]).map(fromPublishedRow))); setError(null); }
    setLoading(false);
  }, [routeId]);
  useEffect(() => { void refetch(); }, [refetch]);
  return { plans, loading, error, refetch };
}
