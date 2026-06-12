// MapGlobe.tsx — the real Mapbox 3D globe (@rnmapbox/maps). Only imported when a
// public token is configured; the native module is required for it to run, so
// this lives behind token-gating + an ErrorBoundary (see index.tsx).
//
// Styled to match the prototype's stylized globe: a sphere floating on the app
// background. We use the `globe` projection, clip the map into a circle, and set
// the Atmosphere `spaceColor` to the theme background so there is no visible
// "outer space" — just the earth in clean whitespace (Apple-minimal).
//
// Route/journey points are drawn as circular photo markers (PhotoPin via
// MarkerView) — the default style — rather than flat colored dots, so each point
// previews its real scenery. The current-location pin stays a plain locating dot.
import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import Mapbox, { MapView, Camera, Atmosphere, StyleImport, MarkerView } from '@rnmapbox/maps';
import { GlobeProps } from './types';
import { PhotoPin } from './PhotoPin';

// Mapbox Standard — the same style as Mapbox's own globe demo. Configured below
// (via StyleImport) to hide every label so it reads as a clean, minimal earth.
const STANDARD_STYLE = 'mapbox://styles/mapbox/standard';

const TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN || '';
let tokenSet = false;
function ensureToken() {
  if (!tokenSet && TOKEN) {
    Mapbox.setAccessToken(TOKEN);
    tokenSet = true;
  }
}

export default function MapGlobe({ theme, pois, activePoiId, onPoiPress, onBackgroundPress, center, pin }: GlobeProps) {
  ensureToken();
  const lon0 = center?.lon ?? 100;
  const lat0 = center?.lat ?? 32;

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.bg }]}>
      <MapView
        style={{ flex: 1 }}
        projection="globe"
        styleURL={STANDARD_STYLE}
        onPress={() => onBackgroundPress?.()}
        scaleBarEnabled={false}
        logoEnabled={false}
        attributionEnabled={false}
        compassEnabled={false}
        rotateEnabled
        zoomEnabled
        scrollEnabled
        pitchEnabled
      >
        {/* defaultSettings only (NOT controlled) so pinch-zoom / pan / rotate
            stick and the camera never snaps back on re-render. Opens framed on
            the globe; the user can freely zoom all the way into a detailed map,
            Apple-Maps style. */}
        <Camera defaultSettings={{ centerCoordinate: [lon0, lat0], zoomLevel: 1.6 }} />
        {/* Standard style basemap config: strip every label for a minimal earth,
            and follow the app's light/dark mode via the light preset. */}
        <StyleImport
          id="basemap"
          existing
          config={{
            lightPreset: theme.mapLightPreset,
            showPlaceLabels: false,
            showRoadLabels: false,
            showPointOfInterestLabels: false,
            showTransitLabels: false,
          } as any}
        />
        {/* Recolor the WHOLE atmosphere (near-horizon glow, high sky, and outer
            space) to the app background, so there is no blue sky filling the
            square — just the earth sphere floating on clean whitespace. */}
        <Atmosphere
          style={{
            color: theme.bg,
            highColor: theme.bg,
            spaceColor: theme.bg,
            horizonBlend: 0.02,
            starIntensity: 0,
          }}
        />

        {/* Circular photo markers — the default point style. allowOverlap keeps
            every photo visible even when the globe is zoomed far out. Press is
            handled by the Pressable child (MarkerView has no onPress). */}
        {pois.map((p) => (
          <MarkerView
            key={p.id}
            coordinate={[p.lng, p.lat]}
            anchor={{ x: 0.5, y: 0.5 }}
            allowOverlap
            isSelected={activePoiId === p.id}
          >
            <Pressable onPress={() => onPoiPress && onPoiPress(p.id)} hitSlop={6}>
              <PhotoPin theme={theme} poi={p} active={activePoiId === p.id} />
            </Pressable>
          </MarkerView>
        ))}

        {/* current-location pin — a plain locating dot, not a photo */}
        {pin && (
          <MarkerView coordinate={[pin.lng, pin.lat]} anchor={{ x: 0.5, y: 0.5 }} allowOverlap>
            <View
              style={{
                width: 16,
                height: 16,
                borderRadius: 8,
                backgroundColor: theme.dotCore,
                borderWidth: 3,
                borderColor: theme.dotRing,
              }}
            />
          </MarkerView>
        )}
      </MapView>
    </View>
  );
}
