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
  /** a catalog route the user has not walked yet: the same pin, greyed out */
  muted?: boolean;
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
      new ones in a sweep that starts at the middle of the group and works
      outward, one compressed step apart, so a whole region arriving finishes
      inside the same total as the first screen's card cascade however many pins
      it carries. Only pins that were not already shown animate; the rest keep
      their alpha. Ignored while the OS asks for reduced motion. */
  apply: (visibleKeys: Set<string>, options?: { stagger?: boolean }) => void;
}

export type GlobeMapStyle = 'standard' | 'terrain' | 'satellite';

export type GlobeCameraAction =
  | { type: 'fitRoute' | 'resetNorth'; revision: number }
  | { type: 'fitCoordinates'; revision: number; coordinates: [number, number][]; padding?: [number, number, number, number]; animated?: boolean }
  /** `zoom` keeps the camera where it is instead of jumping to 14; `inFrame`
     puts the point in the band the route fits to — above the bottom card —
     rather than dead centre with the map squared back to north. */
  | { type: 'locate'; revision: number; coordinate: [number, number]; zoom?: number; inFrame?: boolean }
  | { type: 'restore'; revision: number; coordinate: [number, number]; zoom: number };


export interface GlobeRouteSegment {
  id: string;
  label: string;
  coordinates: [number, number][];
  color: string;
  active: boolean;
  /** `false` leaves out the start/finish dots; the caller draws its own. */
  endpoints?: boolean;
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
  /** Replay the caller's visibility when a native map first mounts. */
  onPinVisibilityReady?: () => void;
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
  /** The stop whose detail is open: the caller draws its drop pin, so its
   *  number is left off. Kept apart from `journeyStops` so opening one does
   *  not hand the map a new stop list and refit the camera. */
  hiddenJourneyStopId?: string | null;
  /** per-day mileage capsules along the itinerary chain */
  journeyDayLabels?: GlobeJourneyDayLabel[];
  onJourneyDayLabelPress?: (day: string) => void;
  /** fully built extra markers (companion live-location pins) appended after
   *  the map's own set. The caller supplies the content so MapGlobe stays
   *  free of feature imports — its framing test loads this file with a fixed
   *  dependency whitelist. */
  extraMarkers?: NativeMapMarker[];
  /** show the current-location pin at this coordinate */
  pin?: { lng: number; lat: number; heading?: number; accuracy?: number } | null;
  /** keep the native map camera centered as the current location updates */
  followUserLocation?: boolean;
  /** reports the native map SDK's current user coordinate */
  onUserLocationChange?: (coordinate: [number, number], accuracy?: number) => void;
  /** base-map presentation used by the platform-native renderer */
  mapStyle?: GlobeMapStyle;
  /** hide ordinary place/road/POI labels while keeping the journey route */
  showMapLabels?: boolean;
  showDistanceMarkers?: boolean;
  /** imperatively re-frame the journey route or restore north-up orientation */
  cameraAction?: GlobeCameraAction;
  /** bottom camera padding reserved for the journey detail sheet */
  focusBottomPadding?: number;
  /** Bottom of the visible map, excluding content that covers the map. */
  mapBottomInset?: number;
  showWalkingAttribution?: boolean;
  /** suspend automatic route framing after the user manually adjusts the map */
  autoFrameRoute?: boolean;
  /** cascade the POI pins in one-by-one (first data load) instead of showing them all at once */
  staggerPins?: boolean;
  /**
   * Names the group of pins the caller is currently *arriving* — for 发现 that is
   * the selected region, and it changes only when a different region's places
   * swap in. Android uses it to decide which pins play the native marker
   * entrance: a pin whose key was not on screen at the previous build gets it
   * while this value is new, and never again for the same appearance. Every
   * other reason a pin is rebuilt — a chip filter, the selected pin, `muted`
   * flipping (its marker id changes), a card opening — keeps the value, so
   * nothing replays. iOS ignores it: there the same decision is made by the
   * `stagger` option of the visibility rail. Ignored while the OS asks for
   * reduced motion.
   */
  pinEntranceKey?: string;
  /** reports map orientation so detail chrome can reveal a compass only when useful */
  onCameraOrientationChange?: (heading: number, pitch: number) => void;
  /** reports that the user has moved the camera away from its programmatic route framing */
  onCameraGestureStart?: () => void;
  onCameraPositionChange?: (camera: NativeMapCamera) => void;
  /** every zoom frame while the camera moves, for a live scale bar */
  onCameraZoomChange?: (zoom: number) => void;
}

export function poiColor(p: GlobePoi, theme: Theme): { fill: string; hollow: boolean } {
  return { fill: p.mine ? theme.trailMine : theme.accent, hollow: false };
}
