// MapGlobe.tsx — the real Mapbox 3D globe (@rnmapbox/maps). Only imported when a
// public token is configured; the native module is required for it to run, so
// this lives behind token-gating + an ErrorBoundary (see index.tsx).
//
// The earth sits in real space: the `globe` projection with Mapbox's atmosphere
// kept intact — a blue horizon rim fading into black outer space with a star
// field (see the Atmosphere config below). The backdrop is space-black so the
// globe never flashes the app background before the map paints.
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

// Deep-space backdrop — the color of "outer space" beyond the atmosphere, used
// both for the Atmosphere spaceColor and the wrapper bg (so no app-bg flash).
const SPACE = '#000010';

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
    <View style={[StyleSheet.absoluteFill, { backgroundColor: SPACE }]}>
      <MapView
        style={{ flex: 1 }}
        projection="globe"
        styleURL={STANDARD_STYLE}
        // Render labels in the device's system language (e.g. 中文 on a zh phone),
        // not the map's default. `current` resolves the system locale natively.
        localizeLabels={{ locale: 'current' }}
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
        {/* Standard style basemap config: show all labels (place / road / POI /
            transit) so zooming in reveals region, road and place names — a full
            map experience. Follows the app's light/dark mode via the light preset. */}
        <StyleImport
          id="basemap"
          existing
          config={{
            lightPreset: theme.mapLightPreset,
            showPlaceLabels: true,
            showRoadLabels: true,
            showPointOfInterestLabels: true,
            showTransitLabels: true,
          } as any}
        />
        {/* The earth in real space: a faint, dim atmosphere rim (low near-horizon
            glow → dark-blue high sky) fading into black outer space with a
            visible star field. Keep `color`/`highColor` dark so the rim never
            glows bright; raise them toward white/blue for a stronger halo. */}
        <Atmosphere
          style={{
            color: '#1e3a5f',
            highColor: '#0a1730',
            spaceColor: SPACE,
            horizonBlend: 0.02,
            starIntensity: 0.55,
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
