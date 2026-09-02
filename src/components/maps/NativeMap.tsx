import React, { forwardRef } from 'react';
import { View } from 'react-native';
import type { NativeMapHandle, NativeMapProps } from './types';

export const NATIVE_MAP_AVAILABLE = false;

export const NativeMap = forwardRef<NativeMapHandle, NativeMapProps>(function NativeMap({ style }, _ref) {
  return <View style={style} />;
});

export type {
  MapCoordinate,
  NativeMapHandle,
  NativeMapMarker,
  NativeMapPolyline,
  NativeMapProps,
  NativeMapStyle,
} from './types';
