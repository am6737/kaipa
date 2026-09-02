import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useI18n } from '../../i18n';
import { Theme } from '../../theme/theme';
import {
  NativeMap,
  type NativeMapHandle,
  type NativeMapMarker,
  type NativeMapPolyline,
} from '../maps/NativeMap';

export type MapStyleId = 'standard' | 'satellite';
export type TrackMapWaypoint = { name: string; coord: [number, number]; km?: number };

export interface TrackMapHandle {
  fitRoute: () => void;
  resetNorth: () => void;
}

export function ensureNativeMapReady() {
  // Native providers initialize through their platform adapter and config plugin.
}

export const TrackMap = forwardRef<TrackMapHandle, {
  coords: [number, number][];
  theme: Theme;
  height?: number;
  fill?: boolean;
  rounded?: boolean;
  showLegend?: boolean;
  scrubPt?: [number, number];
  accent: string;
  interactive?: boolean;
  waypoints?: TrackMapWaypoint[];
  showWaypoints?: boolean;
  mapStyle?: MapStyleId;
  showMapLabels?: boolean;
  onCameraOrientationChange?: (heading: number, pitch: number) => void;
  routePadding?: [number, number, number, number];
}>(function TrackMap({
  coords,
  theme,
  height,
  fill,
  rounded = true,
  showLegend = true,
  scrubPt,
  accent,
  interactive = false,
  waypoints,
  showWaypoints = false,
  mapStyle = 'standard',
  showMapLabels = true,
  onCameraOrientationChange,
  routePadding = [28, 28, 28, 28],
}, ref) {
  const { t } = useI18n();
  const mapRef = useRef<NativeMapHandle>(null);
  const [selectedWaypoint, setSelectedWaypoint] = useState<TrackMapWaypoint | null>(null);

  useEffect(() => setSelectedWaypoint(null), [coords, showWaypoints]);
  useImperativeHandle(ref, () => ({
    fitRoute: () => mapRef.current?.fitCoordinates(coords, routePadding, 600),
    resetNorth: () => mapRef.current?.resetNorth(),
  }), [coords, routePadding]);

  const markers = useMemo<NativeMapMarker[]>(() => {
    if (!coords.length) return [];
    const values: NativeMapMarker[] = [
      {
        id: 'track-start',
        coordinate: coords[0],
        anchor: { x: 0.5, y: 0.5 },
        content: <View style={styles.startMarker} />,
      },
    ];
    if (coords.length > 1) {
      values.push({
        id: 'track-end',
        coordinate: coords[coords.length - 1],
        anchor: { x: 0.5, y: 0.5 },
        content: <View style={[styles.endMarker, { backgroundColor: theme.danger }]} />,
      });
    }
    if (scrubPt) {
      values.push({
        id: 'track-scrub',
        coordinate: scrubPt,
        anchor: { x: 0.5, y: 0.5 },
        content: <View style={[styles.scrubMarker, { backgroundColor: accent }]} />,
      });
    }
    if (showWaypoints) {
      (waypoints || []).forEach((waypoint, index) => {
        values.push({
          id: `track-waypoint-${index}`,
          coordinate: waypoint.coord,
          anchor: { x: 0.5, y: 0.5 },
          title: waypoint.name,
          onPress: () => setSelectedWaypoint(waypoint),
          content: <View style={[styles.waypointMarker, { borderColor: accent }]} />,
        });
      });
    }
    if (selectedWaypoint) {
      values.push({
        id: 'track-selected-waypoint',
        coordinate: selectedWaypoint.coord,
        anchor: { x: 0.5, y: 1 },
        content: (
          <View style={{ alignItems: 'center', paddingBottom: 10 }}>
            <View style={[styles.callout, { backgroundColor: theme.surfaceTop, borderColor: theme.border }]}>
              <Text numberOfLines={2} style={{ fontSize: 13.5, fontWeight: '700', color: theme.text }}>{selectedWaypoint.name}</Text>
              {selectedWaypoint.km != null ? (
                <Text style={{ fontSize: 11, color: theme.text2, marginTop: 2 }}>{selectedWaypoint.km.toFixed(1)} km</Text>
              ) : null}
            </View>
          </View>
        ),
      });
    }
    return values;
  }, [accent, coords, scrubPt, selectedWaypoint, showWaypoints, theme, waypoints]);

  const polylines = useMemo<NativeMapPolyline[]>(() => coords.length >= 2 ? [
    { id: 'track-casing', coordinates: coords, color: theme.dark ? '#FFFFFF' : '#FFFFFF', width: 7 },
    { id: 'track-line', coordinates: coords, color: accent, width: 3.5 },
  ] : [], [accent, coords, theme.dark]);

  if (!coords.length) return null;
  const containerStyle = fill
    ? StyleSheet.absoluteFill
    : {
        height,
        borderRadius: rounded ? 18 : 0,
        overflow: 'hidden' as const,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.hairline,
      };

  return (
    <View style={[containerStyle, { backgroundColor: theme.fieldSurface }, fill ? { overflow: 'hidden' } : null]}>
      <NativeMap
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialCenter={coords[0]}
        initialZoom={11}
        initialFitCoordinates={coords}
        initialPadding={routePadding}
        mapStyle={mapStyle}
        showLabels={showMapLabels}
        interactive={interactive}
        markers={markers}
        polylines={polylines}
        onPress={interactive ? () => setSelectedWaypoint(null) : undefined}
        onCameraChange={onCameraOrientationChange}
      />
      {showLegend ? (
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#34C759' }]} />
            <Text style={{ fontSize: 10.5, color: theme.text2 }}>{t('journey.elevation.waypointStart')}</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: theme.danger }]} />
            <Text style={{ fontSize: 10.5, color: theme.text2 }}>{t('journey.elevation.waypointEnd')}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  startMarker: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#34C759', borderWidth: 2.5, borderColor: '#FFFFFF' },
  endMarker: { width: 14, height: 14, borderRadius: 7, borderWidth: 2.5, borderColor: '#FFFFFF' },
  scrubMarker: { width: 18, height: 18, borderRadius: 9, borderWidth: 2.5, borderColor: '#FFFFFF', opacity: 0.9 },
  waypointMarker: { width: 13, height: 13, borderRadius: 7, backgroundColor: '#FFFFFF', borderWidth: 3 },
  callout: { maxWidth: 220, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth },
  legend: { position: 'absolute', left: 12, bottom: 10, flexDirection: 'row', gap: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
});
