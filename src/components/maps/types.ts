import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { wgs84ToGcj02 } from '../../lib/coordinates';

export type MapCoordinate = [number, number];
export type NativeMapStyle = 'standard' | 'terrain' | 'satellite';
export type ProjectedMapPoint = { longitude: number; latitude: number };

const projectedTracks = new WeakMap<MapCoordinate[], ProjectedMapPoint[]>();

// The GCJ-02 shift costs several trig calls per point, and a long track is
// tens of thousands of them. Keying the projected array by its source keeps a
// parent re-render from re-projecting the whole track and keeps the Polyline
// prop identity stable, so the native layer is not handed fresh geometry to
// rebuild on every render.
export function projectTrack(coordinates: MapCoordinate[]): ProjectedMapPoint[] {
  const cached = projectedTracks.get(coordinates);
  if (cached) return cached;
  const projected = coordinates.map((coordinate) => {
    const [longitude, latitude] = wgs84ToGcj02(coordinate);
    return { longitude, latitude };
  });
  projectedTracks.set(coordinates, projected);
  return projected;
}

// MapKit and AMap polylines have no opacity prop, so the "this belongs to
// another day" dim has to live in the stroke colour itself. AMap parses that
// colour string natively, where an 8-digit hex means #AARRGGBB — only rgba()
// carries alpha the same way on both maps.
export function withColorAlpha(color: string, opacity = 1): string {
  const hex = /^#([0-9a-fA-F]{6})$/.exec(color);
  if (!hex || opacity >= 1) return color;
  const value = parseInt(hex[1], 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${opacity})`;
}

const EMPTY_COORDINATES: MapCoordinate[] = [];

// Validation almost never rejects a point, so filtering would replace an
// unchanged track with a fresh array on every pass. Returning the source array
// when nothing was dropped keeps its identity, which is what stops the
// projection cache and the native polyline from being rebuilt per render.
export function keepValidCoordinates(
  coordinates: MapCoordinate[] | null | undefined,
): MapCoordinate[] {
  if (!coordinates?.length) return EMPTY_COORDINATES;
  const kept = coordinates.filter(isValidMapCoordinate);
  return kept.length === coordinates.length ? coordinates : kept;
}

export function isValidMapCoordinate(value: unknown): value is MapCoordinate {
  if (!Array.isArray(value) || value.length < 2) return false;
  const [longitude, latitude] = value;
  return typeof longitude === 'number'
    && typeof latitude === 'number'
    && Number.isFinite(longitude)
    && Number.isFinite(latitude)
    && longitude >= -180
    && longitude <= 180
    && latitude >= -90
    && latitude <= 90;
}

export interface NativeMapMarker {
  id: string;
  coordinate: MapCoordinate;
  content?: ReactNode;
  title?: string;
  color?: string;
  /**
   * Where in the marker's own box the coordinate lands, 0..1.
   * Android (AMap) only — MapKit ignores it, see `centerOffset`.
   */
  anchor?: { x: number; y: number };
  /**
   * Shifts the marker box away from its coordinate, in dp (negative y = up).
   * iOS (MapKit) only — the Android counterpart is `anchor`.
   */
  centerOffset?: { x: number; y: number };
  opacity?: number;
  onPress?: () => void;
}

export interface NativeMapPolyline {
  id: string;
  coordinates: MapCoordinate[];
  color: string;
  width: number;
  opacity?: number;
  dashed?: boolean;
}

export interface NativeMapHandle {
  fitCoordinates: (coordinates: MapCoordinate[], padding?: [number, number, number, number], duration?: number) => void;
  moveCamera: (coordinate: MapCoordinate, zoom?: number, duration?: number, options?: { resetOrientation?: boolean }) => void;
  resetNorth: () => void;
}

export type NativeMapCamera = { center: MapCoordinate; zoom: number };

export interface NativeMapProps {
  style?: StyleProp<ViewStyle>;
  initialCenter: MapCoordinate;
  initialZoom?: number;
  initialFitCoordinates?: MapCoordinate[];
  initialPadding?: [number, number, number, number];
  mapStyle?: NativeMapStyle;
  showLabels?: boolean;
  interactive?: boolean;
  showUserLocation?: boolean;
  followUserLocation?: boolean;
  markers?: NativeMapMarker[];
  polylines?: NativeMapPolyline[];
  onPress?: (coordinate: MapCoordinate) => void;
  onUserLocationChange?: (coordinate: MapCoordinate) => void;
  onCameraChange?: (heading: number, pitch: number) => void;
  onCameraPositionChange?: (camera: NativeMapCamera) => void;
  onZoomChange?: (zoom: number) => void;
  onGestureStart?: () => void;
}
