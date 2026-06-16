import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { uploadMedia, removeMedia } from '../lib/storage';
import { toInspoMedia } from '../lib/mappers';
import type { InspoMedia } from '../data/inspoStore';

export function useInspo(journeyId: string | undefined, userId: string | undefined) {
  const [media, setMedia] = useState<InspoMedia[]>([]);
  const [uploading, setUploading] = useState(false);

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
    setUploading(true);
    try {
      const uri = await uploadMedia(m.uri, userId, journeyId);

      let thumbnail: string | null = null;
      if (m.thumbnail) {
        thumbnail = await uploadMedia(m.thumbnail, userId, journeyId);
      }

      let pairedVideoUri: string | null = null;
      if (m.pairedVideoUri) {
        pairedVideoUri = await uploadMedia(m.pairedVideoUri, userId, journeyId);
      }

      const { data } = await supabase
        .from('inspo_media')
        .insert({
          journey_id: journeyId,
          user_id: userId,
          uri,
          kind: m.kind,
          thumbnail,
          duration: m.duration ?? null,
          paired_video_uri: pairedVideoUri,
        })
        .select()
        .single();
      if (data) setMedia(prev => [...prev, toInspoMedia(data)]);
    } finally {
      setUploading(false);
    }
  };

  const remove = async (id: string) => {
    const item = media.find(x => x.id === id);
    await supabase.from('inspo_media').delete().eq('id', id);
    setMedia(prev => prev.filter(x => x.id !== id));
    if (item) {
      const urls = [item.uri, item.thumbnail, item.pairedVideoUri].filter(Boolean) as string[];
      removeMedia(urls).catch(() => {});
    }
  };

  return { media, add, remove, uploading };
}
