import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

export type MapCoordinate = [number, number];
export type NativeMapStyle = 'standard' | 'terrain' | 'satellite';

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
  anchor?: { x: number; y: number };
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
  moveCamera: (coordinate: MapCoordinate, zoom?: number, duration?: number) => void;
  resetNorth: () => void;
}

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
  onGestureStart?: () => void;
}
