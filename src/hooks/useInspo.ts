import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { uploadMedia, removeMedia } from '../lib/storage';
import { toInspoMedia } from '../lib/mappers';
import type { InspoMedia } from '../data/inspoStore';

export function useInspo(journeyId: string | undefined, userId: string | undefined) {
  const [media, setMedia] = useState<InspoMedia[]>([]);
  const [uploadingIds, setUploadingIds] = useState<Set<string>>(new Set());
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());

  // Concurrency semaphore for uploads: at most 4 uploadMedia calls run at
  // once so that firing 100 add() calls without await doesn't OOM the device.
  const inflight = useRef(0);
  const queue: (() => void)[] = [];
  const acquire = () => new Promise<void>(resolve => {
    if (inflight.current < 4) { inflight.current++; resolve(); }
    else queue.push(resolve);
  });
  const release = () => {
    const next = queue.shift();
    if (next) next();
    else inflight.current--;
  };

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

  // Single upload (used for camera captures). Placeholder is handled by caller.
  const add = async (m: Omit<InspoMedia, 'id'>) => {
    if (!journeyId || !userId) return;
    const tempId = `uploading-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const placeholder: InspoMedia = { ...m, id: tempId, uri: m.uri };
    // Placeholder is created by addPlaceholders BEFORE any upload starts,
    // so this function only handles the actual upload.
    await acquire();
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
          caption: m.caption?.trim() || null,
        })
        .select()
        .single();
      if (data) {
        const real = toInspoMedia(data);
        setMedia(prev => prev.map(item => item.id === tempId ? real : item));
      }
    } catch {
      setMedia(prev => prev.filter(item => item.id !== tempId));
    } finally {
      setUploadingIds(prev => { const n = new Set(prev); n.delete(tempId); return n; });
      release();
    }
  };

  // Bulk-create placeholders and start uploads, all with concurrency limit.
  // Placeholders are flushed to the UI BEFORE any upload work begins.
  const addAll = async (items: Omit<InspoMedia, 'id'>[]) => {
    if (!journeyId || !userId) return;
    // 1. Create ALL placeholders synchronously in one batch
    const entries: { m: Omit<InspoMedia, 'id'>; tempId: string }[] = [];
    for (const m of items) {
      const tempId = `uploading-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${entries.length}`;
      entries.push({ m, tempId });
    }
    setMedia(prev => [...prev, ...entries.map(e => ({ ...e.m, id: e.tempId, uri: e.m.uri } as InspoMedia))]);
    setUploadingIds(prev => new Set([...prev, ...entries.map(e => e.tempId)]));
    // Uploads start on the next microtask so React has already flushed the
    // placeholder batch to the UI before any upload work begins.
    queueMicrotask(() => {
      let idx = 0;
      const worker = async () => {
      while (idx < entries.length) {
        const { m, tempId } = entries[idx++];
        await acquire();
        try {
          const uri = await uploadMedia(m.uri, userId, journeyId);
          let thumbnail: string | null = null;
          if (m.thumbnail) thumbnail = await uploadMedia(m.thumbnail, userId, journeyId);
          let pairedVideoUri: string | null = null;
          if (m.pairedVideoUri) pairedVideoUri = await uploadMedia(m.pairedVideoUri, userId, journeyId);
          const { data } = await supabase.from('inspo_media').insert({
            journey_id: journeyId, user_id: userId, uri, kind: m.kind,
            thumbnail, duration: m.duration ?? null, paired_video_uri: pairedVideoUri,
            caption: m.caption?.trim() || null,
          }).select().single();
          if (data) setMedia(prev => prev.map(item => item.id === tempId ? toInspoMedia(data) : item));
        } catch {
          setMedia(prev => prev.filter(item => item.id !== tempId));
        } finally {
          setUploadingIds(prev => { const n = new Set(prev); n.delete(tempId); return n; });
          release();
        }
      }
    };
    Promise.all(Array.from({ length: 4 }, () => worker()));
    });
  };

  const remove = async (id: string) => {
    const item = media.find(x => x.id === id);
    if (!item) return;
    // Show removing overlay before actually deleting
    setRemovingIds(prev => new Set(prev).add(id));
    await new Promise(r => setTimeout(r, 400)); // brief visual feedback
    setMedia(prev => prev.filter(x => x.id !== id));
    if (!id.startsWith('uploading-')) {
      await supabase.from('inspo_media').delete().eq('id', id);
      if (item) {
        const urls = [item.uri, item.thumbnail, item.pairedVideoUri].filter(Boolean) as string[];
        removeMedia(urls).catch(() => {});
      }
    }
    setRemovingIds(prev => { const n = new Set(prev); n.delete(id); return n; });
  };

  return { media, add, addAll, remove, uploading: uploadingIds.size > 0, uploadingIds, removingIds };
}
