// trackToPoi.ts — projects a library track onto the Poi shape that
// TrackDetailContent renders. The component reads only id/name/dist/asc and the
// three track* fields; the rest satisfy the type and give the map a start point.
import type { Poi } from '../../data/pois';
import type { Track } from '../../data/tracks';
import { formatTrackAscent, formatTrackDistance } from '../../lib/trackParser';

export function trackToPoi(track: Track): Poi {
  const start = track.coords?.[0];
  return {
    id: track.id,
    kind: 'journey',
    name: track.name,
    region: '',
    coord: '',
    lng: start?.[0] ?? 0,
    lat: start?.[1] ?? 0,
    dist: track.distM != null ? formatTrackDistance(track.distM) : '',
    asc: track.ascM != null ? formatTrackAscent(track.ascM) : '',
    tone: 'forest',
    trackId: track.id,
    trackCoords: track.coords,
    trackElevation: track.elevation,
    trackWaypoints: track.waypoints,
    trackFileUrl: track.fileUrl,
    trackFileName: track.fileName,
  };
}
