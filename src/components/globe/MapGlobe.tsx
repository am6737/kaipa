import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { NativeMap, type NativeMapHandle, type NativeMapMarker, type NativeMapPolyline } from '../maps/NativeMap';
import { isValidMapCoordinate, keepValidCoordinates } from '../maps/types';
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
  center,
  focusCoords,
  focusSegments,
  journeyLegs,
  journeyStops,
  onJourneyStopPress,
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
  // Press handlers are read through refs so the marker memo does not depend on
  // them: callers commonly pass inline arrows, and depending on their identity
  // would rebuild (and on Android re-snapshot) every annotation on every parent
  // render — which is most of them while a detail sheet is opening.
  const onPoiPressRef = useRef(onPoiPress);
  const onJourneyStopPressRef = useRef(onJourneyStopPress);
  useEffect(() => {
    onPoiPressRef.current = onPoiPress;
    onJourneyStopPressRef.current = onJourneyStopPress;
  });
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
      // Changing the distance-marker density rebuilds every label, so wait
      // until the camera has been quiet. On Android that re-snapshots each
      // marker bitmap mid-animation; on iOS it swaps the annotation views
      // while the opening fit is still running.
      if (distanceStepTimer.current) clearTimeout(distanceStepTimer.current);
      distanceStepTimer.current = setTimeout(() => {
        distanceStepTimer.current = null;
        setDistanceStepKm(distanceStep);
      }, 180);
    }
  }, [pinScale]);
  const validFocusCoords = useMemo(
    () => keepValidCoordinates(focusCoords),
    [focusCoords],
  );
  const validFocusSegments = useMemo(
    () => focusSegments?.map((segment) => ({
      ...segment,
      coordinates: keepValidCoordinates(segment.coordinates),
    })).filter((segment) => segment.coordinates.length >= 2),
    [focusSegments],
  );
  const validJourneyLegs = useMemo(
    () => journeyLegs?.map((segment) => ({ ...segment, coordinates: keepValidCoordinates(segment.coordinates) })).filter((segment) => segment.coordinates.length >= 2),
    [journeyLegs],
  );
  const validJourneyStops = useMemo(
    () => journeyStops?.filter((stop) => isValidMapCoordinate(stop.coordinate)),
    [journeyStops],
  );
  const activeSegment = validFocusSegments?.find((segment) => segment.active);
  const hasFocusedRoutePart = validFocusSegments?.some((segment) => !segment.active) ?? false;
  const routeFocusCoords = hasFocusedRoutePart
    ? activeSegment?.coordinates ?? validFocusCoords
    : validFocusCoords;
  // A planned journey has no recorded track to frame, but its stops are the
  // route — without this the camera sits on the journey avatar pin instead.
  // Memoised because the framing effect keys on the array identity.
  const stopFocusCoords = useMemo(
    () => (validJourneyStops && validJourneyStops.length >= 2
      ? validJourneyStops.map((stop) => stop.coordinate)
      : null),
    [validJourneyStops],
  );
  const cameraFocusCoords = (routeFocusCoords?.length ?? 0) >= 2
    ? routeFocusCoords
    : stopFocusCoords ?? routeFocusCoords;
  const routePadding: [number, number, number, number] = [90, 54, focusBottomPadding ?? Math.round(height * 0.54), 54];

  useEffect(() => {
    if (!autoFrameRoute || !cameraFocusCoords?.length) return;
    // AMap's camera transition needs a little more time than MapKit to avoid
    // appearing to jump when a route detail sheet replaces the list. Keep the
    // shorter transition on iOS, where the native renderer is already smooth.
    const duration = Platform.OS === 'android' ? 760 : 250;
    if (cameraFocusCoords.length >= 2) mapRef.current?.fitCoordinates(cameraFocusCoords, routePadding, duration);
    else mapRef.current?.moveCamera(cameraFocusCoords[0], 11, duration);
    // Keep the user's camera when the overlaid sheet changes snap height. The
    // bottom padding only affects an explicit route fit; treating it as an
    // effect trigger would refit the map whenever the journey card is pulled.
  }, [autoFrameRoute, cameraFocusCoords]);

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
    // One width step under the recorded track and one visual identity of its
    // own (numbered pins at each end), so the plan reads as the layer over the
    // track rather than a second, disagreeing route.
    validJourneyLegs?.forEach((leg) => values.push({
      id: `journey-leg-${leg.id}`,
      coordinates: leg.coordinates,
      color: leg.color,
      width: 3,
      opacity: leg.active ? 0.95 : 0.22,
      dashed: leg.dashed,
    }));
    return values;
  }, [validFocusCoords, validFocusSegments, validJourneyLegs, theme]);

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
    // Journey detail keeps place pins off: they were built and then hidden at
    // opacity 0, which still registers a native annotation per place.
    const values: NativeMapMarker[] = showPoiMarkers
      ? pois.filter((poi) => isValidMapCoordinate([poi.lng, poi.lat])).map((poi, index) => {
        const delay = staggerPins
          ? Math.min(index, Math.floor(STAGGER_MAX_DELAY_MS / STAGGER_STEP_MS)) * STAGGER_STEP_MS
          : undefined;
        return {
          id: `poi-${poi.id}`,
          coordinate: [poi.lng, poi.lat],
          anchor: { x: 0.5, y: PHOTO_PIN_ANCHOR_Y },
          title: poi.label,
          onPress: () => onPoiPressRef.current?.(poi.id),
          content: (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={poi.label}
              accessible
              hitSlop={6}
              style={{ opacity: 1 }}
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
      })
      : [];
    values.push(...distanceMarkers);

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

    validJourneyStops?.forEach((stop) => {
      values.push({
        id: `journey-stop-${stop.id}`,
        coordinate: stop.coordinate,
        anchor: { x: 0.5, y: 0.5 },
        opacity: stop.active ? 1 : 0.34,
        onPress: () => onJourneyStopPressRef.current?.(stop.id),
        content: (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${stop.order} ${stop.name}`}
            accessible
            hitSlop={6}
          >
            <View style={[styles.journeyStop, { backgroundColor: theme.accent }]}>
              <Text style={styles.journeyStopText}>{stop.order}</Text>
            </View>
          </Pressable>
        ),
      });
    });

    if (validFocusSegments && validFocusSegments.length > 1) {
      validFocusSegments.forEach((segment, index) => {
        const start = segment.coordinates[0];
        const end = segment.coordinates[segment.coordinates.length - 1];
        if (!start || !end) return;
        values.push({ id: `focus-start-${segment.id}-${index}`, coordinate: start, anchor: { x: 0.5, y: 0.5 }, content: <View style={styles.startMarker} /> });
        values.push({ id: `focus-end-${segment.id}-${index}`, coordinate: end, anchor: { x: 0.5, y: 0.5 }, content: <View style={[styles.endMarker, { backgroundColor: theme.danger }]} /> });
      });
    } else if (validFocusCoords?.[0] && !validJourneyStops?.length) {
      values.push({ id: 'focus-start', coordinate: validFocusCoords[0], anchor: { x: 0.5, y: 0.5 }, content: <View style={styles.startMarker} /> });
      if (validFocusCoords.length > 1) values.push({ id: 'focus-end', coordinate: validFocusCoords[validFocusCoords.length - 1], anchor: { x: 0.5, y: 0.5 }, content: <View style={[styles.endMarker, { backgroundColor: theme.danger }]} /> });
    }
    return values;
    // staggerPins is deliberately not a dependency: it only picks the
    // mount-time entrance, and rebuilding markers when it flips would
    // interrupt the cascade (on Android every still-hidden pin would be
    // revealed at once by the wrapper swap). Later rebuilds — chip
    // switches, edits — run with the latest render's value, so pins mount
    // instantly once the entrance has played.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePoiId, distanceMarkers, pin, pois, showPoiMarkers, theme, validFocusCoords, validFocusSegments, validJourneyStops]);

  const requestedCenter: [number, number] = [center?.lon ?? 100, center?.lat ?? 32];
  const initialCenter: [number, number] = isValidMapCoordinate(requestedCenter) ? requestedCenter : [100, 32];
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.fieldSurface }]}>
      <NativeMap
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialCenter={initialCenter}
        initialZoom={3}
        initialFitCoordinates={cameraFocusCoords?.length ? cameraFocusCoords : undefined}
        initialPadding={routePadding}
        mapStyle={mapStyle}
        showLabels={showMapLabels}
        showUserLocation={!!pin}
        followUserLocation={followUserLocation}
        markers={markers}
        polylines={polylines}
        onPress={() => onBackgroundPress?.()}
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
  distanceMarkerWrap: { alignItems: 'center', justifyContent: 'center' },
  distanceMarkerSideWrap: { flexDirection: 'row', alignItems: 'center' },
  distanceMarkerEndpointSpacer: { width: 36 },
  distanceMarker: { minWidth: 38, paddingHorizontal: 6, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', shadowColor: '#000000', shadowOpacity: 0.16, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  distanceText: { fontSize: 9.5, lineHeight: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  distanceDot: { width: 5, height: 5, marginTop: -1, borderRadius: 3, borderWidth: 1.5, borderColor: '#FFFFFF' },
  startMarker: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#34C759', borderWidth: 2.5, borderColor: '#FFFFFF' },
  endMarker: { width: 14, height: 14, borderRadius: 7, borderWidth: 2.5, borderColor: '#FFFFFF' },
  journeyStop: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  journeyStopText: { color: '#FFFFFF', fontSize: 11, lineHeight: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
});
