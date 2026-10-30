// trackExport.ts — handing library tracks back to the user as files.
//
// The library row is the source of truth, not the original upload: a track may
// have been recorded in the app and never had a file, and storage may have been
// cleaned since. So an export prefers the stored file when there is one and
// otherwise rebuilds GPX from the geometry, which is always present for anything
// that got into the library.
import { Platform, Share } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { strToU8, zipSync } from 'fflate';
import type { Poi } from '../data/pois';
import { trackFormatFromName, type Track, type TrackFormat } from '../data/tracks';
import { routeDistanceParts } from './routePreview';
import { trackToGpx } from './trackParser';

const MIME: Record<TrackFormat, string> = {
  gpx: 'application/gpx+xml',
  kml: 'application/vnd.google-earth.kml+xml',
  kmz: 'application/vnd.google-earth.kmz',
};

function sanitize(name: string) {
  return name.trim().replace(/[\\/:*?"<>|]/g, '_') || 'kaipa-track';
}

export function trackFileName(track: Track, extension?: string) {
  return `${sanitize(track.name)}.${extension ?? track.fileFormat ?? 'gpx'}`;
}

// The archive is not one of the track formats, but the share sheet picks its
// targets from the mime, so a zip has to announce itself as one.
const ZIP_MIME = 'application/zip';

function mimeFor(fileName: string) {
  const extension = fileName.split('.').pop()?.toLowerCase();
  if (extension === 'zip') return ZIP_MIME;
  return MIME[extension as TrackFormat] ?? 'application/octet-stream';
}

function downloadWeb(uri: string, fileName: string) {
  const link = document.createElement('a');
  link.href = uri;
  link.download = fileName;
  link.click();
}

async function shareUri(uri: string, fileName: string) {
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: mimeFor(fileName), dialogTitle: fileName });
    return;
  }
  await Share.share({ title: fileName, url: uri });
}

/**
 * The bytes behind one track: the stored original when storage still has it, and
 * rebuilt GPX otherwise. Both single and archive export go through here so they
 * cannot disagree about what a track's file is.
 */
export async function trackBytes(track: Track): Promise<{ fileName: string; bytes: Uint8Array }> {
  const fileName = trackFileName(track);
  if (track.fileUrl) {
    try {
      if (Platform.OS === 'web') {
        const response = await fetch(track.fileUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return { fileName, bytes: new Uint8Array(await response.arrayBuffer()) };
      }
      // The destination is the cache directory, so the stored name is kept and a
      // second download of the same URL overwrites rather than collides.
      const downloaded = await File.downloadFileAsync(track.fileUrl, Paths.cache, { idempotent: true });
      try {
        return { fileName, bytes: await downloaded.bytes() };
      } finally {
        downloaded.delete();
      }
    } catch (error) {
      // A cleared bucket or an offline device should still yield a usable file,
      // and the geometry needed to rebuild one is already on the row.
      console.warn('[trackBytes] falling back to rebuilt GPX:', error);
    }
  }
  return { fileName: trackFileName(track, 'gpx'), bytes: strToU8(trackToGpx(track)) };
}

/** Writes the bytes out and opens the share sheet (native) or downloads them (web). */
async function saveBytes(fileName: string, bytes: Uint8Array): Promise<void> {
  if (Platform.OS === 'web') {
    const uri = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mimeFor(fileName) }));
    downloadWeb(uri, fileName);
    URL.revokeObjectURL(uri);
    return;
  }
  const file = new File(Paths.cache, fileName);
  file.create({ overwrite: true });
  file.write(bytes);
  try {
    await shareUri(file.uri, fileName);
  } finally {
    if (file.exists) file.delete();
  }
}

/** Two tracks may share a name, and a zip cannot hold the same path twice. */
function uniqueName(fileName: string, taken: Set<string>) {
  if (!taken.has(fileName)) {
    taken.add(fileName);
    return fileName;
  }
  const dot = fileName.lastIndexOf('.');
  const stem = dot > 0 ? fileName.slice(0, dot) : fileName;
  const extension = dot > 0 ? fileName.slice(dot) : '';
  for (let copy = 2; ; copy += 1) {
    const candidate = `${stem} (${copy})${extension}`;
    if (!taken.has(candidate)) {
      taken.add(candidate);
      return candidate;
    }
  }
}

export function trackArchiveName(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `kaipa-tracks-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.zip`;
}

/**
 * Writes one track out and opens the share sheet (native) or downloads it (web).
 * Throws if the user cancels the share sheet; callers decide whether that is worth
 * reporting.
 */
export async function exportTrack(track: Track): Promise<void> {
  const { fileName, bytes } = await trackBytes(track);
  await saveBytes(fileName, bytes);
}

/**
 * Zips the given tracks into one archive. Each file is fetched in turn rather
 * than all at once: a library can hold dozens of tracks and the zip is built in
 * memory, so the copies only overlap for as long as it takes to read each one.
 */
export async function exportTracks(tracks: Track[]): Promise<void> {
  if (!tracks.length) return;
  const entries: Record<string, Uint8Array> = {};
  const taken = new Set<string>();
  for (const track of tracks) {
    const { fileName, bytes } = await trackBytes(track);
    entries[uniqueName(fileName, taken)] = bytes;
  }
  await saveBytes(trackArchiveName(), zipSync(entries));
}

/** The card says a distance in km ("13.0 km", "6,2 公里"); only a walk too short
 *  for one kilometre is written in metres ("800 m"). */
function distanceMeters(label: string | undefined): number | undefined {
  const parts = routeDistanceParts(label);
  if (!parts) return undefined;
  const value = Number.parseFloat(parts.value);
  if (!Number.isFinite(value)) return undefined;
  const unit = parts.unit.toLowerCase();
  return unit === 'm' || unit === '米' ? value : value * 1000;
}

/** Climb figures are whole metres with thousands separators ("+1,240 m"), so the
 *  separators go before the number is read. */
function climbMeters(label: string | undefined): number | undefined {
  const match = label?.replace(/,/g, '').match(/\d+(?:\.\d+)?/);
  const value = match ? Number.parseFloat(match[0]) : NaN;
  return Number.isFinite(value) ? value : undefined;
}

/** A catalog route carries its geometry and stored file the same way a library track does. */
export function routeAsTrack(route: Poi): Track {
  return {
    id: route.id,
    name: route.name,
    fileName: route.trackFileName,
    fileFormat: trackFormatFromName(route.trackFileName ?? route.trackFileUrl),
    fileUrl: route.trackFileUrl,
    coords: route.trackCoords,
    elevation: route.trackElevation,
    waypoints: route.trackWaypoints,
    // The card keeps its numbers as display text; read back into metres they drive
    // the page's headline tiles, which then agree with the profile underneath.
    distM: distanceMeters(route.dist),
    ascM: climbMeters(route.asc),
    pointCount: route.trackCoords?.length,
    durationMs: route.trackDurationMs,
  };
}

/**
 * `gpx` hands over the stored file when it already is GPX and rebuilds one from
 * the geometry otherwise, so it never costs more than a small download.
 * `original` is the stored KML/KMZ as uploaded, falling back to GPX like
 * `exportTrack` when storage no longer has it.
 */
export async function exportRouteTrack(route: Poi, format: 'gpx' | 'original'): Promise<void> {
  const track = routeAsTrack(route);
  if (format === 'original' || track.fileFormat === 'gpx') {
    await exportTrack(track);
    return;
  }
  await saveBytes(trackFileName(track, 'gpx'), strToU8(trackToGpx(track)));
}
