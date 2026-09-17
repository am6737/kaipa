// tracks.ts — the reusable GPX/KML library.
//
// A track is a standalone entity: it exists whether or not a journey uses it.
// Journeys point at one through `track_id`, and any number of journeys may share
// the same track. Geometry is stored once, here.

export type TrackFormat = 'gpx' | 'kml' | 'kmz';

export interface Track {
  id: string;
  name: string;
  fileName?: string;
  fileFormat?: TrackFormat;
  fileUrl?: string;
  fileSize?: number;
  coords?: [number, number][];
  elevation?: { km: number; ele: number }[];
  durationMs?: number;
  waypoints?: { name: string; km: number }[];
  distM?: number;
  ascM?: number;
  pointCount?: number;
  startedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export function trackFormatFromName(fileName: string | undefined): TrackFormat | undefined {
  const ext = fileName?.split('.').pop()?.toLowerCase();
  return ext === 'gpx' || ext === 'kml' || ext === 'kmz' ? ext : undefined;
}

export function formatFileSize(bytes: number | undefined): string | undefined {
  if (!bytes || bytes < 0) return undefined;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
