// tracks.ts — the reusable GPX/KML library.
//
// A track is a standalone entity: it exists whether or not a journey uses it.
// Journeys point at one through `track_id`, and any number of journeys may share
// the same track. Geometry is stored once, here.

export type TrackFormat = 'gpx' | 'kml' | 'kmz';

/**
 * A named spot on the track, placed by distance along it. Points marked while
 * recording also keep where they were taken and, when one was shot, a photo.
 */
export interface TrackWaypoint {
  name: string;
  km: number;
  lng?: number;
  lat?: number;
  /** Metres above sea level where it was marked. */
  ele?: number;
  /** Uploaded photo URL; a `file://` one is still waiting to go up. */
  photo?: string;
  /** ISO time the point was marked. */
  at?: string;
}

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
  waypoints?: TrackWaypoint[];
  distM?: number;
  ascM?: number;
  pointCount?: number;
  startedAt?: string;
  /** 「城市 区县」，保存后按轨迹中段反查填上；高德查不到的地方为空。 */
  region?: string;
  /** Profile visibility; only used while the track is not on a journey. */
  visibility?: 'private' | 'followers' | 'public';
  /** An imported file the owner says they walked, so it counts as a timeline outing. */
  ownOuting?: boolean;
  /** Set while the track is published: anyone signed in can find it in search. */
  publishedAt?: string;
  /**
   * False for a journey's copy of a catalog route: the journey points at it, but
   * it is not one of 「我的轨迹」 until the user saves it there. Absent means true.
   */
  inLibrary?: boolean;
  /** On a library entry saved from a journey's track: that track's id. */
  sourceTrackId?: string;
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
