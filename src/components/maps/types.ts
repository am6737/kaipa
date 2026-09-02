import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

export type MapCoordinate = [number, number];
export type NativeMapStyle = 'standard' | 'terrain' | 'satellite';

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
  markers?: NativeMapMarker[];
  polylines?: NativeMapPolyline[];
  onPress?: (coordinate: MapCoordinate) => void;
  onCameraChange?: (heading: number, pitch: number) => void;
  onGestureStart?: () => void;
}
