// timeline.ts — the unified 行程 model. ONE concept: a checkable, user-grouped
// list of rich records. Groups are user-defined strings (e.g. "交通", "徒步",
// "住宿" — whatever the user wants). Progress = how many rows are checked off.
// Checks are purely manual. Gear checklist stays separate.

export interface TLMedia {
  tone: string;
  uri?: string;
  thumb?: string;
  video?: boolean;
  livePhoto?: boolean;
  pairedVideoUri?: string;
  caption?: string;
  createdAt?: string;
  author?: {
    ini: string;
    name: string;
    color: string;
    avatarUrl?: string;
  };
}

export type TimelineItemKind = 'activity' | 'transport' | 'stay' | 'custom';
export type TimelineTransportMode = 'car' | 'taxi' | 'bus' | 'shuttle' | 'walk' | 'unknown';

export interface TimelineLocation {
  name: string;
  source?: 'map' | 'custom';
  longitude?: number;
  latitude?: number;
  address?: string;
}

export interface TimelineTransport {
  mode: TimelineTransportMode;
  from: TimelineLocation;
  to: TimelineLocation;
  distanceMeters?: number;
  durationMinutes?: number;
  geometry?: [number, number][];
  status: 'verified' | 'estimated' | 'unknown';
  source?: string;
  note?: string;
}

export interface TLRow {
  id: string;
  routeId?: string;
  title: string;
  day: string;
  media?: TLMedia[];
  timeStart?: number; // minutes from midnight (0–1439), 24h start time; undefined = no time
  timeEnd?: number;   // minutes from midnight, 24h end time; undefined = no end
  synth?: boolean;
  custom?: boolean;
  checked?: boolean;
  kind?: TimelineItemKind;
  /** Where this item happens — picked on the map or via place search. */
  location?: TimelineLocation;
  /** Only for agent-produced transport legs (a segment between two places). */
  transport?: TimelineTransport;
}

export interface TimelineGroupRoute {
  /** Catalog route this boundary is measured on; undefined means the journey's own bound track. */
  routeId?: string;
  endDistanceMeters: number;
  longitude: number;
  latitude: number;
  trackPointIndex: number;
  trackPointFraction: number;
  source: 'waypoint' | 'map' | 'distance';
  locationName?: string;
}

export interface TLGroup {
  key: string;
  label: string;
  rows: TLRow[];
}
