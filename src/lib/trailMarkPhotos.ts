// trailMarkPhotos.ts — photos taken with the 徒步导航 camera button.
//
// The camera hands back a file in the cache, which the system may clear
// before a long walk is saved, and a save made offline waits in the queue
// for days. So each photo is shrunk and moved into the app's documents at
// once, and stays there until the track that uses it reaches the server.
import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { fitImage } from './imageFit';

// Big enough to read a trail sign on a phone, small enough to upload on one bar.
const PHOTO_EDGE = 2048;

const photoDir = () => new Directory(Paths.document, 'trail-marks');

export type TrailPhotoResult = { status: 'taken'; uri: string } | { status: 'cancelled' } | { status: 'denied' };

/** Opens the camera and keeps the shot on the device. */
export async function takeTrailPhoto(): Promise<TrailPhotoResult> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return { status: 'denied' };
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85, exif: false });
  const shot = result.canceled ? null : result.assets?.[0];
  if (!shot) return { status: 'cancelled' };
  const fitted = await fitImage(shot.uri, PHOTO_EDGE);
  const source = new File(fitted?.uri ?? shot.uri);
  const dir = photoDir();
  dir.create({ intermediates: true, idempotent: true });
  const kept = new File(dir, `${Date.now()}.jpg`);
  source.copy(kept);
  return { status: 'taken', uri: kept.uri };
}

export function isLocalTrailPhoto(uri: string | undefined): uri is string {
  return !!uri && uri.startsWith('file:');
}

// Coming back from the camera makes the app active, which runs a sweep; a
// shot only just copied in and not yet marked must survive it.
const SWEEP_MIN_AGE_MS = 10 * 60_000;

/** Removes kept photos that no recording or queued save refers to any more. */
export function sweepTrailPhotos(inUse: (string | undefined)[]) {
  try {
    const dir = photoDir();
    if (!dir.exists) return;
    // By file name: the same file may be spelled file:/ or file:///.
    const keep = new Set(inUse.filter(isLocalTrailPhoto).map((uri) => uri.split('/').pop()));
    for (const entry of dir.list()) {
      if (!(entry instanceof File) || keep.has(entry.name)) continue;
      const takenAt = Number(entry.name.replace(/\.jpg$/, ''));
      if (Number.isFinite(takenAt) && Date.now() - takenAt < SWEEP_MIN_AGE_MS) continue;
      entry.delete();
    }
  } catch (cause) {
    console.warn('[trailMarkPhotos] sweep failed:', cause);
  }
}
