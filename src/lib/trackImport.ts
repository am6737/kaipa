// trackImport.ts — turning a picked GPX/KML/KMZ into a track library row.
//
// Every upload entry point (add-route sheet, journey track sheet, new journey
// form, record flow) needs the same three steps: read the file, measure it, and
// store both the original file and the geometry. Keeping that here means the
// call sites only decide which journey the resulting track gets applied to.

import { Platform } from 'react-native';
import { File as FSFile } from 'expo-file-system';
import { buildTrackData, computeStats, parseTrack, snapWaypoints } from './trackParser';
import type { TrackStats } from './trackParser';
import { extractKmlFromKmz } from './kmz';
import { removeMedia, uploadTrackFile } from './storage';
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

// KMZ is a zipped KML, so unwrap it before the XML parser ever sees it.
async function readTrackText(file: TrackFile, format: TrackFormat): Promise<{ text: string; parseName: string }> {
  if (format !== 'kmz') return { text: await file.text(), parseName: file.name };
  const kml = extractKmlFromKmz(new Uint8Array(await file.arrayBuffer()));
  if (!kml) throw new TrackFileError('record.track.errParse');
  return { text: kml, parseName: file.name.replace(/\.kmz$/i, '.kml') };
}

export async function parseTrackFile(file: TrackFile, t: TFn): Promise<ParsedTrackFile> {
  const fileName = file.name || 'track.gpx';
  const format = trackFormatFromName(fileName);
  if (!format) throw new TrackFileError('record.track.errFormat');

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

// Uploads the original file and describes the row to insert. The draft carries
// no journey reference, which is what lets a track stay unattached.
export async function buildTrackDraft(
  parsed: ParsedTrackFile,
  options: { userId: string; sourceUri?: string; fileSize?: number },
): Promise<TrackDraft> {
  const data = buildTrackData(parsed.stats);
  return {
    name: parsed.name,
    fileName: parsed.fileName,
    fileFormat: parsed.format,
    fileUrl: options.sourceUri
      ? await uploadTrackFile(options.sourceUri, options.userId, parsed.fileName)
      : undefined,
    fileSize: options.fileSize,
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
}

async function importOne(file: TrackFile, options: TrackImportOptions): Promise<TrackImportOutcome> {
  let uploadedUrl: string | undefined;
  try {
    const parsed = await parseTrackFile(file, options.t);
    const draft = await buildTrackDraft(parsed, {
      userId: options.userId,
      sourceUri: file.uri,
      fileSize: file.size,
    });
    uploadedUrl = draft.fileUrl;
    const track = await options.createTrack(draft);
    if (!track) throw new Error('TRACK_INSERT_FAILED');
    return { fileName: file.name, ok: true };
  } catch (error) {
    // The file is uploaded before the row is inserted, so a rejected insert would
    // otherwise strand it in the bucket with nothing pointing at it.
    if (uploadedUrl) {
      try {
        await removeMedia([uploadedUrl]);
      } catch (cleanupError) {
        console.warn('[importTrackFiles] cleanup failed:', cleanupError);
      }
    }
    console.warn('[importTrackFiles] import failed:', file.name, error);
    return { fileName: file.name, ok: false };
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
