import React, { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Theme } from '../../theme/theme';
import { Icon } from '../Icon';
import { NativeMap, type NativeMapHandle } from '../maps/NativeMap';

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
  const mapRef = useRef<NativeMapHandle>(null);

  useEffect(() => {
    mapRef.current?.moveCamera(center, 13, 500);
  }, [center, centerRevision]);

  const polylines = useMemo(() => trackCoords && trackCoords.length >= 2 ? [
    { id: 'journey-location-track-casing', coordinates: trackCoords, color: theme.dark ? '#111111' : '#FFFFFF', width: 6 },
    { id: 'journey-location-track-line', coordinates: trackCoords, color: theme.accent, width: 3.2 },
  ] : [], [theme, trackCoords]);
  const markers = useMemo(() => [
    ...(trackCoords?.[0] ? [{
      id: 'journey-location-start',
      coordinate: trackCoords[0],
      anchor: { x: 0.5, y: 0.5 },
      content: <View style={styles.startMarker} />,
    }] : []),
    ...(trackCoords && trackCoords.length > 1 ? [{
      id: 'journey-location-end',
      coordinate: trackCoords[trackCoords.length - 1],
      anchor: { x: 0.5, y: 0.5 },
      content: <View style={[styles.endMarker, { backgroundColor: theme.danger }]} />,
    }] : []),
    {
      id: 'journey-location-selection',
      coordinate: selectedCoordinate,
      anchor: { x: 0.5, y: 1 },
      content: <Icon name="pin" size={38} color={theme.accent} strokeWidth={2.2} />,
    },
  ], [selectedCoordinate, theme, trackCoords]);

  return (
    <NativeMap
      ref={mapRef}
      style={StyleSheet.absoluteFill}
      initialCenter={center}
      initialZoom={13}
      initialFitCoordinates={trackCoords}
      initialPadding={[34, 34, 34, 34]}
      markers={markers}
      polylines={polylines}
      onPress={(coordinate) => {
        mapRef.current?.moveCamera(coordinate, undefined, 320);
        onSelectCoordinate(coordinate);
      }}
    />
  );
}

const styles = StyleSheet.create({
  startMarker: { width: 13, height: 13, borderRadius: 7, backgroundColor: '#34C759', borderWidth: 2.5, borderColor: '#FFFFFF' },
  endMarker: { width: 13, height: 13, borderRadius: 7, borderWidth: 2.5, borderColor: '#FFFFFF' },
});
