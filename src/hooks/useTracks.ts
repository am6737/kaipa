import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { toTrack } from '../lib/mappers';
import { removeMedia } from '../lib/storage';
import type { Track } from '../data/tracks';

// Geometry is passed whole: a track is created from a parsed file, never
// assembled field by field the way a journey is.
export type TrackDraft = Omit<Track, 'id' | 'createdAt' | 'updatedAt'>;

function draftToRow(draft: Partial<TrackDraft>) {
  const row: any = {};
  const set = (key: keyof TrackDraft, column: string) => {
    if (Object.prototype.hasOwnProperty.call(draft, key)) row[column] = draft[key] ?? null;
  };
  set('name', 'name');
  set('fileName', 'file_name');
  set('fileFormat', 'file_format');
  set('fileUrl', 'file_url');
  set('fileSize', 'file_size');
  set('coords', 'coords');
  set('elevation', 'elevation');
  set('durationMs', 'duration_ms');
  set('waypoints', 'waypoints');
  set('distM', 'dist_m');
  set('ascM', 'asc_m');
  set('pointCount', 'point_count');
  set('startedAt', 'started_at');
  return row;
}

export function useTracks(userId: string | undefined) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!userId) return [] as Track[];
    setLoading(true);
    const { data, error } = await supabase
      .from('tracks')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) console.warn('[useTracks] fetch error:', error.message);
    const next = data ? data.map(toTrack) : [];
    if (data) setTracks(next);
    setLoading(false);
    return next;
  }, [userId]);

  useEffect(() => { refetch(); }, [refetch]);

  const createTrack = useCallback(async (draft: TrackDraft): Promise<Track | null> => {
    if (!userId) return null;
    const { data, error } = await supabase
      .from('tracks')
      .insert({ ...draftToRow(draft), user_id: userId })
      .select('*')
      .single();
    if (error) {
      console.warn('[createTrack] insert error:', error.message);
      return null;
    }
    const track = toTrack(data);
    setTracks((prev) => [track, ...prev]);
    return track;
  }, [userId]);

  const updateTrack = useCallback(async (id: string, patch: Partial<TrackDraft>): Promise<void> => {
    const row = draftToRow(patch);
    if (!Object.keys(row).length) return;
    row.updated_at = new Date().toISOString();
    const { error } = await supabase.from('tracks').update(row).eq('id', id);
    if (error) {
      console.warn('[updateTrack] update error:', error.message);
      return;
    }
    setTracks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: row.updated_at } : t)));
  }, []);

  // Deleting a track unlinks it from every journey that used it (the FK is
  // `on delete set null`), so callers warn with the usage count first.
  const deleteTracks = useCallback(async (ids: string[]): Promise<void> => {
    if (!ids.length) return;
    const removing = new Set(ids);
    const urls = tracks.filter((t) => removing.has(t.id) && t.fileUrl).map((t) => t.fileUrl!);
    const { error } = await supabase.from('tracks').delete().in('id', ids);
    if (error) {
      console.warn('[deleteTracks] delete error:', error.message);
      return;
    }
    setTracks((prev) => prev.filter((t) => !removing.has(t.id)));
    if (urls.length) {
      try {
        await removeMedia(urls);
      } catch (e) {
        console.warn('[deleteTracks] storage cleanup failed:', e);
      }
    }
  }, [tracks]);

  const deleteTrack = useCallback((id: string) => deleteTracks([id]), [deleteTracks]);

  return { tracks, loading, createTrack, updateTrack, deleteTrack, deleteTracks, refetch };
}
