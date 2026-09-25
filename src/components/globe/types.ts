import { Theme } from '../../theme/theme';
import { Tone } from '../../data/tones';
import type { NativeMapCamera, NativeMapMarker } from '../maps/types';

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
  /** Which 发现 mode this pin belongs to, so the two layers can be told apart by
      the visibility rail below. Part of the pin's key, not of its visibility:
      a pin's own fields must not change when a switch hides it, or the switch is
      back to rebuilding every marker. */
  layer?: 'explore' | 'memory';
}

/** A pin's identity as the visibility rail knows it: its mode's layer plus its
    place id. One POI can belong to both layers (a journey whose track is public is
    also a route card), so the layer has to be in the key.
    `MapGlobe` inlines the same string rather than importing this: the framing test
    vm-loads that file against a fixed dependency whitelist. Change one, change the
    other. */
export const pinKey = (p: { id: string; layer?: 'explore' | 'memory' }) => `${p.layer ?? 'shared'}:${p.id}`;

/**
 * Lets the caller change which pins are on screen **without a React render**.
 * Measured: a 探索↔旅程 switch costs ~190ms no matter what is done to the pins'
 * contents, because that is what it costs React to walk the marker list again.
 * The way out is already in this codebase - `pinScale` is an Animated.Value
 * rather than state, precisely so zooming never re-registers a marker - so pin
 * visibility rides the same rail: the caller writes the visible set here and the
 * map moves per-pin alpha values. Only the native map honours it; everywhere else
 * (Android's bitmap-baked markers, the SVG globe) the caller passes just the layer
 * it wants drawn.
 */
export interface PinVisibilityApi {
  /** Show exactly these pins (`pinKey` values), hide the rest. Hiding is
      immediate - that layer is the one the user just left. `stagger` reveals the
      new ones one after another, like the first screen's pins arrive. */
  apply: (visibleKeys: Set<string>, options?: { stagger?: boolean }) => void;
}

export type GlobeMapStyle = 'standard' | 'terrain' | 'satellite';

export type GlobeCameraAction =
  | { type: 'fitRoute' | 'resetNorth'; revision: number }
  | { type: 'fitCoordinates'; revision: number; coordinates: [number, number][] }
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

/** A day's mileage, pinned at the middle of that day's part of the chain. */
export interface GlobeJourneyDayLabel {
  /** the itinerary group key, used to select that day */
  day: string;
  title: string;
  distance: string;
  coordinate: [number, number];
  color: string;
}

/** One itinerary stop that carries a place, drawn with its sequence number.
 *  Only the open day's stops are sent; the overview sends unnumbered dots. */
export interface GlobeJourneyStop {
  id: string;
  /** the pin's number, or undefined for a plain dot (the overview shows the
   *  chain of places without pretending each one is a numbered step) */
  order?: number;
  name: string;
  coordinate: [number, number];
  /** the colour of the day this stop belongs to, matching its legs */
  color: string;
}

export interface GlobeProps {
  theme: Theme;
  size: number;
  pois: GlobePoi[];
  /** false = the map is behind another screen: nothing it renders can be seen or
      touched, so it stays mounted but stops taking re-renders. */
  active?: boolean;
  /** keep native POI marker instances mounted while temporarily hiding them */
  showPoiMarkers?: boolean;
  /** Filled in by the native map with the render-free way to change which pins are
      on screen. See `PinVisibilityApi`. */
  pinVisibilityApi?: { current: PinVisibilityApi | null };
  activePoiId?: string | null;
  onPoiPress?: (id: string) => void;
  /** tap on the empty map background (not a marker) — used to dismiss the sheet */
  onBackgroundPress?: () => void;
  center?: { lon: number; lat: number };
  /** selected route/location to animate the native map camera toward */
  focusCoords?: [number, number][] | null;
  /** overrides what the map frames (initial fit and automatic refit). Used by a
   *  journey, whose planned legs reach places no recorded track ever went. */
  frameCoords?: [number, number][];
  /** colored itinerary sections drawn over the selected track */
  focusSegments?: GlobeRouteSegment[];
  /** planned road between consecutive itinerary stops of the same day */
  journeyLegs?: GlobeJourneyLeg[];
  /** numbered pins for itinerary stops that carry a place */
  journeyStops?: GlobeJourneyStop[];
  onJourneyStopPress?: (id: string) => void;
  /** per-day mileage capsules along the itinerary chain */
  journeyDayLabels?: GlobeJourneyDayLabel[];
  onJourneyDayLabelPress?: (day: string) => void;
  /** fully built extra markers (companion live-location pins) appended after
   *  the map's own set. The caller supplies the content so MapGlobe stays
   *  free of feature imports — its framing test loads this file with a fixed
   *  dependency whitelist. */
  extraMarkers?: NativeMapMarker[];
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
