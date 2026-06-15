import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { toInspoMedia } from '../lib/mappers';
import type { InspoMedia } from '../data/inspoStore';

export function useInspo(journeyId: string | undefined, userId: string | undefined) {
  const [media, setMedia] = useState<InspoMedia[]>([]);

  const fetchMedia = useCallback(async () => {
    if (!journeyId || !userId) return;
    const { data } = await supabase
      .from('inspo_media')
      .select('*')
      .eq('journey_id', journeyId)
      .order('created_at');
    if (data) setMedia(data.map(toInspoMedia));
  }, [journeyId, userId]);

  useEffect(() => { fetchMedia(); }, [fetchMedia]);

  const add = async (m: Omit<InspoMedia, 'id'>) => {
    if (!journeyId || !userId) return;
    const { data } = await supabase
      .from('inspo_media')
      .insert({ journey_id: journeyId, user_id: userId, uri: m.uri, kind: m.kind })
      .select()
      .single();
    if (data) setMedia(prev => [...prev, toInspoMedia(data)]);
  };

  const remove = async (id: string) => {
    await supabase.from('inspo_media').delete().eq('id', id);
    setMedia(prev => prev.filter(x => x.id !== id));
  };

  return { media, add, remove };
}
