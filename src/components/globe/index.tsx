// Map entry: native flat map in development builds, SVG fallback in Expo Go/web.
import React from 'react';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import SvgGlobe from './SvgGlobe';
import { GlobeProps } from './types';
import { NATIVE_MAP_AVAILABLE } from '../maps/NativeMap';

export const NATIVE_MAP_ENABLED = NATIVE_MAP_AVAILABLE;

let MapGlobe: React.ComponentType<GlobeProps> | null = null;
if (NATIVE_MAP_ENABLED) {
  // Native map failures must surface instead of being disguised as the SVG map.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  MapGlobe = require('./MapGlobe').default;
}

export function Globe(props: GlobeProps) {
  if (MapGlobe) {
    const Map = MapGlobe;
    return <Map {...props} />;
  }
  if (Platform.OS === 'web' || Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    return <SvgGlobe {...props} />;
  }
  throw new Error('Native map module is unavailable. Rebuild the development client with expo-gaode-map.');
}

export type { GlobeCameraAction, GlobeMapStyle, GlobeProps } from './types';
