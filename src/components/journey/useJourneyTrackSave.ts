// useJourneyTrackSave.ts — the explicit way a journey's route track gets into 「我的轨迹」.
//
// A journey made from a catalog route points at its own copy of the route's
// line, kept out of the library (tracks.in_library = false). Nothing adds it
// there implicitly; the journey page offers this instead. Saving makes an
// independent library entry, so the journey's line never depends on it.
import { useState } from 'react';
import { useData } from '../../data/DataContext';
import type { Track } from '../../data/tracks';
import { useI18n } from '../../i18n';
import { useNav } from '../../nav/NavContext';

export type JourneyTrackSave = {
  /** The library copy, once there is one. */
  saved: Track | undefined;
  saving: boolean;
  save: () => Promise<void>;
};

/**
 * Null when there is nothing to save: no track, a track that already is a
 * library entry (picked or uploaded by the user), or one the viewer does not own.
 */
export function useJourneyTrackSave(trackId: string | undefined): JourneyTrackSave | null {
  const { t } = useI18n();
  const nav = useNav();
  const data = useData();
  const [saving, setSaving] = useState(false);
  const track = trackId ? data.allTracks.find((item) => item.id === trackId) : undefined;
  if (!track || track.inLibrary !== false) return null;
  const saved = data.tracks.find((item) => item.sourceTrackId === track.id);
  const save = async () => {
    if (saving || saved) return;
    setSaving(true);
    const copy = await data.saveTrackToLibrary(track.id);
    setSaving(false);
    nav.showToast(t(copy ? 'journey.track.saveDone' : 'journey.track.saveFailed'));
  };
  return { saved, saving, save };
}
