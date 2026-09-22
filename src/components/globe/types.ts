import { Theme } from '../../theme/theme';
import { Tone } from '../../data/tones';
import type { NativeMapCamera } from '../maps/types';

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

export type GlobeMapStyle = 'standard' | 'terrain' | 'satellite';

export type GlobeCameraAction =
  | { type: 'fitRoute' | 'resetNorth'; revision: number }
  | { type: 'locate'; revision: number; coordinate: [number, number] }
  | { type: 'restore'; revision: number; coordinate: [number, number]; zoom: number };


export interface GlobeRouteSegment {
  id: string;
  label: string;
  coordinates: [number, number][];
  color: string;
  active: boolean;
}

/** A leg between two consecutive itinerary stops of the same day. */
export interface GlobeJourneyLeg {
  id: string;
  coordinates: [number, number][];
  color: string;
  active: boolean;
  /** the road plan for this leg has not arrived, so it reads as a plain link */
  dashed?: boolean;
}

/** One itinerary stop that carries a place, drawn with its sequence number. */
export interface GlobeJourneyStop {
  id: string;
  order: number;
  name: string;
  coordinate: [number, number];
  active: boolean;
}

export interface GlobeProps {
  theme: Theme;
  size: number;
  pois: GlobePoi[];
  /** keep native POI marker instances mounted while temporarily hiding them */
  showPoiMarkers?: boolean;
  activePoiId?: string | null;
  onPoiPress?: (id: string) => void;
  /** tap on the empty map background (not a marker) — used to dismiss the sheet */
  onBackgroundPress?: () => void;
  center?: { lon: number; lat: number };
  /** selected route/location to animate the native map camera toward */
  focusCoords?: [number, number][] | null;
  /** colored itinerary sections drawn over the selected track */
  focusSegments?: GlobeRouteSegment[];
  /** planned road between consecutive itinerary stops of the same day */
  journeyLegs?: GlobeJourneyLeg[];
  /** numbered pins for itinerary stops that carry a place */
  journeyStops?: GlobeJourneyStop[];
  onJourneyStopPress?: (id: string) => void;
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
  showDistanceMarkers?: boolean;
  /** imperatively re-frame the journey route or restore north-up orientation */
  cameraAction?: GlobeCameraAction;
  /** bottom camera padding reserved for the journey detail sheet */
  focusBottomPadding?: number;
  /** suspend automatic route framing after the user manually adjusts the map */
  autoFrameRoute?: boolean;
  /** cascade the POI pins in one-by-one (first data load) instead of showing them all at once */
  staggerPins?: boolean;
  /** reports map orientation so detail chrome can reveal a compass only when useful */
  onCameraOrientationChange?: (heading: number, pitch: number) => void;
  /** reports that the user has moved the camera away from its programmatic route framing */
  onCameraGestureStart?: () => void;
  onCameraPositionChange?: (camera: NativeMapCamera) => void;
}

export function poiColor(p: GlobePoi, theme: Theme): { fill: string; hollow: boolean } {
  return { fill: p.mine ? theme.trailMine : theme.accent, hollow: false };
}
