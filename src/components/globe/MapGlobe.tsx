import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Icon } from '../Icon';
import { NativeMap, type NativeMapHandle, type NativeMapMarker, type NativeMapPolyline } from '../maps/NativeMap';
import { isValidMapCoordinate } from '../maps/types';
import { PhotoPin, PHOTO_PIN_ANCHOR_Y, photoPinScaleForZoom } from './PhotoPin';
import { CurrentLocationMarker } from './CurrentLocationMarker';
import { STAGGER_MAX_DELAY_MS, STAGGER_STEP_MS } from '../StaggerIn';
import type { GlobeProps } from './types';
import { measureTrack, positionAtDistance } from '../../lib/routeSegments';

// A long route at high zoom would otherwise build one distance marker per
// km (hundreds of custom marker bitmaps), and rebuilding them all when the
// zoom crosses a step bucket causes a visible stutter — worst on Android
// where each marker content is re-snapshotted into a bitmap.
const MAX_DISTANCE_MARKERS = 60;
function cappedStepKm(stepKm: number, totalMeters: number): number {
  const slots = Math.floor((totalMeters - 120) / 1000 / stepKm);
  if (slots <= MAX_DISTANCE_MARKERS) return stepKm;
  // Round the minimum step up to a "nice" km value so labels stay readable.
  const minStep = Math.ceil((totalMeters - 120) / 1000 / MAX_DISTANCE_MARKERS);
  const niceSteps = [1, 2, 5, 10, 20, 25, 50, 100, 200];
  return niceSteps.find((step) => step >= minStep) ?? Math.ceil(minStep / 50) * 50;
}

export default function MapGlobe({
  theme,
  pois,
  showPoiMarkers = true,
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
  focusConnectors,
  transportSegments,
  onRouteBoundaryPress,
  pin,
  followUserLocation = false,
  onUserLocationChange,
  mapStyle = 'standard',
  showMapLabels = true,
  showDistanceMarkers = false,
  cameraAction,
  focusBottomPadding,
  autoFrameRoute = true,
  staggerPins = false,
  onCameraOrientationChange,
  onCameraGestureStart,
  onCameraPositionChange,
}: GlobeProps) {
  const { height } = useWindowDimensions();
  const mapRef = useRef<NativeMapHandle>(null);
  // The pin scale is an Animated.Value rather than state: a state change would
  // rebuild (and thus re-register) every marker on the native map mid-zoom,
  // which makes all pins flicker while pinching. setValue updates the
  // transform natively without a React render or a marker remount.
  const pinScale = useRef(new Animated.Value(photoPinScaleForZoom(3))).current;
  const [distanceStepKm, setDistanceStepKm] = React.useState(10);
  const lastZoomBucket = useRef<number | null>(null);
  const lastDistanceStep = useRef<number | null>(null);
  const distanceStepTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (distanceStepTimer.current) clearTimeout(distanceStepTimer.current);
  }, []);
  const handleZoomChange = useCallback((zoom: number) => {
    if (!Number.isFinite(zoom)) return;
    const quantizedZoom = Math.round(zoom * 4) / 4;
    // Quantize to quarter-zoom steps so the scale only steps a few times
    // across the whole zoom range.
    if (lastZoomBucket.current !== quantizedZoom) {
      lastZoomBucket.current = quantizedZoom;
      pinScale.setValue(photoPinScaleForZoom(quantizedZoom));
    }
    const distanceStep = zoom < 8 ? 50 : zoom < 11 ? 10 : zoom < 13 ? 5 : 1;
    if (lastDistanceStep.current !== distanceStep) {
      lastDistanceStep.current = distanceStep;
      if (Platform.OS === 'android') {
        // Rebuilding AMap marker bitmaps while animateCamera is running causes
        // visible hitching. Wait until the camera has been quiet before
        // changing the distance-marker density.
        if (distanceStepTimer.current) clearTimeout(distanceStepTimer.current);
        distanceStepTimer.current = setTimeout(() => {
          distanceStepTimer.current = null;
          setDistanceStepKm(distanceStep);
        }, 180);
      } else {
        setDistanceStepKm(distanceStep);
      }
    }
  }, [pinScale]);
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
  const validTransportSegments = useMemo(
    () => transportSegments?.map((segment) => ({ ...segment, coordinates: segment.coordinates.filter(isValidMapCoordinate) })).filter((segment) => segment.coordinates.length >= 2),
    [transportSegments],
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
    if (!autoFrameRoute || onMapCoordinatePress || !cameraFocusCoords?.length) return;
    // AMap's camera transition needs a little more time than MapKit to avoid
    // appearing to jump when a route detail sheet replaces the list. Keep the
    // shorter transition on iOS, where the native renderer is already smooth.
    const duration = Platform.OS === 'android' ? 760 : 250;
    if (cameraFocusCoords.length >= 2) mapRef.current?.fitCoordinates(cameraFocusCoords, routePadding, duration);
    else mapRef.current?.moveCamera(cameraFocusCoords[0], 11, duration);
    // Keep the user's camera when the overlaid sheet changes snap height. The
    // bottom padding only affects an explicit route fit; treating it as an
    // effect trigger would refit the map whenever the journey card is pulled.
  }, [autoFrameRoute, cameraFocusCoords, onMapCoordinatePress]);

  useEffect(() => {
    if (!cameraAction) return;
    if (cameraAction.type === 'resetNorth') {
      mapRef.current?.resetNorth();
      return;
    }
    if (cameraAction.type === 'locate') {
      mapRef.current?.moveCamera(cameraAction.coordinate, 14, 650, { resetOrientation: true });
      return;
    }
    if (cameraAction.type === 'restore') {
      mapRef.current?.moveCamera(
        cameraAction.coordinate,
        cameraAction.zoom,
        Platform.OS === 'android' ? 680 : 260,
      );
      return;
    }
    if (!cameraFocusCoords?.length) return;
    if (cameraFocusCoords.length >= 2) mapRef.current?.fitCoordinates(cameraFocusCoords, routePadding, 650);
    else mapRef.current?.moveCamera(cameraFocusCoords[0], 11, 650);
  }, [cameraAction?.revision]);

  const polylines = useMemo<NativeMapPolyline[]>(() => {
    const values: NativeMapPolyline[] = [];
    if (validFocusCoords && validFocusCoords.length >= 2 && !validFocusSegments?.length) {
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
    return values;
  }, [validFocusCoords, validFocusSegments, theme]);

  const distanceMarkers = useMemo<NativeMapMarker[]>(() => {
    if (!showDistanceMarkers || !validFocusCoords || validFocusCoords.length < 2) return [];
    const values: NativeMapMarker[] = [];
    const tracks = validFocusSegments && validFocusSegments.length > 1
      ? validFocusSegments
      : [{ id: 'route', coordinates: validFocusCoords }];
    tracks.forEach((track) => {
      const measure = measureTrack(track.coordinates);
      if (!measure || measure.totalMeters < 1000) return;
      const totalKm = measure.totalMeters / 1000;
      const preferredStepKm = distanceStepKm >= 50 ? (totalKm >= 250 ? 50 : totalKm >= 100 ? 25 : 10) : distanceStepKm;
      let stepKm = measure.totalMeters < preferredStepKm * 1000 ? (totalKm <= 10 ? 1 : totalKm <= 50 ? 5 : 10) : preferredStepKm;
      stepKm = cappedStepKm(stepKm, measure.totalMeters);
      for (let km = stepKm; km * 1000 < measure.totalMeters - 120; km += stepKm) {
        const position = positionAtDistance(measure, km * 1000);
        values.push({ id: `route-distance-${track.id}-${km}`, coordinate: position.coordinate, anchor: { x: 0.5, y: 1 }, content: (
          <View style={styles.distanceMarkerWrap}>
            <View style={[styles.distanceMarker, { backgroundColor: theme.dark ? 'rgba(30,32,34,0.9)' : 'rgba(255,255,255,0.94)' }]}><Text style={[styles.distanceText, { color: theme.text }]}>{km} km</Text></View>
            <View style={[styles.distanceDot, { backgroundColor: theme.accent }]} />
          </View>
        ) });
      }
      const finalDistanceKm = Math.round(totalKm * 10) / 10;
      const finalPosition = positionAtDistance(measure, measure.totalMeters);
      values.push({ id: `route-distance-${track.id}-end`, coordinate: finalPosition.coordinate, anchor: Platform.OS === 'android' ? { x: 0.5, y: 1 } : { x: 0, y: 0.5 }, content: Platform.OS === 'android' ? (
        <View style={styles.distanceMarkerWrap}><View style={[styles.distanceMarker, { backgroundColor: theme.dark ? 'rgba(30,32,34,0.9)' : 'rgba(255,255,255,0.94)' }]}><Text style={[styles.distanceText, { color: theme.text }]}>{finalDistanceKm} km</Text></View><View style={[styles.distanceDot, { backgroundColor: theme.accent }]} /></View>
      ) : (
        <View style={styles.distanceMarkerSideWrap}><View style={styles.distanceMarkerEndpointSpacer} /><View style={[styles.distanceMarker, { backgroundColor: theme.dark ? 'rgba(30,32,34,0.9)' : 'rgba(255,255,255,0.94)' }]}><Text style={[styles.distanceText, { color: theme.text }]}>{finalDistanceKm} km</Text></View></View>
      ) });
    });
    return values;
  }, [distanceStepKm, showDistanceMarkers, theme, validFocusCoords, validFocusSegments]);

  const markers = useMemo<NativeMapMarker[]>(() => {
    const values: NativeMapMarker[] = pois.filter((poi) => isValidMapCoordinate([poi.lng, poi.lat])).map((poi, index) => {
      const delay = staggerPins
        ? Math.min(index, Math.floor(STAGGER_MAX_DELAY_MS / STAGGER_STEP_MS)) * STAGGER_STEP_MS
        : undefined;
      return {
        id: `poi-${poi.id}`,
        coordinate: [poi.lng, poi.lat],
        anchor: { x: 0.5, y: PHOTO_PIN_ANCHOR_Y },
        title: poi.label,
        onPress: showPoiMarkers ? () => onPoiPress?.(poi.id) : undefined,
        content: (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={poi.label}
            accessible={showPoiMarkers}
            hitSlop={6}
            pointerEvents={showPoiMarkers ? 'auto' : 'none'}
            style={{ opacity: showPoiMarkers ? 1 : 0 }}
          >
            <PhotoPin
                theme={theme}
                poi={poi}
                active={activePoiId === poi.id}
                mapScale={Platform.OS === 'android' ? 1 : pinScale}
                staticRender={Platform.OS === 'android'}
                entranceDelayMs={Platform.OS === 'android' ? undefined : delay}
              />
          </Pressable>
        ),
      };
    });
    values.push(...distanceMarkers);

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

    // AMap's built-in location indicator does not match the iOS/ fallback
    // presentation. Render the shared marker on Android instead. Include the
    // heading in the id because Android caches marker content by cacheKey.
    if (Platform.OS === 'android' && pin && isValidMapCoordinate([pin.lng, pin.lat])) {
      const headingKey = Number.isFinite(pin.heading) ? Math.round(pin.heading as number) : 'none';
      values.push({
        id: `current-location-${headingKey}`,
        coordinate: [pin.lng, pin.lat],
        anchor: { x: 0.5, y: 0.5 },
        content: <CurrentLocationMarker theme={theme} heading={pin.heading} />,
      });
    }

    if (validFocusSegments && validFocusSegments.length > 1) {
      validFocusSegments.forEach((segment, index) => {
        const start = segment.coordinates[0];
        const end = segment.coordinates[segment.coordinates.length - 1];
        if (!start || !end) return;
        values.push({ id: `focus-start-${segment.id}-${index}`, coordinate: start, anchor: { x: 0.5, y: 0.5 }, content: <View style={styles.startMarker} /> });
        values.push({ id: `focus-end-${segment.id}-${index}`, coordinate: end, anchor: { x: 0.5, y: 0.5 }, content: <View style={[styles.endMarker, { backgroundColor: theme.danger }]} /> });
      });
    } else if (validFocusCoords?.[0]) {
      values.push({ id: 'focus-start', coordinate: validFocusCoords[0], anchor: { x: 0.5, y: 0.5 }, content: <View style={styles.startMarker} /> });
      if (!validFocusBoundaries?.length && validFocusCoords.length > 1) values.push({ id: 'focus-end', coordinate: validFocusCoords[validFocusCoords.length - 1], anchor: { x: 0.5, y: 0.5 }, content: <View style={[styles.endMarker, { backgroundColor: theme.danger }]} /> });
    }
    return values;
    // staggerPins is deliberately not a dependency: it only picks the
    // mount-time entrance, and rebuilding markers when it flips would
    // interrupt the cascade (on Android every still-hidden pin would be
    // revealed at once by the wrapper swap). Later rebuilds — chip
    // switches, edits — run with the latest render's value, so pins mount
    // instantly once the entrance has played.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePoiId, distanceMarkers, onPoiPress, onRouteBoundaryPress, pin, pois, selectionPin, showPoiMarkers, theme, validFocusBoundaries, validFocusCoords, validFocusSegments]);

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
        onCameraPositionChange={onCameraPositionChange}
        onZoomChange={handleZoomChange}
        onGestureStart={onCameraGestureStart}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Let Android measure the marker from its content. A fixed width here is in
  // RN dp but the native marker snapshot is density-scaled, making the pill
  // unexpectedly wide on high-density devices.
  boundaryLabel: { height: 24, paddingLeft: 6, paddingRight: 3, borderRadius: 7, flexDirection: 'row', alignItems: 'center' },
  pendingDot: { width: 4, height: 4, borderRadius: 2, marginRight: 3, borderWidth: 1.5 },
  boundaryText: { flexShrink: 0, fontSize: 10.5, fontWeight: '700' },
  boundaryDistance: { marginLeft: 2.5, fontSize: 10.5, fontWeight: '700', fontVariant: ['tabular-nums'] },
  distanceMarkerWrap: { alignItems: 'center', justifyContent: 'center' },
  distanceMarkerSideWrap: { flexDirection: 'row', alignItems: 'center' },
  distanceMarkerEndpointSpacer: { width: 36 },
  distanceMarker: { minWidth: 38, paddingHorizontal: 6, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', shadowColor: '#000000', shadowOpacity: 0.16, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  distanceText: { fontSize: 9.5, lineHeight: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  distanceDot: { width: 5, height: 5, marginTop: -1, borderRadius: 3, borderWidth: 1.5, borderColor: '#FFFFFF' },
  boundaryChevron: { marginLeft: 2.5, fontSize: 12.5, fontWeight: '500', lineHeight: 15 },
  selectionPin: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  connectorMarker: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, shadowColor: '#000000', shadowOpacity: 0.14, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  startMarker: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#34C759', borderWidth: 2.5, borderColor: '#FFFFFF' },
  endMarker: { width: 14, height: 14, borderRadius: 7, borderWidth: 2.5, borderColor: '#FFFFFF' },
});
