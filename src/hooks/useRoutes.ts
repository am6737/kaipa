import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { toRoutePoi } from '../lib/mappers';
import type { Poi } from '../data/pois';

export function useRoutes() {
  const [routes, setRoutes] = useState<Poi[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('routes')
        .select('*')
        .order('created_at');
      if (error) console.warn('[useRoutes] fetch error:', error.message);
      if (data) setRoutes(data.map((r: any) => toRoutePoi({ ...r, asc: r.asc_ })));
      setLoading(false);
    })();
  }, []);

  return { routes, loading };
}
