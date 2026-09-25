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

/**
 * A fit only needs a track's extent, and both native SDKs take it as the min/max
 * of whatever points they are handed — so the four corners of the bounding box
 * describe exactly the region the whole track does, at 1549/4 the cost. The
 * difference is where it is paid: opening a route card asks for the fit in the
 * same frame the 1500-point track is projected for its polyline, and every one of
 * those points then crosses to the native side a second time to say where its own
 * edges are, while the camera is trying to move.
 */
export function fitBoundsCorners(coordinates: MapCoordinate[]): MapCoordinate[] {
  if (coordinates.length < 2) return coordinates;
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const coordinate of coordinates) {
    const [lng, lat] = coordinate;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  if (!Number.isFinite(minLng)) return coordinates;
  return [[minLng, minLat], [maxLng, minLat], [maxLng, maxLat], [minLng, maxLat]];
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
  /**
   * Draw order against other markers. A larger value floats above a smaller
   * one where they overlap; ties fall back to insertion order, which is why
   * anything that must win an overlap sets this explicitly. Both native maps
   * honour it (MapKit `zIndex`, AMap marker `zIndex`).
   */
  zIndex?: number;
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

export interface MoveCameraOptions {
  resetOrientation?: boolean;
  /**
   * Same [top, right, bottom, left] box `fitCoordinates` takes. Without it a
   * single-point move drops the target on the map view's centre, which on the
   * journey card is under the sheet.
   */
  edgePadding?: [number, number, number, number];
}

export interface NativeMapHandle {
  fitCoordinates: (coordinates: MapCoordinate[], padding?: [number, number, number, number], duration?: number) => void;
  moveCamera: (coordinate: MapCoordinate, zoom?: number, duration?: number, options?: MoveCameraOptions) => void;
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
