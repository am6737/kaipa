// Map entry: native flat map in development builds, SVG fallback in Expo Go/web.
import React from 'react';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import SvgGlobe from './SvgGlobe';
import { GlobeProps } from './types';
import { NATIVE_MAP_AVAILABLE } from '../maps/NativeMap';
import { countRender, propDiff, trace } from '../../lib/tabSwitchProbe';

export const NATIVE_MAP_ENABLED = NATIVE_MAP_AVAILABLE;

let MapGlobe: React.ComponentType<GlobeProps> | null = null;
if (NATIVE_MAP_ENABLED) {
  // Native map failures must surface instead of being disguised as the SVG map.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  MapGlobe = require('./MapGlobe').default;
}

function GlobeBase(props: GlobeProps) {
  countRender('Globe');
  if (MapGlobe) {
    const Map = MapGlobe;
    return <Map {...props} />;
  }
  if (Platform.OS === 'web' || Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    return <SvgGlobe {...props} />;
  }
  throw new Error('Native map module is unavailable. Rebuild the development client with expo-gaode-map.');
}

function sameProps(prev: GlobeProps, next: GlobeProps) {
  const a = prev as unknown as Record<string, unknown>;
  const b = next as unknown as Record<string, unknown>;
  const keys = Object.keys(b);
  return keys.length === Object.keys(a).length && keys.every((key) => a[key] === b[key]);
}

// `active === false` is the caller saying no pixel of this map can be seen or
// touched, so none of its props can matter this pass. Measured on iOS: rebuilding
// the marker/polyline subtree was 112ms of a 230ms bottom-tab switch, and it ran
// on every switch - including the ones that only opened the 我 tab.
// While it is coming back or staying on screen, an all-equal prop set means the
// same thing: the annotations the caller would hand us are already built.
export const Globe = React.memo(GlobeBase, (prev, next) => {
  const frozen = next.active === false;
  const unchanged = sameProps(prev, next);
  if (__DEV__) trace(frozen ? 'Globe skipped (inactive)' : unchanged ? 'Globe skipped (props unchanged)' : `Globe renders, churned props: ${propDiff(prev, next)}`);
  return frozen || unchanged;
});

export type { GlobeCameraAction, GlobeMapStyle, GlobeProps, GlobeRouteSegment, GlobeJourneyLeg, GlobeJourneyStop, GlobeJourneyDayLabel } from './types';
