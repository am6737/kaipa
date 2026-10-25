// trackImport.ts — turning a picked GPX/KML/KMZ into a track library row.
//
// Every upload entry point (add-route sheet, journey track sheet, new journey
// form, record flow) needs the same three steps: read the file, measure it, and
// store both the original file and the geometry. Keeping that here means the
// call sites only decide which journey the resulting track gets applied to.

import { Platform } from 'react-native';
import { File as FSFile, Paths, type FileHandle } from 'expo-file-system';
import { buildTrackData, computeStats, parseTrack, snapWaypoints } from './trackParser';
import type { TrackStats } from './trackParser';
import { bytesSource, readKmlFromKmz, trackOnlyKmz, type ByteSource } from './kmz';
import { removeMedia, uploadTrackFile } from './storage';
import type { ResourceRequestError } from './resourceClient';
import { trackFormatFromName, type TrackFormat } from '../data/tracks';
import type { Track } from '../data/tracks';
import type { TrackDraft } from '../hooks/useTracks';
import type { TKey, TVars } from '../i18n';

type TFn = (key: TKey, vars?: TVars) => string;

// Files arrive from expo-file-system's picker; both native and the fallback
// expose this subset, so callers never import the picker's own types.
export type TrackFile = {
  name: string;
  uri: string;
  size?: number;
  text: () => Promise<string>;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

export type ParsedTrackFile = {
  stats: TrackStats;
  fileName: string;
  format: TrackFormat;
  name: string;
  waypoints?: TrackDraft['waypoints'];
  /** Display strings for the owning journey's distance/ascent fields. */
  dist: string;
  asc?: string;
};

export class TrackFileError extends Error {
  /** i18n key describing what the user should fix. */
  readonly messageKey: TKey;

  constructor(messageKey: TKey) {
    super(messageKey);
    this.messageKey = messageKey;
  }
}

/** Matches the 'track' upload ticket limit in prepare_resource_upload. */
export const TRACK_MAX_BYTES = 20 * 1024 * 1024;
/** The largest KMZ kept whole, for accounts with the largeTrackArchive feature. */
const KMZ_ARCHIVE_MAX_BYTES = 200 * 1024 * 1024;

// The upload ticket would reject an oversized file anyway, but only after the
// whole file had been parsed in memory, which is where a large one crashes.
function trackFileSize(file: Pick<TrackFile, 'uri' | 'size'>): number | undefined {
  if (file.size != null) return file.size;
  try {
    return new FSFile(file.uri).size ?? undefined;
  } catch {
    return undefined;
  }
}

function seekableHandle(file: FSFile): FileHandle {
  const handle = file.open();
  try {
    handle.offset = 0;
    if (handle.size == null) throw new Error('KMZ size unknown');
    return handle;
  } catch (error) {
    handle.close();
    throw error;
  }
}

// A KMZ can be 200 MB of photos around a 1 MB track, so only its directory and
// KML entry are read. Picked files are normally local copies, but an Android
// provider can hand back a stream that cannot seek; that one is copied first.
async function readKmz(uri: string, fallback?: () => Promise<ArrayBuffer>) {
  if (Platform.OS === 'web') {
    if (!fallback) throw new TrackFileError('record.track.errParse');
    return readKmlFromKmz(bytesSource(new Uint8Array(await fallback())), TRACK_MAX_BYTES);
  }
  let copy: FSFile | undefined;
  let handle: FileHandle;
  try {
    handle = seekableHandle(new FSFile(uri));
  } catch {
    copy = new FSFile(Paths.cache, `kmz-${Date.now()}.kmz`);
    await new FSFile(uri).copy(copy);
    handle = seekableHandle(copy);
  }
  try {
    const source: ByteSource = {
      size: handle.size!,
      read: (offset, length) => {
        handle.offset = offset;
        return handle.readBytes(length);
      },
    };
    return readKmlFromKmz(source, TRACK_MAX_BYTES);
  } finally {
    handle.close();
    try { copy?.delete(); } catch { /* the cache is cleared by the OS */ }
  }
}

// KMZ is a zipped KML, so unwrap it before the XML parser ever sees it. The KML
// inside gets the same limit as a KML picked directly.
async function readTrackText(file: TrackFile, format: TrackFormat): Promise<{ text: string; parseName: string }> {
  if (format !== 'kmz') return { text: await file.text(), parseName: file.name };
  const result = await readKmz(file.uri, () => file.arrayBuffer());
  if ('error' in result) {
    throw new TrackFileError(result.error === 'tooLarge' ? 'record.track.errTooLarge' : 'record.track.errParse');
  }
  return { text: result.kml, parseName: file.name.replace(/\.kmz$/i, '.kml') };
}

export async function parseTrackFile(file: TrackFile, t: TFn): Promise<ParsedTrackFile> {
  const fileName = file.name || 'track.gpx';
  const format = trackFormatFromName(fileName);
  if (!format) throw new TrackFileError('record.track.errFormat');
  // A KMZ is read by random access, so only its KML entry is capped; whether
  // the archive itself is kept is decided at upload time.
  if (format !== 'kmz' && (trackFileSize(file) ?? 0) > TRACK_MAX_BYTES) throw new TrackFileError('record.track.errTooLarge');

  const { text, parseName } = await readTrackText(file, format);
  const parsed = parseTrack(text, parseName, t as (key: string, vars?: Record<string, any>) => string);
  if (parsed.error || !parsed.points) throw new TrackFileError('record.track.errParse');
  const stats = computeStats(parsed.points);
  if (!stats) throw new TrackFileError('record.track.errParse');

  const data = buildTrackData(stats);
  return {
    stats,
    fileName,
    format,
    name: (parsed.name || '').trim() || fileName.replace(/\.[^.]+$/, ''),
    waypoints: parsed.waypoints ? snapWaypoints(parsed.waypoints, stats) : undefined,
    dist: data.dist,
    asc: data.asc,
  };
}

export type TrackDraftResult = TrackDraft & {
  /** The KMZ was over the account's limit, so only its track was stored. */
  archiveTrimmed?: boolean;
};

const isTooLarge = (error: unknown) => (error as ResourceRequestError).code === 'file_too_large';

// Stores the original file. A KMZ over 20 MB is kept whole when the server
// grants largeTrackArchive (members and the open-access campaign); otherwise
// the ticket is refused before any bytes move, and a KMZ holding only the
// track is stored instead, so the import still succeeds.
async function storeTrackFile(parsed: ParsedTrackFile, sourceUri: string, userId: string, size: number | undefined) {
  const trimmable = parsed.format === 'kmz' && (size ?? 0) > TRACK_MAX_BYTES;
  if (!trimmable || (size ?? 0) <= KMZ_ARCHIVE_MAX_BYTES) {
    try {
      return { url: await uploadTrackFile(sourceUri, userId, parsed.fileName), size, trimmed: false };
    } catch (error) {
      if (!isTooLarge(error)) throw error;
      if (!trimmable) throw new TrackFileError('record.track.errTooLarge');
    }
  }
  const kml = await readKmz(sourceUri);
  if ('error' in kml) throw new TrackFileError(kml.error === 'tooLarge' ? 'record.track.errTooLarge' : 'record.track.errParse');
  const trimmedFile = new FSFile(Paths.cache, `track-${Date.now()}.kmz`);
  try {
    const bytes = trackOnlyKmz(kml.kmlBytes);
    trimmedFile.write(bytes);
    const url = await uploadTrackFile(trimmedFile.uri, userId, parsed.fileName).catch((error: unknown) => {
      if (isTooLarge(error)) throw new TrackFileError('record.track.errTooLarge');
      throw error;
    });
    return { url, size: bytes.byteLength, trimmed: true };
  } finally {
    try { trimmedFile.delete(); } catch { /* the cache is cleared by the OS */ }
  }
}

// Uploads the original file and describes the row to insert. The draft carries
// no journey reference, which is what lets a track stay unattached.
async function buildTrackDraft(
  parsed: ParsedTrackFile,
  options: { userId: string; sourceUri?: string; fileSize?: number },
): Promise<TrackDraftResult> {
  const data = buildTrackData(parsed.stats);
  const stored = options.sourceUri
    ? await storeTrackFile(parsed, options.sourceUri, options.userId, options.fileSize ?? trackFileSize({ uri: options.sourceUri }))
    : undefined;
  return {
    name: parsed.name,
    fileName: parsed.fileName,
    fileFormat: parsed.format,
    fileUrl: stored?.url,
    fileSize: stored ? stored.size : options.fileSize,
    archiveTrimmed: stored?.trimmed || undefined,
    coords: data.trackCoords,
    elevation: data.trackElevation,
    durationMs: data.trackDurationMs,
    waypoints: parsed.waypoints,
    distM: Math.round(parsed.stats.distM),
    ascM: parsed.stats.hasEle ? parsed.stats.ascent : undefined,
    pointCount: parsed.stats.count,
    startedAt: parsed.stats.startTime ? parsed.stats.startTime.toISOString() : undefined,
  };
}

/**
 * Uploads the file and inserts the library row. A failed insert removes the
 * upload again: maintenance never sweeps track files, so a stray one would hold
 * up to 200 MB of the account's storage for good.
 */
export async function createTrackFromFile(
  parsed: ParsedTrackFile,
  options: { userId: string; sourceUri?: string; fileSize?: number },
  createTrack: (draft: TrackDraft) => Promise<Track | null>,
): Promise<{ track: Track; archiveTrimmed?: boolean }> {
  const draft = await buildTrackDraft(parsed, options);
  let track: Track | null = null;
  try {
    track = await createTrack(draft);
  } finally {
    if (!track && draft.fileUrl) {
      await removeMedia([draft.fileUrl]).catch((error) => console.warn('[createTrackFromFile] cleanup failed:', error));
    }
  }
  if (!track) throw new Error('TRACK_INSERT_FAILED');
  return { track, archiveTrimmed: draft.archiveTrimmed };
}

// A track picker hands back whatever the OS filter let through, and on iOS the
// filter is advisory, so the extension is what actually decides.
const TRACK_MIME_TYPES = [
  'application/gpx+xml',
  'application/vnd.google-earth.kml+xml',
  'application/vnd.google-earth.kmz',
  'application/zip',
  'application/xml',
  'text/xml',
  'text/*',
];

/**
 * Opens the system picker for one or more track files. Returns null when the user
 * cancels, an empty array when they picked files none of which is a track, and
 * always null on web, where expo-file-system has no implementation of the picker.
 */
export async function pickTrackFiles(): Promise<TrackFile[] | null> {
  if (Platform.OS === 'web') return null;
  const picked = await FSFile.pickFileAsync({ multipleFiles: true, mimeTypes: TRACK_MIME_TYPES });
  if (!picked || picked.canceled) return null;
  return picked.result.filter((file) => trackFormatFromName(file.name));
}

export interface TrackImportOptions {
  userId: string;
  t: TFn;
  createTrack: (draft: TrackDraft) => Promise<Track | null>;
  /** Called before each file is read, so the UI can name what it is working on. */
  onProgress?: (done: number, total: number, fileName: string) => void;
}

export interface TrackImportOutcome {
  fileName: string;
  ok: boolean;
  /** Why the file failed, when it is something the user can fix. */
  messageKey?: TKey;
  /** Imported, but only the track of an oversized KMZ was kept. */
  archiveTrimmed?: boolean;
}

async function importOne(file: TrackFile, options: TrackImportOptions): Promise<TrackImportOutcome> {
  try {
    const parsed = await parseTrackFile(file, options.t);
    const { archiveTrimmed } = await createTrackFromFile(parsed, {
      userId: options.userId,
      sourceUri: file.uri,
      fileSize: file.size,
    }, options.createTrack);
    return { fileName: file.name, ok: true, archiveTrimmed };
  } catch (error) {
    console.warn('[importTrackFiles] import failed:', file.name, error);
    return { fileName: file.name, ok: false, messageKey: error instanceof TrackFileError ? error.messageKey : undefined };
  }
}

/**
 * Imports picked files one at a time. A file that cannot be read, parsed, or
 * stored is reported and skipped rather than aborting the batch: the user chose
 * the whole set on purpose, and one bad track should not cost them the rest.
 */
export async function importTrackFiles(
  files: TrackFile[],
  options: TrackImportOptions,
): Promise<TrackImportOutcome[]> {
  const outcomes: TrackImportOutcome[] = [];
  for (const [index, file] of files.entries()) {
    options.onProgress?.(index, files.length, file.name);
    outcomes.push(await importOne(file, options));
  }
  options.onProgress?.(files.length, files.length, '');
  return outcomes;
}
