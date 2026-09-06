import React, { useEffect, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Icon } from '../Icon';
import { NativeMap, type NativeMapHandle, type NativeMapMarker, type NativeMapPolyline } from '../maps/NativeMap';
import { isValidMapCoordinate } from '../maps/types';
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
  followUserLocation = false,
  onUserLocationChange,
  mapStyle = 'standard',
  showMapLabels = true,
  cameraAction,
  focusBottomPadding,
  onCameraOrientationChange,
  onCameraGestureStart,
}: GlobeProps) {
  const { height } = useWindowDimensions();
  const mapRef = useRef<NativeMapHandle>(null);
  const validFocusCoords = useMemo(
    () => focusCoords?.filter(isValidMapCoordinate),
    [focusCoords],
  );
  const validFocusSegments = useMemo(
    () => focusSegments?.map((segment) => ({
      ...segment,
      coordinates: segment.coordinates.filter(isValidMapCoordinate),
    })).filter((segment) => segment.coordinates.length >= 2),
    [focusSegments],
  );
  const validFocusBoundaries = useMemo(
    () => focusBoundaries?.filter((boundary) => isValidMapCoordinate(boundary.coordinate)),
    [focusBoundaries],
  );
  const activeSegment = validFocusSegments?.find((segment) => segment.active);
  const activeBoundary = validFocusBoundaries?.find((boundary) => boundary.active);
  const hasFocusedRoutePart = (validFocusSegments?.some((segment) => !segment.active) ?? false)
    || (validFocusBoundaries?.some((boundary) => !boundary.active) ?? false);
  const cameraFocusCoords = hasFocusedRoutePart
    ? activeSegment?.coordinates ?? (activeBoundary ? [activeBoundary.coordinate] : validFocusCoords)
    : validFocusCoords;
  const routePadding: [number, number, number, number] = [90, 54, focusBottomPadding ?? Math.round(height * 0.54), 54];

  useEffect(() => {
    if (onMapCoordinatePress || !cameraFocusCoords?.length) return;
    if (cameraFocusCoords.length >= 2) mapRef.current?.fitCoordinates(cameraFocusCoords, routePadding, 250);
    else mapRef.current?.moveCamera(cameraFocusCoords[0], 11, 250);
  }, [cameraFocusCoords, focusBottomPadding, height, onMapCoordinatePress]);

  useEffect(() => {
    if (!cameraAction) return;
    if (cameraAction.type === 'resetNorth') {
      mapRef.current?.resetNorth();
      return;
    }
    if (cameraAction.type === 'locate') {
      mapRef.current?.moveCamera(cameraAction.coordinate, 14, 650);
      return;
    }
    if (!cameraFocusCoords?.length) return;
    if (cameraFocusCoords.length >= 2) mapRef.current?.fitCoordinates(cameraFocusCoords, routePadding, 650);
    else mapRef.current?.moveCamera(cameraFocusCoords[0], 11, 650);
  }, [cameraAction?.revision]);

  const polylines = useMemo<NativeMapPolyline[]>(() => {
    const values: NativeMapPolyline[] = [];
    if (validFocusCoords && validFocusCoords.length >= 2) {
      values.push({
        id: 'discover-focus-route',
        coordinates: validFocusCoords,
        color: validFocusSegments?.length ? theme.trailFaint : theme.accent,
        width: validFocusSegments?.length ? 3 : 4,
        opacity: validFocusSegments?.length ? 0.5 : 1,
      });
    }
    validFocusSegments?.forEach((segment, index) => values.push({
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
  }, [focusConnector, validFocusCoords, validFocusSegments, theme]);

  const markers = useMemo<NativeMapMarker[]>(() => {
    const values: NativeMapMarker[] = pois.filter((poi) => isValidMapCoordinate([poi.lng, poi.lat])).map((poi) => ({
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

    validFocusBoundaries?.forEach((boundary) => {
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

    if (validFocusCoords?.[0]) {
      values.push({ id: 'focus-start', coordinate: validFocusCoords[0], anchor: { x: 0.5, y: 0.5 }, content: <View style={styles.startMarker} /> });
      if (!validFocusBoundaries?.length && validFocusCoords.length > 1) {
        values.push({ id: 'focus-end', coordinate: validFocusCoords[validFocusCoords.length - 1], anchor: { x: 0.5, y: 0.5 }, content: <View style={[styles.endMarker, { backgroundColor: theme.danger }]} /> });
      }
    }
    return values;
  }, [activePoiId, onPoiPress, onRouteBoundaryPress, pois, selectionPin, theme, validFocusBoundaries, validFocusCoords]);

  const requestedCenter: [number, number] = [center?.lon ?? 100, center?.lat ?? 32];
  const initialCenter: [number, number] = isValidMapCoordinate(requestedCenter) ? requestedCenter : [100, 32];
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.fieldSurface }]}>
      <NativeMap
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialCenter={initialCenter}
        initialZoom={3}
        initialFitCoordinates={validFocusCoords?.length ? validFocusCoords : undefined}
        initialPadding={routePadding}
        mapStyle={mapStyle}
        showLabels={showMapLabels}
        showUserLocation={!!pin}
        followUserLocation={followUserLocation}
        markers={markers}
        polylines={polylines}
        onPress={(coordinate) => {
          if (onMapCoordinatePress) onMapCoordinatePress(coordinate);
          else onBackgroundPress?.();
        }}
        onUserLocationChange={onUserLocationChange}
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
});
