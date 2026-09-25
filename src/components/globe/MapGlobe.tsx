import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { NativeMap, type NativeMapHandle, type NativeMapMarker, type NativeMapPolyline } from '../maps/NativeMap';
import { isValidMapCoordinate, keepValidCoordinates, type MapCoordinate } from '../maps/types';
import { simplifyTrack, trackSpanOnScreen, trackWorldSpan, zoomToFitSpan } from '../maps/extent';
import { PhotoPin, PHOTO_PIN_ANCHOR_Y, PHOTO_PIN_HEIGHT, PHOTO_PIN_WIDTH, PHOTO_SIZE, photoPinScaleForZoom } from './PhotoPin';
import { CurrentLocationMarker } from './CurrentLocationMarker';
import { pickPinUnderPress } from '../../lib/pinOverlap';
import { STAGGER_MAX_DELAY_MS, STAGGER_STEP_MS } from '../StaggerIn';
import type { GlobePoi, GlobeProps } from './types';
import { measureTrack, positionAtDistance } from '../../lib/routeSegments';

// A long route at high zoom would otherwise build one distance marker per
// km (hundreds of custom marker bitmaps), and rebuilding them all when the
// zoom crosses a step bucket causes a visible stutter — worst on Android
// where each marker content is re-snapshotted into a bitmap.
const MAX_DISTANCE_MARKERS = 60;
// The camera the native map is created with. Needed to judge a press before the
// map has ever reported a zoom change.
const MAP_INITIAL_ZOOM = 3;
// Reveal rhythm for the visibility rail: same step and cap as the first screen's pin
// entrance, so a switch arrives the way the catalog did the first time.
const ENTRANCE_LAST_INDEX = Math.floor(STAGGER_MAX_DELAY_MS / STAGGER_STEP_MS);
const ENTRANCE_REVEAL_MS = 180;
function cappedStepKm(stepKm: number, totalMeters: number): number {
  const slots = Math.floor((totalMeters - 120) / 1000 / stepKm);
  if (slots <= MAX_DISTANCE_MARKERS) return stepKm;
  // Round the minimum step up to a "nice" km value so labels stay readable.
  const minStep = Math.ceil((totalMeters - 120) / 1000 / MAX_DISTANCE_MARKERS);
  const niceSteps = [1, 2, 5, 10, 20, 25, 50, 100, 200];
  return niceSteps.find((step) => step >= minStep) ?? Math.ceil(minStep / 50) * 50;
}

const MIN_TRACK_ENDPOINT_PIXELS = 100;
// The overlay layer is empty most of the time, and a memo that returns a fresh
// `[]` is a changed dependency to anything that reads it — which used to mean
// that switching the kilometre labels off rebuilt all 85 pin markers.
const NO_MARKERS: NativeMapMarker[] = [];

const MAP_FRAME_TOP_PADDING = 90;
const MAP_FRAME_SIDE_PADDING = 54;
// A card pulled all the way up leaves less room than the bottom padding asks
// for. Both native maps mishandle a padded box with no area — the fitted
// content ends up dumped in the middle of the view, behind the card — so the
// top padding gives way first and the strip above the card stays the target.
const MAP_FRAME_MIN_BAND = 40;

export default function MapGlobe({
  theme,
  pois,
  showPoiMarkers = true,
  pinVisibilityApi,
  activePoiId,
  onPoiPress,
  onBackgroundPress,
  center,
  focusCoords,
  frameCoords,
  focusSegments,
  journeyLegs,
  journeyStops,
  onJourneyStopPress,
  journeyDayLabels,
  onJourneyDayLabelPress,
  extraMarkers,
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
  const { width, height } = useWindowDimensions();
  const mapRef = useRef<NativeMapHandle>(null);
  // The pin scale is an Animated.Value rather than state: a state change would
  // rebuild (and thus re-register) every marker on the native map mid-zoom,
  // which makes all pins flicker while pinching. setValue updates the
  // transform natively without a React render or a marker remount.
  const pinScale = useRef(new Animated.Value(photoPinScaleForZoom(3))).current;
  // ─────────────────────── visibility without a render ───────────────────────
  // One alpha per pin, created when the pin is built and carried along for as long
  // as it stays in the array; `applyVisibility` below moves them. Neither end of
  // that touches React, which is the only way this map has avoided paying ~190ms to
  // change what is on screen: measured, a 探索↔旅程 switch costs that much even
  // when every pin object is reused and every pin's own subtree is memoised,
  // because walking 148 markers *is* the cost. `pinScale` above already solved the
  // identical problem for zoom the same way, for the identical reason.
  const pinAlphasRef = useRef(new Map<string, Animated.Value>());
  /** The set `applyVisibility` was last given, or null before the first call -
      read at press time, because a pin at alpha 0 is still hit-testable (verified
      on device: the card opened from an invisible pin). */
  const visiblePinsRef = useRef<Set<string> | null>(null);
  /** Which keys are currently revealed, kept separately from the visible set: a pin
      can mount *after* the set was last applied, and then the set says it should be
      shown while nothing has ever told its value so. */
  const revealedPinsRef = useRef(new Set<string>());
  const applyVisibility = useCallback((keys: Set<string>, options?: { stagger?: boolean }) => {
    visiblePinsRef.current = keys;
    const revealed = revealedPinsRef.current;
    let staggerIndex = 0;
    pinAlphasRef.current.forEach((value, key) => {
      const on = keys.has(key);
      if (on === revealed.has(key)) return;
      if (on) revealed.add(key); else revealed.delete(key);
      if (on) {
        if (!options?.stagger) {
          value.setValue(1);
          return;
        }
        value.setValue(0);
        Animated.sequence([
          Animated.delay(Math.min(staggerIndex++, ENTRANCE_LAST_INDEX) * STAGGER_STEP_MS),
          Animated.timing(value, {
            toValue: 1,
            duration: ENTRANCE_REVEAL_MS,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]).start();
        return;
      }
      // Hiding is immediate: that is the layer the user just walked away from, and
      // animating it out would only delay the new one arriving.
      value.setValue(0);
    });
    (globalThis as any).__pinpress?.railApplied?.(
      keys.size,
      revealed.size,
      pinAlphasRef.current.size,
      !!options?.stagger,
    );
  }, []);
  useEffect(() => {
    if (!pinVisibilityApi) return;
    pinVisibilityApi.current = { apply: applyVisibility };
    return () => {
      pinVisibilityApi.current = null;
    };
  }, [pinVisibilityApi, applyVisibility]);
  // Press handlers are read through refs so the marker memo does not depend on
  // them: callers commonly pass inline arrows, and depending on their identity
  // would rebuild (and on Android re-snapshot) every annotation on every parent
  // render — which is most of them while a detail sheet is opening.
  // `ownerOfBlockedPress` below is left out of the memo deps for the same reason:
  // it is a `useCallback` with no dependencies and reads only refs.
  const onPoiPressRef = useRef(onPoiPress);
  /** The pins as the caller last had them, for the blocked-press resolution
      below. A ref for the same reason as the handlers: reading it from a press
      closure must not make the marker memo depend on it. */
  const poisRef = useRef(pois);
  const onJourneyStopPressRef = useRef(onJourneyStopPress);
  const onJourneyDayLabelPressRef = useRef(onJourneyDayLabelPress);
  useEffect(() => {
    onPoiPressRef.current = onPoiPress;
    poisRef.current = pois;
    onJourneyStopPressRef.current = onJourneyStopPress;
    onJourneyDayLabelPressRef.current = onJourneyDayLabelPress;
  });
  const [distanceStepKm, setDistanceStepKm] = React.useState(10);
  // The zoom the track geometry is drawn for, updated once the camera has been
  // quiet - `drawAtDetail` below is what waits for it, because re-cutting a line
  // mid-animation is the cost this is trying to move out of that window.
  const [cameraDetailZoom, setCameraDetailZoom] = React.useState(4);
  const [trackEndpointsVisible, setTrackEndpointsVisible] = React.useState(true);
  const lastZoomBucket = useRef<number | null>(null);
  const lastDistanceStep = useRef<number | null>(null);
  const distanceStepTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const detailZoomTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastDetailZoom = useRef<number | null>(null);
  useEffect(() => () => {
    if (distanceStepTimer.current) clearTimeout(distanceStepTimer.current);
    if (detailZoomTimer.current) clearTimeout(detailZoomTimer.current);
  }, []);
  const handleZoomChange = useCallback((zoom: number) => {
    if (!Number.isFinite(zoom)) return;
    liveZoom.current = zoom;
    syncTrackEndpoints(zoom);
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
    const detailZoom = Math.round(zoom);
    if (lastDetailZoom.current !== detailZoom) {
      lastDetailZoom.current = detailZoom;
      // Same reason as the distance step above: a finer tolerance keeps more
      // vertices, and handing the native map a new shape mid-pinch is the very
      // cost this is trying to avoid - so the camera settles first.
      if (detailZoomTimer.current) clearTimeout(detailZoomTimer.current);
      detailZoomTimer.current = setTimeout(() => {
        detailZoomTimer.current = null;
        setCameraDetailZoom(detailZoom);
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
  const validJourneyDayLabels = useMemo(
    () => journeyDayLabels?.filter((label) => isValidMapCoordinate(label.coordinate)),
    [journeyDayLabels],
  );
  const trackSpan = useMemo(() => {
    const segments = validFocusSegments && validFocusSegments.length > 1
      ? validFocusSegments.map((segment) => segment.coordinates)
      : [validFocusCoords ?? []];
    let widest: { width: number; height: number } | null = null;
    segments.forEach((coordinates) => {
      const span = trackWorldSpan(coordinates);
      if (span && (!widest || Math.max(span.width, span.height) > Math.max(widest.width, widest.height))) widest = span;
    });
    return widest;
  }, [validFocusCoords, validFocusSegments]);
  const liveZoom = useRef<number | null>(null);
  /**
   * Whose press was this, when the pin the map pressed is one the visibility rail
   * has hidden. Alpha lives on the pin's *content*, so the native annotation view
   * is still perfectly interactive, and at a country-wide zoom its 116x70 layout
   * frame covers most of the screen — MapKit hands the tap to whichever frame is
   * on top, which is very often an invisible pin from the other mode. Dropping
   * that press (the old behaviour) is what reads as "I tapped the pin, nothing
   * happened; the second tap worked".
   *
   * Settle it by geometry instead: if a pin that IS allowed to be seen has its
   * drawn photo inside the frame that ate the tap, the tap belonged to that pin.
   * Photo-level overlap is the conservative part — it will not move a tap on
   * empty Hunan onto a journey in Sichuan.
   */
  const ownerOfBlockedPress = useCallback((pressed: GlobePoi): GlobePoi | null => {
    const visible = visiblePinsRef.current;
    if (!visible) return null;
    const zoom = liveZoom.current ?? MAP_INITIAL_ZOOM;
    // Inlined `pinKey` for the same reason the marker memo does: this file is
    // vm-loaded against a dependency whitelist by the framing test.
    const candidates = poisRef.current.filter((poi) => visible.has(`${poi.layer ?? 'shared'}:${poi.id}`));
    const match = pickPinUnderPress(pressed, candidates, zoom, {
      frameWidth: PHOTO_PIN_WIDTH,
      frameHeight: PHOTO_PIN_HEIGHT,
      anchorY: PHOTO_PIN_ANCHOR_Y,
      photoSize: PHOTO_SIZE,
      scale: photoPinScaleForZoom(zoom),
    });
    (globalThis as any).__pinpress?.overlap?.(
      pressed.id,
      match ? match.pin.id : '',
      match ? match.score : 0,
      zoom,
      candidates.length,
    );
    return match ? match.pin : null;
  }, []);
  const trackSpanRef = useRef(trackSpan);
  const endpointVisibleRef = useRef(true);
  const syncTrackEndpoints = (zoom: number | null) => {
    if (zoom == null) return;
    const visible = trackSpanOnScreen(trackSpanRef.current, zoom) >= MIN_TRACK_ENDPOINT_PIXELS;
    if (visible === endpointVisibleRef.current) return;
    endpointVisibleRef.current = visible;
    setTrackEndpointsVisible(visible);
  };
  useEffect(() => {
    trackSpanRef.current = trackSpan;
    syncTrackEndpoints(liveZoom.current);
  }, [trackSpan]);
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
  const cameraFocusCoords = frameCoords?.length
    // A journey's own extent, computed by the caller: the recorded track alone
    // leaves each day's transfer leg off screen, and that is what the overview
    // is for. Stable across day switches, so the per-day framing below stays
    // the only thing that moves the camera once the journey is open.
    ? frameCoords
    : (routeFocusCoords?.length ?? 0) >= 2
      ? routeFocusCoords
      : stopFocusCoords ?? routeFocusCoords;
  const focusBottom = focusBottomPadding ?? Math.round(height * 0.54);
  const frameTopPadding = Math.max(0, Math.min(MAP_FRAME_TOP_PADDING, height - focusBottom - MAP_FRAME_MIN_BAND));
  const routePadding: [number, number, number, number] = [frameTopPadding, MAP_FRAME_SIDE_PADDING, focusBottom, MAP_FRAME_SIDE_PADDING];

  useEffect(() => {
    if (!autoFrameRoute || !cameraFocusCoords?.length) return;
    // AMap's camera transition needs a little more time than MapKit to avoid
    // appearing to jump when a route detail sheet replaces the list. Keep the
    // shorter transition on iOS, where the native renderer is already smooth.
    const duration = Platform.OS === 'android' ? 760 : 250;
    if (cameraFocusCoords.length >= 2) mapRef.current?.fitCoordinates(cameraFocusCoords, routePadding, duration);
    else mapRef.current?.moveCamera(cameraFocusCoords[0], 11, duration, { edgePadding: routePadding });
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
    if (cameraAction.type === 'fitCoordinates') {
      const coordinates = cameraAction.coordinates.filter(isValidMapCoordinate);
      const duration = Platform.OS === 'android' ? 680 : 260;
      if (coordinates.length >= 2) mapRef.current?.fitCoordinates(coordinates, routePadding, duration);
      else if (coordinates.length === 1) mapRef.current?.moveCamera(coordinates[0], 12, duration, { edgePadding: routePadding });
      return;
    }
    if (!cameraFocusCoords?.length) return;
    if (cameraFocusCoords.length >= 2) mapRef.current?.fitCoordinates(cameraFocusCoords, routePadding, 650);
    else mapRef.current?.moveCamera(cameraFocusCoords[0], 11, 650, { edgePadding: routePadding });
  }, [cameraAction?.revision]);

  // What a track is drawn as, and what it has already been drawn as. The
  // tolerance is half a pixel of whichever framing resolves it finest: the one the
  // card gives this track - known the moment its coordinates are, which is what
  // lets the frame that opens a card carry a few hundred vertices instead of every
  // GPS sample of a two-hour walk - or wherever the user has since zoomed to.
  const trackDetailZoom = useMemo(() => {
    const boxPixels = Math.max(1, Math.min(
      width - MAP_FRAME_SIDE_PADDING * 2,
      height - frameTopPadding - focusBottom,
    ));
    // Whole zoom levels, so a sheet dragged up and down does not re-cut every
    // line on the map for a few pixels of framing.
    return Math.ceil(Math.max(cameraDetailZoom, zoomToFitSpan(trackSpan, boxPixels)));
  }, [cameraDetailZoom, focusBottom, frameTopPadding, height, trackSpan, width]);
  // Refinement is one-way per track: a line already drawn fine stays fine. Letting
  // it coarsen again when the camera pulls back would make the road visibly
  // reshape itself mid-session, which is a worse trade than the payload.
  const drawnTracks = useRef(new WeakMap<MapCoordinate[], { zoom: number; coordinates: MapCoordinate[] }>());
  const drawAtDetail = useCallback((coordinates: MapCoordinate[]) => {
    const paid = drawnTracks.current.get(coordinates);
    if (paid && paid.zoom >= trackDetailZoom) return paid.coordinates;
    // A world is 360 degrees across and 256 * 2**zoom pixels wide.
    const simplified = simplifyTrack(coordinates, 0.5 * (360 / (256 * 2 ** trackDetailZoom)));
    drawnTracks.current.set(coordinates, { zoom: trackDetailZoom, coordinates: simplified });
    return simplified;
  }, [trackDetailZoom]);

  const polylines = useMemo<NativeMapPolyline[]>(() => {
    const values: NativeMapPolyline[] = [];
    if (validFocusCoords && validFocusCoords.length >= 2 && !validFocusSegments?.length) {
      values.push({
        id: 'discover-focus-route',
        coordinates: drawAtDetail(validFocusCoords),
        color: validFocusSegments?.length ? theme.trailFaint : theme.accent,
        width: validFocusSegments?.length ? 3 : 4,
        opacity: validFocusSegments?.length ? 0.5 : 1,
      });
    }
    validFocusSegments?.forEach((segment, index) => values.push({
      id: `discover-segment-${index}`,
      coordinates: drawAtDetail(segment.coordinates),
      color: segment.color,
      width: 4,
      opacity: segment.active ? 1 : 0.45,
    }));
    // One width step under the recorded track and one visual identity of its
    // own (numbered pins at each end), so the plan reads as the layer over the
    // track rather than a second, disagreeing route.
    validJourneyLegs?.forEach((leg) => values.push({
      id: `journey-leg-${leg.id}`,
      coordinates: drawAtDetail(leg.coordinates),
      color: leg.color,
      width: 3,
      // Not a copy of the dots' 0.34: a bare 3pt stroke on map tiles needs to
      // stay readable to keep the day chain's context.
      opacity: leg.active ? 0.95 : 0.45,
      dashed: leg.dashed,
    }));
    // TEMPORARY probe: how many track vertices the native map was actually
    // handed, against what came in. Reached through a global rather than an
    // import because this file is loaded by a test with a dependency whitelist.
    if (__DEV__) {
      const drawn = values.reduce((widest, line) => Math.max(widest, line.coordinates.length), 0);
      (globalThis as unknown as { __pointframe?: { vertices: (source: number, drawn: number) => void } })
        .__pointframe?.vertices(validFocusCoords?.length ?? 0, drawn);
    }
    return values;
  }, [drawAtDetail, validFocusCoords, validFocusSegments, validJourneyLegs, theme]);

  const distanceMarkers = useMemo<NativeMapMarker[]>(() => {
    if (!showDistanceMarkers || !validFocusCoords || validFocusCoords.length < 2) return NO_MARKERS;
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

  // Split in two because the pin layer is the expensive one (one offscreen
  // snapshot per pin on iOS, a baked bitmap each on Android) and nothing in the
  // overlay layer should be able to ask for it to be rebuilt. Measured: opening
  // a route card zooms in, the zoom flips `trackEndpointsVisible` and re-steps
  // `distanceStepKm`, and the single memo that mixed both layers then rebuilt 85
  // pin markers mid-animation — a 510ms JS-thread block between the track commit
  // and the camera settling, with nothing else scheduled.
  const poiMarkers = useMemo<NativeMapMarker[]>(() => {
    // Journey detail keeps place pins off: they were built and then hidden at
    // opacity 0, which still registers a native annotation per place.
    const values: NativeMapMarker[] = [];
    // The visibility rail owns the reveal once it is wired up (a caller that can
    // hide a pin without a render also has to be the one that shows it with the
    // cascade); the mount-time entrance is for the callers without it.
    const alphas = new Map<string, Animated.Value>();
    if (showPoiMarkers) {
      pois.forEach((poi, index) => {
        if (!isValidMapCoordinate([poi.lng, poi.lat])) return;
        // Inlined `pinKey` - see the note in ./types about the framing test's
        // dependency whitelist.
        const key = `${poi.layer ?? 'shared'}:${poi.id}`;
        const alpha = pinAlphasRef.current.get(key)
          // With the rail wired, a pin nobody has revealed yet starts hidden. The
          // alternative - start shown - would put both layers on screen for the
          // frame between this render and the caller's first `apply`.
          ?? new Animated.Value(
            !pinVisibilityApi
            || (revealedPinsRef.current.has(key) && visiblePinsRef.current?.has(key) !== false)
              ? 1
              : 0,
          );
        alphas.set(key, alpha);
        const delay = staggerPins && !pinVisibilityApi
          ? Math.min(index, ENTRANCE_LAST_INDEX) * STAGGER_STEP_MS
          : undefined;
        values.push({
          id: `poi-${key}`,
          coordinate: [poi.lng, poi.lat],
          anchor: { x: 0.5, y: PHOTO_PIN_ANCHOR_Y },
          title: poi.label,
          onPress: () => {
            // Alpha 0 does not make a pin un-tappable - verified on device, the card
            // opened from a pin nobody could see. So the press is judged by the same
            // set the visuals use, read at press time.
            if (visiblePinsRef.current && !visiblePinsRef.current.has(key)) {
              // Read through a global on purpose: `MapGlobe` is vm-loaded by two
              // node tests against a fixed dependency whitelist, and a probe
              // import would fail them. Delete with src/lib/pinPressProbe.ts.
              const meant = ownerOfBlockedPress(poi);
              (globalThis as any).__pinpress?.blocked?.(
                key,
                `${poi.lng},${poi.lat}`,
                visiblePinsRef.current.size,
                meant ? `redirect -> ${meant.layer ?? 'shared'}:${meant.id}` : 'dropped: nothing visible under the frame',
              );
              if (meant) onPoiPressRef.current?.(meant.id);
              return;
            }
            (globalThis as any).__pinpress?.markerInMap?.(key, `${poi.lng},${poi.lat}`);
            onPoiPressRef.current?.(poi.id);
          },
          content: (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={poi.label}
              accessible
              hitSlop={6}
              style={{ opacity: 1 }}
            >
              <Animated.View style={{ opacity: alpha }}>
                <PhotoPin
                  theme={theme}
                  poi={poi}
                  active={activePoiId === poi.id}
                  mapScale={Platform.OS === 'android' ? 1 : pinScale}
                  staticRender={Platform.OS === 'android'}
                  entranceDelayMs={Platform.OS === 'android' ? undefined : delay}
                />
              </Animated.View>
            </Pressable>
          ),
        });
      });
    }
    // Pins that left the array take their value with them; the ones that stayed keep
    // the same Animated.Value, which is what makes a switch cost nothing here.
    pinAlphasRef.current = alphas;
    return values;
    // staggerPins is deliberately not a dependency: it only picks the
    // mount-time entrance, and rebuilding markers when it flips would
    // interrupt the cascade (on Android every still-hidden pin would be
    // revealed at once by the wrapper swap). Later rebuilds — chip
    // switches, edits — run with the latest render's value, so pins mount
    // instantly once the entrance has played.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activePoiId, pois, showPoiMarkers, theme]);

  const overlayMarkers = useMemo<NativeMapMarker[]>(() => {
    const values: NativeMapMarker[] = [];
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
        // Android caches marker content by id, so the number has to live in it.
        id: `journey-stop-${stop.id}-${stop.order ?? 'dot'}`,
        coordinate: stop.coordinate,
        anchor: { x: 0.5, y: 0.5 },
        onPress: () => onJourneyStopPressRef.current?.(stop.id),
        content: (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={stop.order == null ? stop.name : `${stop.order} ${stop.name}`}
            accessible
            hitSlop={6}
          >
            {stop.order == null
              ? <View style={[styles.journeyStopDot, { backgroundColor: stop.color }]} />
              : (
                <View style={[styles.journeyStop, { backgroundColor: stop.color }]}>
                  <Text style={styles.journeyStopText}>{stop.order}</Text>
                </View>
              )}
          </Pressable>
        ),
      });
    });

    validJourneyDayLabels?.forEach((label) => {
      values.push({
        id: `journey-day-${label.day}`,
        coordinate: label.coordinate,
        // The mileage describes the road, so the coordinate stays at the arc
        // midpoint and only the pill lifts off the line. Each platform has its
        // own prop for that: `anchor` is Android-only, `centerOffset` is the
        // MapKit one, and both are asked to put the pill's bottom edge on the
        // point, which is half its height above the centre.
        anchor: { x: 0.5, y: 1 },
        centerOffset: { x: 0, y: -styles.dayLabel.height / 2 },
        onPress: () => onJourneyDayLabelPressRef.current?.(label.day),
        content: (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${label.title} ${label.distance}`}
            accessible
            hitSlop={6}
          >
            <View style={[styles.dayLabel, { backgroundColor: label.color }]}>
              <Text numberOfLines={1} style={styles.dayLabelText}>{label.title}</Text>
              <Text numberOfLines={1} style={styles.dayLabelDistance}>{label.distance}</Text>
              <Text style={styles.dayLabelChevron}>›</Text>
            </View>
          </Pressable>
        ),
      });
    });

    // Built by the caller (companion live-location pins and anything else that
    // needs its own component imports): appended last so they draw over the
    // itinerary, and passed through untouched.
    if (extraMarkers?.length) values.push(...extraMarkers);

    // The track's own endpoints only earn a marker once the route is big on
    // screen; zoomed out they compete with the itinerary dots.
    if (trackEndpointsVisible) {
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
    }
    return values;
  }, [distanceMarkers, extraMarkers, pin, theme, trackEndpointsVisible, validFocusCoords, validFocusSegments, validJourneyDayLabels, validJourneyStops]);

  // Concatenated rather than spread into one array so that the common case
  // (nothing overlaid) hands NativeMap the very same array instance it already
  // has, and the pin objects inside it keep their identity — which is what lets
  // the marker elements below bail out of reconciliation entirely.
  const markers = useMemo(
    () => (overlayMarkers.length ? [...poiMarkers, ...overlayMarkers] : poiMarkers),
    [overlayMarkers, poiMarkers],
  );

  const requestedCenter: [number, number] = [center?.lon ?? 100, center?.lat ?? 32];
  const initialCenter: [number, number] = isValidMapCoordinate(requestedCenter) ? requestedCenter : [100, 32];
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.fieldSurface }]}>
      <NativeMap
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialCenter={initialCenter}
        initialZoom={MAP_INITIAL_ZOOM}
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
  dayLabel: { height: 24, paddingHorizontal: 8, borderRadius: 7, flexDirection: 'row', alignItems: 'center', shadowColor: '#000000', shadowOpacity: 0.18, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  dayLabelText: { fontSize: 11.5, lineHeight: 15, fontWeight: '700', color: '#FFFFFF' },
  dayLabelDistance: { marginLeft: 4, fontSize: 11.5, lineHeight: 15, fontWeight: '700', color: '#FFFFFF', fontVariant: ['tabular-nums'] },
  dayLabelChevron: { marginLeft: 4, fontSize: 13, lineHeight: 15, fontWeight: '500', color: '#FFFFFF' },
  journeyStopDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: '#FFFFFF' },
  journeyStopText: { color: '#FFFFFF', fontSize: 11, lineHeight: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
});
