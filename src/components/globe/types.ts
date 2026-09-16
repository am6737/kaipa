import { Theme } from '../../theme/theme';
import { Tone } from '../../data/tones';

export interface GlobePoi {
  id: string;
  lng: number;
  lat: number;
  mine?: boolean;
  /** scenery tone — picks the marker's photo (with id as the seed) */
  tone?: Tone;
  /** how many journeys share this place — when >1 the pin shows a count badge */
  count?: number;
  /** real cover photo URI from a recorded journey */
  coverUri?: string;
  /** route or journey name shown in the marker's capsule label */
  label?: string;
}

export type GlobeMapStyle = 'standard' | 'satellite';

export type GlobeCameraAction =
  | { type: 'fitRoute' | 'resetNorth'; revision: number }
  | { type: 'locate'; revision: number; coordinate: [number, number] };


export interface GlobeRouteBoundary {
  id: string;
  groupKey: string;
  title: string;
  distance: string;
  coordinate: [number, number];
  color: string;
  active: boolean;
  pending: boolean;
}

export interface GlobeRouteSegment {
  id: string;
  label: string;
  coordinates: [number, number][];
  color: string;
  active: boolean;
}

export interface GlobeProps {
  theme: Theme;
  size: number;
  pois: GlobePoi[];
  activePoiId?: string | null;
  onPoiPress?: (id: string) => void;
  /** tap on the empty map background (not a marker) — used to dismiss the sheet */
  onBackgroundPress?: () => void;
  /** map coordinate picked while editing an itinerary endpoint */
  onMapCoordinatePress?: (coordinate: [number, number]) => void;
  center?: { lon: number; lat: number };
  /** selected route/location to animate the native map camera toward */
  focusCoords?: [number, number][] | null;
  /** colored itinerary sections drawn over the selected track */
  focusSegments?: GlobeRouteSegment[];
  /** configured endpoints, including groups whose preceding segment is not set */
  focusBoundaries?: GlobeRouteBoundary[];
  /** current unsaved endpoint while the background map is in selection mode */
  selectionPin?: { coordinate: [number, number]; color: string };
  /** visual link from the projected track boundary to an off-track endpoint */
  focusConnector?: { coordinates: [[number, number], [number, number]]; color: string };
  /** switch the itinerary tab when a route endpoint label is pressed */
  onRouteBoundaryPress?: (groupKey: string) => void;
  /** show the current-location pin at this coordinate */
  pin?: { lng: number; lat: number; heading?: number } | null;
  /** keep the native map camera centered as the current location updates */
  followUserLocation?: boolean;
  /** reports the native map SDK's current user coordinate */
  onUserLocationChange?: (coordinate: [number, number]) => void;
  /** base-map presentation used by the platform-native renderer */
  mapStyle?: GlobeMapStyle;
  /** hide ordinary place/road/POI labels while keeping the journey route */
  showMapLabels?: boolean;
  /** imperatively re-frame the journey route or restore north-up orientation */
  cameraAction?: GlobeCameraAction;
  /** bottom camera padding reserved for the journey detail sheet */
  focusBottomPadding?: number;
  /** reports map orientation so detail chrome can reveal a compass only when useful */
  onCameraOrientationChange?: (heading: number, pitch: number) => void;
  /** reports that the user has moved the camera away from its programmatic route framing */
  onCameraGestureStart?: () => void;
}

export function poiColor(p: GlobePoi, theme: Theme): { fill: string; hollow: boolean } {
  return { fill: p.mine ? theme.trailMine : theme.accent, hollow: false };
}
