// Globe entry — picks the real Mapbox globe when a public token is configured,
// otherwise the stylized SVG fallback. The Mapbox path is wrapped in an
// ErrorBoundary so a missing native module (e.g. running in Expo Go) silently
// degrades to the fallback instead of crashing the app.
import React from 'react';
import SvgGlobe from './SvgGlobe';
import { GlobeProps } from './types';

export const MAPBOX_ENABLED = !!(process.env.EXPO_PUBLIC_MAPBOX_TOKEN || '').trim();

let MapGlobe: React.ComponentType<GlobeProps> | null = null;
if (MAPBOX_ENABLED) {
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
