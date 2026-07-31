import React, { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Mapbox, { Camera, LineLayer, MapView, MarkerView, ShapeSource, StyleImport } from '@rnmapbox/maps';
import { Icon } from '../Icon';
import { Theme } from '../../theme/theme';

const MAPBOX_TOKEN = (process.env.EXPO_PUBLIC_MAPBOX_TOKEN || '').trim();
const STANDARD_STYLE = 'mapbox://styles/mapbox/standard';
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
  selectedCoordinate: [number, number];
  trackCoords?: [number, number][];
  onSelectCoordinate: (coordinate: [number, number]) => void;
}

export default function JourneyLocationMap({
  theme,
  center,
  centerRevision,
  selectedCoordinate,
  trackCoords,
  onSelectCoordinate,
}: JourneyLocationMapProps) {
  ensureToken();
  const cameraRef = useRef<Camera>(null);
  const routeBounds = useMemo(() => {
    if (!trackCoords || trackCoords.length < 2) return null;
    let minLng = trackCoords[0][0];
    let maxLng = trackCoords[0][0];
    let minLat = trackCoords[0][1];
    let maxLat = trackCoords[0][1];
    for (const [lng, lat] of trackCoords.slice(1)) {
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    }
    return { ne: [maxLng, maxLat] as [number, number], sw: [minLng, minLat] as [number, number] };
  }, [trackCoords]);
  const routeShape = useMemo(() => trackCoords && trackCoords.length >= 2 ? ({
    type: 'Feature' as const,
    properties: {},
    geometry: { type: 'LineString' as const, coordinates: trackCoords },
  }) : null, [trackCoords]);
  const initialCameraSettings = useRef(routeBounds ? {
    bounds: { ...routeBounds, paddingLeft: 34, paddingRight: 34, paddingTop: 34, paddingBottom: 34 },
  } : { centerCoordinate: center, zoomLevel: 13 }).current;

  useEffect(() => {
    cameraRef.current?.setCamera({ centerCoordinate: center, zoomLevel: 13, animationDuration: 500 });
  }, [centerRevision]); // revision changes only for explicit location choices

  return (
    <View style={StyleSheet.absoluteFill}>
      <MapView
        style={StyleSheet.absoluteFill}
        styleURL={STANDARD_STYLE}
        logoEnabled={false}
        attributionEnabled={false}
        scaleBarEnabled={false}
        compassEnabled={false}
        gestureSettings={{ pinchPanEnabled: false, pinchZoomEnabled: true }}
        onPress={(event) => {
          const coordinates = event.geometry.coordinates;
          if (coordinates.length >= 2) {
            const coordinate: [number, number] = [coordinates[0], coordinates[1]];
            cameraRef.current?.setCamera({ centerCoordinate: coordinate, animationDuration: 320 });
            onSelectCoordinate(coordinate);
          }
        }}
      >
        <Camera ref={cameraRef} defaultSettings={initialCameraSettings} />
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
        {routeShape ? (
          <ShapeSource id="journey-location-track" shape={routeShape}>
            <LineLayer
              slot="top"
              id="journey-location-track-casing"
              style={{
                lineColor: theme.dark ? 'rgba(0,0,0,0.58)' : 'rgba(255,255,255,0.92)',
                lineWidth: 6,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
            <LineLayer
              slot="top"
              id="journey-location-track-line"
              style={{
                lineColor: theme.accent,
                lineOpacity: 0.82,
                lineWidth: 3.2,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          </ShapeSource>
        ) : null}
        {trackCoords?.[0] ? (
          <MarkerView coordinate={trackCoords[0]} anchor={{ x: 0.5, y: 0.5 }} allowOverlap>
            <View style={{ width: 13, height: 13, borderRadius: 7, backgroundColor: '#34C759', borderWidth: 2.5, borderColor: '#FFFFFF' }} />
          </MarkerView>
        ) : null}
        {trackCoords && trackCoords.length > 1 ? (
          <MarkerView coordinate={trackCoords[trackCoords.length - 1]} anchor={{ x: 0.5, y: 0.5 }} allowOverlap>
            <View style={{ width: 13, height: 13, borderRadius: 7, backgroundColor: theme.danger, borderWidth: 2.5, borderColor: '#FFFFFF' }} />
          </MarkerView>
        ) : null}
        <MarkerView coordinate={selectedCoordinate} anchor={{ x: 0.5, y: 1 }} allowOverlap>
          <Icon name="pin" size={38} color={theme.accent} strokeWidth={2.2} />
        </MarkerView>
      </MapView>
    </View>
  );
}
