// MapGlobe.tsx — the real Mapbox 3D globe (@rnmapbox/maps). Only imported when a
// public token is configured; the native module is required for it to run, so
// this lives behind token-gating + an ErrorBoundary (see index.tsx).
import React, { useMemo } from 'react';
import { View } from 'react-native';
import Mapbox, { MapView, Camera, ShapeSource, CircleLayer } from '@rnmapbox/maps';
import { GlobeProps, poiColor } from './types';

const TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN || '';
let tokenSet = false;
function ensureToken() {
  if (!tokenSet && TOKEN) {
    Mapbox.setAccessToken(TOKEN);
    tokenSet = true;
  }
}

export default function MapGlobe({ theme, size, pois, activePoiId, onPoiPress, center, pin }: GlobeProps) {
  ensureToken();
  const lon0 = center?.lon ?? 100;
  const lat0 = center?.lat ?? 32;

  const featureCollection = useMemo(() => {
    const features = pois.map((p) => {
      const { fill, hollow } = poiColor(p, theme);
      const active = activePoiId != null && p.id === activePoiId;
      return {
        type: 'Feature' as const,
        id: p.id,
        properties: {
          id: p.id,
          fillColor: hollow ? theme.bg : fill,
          strokeColor: hollow ? fill : theme.dark ? '#000000' : '#FFFFFF',
          ringColor: fill,
          radius: active ? 8 : 6,
          strokeW: active ? 2.4 : 1.6,
        },
        geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
      };
    });
    if (pin) {
      features.push({
        type: 'Feature' as const,
        id: '__me__',
        properties: {
          id: '__me__',
          fillColor: theme.dotCore,
          strokeColor: theme.dotRing,
          ringColor: theme.dotRing,
          radius: 6,
          strokeW: 3,
        },
        geometry: { type: 'Point' as const, coordinates: [pin.lng, pin.lat] },
      });
    }
    return { type: 'FeatureCollection' as const, features };
  }, [pois, activePoiId, theme, pin]);

  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: theme.bg }}>
      <MapView
        style={{ flex: 1 }}
        projection="globe"
        styleURL={theme.mapStyleURL}
        scaleBarEnabled={false}
        logoEnabled={false}
        attributionEnabled={false}
        compassEnabled={false}
        rotateEnabled
        zoomEnabled
        pitchEnabled={false}
      >
        <Camera
          defaultSettings={{ centerCoordinate: [lon0, lat0], zoomLevel: 1.35 }}
          centerCoordinate={[lon0, lat0]}
          zoomLevel={1.35}
          animationMode="easeTo"
          animationDuration={400}
        />
        <ShapeSource
          id="kaipa-pois"
          shape={featureCollection as any}
          onPress={(e: any) => {
            const f = e?.features?.[0];
            const id = f?.properties?.id;
            if (id && id !== '__me__' && onPoiPress) onPoiPress(id);
          }}
        >
          <CircleLayer
            id="kaipa-poi-ring"
            style={{
              circleRadius: ['+', ['get', 'radius'], 4] as any,
              circleColor: ['get', 'ringColor'] as any,
              circleOpacity: 0.18,
            }}
          />
          <CircleLayer
            id="kaipa-poi-dot"
            style={{
              circleRadius: ['get', 'radius'] as any,
              circleColor: ['get', 'fillColor'] as any,
              circleStrokeColor: ['get', 'strokeColor'] as any,
              circleStrokeWidth: ['get', 'strokeW'] as any,
            }}
          />
        </ShapeSource>
      </MapView>
    </View>
  );
}
