import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Mapbox, { Camera, MapView } from '@rnmapbox/maps';
import type { MapState } from '@rnmapbox/maps';
import { Theme } from '../../theme/theme';

const MAPBOX_TOKEN = (process.env.EXPO_PUBLIC_MAPBOX_TOKEN || '').trim();
let tokenSet = false;

function ensureToken() {
  if (!tokenSet && MAPBOX_TOKEN) {
    Mapbox.setAccessToken(MAPBOX_TOKEN);
    tokenSet = true;
  }
}

export interface JourneyLocationMapProps {
  theme: Theme;
  center: [number, number];
  centerRevision: number;
  onCenterChange: (center: [number, number]) => void;
  onGestureStart: () => void;
}

export default function JourneyLocationMap({
  theme,
  center,
  centerRevision,
  onCenterChange,
  onGestureStart,
}: JourneyLocationMapProps) {
  ensureToken();
  const cameraRef = useRef<Camera>(null);

  useEffect(() => {
    cameraRef.current?.setCamera({ centerCoordinate: center, zoomLevel: 13, animationDuration: 500 });
  }, [centerRevision]); // center changes continuously while panning; revision changes only for commanded moves

  const handleIdle = (state: MapState) => {
    const [lng, lat] = state.properties.center;
    if (Number.isFinite(lng) && Number.isFinite(lat)) onCenterChange([lng, lat]);
  };

  return (
    <View style={StyleSheet.absoluteFill}>
      <MapView
        style={StyleSheet.absoluteFill}
        styleURL={theme.mapStyleURL}
        logoEnabled={false}
        attributionEnabled={false}
        scaleBarEnabled={false}
        compassEnabled={false}
        onTouchStart={onGestureStart}
        onMapIdle={handleIdle}
        onPress={(event) => {
          const coordinates = event.geometry.coordinates;
          if (coordinates.length >= 2) {
            cameraRef.current?.setCamera({
              centerCoordinate: [coordinates[0], coordinates[1]],
              animationDuration: 320,
            });
          }
        }}
      >
        <Camera ref={cameraRef} defaultSettings={{ centerCoordinate: center, zoomLevel: 13 }} />
      </MapView>
    </View>
  );
}
