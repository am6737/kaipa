import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useI18n } from '../../i18n';
import { Theme } from '../../theme/theme';
import { MONO } from '../../theme/fonts';
import { clusterWaypoints as groupWaypoints } from '../maps/waypointClusters';
import { trackWorldSpan } from '../maps/extent';
import {
  NativeMap,
  type NativeMapHandle,
  type NativeMapMarker,
  type NativeMapPolyline,
  type NativeMapCamera,
  type NativeMapPoi,
} from '../maps/NativeMap';

export type MapStyleId = 'standard' | 'terrain' | 'satellite';
export type TrackMapWaypoint = { name: string; coord: [number, number]; km?: number };

export interface TrackMapHandle {
  fitRoute: () => void;
  resetNorth: () => void;
  focusPoint: (coordinate: [number, number]) => void;
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
  numberWaypoints?: boolean;
  clusterWaypoints?: boolean;
  showWaypointCallout?: boolean;
  /** a tap on the map itself, in WGS-84 — preserves the requested location */
  onMapPress?: (coordinate: [number, number]) => void;
  onPoiPress?: (poi: NativeMapPoi) => void;
  /** Lets a parent own selection; showWaypointCallout controls the built-in label. */
  onWaypointPress?: (waypoint: TrackMapWaypoint) => void;
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
  numberWaypoints = false,
  clusterWaypoints = false,
  showWaypointCallout = true,
  onMapPress,
  onPoiPress,
  onWaypointPress,
  mapStyle = 'standard',
  showMapLabels = true,
  onCameraOrientationChange,
  routePadding = [28, 28, 28, 28],
}, ref) {
  const { t } = useI18n();
  const window = useWindowDimensions();
  const span = useMemo(() => trackWorldSpan(coords), [coords]);
  const initialClusterZoom = useMemo(() => {
    if (!span) return 11;
    const availableWidth = Math.max(1, window.width - routePadding[1] - routePadding[3]);
    const availableHeight = Math.max(1, (height ?? window.height) - routePadding[0] - routePadding[2]);
    return Math.min(20, Math.log2(Math.min(availableWidth / Math.max(span.width, 1e-12), availableHeight / Math.max(span.height, 1e-12)) / 256));
  }, [height, routePadding, span, window.height, window.width]);
  const [clusterZoom, setClusterZoom] = useState(initialClusterZoom);
  const updateZoom = (zoom: number) => {
    cameraRef.current.zoom = zoom;
    if (clusterWaypoints) {
      // Rebuild annotation groups at half-zoom steps, not on every pinch frame.
      const bucket = Math.floor(zoom * 2) / 2;
      setClusterZoom((current) => current === bucket ? current : bucket);
    }
  };
  const mapRef = useRef<NativeMapHandle>(null);
  const cameraRef = useRef<NativeMapCamera>({ center: coords[0] ?? [0, 0], zoom: 11 });
  const [selectedWaypoint, setSelectedWaypoint] = useState<TrackMapWaypoint | null>(null);
  // A marker tap also arrives as a map-background tap a beat later, which used to
  // dismiss whatever the marker just chose.
  const markerPressAt = useRef(0);

  useEffect(() => setSelectedWaypoint(null), [coords, showWaypoints]);
  useImperativeHandle(ref, () => ({
    fitRoute: () => mapRef.current?.fitCoordinates(coords, routePadding, 600),
    resetNorth: () => mapRef.current?.resetNorth(),
    focusPoint: (coordinate) => mapRef.current?.moveCamera(coordinate, Math.max(cameraRef.current.zoom, 13), 360, { edgePadding: routePadding }),

  }), [coords, routePadding]);

  const waypointGroups = useMemo(() => clusterWaypoints
    ? groupWaypoints((waypoints ?? []).map((waypoint) => waypoint.coord), clusterZoom)
    : (waypoints ?? []).map((waypoint, index) => ({ indices: [index], coordinate: waypoint.coord })),
  [clusterWaypoints, clusterZoom, waypoints]);

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
        zIndex: 10,
        anchor: { x: 0.5, y: 0.5 },
        onPress: () => { markerPressAt.current = Date.now(); },
        content: <View style={[styles.scrubMarker, numberWaypoints ? styles.pickedMarker : null, { backgroundColor: accent }]} />,
      });
    }
    if (showWaypoints) {
      waypointGroups.forEach((group) => {
        const index = group.indices[0];
        const waypoint = waypoints![index];
        if (group.indices.length > 1) {
          values.push({
            id: `track-cluster-${group.indices[0]}`,
            coordinate: group.coordinate,
            anchor: { x: 0.5, y: 1 },
            centerOffset: { x: 0, y: -18 },
            zIndex: 2,
            onPress: () => {
              markerPressAt.current = Date.now();
              // A group expands the map; it never silently picks one member.
              mapRef.current?.moveCamera(group.coordinate, Math.min(19, cameraRef.current.zoom + 2), 360, { edgePadding: routePadding });
            },
            content: (
              <View style={styles.clusterAnchor}>
                <View style={[styles.clusterBadge, { backgroundColor: theme.surfaceTop, borderColor: theme.hairline }]}>
                  <Text style={{ fontFamily: MONO, fontSize: 12, fontWeight: '700', color: theme.text }}>{group.indices.length}</Text>
                </View>
                <View style={[styles.clusterStem, { backgroundColor: theme.text3 }]} />
              </View>
            ),
          });
          return;
        }
        values.push({
          id: `track-waypoint-${index}`,
          coordinate: waypoint.coord,
          anchor: { x: 0.5, y: 0.5 },
          title: waypoint.name,
          onPress: () => {
            markerPressAt.current = Date.now();
            if (showWaypointCallout) setSelectedWaypoint(waypoint);
            onWaypointPress?.(waypoint);
          },
          content: numberWaypoints ? (
            <View style={[styles.numberedWaypoint, { borderColor: theme.hairline }]}>
              <Text style={{ fontFamily: MONO, fontSize: 11, fontWeight: '700', color: theme.text2 }}>{index + 1}</Text>
            </View>
          ) : <View style={[styles.waypointMarker, { borderColor: accent }]} />,
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
  }, [accent, coords, numberWaypoints, onWaypointPress, scrubPt, selectedWaypoint, showWaypointCallout, showWaypoints, theme, waypoints, waypointGroups, routePadding]);

  const polylines = useMemo<NativeMapPolyline[]>(() => coords.length >= 2 ? [
    { id: 'track-line', coordinates: coords, color: accent, width: 3.5 },
  ] : [], [accent, coords]);

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
        initialFitCoordinates={coords.length > 1 ? coords : undefined}
        initialPadding={routePadding}
        mapStyle={mapStyle}
        showLabels={showMapLabels}
        interactive={interactive}
        markers={markers}
        polylines={polylines}
        onPress={interactive ? (coordinate) => {
          if (Date.now() - markerPressAt.current < 400) return;
          setSelectedWaypoint(null);
          onMapPress?.(coordinate);
        } : undefined}
        onPoiPress={interactive ? (poi) => {
          markerPressAt.current = Date.now();
          setSelectedWaypoint(null);
          if (onPoiPress) onPoiPress(poi);
          else onMapPress?.(poi.coordinate);
        } : undefined}
        onCameraChange={onCameraOrientationChange}
        onCameraPositionChange={(camera) => { cameraRef.current = camera; updateZoom(camera.zoom); }}
        onZoomChange={updateZoom}
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
  clusterAnchor: { alignItems: 'center' },
  clusterBadge: { minWidth: 30, height: 30, paddingHorizontal: 7, borderRadius: 15, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  clusterStem: { width: 1, height: 6 },
  startMarker: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#34C759', borderWidth: 2.5, borderColor: '#FFFFFF' },
  endMarker: { width: 14, height: 14, borderRadius: 7, borderWidth: 2.5, borderColor: '#FFFFFF' },
  scrubMarker: { width: 18, height: 18, borderRadius: 9, borderWidth: 2.5, borderColor: '#FFFFFF', opacity: 0.9 },
  pickedMarker: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, opacity: 1 },
  numberedWaypoint: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#FFFFFF', borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  waypointMarker: { width: 13, height: 13, borderRadius: 7, backgroundColor: '#FFFFFF', borderWidth: 3 },
  callout: { maxWidth: 220, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth },
  legend: { position: 'absolute', left: 12, bottom: 10, flexDirection: 'row', gap: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
});
