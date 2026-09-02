// Map entry: native flat map in development builds, SVG fallback in Expo Go/web.
import React from 'react';
import SvgGlobe from './SvgGlobe';
import { GlobeProps } from './types';
import { NATIVE_MAP_AVAILABLE } from '../maps/NativeMap';

export const NATIVE_MAP_ENABLED = NATIVE_MAP_AVAILABLE;

let MapGlobe: React.ComponentType<GlobeProps> | null = null;
if (NATIVE_MAP_ENABLED) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    MapGlobe = require('./MapGlobe').default;
  } catch (e) {
    MapGlobe = null;
  }
}

class GlobeBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    // swallow — the fallback globe takes over
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function Globe(props: GlobeProps) {
  if (MapGlobe) {
    const Map = MapGlobe;
    return (
      <GlobeBoundary fallback={<SvgGlobe {...props} />}>
        <Map {...props} />
      </GlobeBoundary>
    );
  }
  return <SvgGlobe {...props} />;
}

export type { GlobeCameraAction, GlobeMapStyle, GlobeProps } from './types';
