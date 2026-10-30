import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useOfflineState } from '../lib/offlineCache';
import { toTrack } from '../lib/mappers';
import { removeMedia } from '../lib/storage';
import { reverseTrackRegion } from '../lib/amapGeocoding';
import { setOutingVisibility } from './useSocial';
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
  set('region', 'region');
  set('visibility', 'visibility');
  set('ownOuting', 'own_outing');
  set('sourceTrackId', 'source_track_id');
  // Not null in the table: left out, the column default (in the library) holds.
  if (draft.inLibrary != null) row.in_library = draft.inLibrary;
  return row;
}

export function useTracks(userId: string | undefined) {
  const [tracks, setTracks, cached] = useOfflineState<Track[]>(userId, 'tracks', []);
  const [loading, setLoading] = useState(true);
  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;

  const refetch = useCallback(async () => {
    if (!userId) return [] as Track[];
    setLoading(true);
    const { data, error } = await supabase
      .from('tracks')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) console.warn('[useTracks] fetch error:', error.message);
    setLoading(false);
    // Offline: hand back what is on screen rather than an empty list.
    if (!data) return tracksRef.current;
    const next = data.map(toTrack);
    setTracks(next);
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
    // 时间线卡片要显示地点；查不到或失败就留空，不挡保存。
    if (!track.region && track.coords?.length) {
      void reverseTrackRegion(track.coords).then(async (region) => {
        if (!region) return;
        const { error: regionError } = await supabase.from('tracks').update({ region }).eq('id', track.id);
        if (regionError) {
          console.warn('[createTrack] region update error:', regionError.message);
          return;
        }
        setTracks((prev) => prev.map((t) => (t.id === track.id ? { ...t, region } : t)));
      }).catch((regionError) => console.warn('[createTrack] region lookup failed:', regionError));
    }
    return track;
  }, [userId]);

  const updateTrack = useCallback(async (id: string, patch: Partial<TrackDraft>): Promise<boolean> => {
    const row = draftToRow(patch);
    if (!Object.keys(row).length) return true;
    row.updated_at = new Date().toISOString();
    const { error } = await supabase.from('tracks').update(row).eq('id', id);
    if (error) {
      console.warn('[updateTrack] update error:', error.message);
      return false;
    }
    setTracks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: row.updated_at } : t)));
    return true;
  }, []);

  // Deleting a track unlinks it from every journey that used it (the FK is
  // `on delete set null`), so callers warn with the usage count first.
  const deleteTracks = useCallback(async (ids: string[]): Promise<void> => {
    if (!ids.length) return;
    const removing = new Set(ids);
    // The file and any photos marked along the walk go with the row, unless a
    // row that stays still shows them (a copy saved from a journey's track).
    const media = (t: Track) => [
      ...(t.fileUrl ? [t.fileUrl] : []),
      ...(t.waypoints ?? []).flatMap((waypoint) => (waypoint.photo && /^https?:/i.test(waypoint.photo) ? [waypoint.photo] : [])),
    ];
    const kept = new Set(tracks.filter((t) => !removing.has(t.id)).flatMap(media));
    const urls = tracks.filter((t) => removing.has(t.id)).flatMap(media).filter((url) => !kept.has(url));
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

  // Copies a journey's track into 「我的轨迹」 as an entry of its own, so renaming
  // or deleting it there never touches the journey. Only the user's tap does
  // this. The stored file is not shared: deleting the copy would take it from
  // the journey too, and export rebuilds a GPX from the geometry anyway.
  const saveTrackToLibrary = useCallback(async (id: string): Promise<Track | null> => {
    const saved = tracksRef.current.find((t) => t.sourceTrackId === id && t.inLibrary !== false);
    if (saved) return saved;
    const source = tracksRef.current.find((t) => t.id === id);
    if (!source) return null;
    return createTrack({
      name: source.name,
      fileName: source.fileName,
      fileFormat: source.fileFormat,
      coords: source.coords,
      elevation: source.elevation,
      durationMs: source.durationMs,
      waypoints: source.waypoints,
      distM: source.distM,
      ascM: source.ascM,
      pointCount: source.pointCount,
      startedAt: source.startedAt,
      region: source.region,
      sourceTrackId: source.id,
      inLibrary: true,
    });
  }, [createTrack]);

  const setTrackVisibility = useCallback(async (id: string, visibility: NonNullable<Track['visibility']>) => {
    await setOutingVisibility({ journeyId: null, trackId: id }, visibility);
    setTracks((prev) => prev.map((t) => (t.id === id ? { ...t, visibility } : t)));
  }, []);

  // Publishing goes through an RPC so only the owner can flip it; the server
  // keeps the first publish time when it is switched on again.
  const setTrackPublished = useCallback(async (id: string, published: boolean) => {
    const { data, error } = await supabase.rpc('set_track_published', { p_track: id, p_published: published });
    if (error) throw new Error(error.message);
    setTracks((prev) => prev.map((t) => (t.id === id ? { ...t, publishedAt: (data as string | null) ?? undefined } : t)));
  }, []);

  return { tracks, loading: loading && !cached, createTrack, updateTrack, deleteTrack, deleteTracks, saveTrackToLibrary, setTrackVisibility, setTrackPublished, refetch };
}
