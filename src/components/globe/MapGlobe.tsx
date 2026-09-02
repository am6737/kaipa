import React, { useEffect, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Icon } from '../Icon';
import { NativeMap, type NativeMapHandle, type NativeMapMarker, type NativeMapPolyline } from '../maps/NativeMap';
import { PhotoPin, PHOTO_PIN_ANCHOR_Y } from './PhotoPin';
import type { GlobeProps } from './types';

export default function MapGlobe({
  theme,
  pois,
  activePoiId,
  onPoiPress,
  onBackgroundPress,
  onMapCoordinatePress,
  center,
  focusCoords,
  focusSegments,
  focusBoundaries,
  selectionPin,
  focusConnector,
  onRouteBoundaryPress,
  pin,
  mapStyle = 'standard',
  showMapLabels = true,
  cameraAction,
  focusBottomPadding,
  onCameraOrientationChange,
  onCameraGestureStart,
}: GlobeProps) {
  const { height } = useWindowDimensions();
  const mapRef = useRef<NativeMapHandle>(null);
  const activeSegment = focusSegments?.find((segment) => segment.active);
  const activeBoundary = focusBoundaries?.find((boundary) => boundary.active);
  const hasFocusedRoutePart = (focusSegments?.some((segment) => !segment.active) ?? false)
    || (focusBoundaries?.some((boundary) => !boundary.active) ?? false);
  const cameraFocusCoords = hasFocusedRoutePart
    ? activeSegment?.coordinates ?? (activeBoundary ? [activeBoundary.coordinate] : focusCoords)
    : focusCoords;
  const focusKey = cameraFocusCoords?.map(([lng, lat]) => `${lng.toFixed(5)},${lat.toFixed(5)}`).join('|') || '';
  const routePadding: [number, number, number, number] = [90, 54, focusBottomPadding ?? Math.round(height * 0.54), 54];

  useEffect(() => {
    if (onMapCoordinatePress || !cameraFocusCoords?.length) return;
    if (cameraFocusCoords.length >= 2) mapRef.current?.fitCoordinates(cameraFocusCoords, routePadding, 900);
    else mapRef.current?.moveCamera(cameraFocusCoords[0], 11, 900);
  }, [focusKey, onMapCoordinatePress]);

  useEffect(() => {
    if (!cameraAction) return;
    if (cameraAction.type === 'resetNorth') {
      mapRef.current?.resetNorth();
      return;
    }
    if (!cameraFocusCoords?.length) return;
    if (cameraFocusCoords.length >= 2) mapRef.current?.fitCoordinates(cameraFocusCoords, routePadding, 650);
    else mapRef.current?.moveCamera(cameraFocusCoords[0], 11, 650);
  }, [cameraAction?.revision]);

  const polylines = useMemo<NativeMapPolyline[]>(() => {
    const values: NativeMapPolyline[] = [];
    if (focusCoords && focusCoords.length >= 2) {
      values.push({
        id: 'discover-focus-route',
        coordinates: focusCoords,
        color: focusSegments?.length ? theme.trailFaint : theme.accent,
        width: focusSegments?.length ? 3 : 4,
        opacity: focusSegments?.length ? 0.5 : 1,
      });
    }
    focusSegments?.forEach((segment, index) => values.push({
      id: `discover-segment-${index}`,
      coordinates: segment.coordinates,
      color: segment.color,
      width: 4,
      opacity: segment.active ? 1 : 0.26,
    }));
    if (focusConnector) {
      values.push({
        id: 'journey-endpoint-connector',
        coordinates: focusConnector.coordinates,
        color: focusConnector.color,
        width: 2.2,
        opacity: 0.72,
        dashed: true,
      });
    }
    return values;
  }, [focusConnector, focusCoords, focusSegments, theme]);

  const markers = useMemo<NativeMapMarker[]>(() => {
    const values: NativeMapMarker[] = pois.map((poi) => ({
      id: `poi-${poi.id}`,
      coordinate: [poi.lng, poi.lat],
      anchor: { x: 0.5, y: PHOTO_PIN_ANCHOR_Y },
      title: poi.label,
      onPress: () => onPoiPress?.(poi.id),
      content: (
        <Pressable accessibilityRole="button" accessibilityLabel={poi.label} hitSlop={6}>
          <PhotoPin theme={theme} poi={poi} active={activePoiId === poi.id} />
        </Pressable>
      ),
    }));

    focusBoundaries?.forEach((boundary) => {
      const foreground = boundary.pending ? theme.text : '#FFFFFF';
      values.push({
        id: `boundary-${boundary.id}`,
        coordinate: boundary.coordinate,
        anchor: { x: 0.5, y: 1 },
        opacity: boundary.active ? 1 : 0.46,
        onPress: () => onRouteBoundaryPress?.(boundary.groupKey),
        content: (
          <View style={{ alignItems: 'center' }}>
            <View style={[
              styles.boundaryLabel,
              {
                backgroundColor: boundary.pending ? theme.surfaceTop : boundary.color,
                borderWidth: boundary.pending ? StyleSheet.hairlineWidth : 0,
                borderColor: theme.hairline,
              },
            ]}>
              {boundary.pending ? <View style={[styles.pendingDot, { borderColor: boundary.color }]} /> : null}
              <Text numberOfLines={1} style={[styles.boundaryText, { color: foreground }]}>{boundary.title}</Text>
              <Text numberOfLines={1} style={[styles.boundaryDistance, { color: foreground }]}>{boundary.distance}</Text>
              <Text style={[styles.boundaryChevron, { color: foreground }]}>›</Text>
            </View>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: boundary.color, borderWidth: 1.8, borderColor: '#FFFFFF' }} />
          </View>
        ),
      });
    });

    if (selectionPin) {
      values.push({
        id: 'selection-pin',
        coordinate: selectionPin.coordinate,
        anchor: { x: 0.5, y: 1 },
        content: (
          <View style={{ alignItems: 'center' }}>
            <View style={[styles.selectionPin, { backgroundColor: theme.surfaceTop, borderColor: theme.hairline }]}>
              <Icon name="pin" color={theme.text2} size={18} strokeWidth={2.1} />
            </View>
            <View style={{ width: 8, height: 8, marginTop: -2, borderRadius: 4, backgroundColor: selectionPin.color, borderWidth: 1.8, borderColor: '#FFFFFF' }} />
          </View>
        ),
      });
    }

    if (focusCoords?.[0]) {
      values.push({ id: 'focus-start', coordinate: focusCoords[0], anchor: { x: 0.5, y: 0.5 }, content: <View style={styles.startMarker} /> });
      if (!focusBoundaries?.length && focusCoords.length > 1) {
        values.push({ id: 'focus-end', coordinate: focusCoords[focusCoords.length - 1], anchor: { x: 0.5, y: 0.5 }, content: <View style={[styles.endMarker, { backgroundColor: theme.danger }]} /> });
      }
    }
    if (pin) {
      values.push({
        id: 'current-location',
        coordinate: [pin.lng, pin.lat],
        anchor: { x: 0.5, y: 0.5 },
        content: <View style={[styles.currentLocation, { backgroundColor: theme.dotCore, borderColor: theme.dotRing }]} />,
      });
    }
    return values;
  }, [activePoiId, focusBoundaries, focusCoords, onPoiPress, onRouteBoundaryPress, pin, pois, selectionPin, theme]);

  const initialCenter: [number, number] = [center?.lon ?? 100, center?.lat ?? 32];
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.fieldSurface }]}>
      <NativeMap
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialCenter={initialCenter}
        initialZoom={3}
        initialFitCoordinates={focusCoords || undefined}
        initialPadding={routePadding}
        mapStyle={mapStyle === 'light' ? 'standard' : mapStyle}
        showLabels={showMapLabels}
        markers={markers}
        polylines={polylines}
        onPress={(coordinate) => {
          if (onMapCoordinatePress) onMapCoordinatePress(coordinate);
          else onBackgroundPress?.();
        }}
        onCameraChange={onCameraOrientationChange}
        onGestureStart={onCameraGestureStart}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  boundaryLabel: { height: 24, maxWidth: 128, paddingLeft: 6, paddingRight: 3, borderRadius: 7, flexDirection: 'row', alignItems: 'center' },
  pendingDot: { width: 4, height: 4, borderRadius: 2, marginRight: 3, borderWidth: 1.5 },
  boundaryText: { flexShrink: 1, fontSize: 10.5, fontWeight: '700' },
  boundaryDistance: { marginLeft: 2.5, fontSize: 10.5, fontWeight: '700', fontVariant: ['tabular-nums'] },
  boundaryChevron: { marginLeft: 2.5, fontSize: 12.5, fontWeight: '500', lineHeight: 15 },
  selectionPin: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  startMarker: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#34C759', borderWidth: 2.5, borderColor: '#FFFFFF' },
  endMarker: { width: 14, height: 14, borderRadius: 7, borderWidth: 2.5, borderColor: '#FFFFFF' },
  currentLocation: { width: 16, height: 16, borderRadius: 8, borderWidth: 3 },
});
