import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { toRoutePoi } from '../lib/mappers';
import type { Poi } from '../data/pois';

export function useRoutes() {
  const [routes, setRoutes] = useState<Poi[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('routes')
        .select('id, name, region, coord, lng, lat, dist, asc:asc_, diff, rating, reviews, tone, desc')
        .order('created_at');
      if (data) setRoutes(data.map(toRoutePoi));
      setLoading(false);
    })();
  }, []);

  return { routes, loading };
}
