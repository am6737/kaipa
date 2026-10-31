// TrailNavigationPage.tsx — 徒步导航: follow a planned route or record freely.
//
// The map owns the whole screen and the chrome floats on it (DESIGN.md §1.8):
// minimise at the top left, one column of map controls on the right, and
// everything else in a card at the bottom.
//
// Before starting the card is docked to the bottom edge like the recording
// sheet it turns into, with the start pill and settings behind a grab handle;
// once finished it is a plain panel docked the same way. While
// recording it is a sheet with three detents, after AllTrails and Komoot: the
// lowest shows only time, distance and pause, so the map gets the screen; the
// middle turns that row into a grid of numbers in three columns and adds the
// elevation profile; fully open adds the settings. Above the lowest detent
// 暂停 moves into a big button pinned under the sheet; paused, 结束 and 继续
// sit there at every detent.
//
// Minimising never stops anything. The recording lives in trailRecorder.ts
// and a pill at the top of every screen leads back here (TrailMiniBar).
import * as Haptics from 'expo-haptics';
import React, { type ReactNode, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AccessibilityInfo, Animated, BackHandler, Linking, PanResponder, Platform, StyleSheet, Switch, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { platformLocationImage } from '../maps/locationImage';
import { useDropPinPhoto, waypointDropPinMarker } from '../maps/DropPin';
import { AppActionDialog, AppProgressBar, layout, motion, radius, space, type } from '../../design-system';
import { useData } from '../../data/DataContext';
import { useI18n } from '../../i18n';
import { useNav } from '../../nav/NavContext';
import type { Theme } from '../../theme/theme';
import { trailMarkDistances, useTrail, useTrailGuide, useTrailSnapshot } from '../../trail/TrailContext';
import { distanceMeters, JOURNEY_SEGMENT_COLORS, type Coordinate } from '../../lib/routeSegments';
import { formatClock, formatPace, remainingAscent, routeMeasure, splitDistance, type RouteProgress, type TrailFix } from '../../lib/trailGeo';
import { previewTrailVoice, setTrailVoice } from '../../lib/trailGuide';
import { takeTrailPhoto } from '../../lib/trailMarkPhotos';
import { dismissLockScreenGuide, shouldShowLockScreenGuide } from '../../lib/trailLockScreenGuide';
import { getTrailLayers, getTrailOverlays, setTrailLayer, setTrailOverlays, subscribeTrailLayers, subscribeTrailOverlays } from '../../lib/trailOverlays';
import {
  addTrailMark,
  clearTrailError,
  finishTrail,
  getTrailSnapshot,
  pauseTrail,
  removeTrailMark,
  renameTrailMark,
  resumeTrail,
  startTrail,
  trailBackgroundSupported,
  trailMovingMs,
  watchTrailPosition,
  type TrailSession,
} from '../../lib/trailRecorder';
import { CurrentLocationMarker } from '../globe/CurrentLocationMarker';
import { TrailSheet } from '../Sheet';
import { buildRouteEndpointMarkers } from '../discover/routeEndpointMarkers';
import { buildRouteWaypointMarkers, buildWaypointLayer } from '../discover/routeWaypointMarkers';
import { buildTrailKmMarkers, kmStepForZoom } from './trailKmMarkers';
import { useMapPresentation } from '../maps/MapPresentationContext';
import { formatTrackDistance } from '../../lib/trackParser';
import { MapStylePickerSheet, type MapPresentationStyle } from '../MapStylePickerSheet';
import { MapCompassReveal, useMapHeading } from '../maps/MapCompass';
import { MapScaleBar, useMapScale } from '../maps/MapScale';
import { MAP_CONTROL_SIZE, MapControlButton, MapControlGroup, MapRoundButton } from '../MapControls';
import { NativeMap, NATIVE_MAP_AVAILABLE, type NativeMapHandle, type NativeMapMarker, type NativeMapPolyline } from '../maps/NativeMap';
import { Icon, type IconName } from '../Icon';
import { Press } from '../Press';
import { TrailOverlaySheet } from './TrailOverlaySheet';
import { MarkDetail, type MarkDetailItem } from './MarkDetail';
import { TrailControlButton } from './TrailControlButton';
import { TrailProfile } from './TrailProfile';
import { TrailSummary } from './TrailSummary';

// The planned line in the same blue the route card uses for navigation.
const PLANNED_ROUTE_COLOR = JOURNEY_SEGMENT_COLORS[0];
// Overlaid tracks take the other segment colours, leaving out the planned
// blue and the orange that would read as the walker's own line.
const OVERLAY_COLORS = [JOURNEY_SEGMENT_COLORS[2], JOURNEY_SEGMENT_COLORS[3], JOURNEY_SEGMENT_COLORS[4], JOURNEY_SEGMENT_COLORS[5]];
const FOLLOW_ZOOM = 16;
const NO_MARKERS: NativeMapMarker[] = [];

// How far the pre-start card may be pulled past 展开, and how much card surface
// is parked under the screen's bottom edge to spend on it: the stretch shows
// more card, never the map under it.
const READY_PULL = 0.2;
const READY_PULL_MAX = 0.15;
const READY_RESIST = 0.35;

export function TrailNavigationPage({ theme }: { theme: Theme }) {
  const { t } = useI18n();
  const nav = useNav();
  const insets = useSafeAreaInsets();
  const trail = useTrail();
  const { session, fix, gps, error } = useTrailSnapshot();
  const { mapStyle, setMapStyle } = useMapPresentation();
  const [layersOpen, setLayersOpen] = useState(false);
  const mapRef = useRef<NativeMapHandle>(null);
  const zoomRef = useRef(FOLLOW_ZOOM);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const fingerDown = useRef(false);
  // Where the map's own location dot is (Android), for "locate" before the
  // recorder has a fix of its own.
  const mapLocation = useRef<Coordinate | null>(null);
  const { height: windowHeight } = useWindowDimensions();
  const [panelHeight, setPanelHeight] = useState(280);
  // The pre-start card: its full height, the part of it that starts under the
  // screen's bottom edge, and how far it has been dragged up (0 收起, 1 展开).
  const [readyHeight, setReadyHeight] = useState(392);
  const [readyHidden, setReadyHidden] = useState(262);
  const [readyOpen, setReadyOpen] = useState(false);
  const [lockGuide, setLockGuide] = useState(false);
  const readyLift = useRef(new Animated.Value(0)).current;
  const [sheetIndex, setSheetIndex] = useState(1);
  const sheetY = useRef(new Animated.Value(0)).current;
  // Measured so the lower two detents end exactly under their content.
  const [quickHeight, setQuickHeight] = useState(68);
  const [midHeight, setMidHeight] = useState(300);
  const [following, setFollowing] = useState(true);
  // The zoom the label layers are laid out for: half steps, once the camera
  // has been quiet, so a pinch doesn't rebuild every label mid-gesture.
  const [layerZoom, setLayerZoom] = useState(() => (trail.plannedRoute || getTrailSnapshot().session?.route ? 13 : FOLLOW_ZOOM));
  const layerZoomBucket = useRef<number | null>(null);
  const layerZoomTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (layerZoomTimer.current) clearTimeout(layerZoomTimer.current);
  }, []);
  const onLayerZoom = useCallback((zoom: number) => {
    const bucket = Math.round(zoom * 2) / 2;
    if (!Number.isFinite(bucket) || bucket === layerZoomBucket.current) return;
    layerZoomBucket.current = bucket;
    if (layerZoomTimer.current) clearTimeout(layerZoomTimer.current);
    layerZoomTimer.current = setTimeout(() => setLayerZoom(bucket), 180);
  }, []);
  // The named spot open in the detail, as an index into the waypoint layer.
  const [openWaypoint, setOpenWaypoint] = useState<number | null>(null);
  const { heading: mapHeading, offNorth: mapOffNorth, onOrientation: onMapOrientation } = useMapHeading();
  const { scale: mapScale, onZoom: onMapScaleZoom, onLatitude: onMapScaleLatitude } = useMapScale();
  const [starting, setStarting] = useState(false);
  const [, setTick] = useState(0);
  const { tracks } = useData();
  const overlayIds = useSyncExternalStore(subscribeTrailOverlays, getTrailOverlays, getTrailOverlays);
  const [overlayPicker, setOverlayPicker] = useState(false);
  const layers = useSyncExternalStore(subscribeTrailLayers, getTrailLayers, getTrailLayers);
  const [marking, setMarking] = useState(false);
  const [openMark, setOpenMark] = useState<number | null>(null);

  const route = session ? session.route : trail.plannedRoute;
  const status = session?.status ?? 'ready';
  const live = session != null && (status === 'recording' || status === 'paused');
  const measure = useMemo(() => routeMeasure(route?.coords), [route?.coords]);
  // The track being followed is already drawn as the planned line.
  const overlayTracks = useMemo(
    () => overlayIds
      .map((id) => tracks.find((track) => track.id === id))
      .filter((track): track is NonNullable<typeof track> => !!track?.coords && track.coords.length >= 2 && !(route?.kind === 'track' && route.id === track.id)),
    [overlayIds, tracks, route?.kind, route?.id],
  );

  // The page keeps its own live position while open, recording or not.
  useEffect(() => watchTrailPosition(), []);

  // The clock ticks only while time is actually counting.
  useEffect(() => {
    if (status !== 'recording') return;
    const timer = setInterval(() => setTick((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [status]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      trail.closeTrail();
      return true;
    });
    return () => subscription.remove();
  }, [trail]);

  useEffect(() => {
    nav.setTabBarHidden('trail', true);
    return () => nav.setTabBarHidden('trail', false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Progress, off route and arrival come from trailGuide, which also speaks
  // them; it runs on every fix even when this page isn't rendering.
  const guide = useTrailGuide();
  const progress = status === 'ready' ? null : guide.progress;
  const { offRoute, arrived } = guide;
  const routeFraction = progress && progress.totalM > 0 ? progress.alongM / progress.totalM : 0;
  const profileKm = route?.elevation?.length ? route.elevation[route.elevation.length - 1].km : 0;

  // ─── map content ──────────────────────────────────────────────────────────
  const recordedCoords = useMemo<Coordinate[][]>(
    () => (session?.segments ?? []).map((segment) => segment.map(([lng, lat]) => [lng, lat] as Coordinate)),
    // Segments grow in place; the point count says when.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session?.id, session?.segments.length, session?.totals.pointCount],
  );

  const polylines = useMemo<NativeMapPolyline[]>(() => {
    const lines: NativeMapPolyline[] = [];
    // Drawn first, so the planned line and the walk stay on top.
    overlayTracks.forEach((track, index) => {
      lines.push({ id: `trail-overlay-${track.id}`, coordinates: track.coords!, color: OVERLAY_COLORS[index % OVERLAY_COLORS.length], width: 4, opacity: 0.85 });
    });
    if (route && route.coords.length >= 2) {
      lines.push({ id: `trail-route-${route.id}`, coordinates: route.coords, color: PLANNED_ROUTE_COLOR, width: 6, opacity: 0.9 });
    }
    recordedCoords.forEach((coordinates, index) => {
      if (coordinates.length >= 2) lines.push({ id: `trail-recorded-${index}`, coordinates, color: theme.trailMine, width: 4 });
    });
    return lines;
  }, [overlayTracks, route, recordedCoords, theme.trailMine]);

  // Once finished, the walk itself is what the map shows: its ends, framed whole.
  const finishedCoords = useMemo<Coordinate[] | null>(() => {
    if (status !== 'finished') return null;
    const coords = recordedCoords.flat();
    return coords.length >= 2 ? coords : null;
  }, [status, recordedCoords]);
  const endpointCoords = finishedCoords ?? (route && route.coords.length >= 2 ? route.coords : null);

  const endpointMarkers = useMemo(() => (endpointCoords
    ? buildRouteEndpointMarkers({
      theme,
      drawnCoords: endpointCoords,
      loop: distanceMeters(endpointCoords[0], endpointCoords[endpointCoords.length - 1]) <= 300,
      labels: { start: t('route.direction.start'), finish: t('route.direction.finish'), action: '' },
      actionOpen: false,
      onEndpointPress: () => undefined,
      onActionPress: () => undefined,
    })
    : NO_MARKERS), [endpointCoords, t, theme]);

  // The route card's layers on the line being followed and on every overlay:
  // kilometre labels and named waypoints, each dotted or ringed in its line's
  // colour. Once finished the map is about the walk, so the followed line's go.
  const showRouteLayers = status !== 'finished';
  const kmStep = kmStepForZoom(layerZoom);
  const kmMarkers = useMemo(() => {
    if (!layers.km) return NO_MARKERS;
    const values: NativeMapMarker[] = [];
    if (showRouteLayers && route && route.coords.length >= 2) {
      values.push(...buildTrailKmMarkers({ theme, coords: route.coords, stepKm: kmStep, idPrefix: `trail-km-${route.id}` }));
    }
    overlayTracks.forEach((track, index) => {
      const color = OVERLAY_COLORS[index % OVERLAY_COLORS.length];
      values.push(...buildTrailKmMarkers({ theme, coords: track.coords!, stepKm: kmStep, color, idPrefix: `trail-km-${track.id}-${index}` }));
    });
    return values.length ? values : NO_MARKERS;
  }, [showRouteLayers, layers.km, route, overlayTracks, kmStep, theme]);
  // A tap on one opens the same detail as the walker's own marks, read-only,
  // with the spots of that one line to swipe through.
  const waypointLayer = useMemo(() => {
    const layer = buildWaypointLayer([
      ...(showRouteLayers && route?.waypoints?.length ? [{
        key: `route-${route.id}`,
        coords: route.coords,
        waypoints: route.waypoints,
        color: PLANNED_ROUTE_COLOR,
        elevation: route.elevation,
        source: { name: route.name, color: PLANNED_ROUTE_COLOR },
      }] : []),
      ...overlayTracks.flatMap((track, index) => {
        if (!track.waypoints?.length) return [];
        const color = OVERLAY_COLORS[index % OVERLAY_COLORS.length];
        return [{
          key: `track-${track.id}`,
          coords: track.coords!,
          waypoints: track.waypoints,
          color,
          elevation: track.elevation,
          source: { name: track.name, color },
        }];
      }),
    ]);
    // Android snapshots marker views by id and these ids are list indexes, so
    // they carry what the list is made of.
    const signature = [route?.id ?? '', ...overlayTracks.map((track) => track.id)].join('|');
    return { ...layer, idPrefix: `trail-wp-${hashString(signature)}-${layer.list.length}` };
  }, [showRouteLayers, route, overlayTracks]);
  useEffect(() => setOpenWaypoint(null), [waypointLayer, layers.waypoints]);
  // The named spot the card is reading wears the drop pin in place of its dot.
  const openWaypointItem = openWaypoint != null ? waypointLayer.details[openWaypoint] : undefined;
  const {
    photoReady: waypointPinReady,
    photoRevision: waypointPinRevision,
    onPhotoLoad: waypointPinLoad,
  } = useDropPinPhoto(openWaypointItem?.photo);
  const waypointMarkers = useMemo(() => (layers.waypoints && waypointLayer.list.length
    ? buildRouteWaypointMarkers({
      theme,
      waypoints: waypointLayer.list,
      zoom: layerZoom,
      idPrefix: waypointLayer.idPrefix,
      hideIndex: openWaypoint,
      onWaypointPress: setOpenWaypoint,
      onClusterPress: (coordinates) => {
        setFollowing(false);
        mapRef.current?.fitCoordinates(coordinates, cameraPadding(), motion.emphasized * 2);
      },
      clusterSpotsLabel: (n) => t('journey.map.clusterSpots', { n }),
    })
    : NO_MARKERS), [layers.waypoints, openWaypoint, t, waypointLayer, layerZoom, theme]);
  const waypointLine = openWaypoint != null ? waypointLayer.lines.find((line) => openWaypoint >= line.start && openWaypoint < line.end) : undefined;
  const waypointItems = useMemo(
    () => (waypointLine ? waypointLayer.details.slice(waypointLine.start, waypointLine.end) : []),
    [waypointLayer, waypointLine],
  );
  const waypointPin = useMemo<NativeMapMarker[]>(() => {
    const item = openWaypointItem;
    if (openWaypoint == null || !item || item.lng == null || item.lat == null) return NO_MARKERS;
    return [waypointDropPinMarker({
      theme,
      pinKey: `trail-waypoint-${openWaypoint}`,
      coordinate: [item.lng, item.lat],
      // The number the card wears: its place in the line's own page list.
      number: waypointLine ? openWaypoint - waypointLine.start + 1 : openWaypoint + 1,
      photo: item.photo,
      photoReady: waypointPinReady,
      photoRevision: waypointPinRevision,
      onPhotoLoad: waypointPinLoad,
      // Over the walker's own dot and the kilometre labels: this is what the
      // card is reading.
      zIndex: 20,
      title: item.name,
    })];
  }, [openWaypoint, openWaypointItem, theme, waypointLine, waypointPinLoad, waypointPinReady, waypointPinRevision]);

  // "You are here", drawn from the recorder's fix on Android, so it
  // holds still while the phone lies still (AMap's own location layer would
  // wander with every raw fix). Android draws the shared marker's image rather
  // than its view: a snapshotted custom view did not show up on device there.
  // iOS skips all of this and lets MapKit draw its own dot, as Discover does.
  const headingKey = fix?.heading != null ? Math.round(fix.heading / 15) * 15 : null;
  // Marked spots, numbered in the order they were marked: the number is what
  // the saved track names them by (标注点 1, 2, …).
  const marks = session?.marks;
  // The mark the card is reading, and the photo its pin wears.
  const openMarkItem = openMark != null ? marks?.[openMark] : undefined;
  const {
    photoReady: markPinReady,
    photoRevision: markPinRevision,
    onPhotoLoad: markPinLoad,
  } = useDropPinPhoto(openMarkItem?.photo);
  // Android snapshots marker views by id, so the number is part of it: a
  // deleted mark renumbers the ones after it. The open one is dropped as a pin
  // instead, so its badge goes.
  const markMarkers = useMemo<NativeMapMarker[]>(() => (marks ?? []).flatMap((mark, index) => (index === openMark ? [] : [{
    id: `trail-mark-${mark.id}-${index + 1}`,
    coordinate: [mark.lng, mark.lat] as [number, number],
    anchor: { x: 0.5, y: 0.5 },
    zIndex: 5,
    onPress: () => setOpenMark(index),
    content: <MarkBadge theme={theme} label={String(index + 1)} />,
  }])), [marks, openMark, theme]);
  const markPin = useMemo<NativeMapMarker[]>(() => {
    const mark = openMarkItem;
    if (openMark == null || !mark) return NO_MARKERS;
    return [waypointDropPinMarker({
      theme,
      pinKey: `trail-mark-${mark.id}`,
      coordinate: [mark.lng, mark.lat],
      number: openMark + 1,
      photo: mark.photo,
      photoReady: markPinReady,
      photoRevision: markPinRevision,
      onPhotoLoad: markPinLoad,
      zIndex: 20,
      title: mark.name ?? t('trail.mark.defaultName', { n: openMark + 1 }),
    })];
  }, [markPinLoad, markPinReady, markPinRevision, openMark, openMarkItem, t, theme]);
  // Only worked out while the detail is open: it walks the whole recording.
  const markItems = useMemo<MarkDetailItem[]>(() => {
    if (openMark == null || !session?.marks?.length) return [];
    const along = trailMarkDistances(session);
    return session.marks.map((mark, index) => ({
      key: mark.id,
      name: mark.name ?? t('trail.mark.defaultName', { n: index + 1 }),
      photo: mark.photo,
      at: mark.at,
      alongM: along[index],
      lng: mark.lng,
      lat: mark.lat,
      ele: mark.alt,
    }));
    // Marks change by identity; the points under them only matter on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openMark != null, session?.marks, t]);
  const markers = useMemo<NativeMapMarker[]>(() => {
    const base = [...kmMarkers, ...waypointMarkers, ...endpointMarkers, ...markMarkers, ...waypointPin, ...markPin];
    if (!fix || Platform.OS !== 'android') return base;
    const image = platformLocationImage(theme.accent, headingKey != null);
    return [...base, {
      id: 'trail-location',
      coordinate: [fix.lng, fix.lat],
      anchor: { x: 0.5, y: 0.5 },
      zIndex: 10,
      ...(image ? { image, rotation: headingKey ?? 0 } : {}),
      content: <CurrentLocationMarker theme={theme} heading={headingKey ?? undefined} />,
    }];
  }, [kmMarkers, waypointMarkers, waypointPin, endpointMarkers, markMarkers, markPin, fix, headingKey, theme]);

  const topChrome = insets.top + space.xs + MAP_CONTROL_SIZE;

  // ─── the live sheet ───────────────────────────────────────────────────────
  const sheetGrabber = 19; // TrailSheet's grab handle above the body
  const footerBar = space.sm + 52 + space.sm + insets.bottom;
  const footerHeight = live ? footerBar : 0;
  const snapsFor = useCallback((paused: boolean) => {
    // Lowest detent ends at the quick row: recording, its pause button is
    // there and the footer has slid away, so it keeps clear of the home
    // indicator itself; paused, the footer stays and clears it.
    const min = sheetGrabber + quickHeight + (paused ? footerBar : Math.max(insets.bottom, space.md) - space.md);
    const mid = Math.max(min + 40, sheetGrabber + midHeight + space.md + footerBar);
    const full = Math.max(mid + 40, windowHeight - topChrome - space.sm);
    return [min, mid, full];
  }, [quickHeight, midHeight, footerBar, insets.bottom, windowHeight, topChrome]);
  const snapHeights = useMemo(() => snapsFor(status === 'paused'), [snapsFor, status]);
  useEffect(() => {
    if (!live) setSheetIndex(1);
  }, [live]);

  // ─── the pre-start card ───────────────────────────────────────────────────
  // One card in two states, dragged like the sheet it becomes: the settings are
  // laid out under the screen's bottom edge and ride up with the card, so
  // 收起 shows exactly the region the open card shows above them.
  const readyOver = Math.ceil(readyHidden * READY_PULL);
  const readyMin = Math.max(space.md, readyHeight - readyHidden - readyOver);
  const readyAt = useRef(0);
  const readyFrom = useRef(0);
  const readyHiddenRef = useRef(readyHidden);
  readyHiddenRef.current = readyHidden;
  useEffect(() => {
    const id = readyLift.addListener(({ value }) => { readyAt.current = value; });
    return () => readyLift.removeListener(id);
  }, [readyLift]);
  const restReady = useCallback((open: boolean) => {
    setReadyOpen(open);
    Animated.spring(readyLift, { toValue: open ? 1 : 0, useNativeDriver: true, ...motion.pageSpring }).start();
  }, [readyLift]);
  // The recording sheet and the summary take the card's place; the lift reads 0
  // there, or the map controls stay lifted from the last drag.
  useEffect(() => {
    if (!live && status !== 'finished') return;
    readyLift.setValue(0);
    readyAt.current = 0;
    setReadyOpen(false);
  }, [live, status, readyLift]);
  const readyDrag = useMemo(() => PanResponder.create({
    // The card is dragged, not the map under it: a horizontal pull stays a pan.
    onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dy) > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    // And it is dragged from the handle or the 开始 pill too: those take the
    // responder on touch-down, so the card claims the move phase instead and
    // leaves a still finger to them as a tap.
    onMoveShouldSetPanResponderCapture: (_event, gesture) => Math.abs(gesture.dy) > 10 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onPanResponderGrant: () => { readyFrom.current = readyAt.current; },
    onPanResponderMove: (_event, gesture) => {
      const span = readyHiddenRef.current;
      if (span <= 0) return;
      // The travel is exactly the settings block: 展开 is the card sitting on
      // the bottom edge and 收起 the same card pushed one block below it. Past
      // 展开 it stretches against the spare card parked below the edge, so the
      // pull reads as resistance, never as the map coming into view.
      const raw = readyFrom.current - gesture.dy / span;
      readyLift.setValue(raw > 1 ? Math.min(1 + READY_PULL_MAX, 1 + (raw - 1) * READY_RESIST) : Math.max(0, raw));
    },
    onPanResponderRelease: (_event, gesture) => {
      restReady(gesture.vy < -0.2 ? true : gesture.vy > 0.2 ? false : readyAt.current > 0.5);
    },
    // A gesture stolen mid-drag (an alert, a system edge swipe) still has to
    // leave the card parked on one of its two states.
    onPanResponderTerminate: () => { restReady(readyAt.current > 0.5); },
  }), [readyLift, restReady]);
  // Fully open rests on the spare card, not on the screen edge; every point of
  // 收起 is one card of settings pushed below it.
  const readySlide = readyLift.interpolate({ inputRange: [0, 1], outputRange: [readyHidden + readyOver, readyOver] });
  // The controls rest on the collapsed card and climb with it, so they read the
  // same value the card is sliding by.
  const readyLifted = Animated.subtract(readySlide, readyHidden + readyOver);

  // Fully open covers the map, so the camera keeps framing for the middle.
  const bottomInset = live ? snapHeights[Math.min(sheetIndex, 1)] : status === 'finished' ? panelHeight : readyOpen ? readyMin + readyHidden : readyMin;
  const cameraPadding = useCallback((): [number, number, number, number] => [topChrome + space.lg, 40, bottomInset + space.lg, 40], [bottomInset, topChrome]);
  // Following frames for the sheet as it is while recording: at the lowest
  // detent the paused footer comes and goes with 暂停 and 继续, and
  // re-centring for it slid the map each time.
  const followBottom = live ? snapsFor(false)[Math.min(sheetIndex, 1)] : bottomInset;
  const followPadding = useCallback((): [number, number, number, number] => [topChrome + space.lg, 40, followBottom + space.lg, 40], [followBottom, topChrome]);
  // The card and the pin read the same spot, so the map keeps that spot in the
  // part of itself the card does not cover, at the zoom the walker was already
  // looking at. Following stops while a spot is being read — the card is about
  // somewhere other than here — and the locate control turns it back on.
  // Keyed on the two indexes alone: a photo arriving in the pin, or the sheet
  // being dragged, must not move the map under the card.
  useEffect(() => {
    const spot = openWaypoint == null ? openMarkItem : openWaypointItem;
    if (!spot || spot.lng == null || spot.lat == null) return;
    setFollowing(false);
    mapRef.current?.moveCamera([spot.lng, spot.lat], zoomRef.current, motion.emphasized, { edgePadding: cameraPadding() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openMark, openWaypoint]);

  const liveFooter = (
    <Animated.View
      pointerEvents={status === 'recording' && sheetIndex === 0 ? 'none' : 'auto'}
      style={{
        flexDirection: 'row', gap: space.sm, paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: insets.bottom + space.sm, backgroundColor: theme.featureSurface,
        // The transform is always carried, only its output goes to 0: dropping it
        // from the style while paused left the last native-driven value (footerBar)
        // on the view, so the footer stayed slid down under the card and its
        // buttons hung off the bottom of the screen.
        transform: [{
          translateY: sheetY.interpolate({
            inputRange: [snapHeights[2] - snapHeights[1], snapHeights[2] - snapHeights[0]],
            outputRange: [0, status === 'recording' ? footerBar : 0],
            extrapolate: 'clamp',
          }),
        }],
      }}
    >
      {status === 'paused' ? (
        <>
          <TrailControlButton theme={theme} icon="stop" label={t('trail.action.finish')} danger onPress={() => void finishTrail()} />
          <TrailControlButton theme={theme} icon="play" label={t('trail.action.resume')} primary grow={2} onPress={() => void resumeTrail()} />
        </>
      ) : (
        <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'center' }}>
          <View style={{ width: 168, flexDirection: 'row' }}>
            <TrailControlButton theme={theme} icon="pause" label={t('trail.action.pause')} ink onPress={() => void pauseTrail()} />
          </View>
        </View>
      )}
    </Animated.View>
  );

  // Follow the walker; a pan or pinch hands the camera back to them.
  const lastFollowAt = useRef(0);
  useEffect(() => {
    if (!following || !fix) return;
    const now = Date.now();
    if (now - lastFollowAt.current < 1500) return;
    lastFollowAt.current = now;
    mapRef.current?.moveCamera([fix.lng, fix.lat], Math.max(zoomRef.current, 14), 600, { edgePadding: followPadding() });
  }, [fix, following, followPadding]);

  // Frame the finished walk once its summary has laid out, so the padding
  // knows how tall the panel is.
  const framedSessionId = useRef<string | null>(null);
  useEffect(() => {
    if (!finishedCoords || !session || panelHeight <= 0 || framedSessionId.current === session.id) return;
    framedSessionId.current = session.id;
    setFollowing(false);
    mapRef.current?.fitCoordinates(finishedCoords, cameraPadding(), motion.emphasized * 2);
  }, [finishedCoords, session, panelHeight, cameraPadding]);
  useEffect(() => {
    if (status !== 'finished') framedSessionId.current = null;
  }, [status]);

  // The camera button: shoot, then mark where the walker is. Cancelling the
  // camera marks nothing, so a mis-tap costs one back gesture.
  const markHere = async () => {
    if (marking) return;
    setMarking(true);
    try {
      const shot = await takeTrailPhoto();
      if (shot.status === 'denied') {
        nav.showToast(t('trail.mark.cameraDenied'));
        return;
      }
      if (shot.status !== 'taken') return;
      const mark = await addTrailMark(shot.uri);
      if (!mark) {
        nav.showToast(t('trail.mark.noFix'));
        return;
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      nav.showToast(t('trail.mark.added', { n: getTrailSnapshot().session?.marks?.length ?? 1 }));
    } catch (cause) {
      console.warn('[trail] mark failed:', cause);
      nav.showToast(t('trail.mark.failed'));
    } finally {
      setMarking(false);
    }
  };

  const overlayCandidates = useMemo(
    () => tracks.filter((track) => track.coords && track.coords.length >= 2 && !(route?.kind === 'track' && route.id === track.id)),
    [tracks, route?.kind, route?.id],
  );
  const overlayHint = overlayTracks.length ? t('trail.overlay.count', { n: overlayTracks.length }) : t('trail.overlay.hint');

  const followMe = () => {
    setFollowing(true);
    lastFollowAt.current = 0;
    const here: Coordinate | null = fix ? [fix.lng, fix.lat] : mapLocation.current;
    if (here) mapRef.current?.moveCamera(here, FOLLOW_ZOOM, 600, { edgePadding: followPadding() });
  };

  // ─── controls ─────────────────────────────────────────────────────────────
  const start = async () => {
    if (starting) return;
    setStarting(true);
    clearTrailError();
    const ok = await startTrail(trail.plannedRoute);
    setStarting(false);
    if (ok) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      followMe();
      void shouldShowLockScreenGuide().then((show) => { if (show) setLockGuide(true); });
    }
  };

  const closeLockGuide = (openSettings: boolean) => {
    setLockGuide(false);
    dismissLockScreenGuide(openSettings);
  };

  const movingMs = trailMovingMs(session);
  const toggleVoice = () => {
    const next = !guide.voice;
    setTrailVoice(next);
    if (next) previewTrailVoice();
  };
  const initialCenter: Coordinate = route?.coords[0] ?? (fix ? [fix.lng, fix.lat] : [116.39, 39.9]);
  // The scale needs a latitude; where the walker is is close enough.
  const scaleLatitude = fix?.lat ?? initialCenter[1];
  useEffect(() => onMapScaleLatitude(scaleLatitude), [onMapScaleLatitude, scaleLatitude]);

  // Where the map controls ride: on top of the card, following the live sheet
  // as it is dragged and fading out before it reaches the top.
  const controlsPointerEvents = live && sheetIndex >= 2 ? 'none' : 'box-none';
  // Both branches keep transform and opacity animated: these two Animated.Views
  // outlive the sheet, and a native-driven property that leaves the style keeps
  // the last value the driver wrote, so after 结束 the controls stayed parked at
  // the recording sheet's offset and faded out.
  const controlsRide = live ? {
    position: 'absolute' as const,
    bottom: snapHeights[2] + space.md,
    transform: [{ translateY: sheetY }],
    opacity: sheetY.interpolate({ inputRange: [(snapHeights[2] - snapHeights[1]) / 2, snapHeights[2] - snapHeights[1]], outputRange: [0, 1], extrapolate: 'clamp' }),
  } : {
    position: 'absolute' as const,
    // The summary is a panel of its own, measured once; the pre-start card is
    // dragged, and its lift reads 0 once a walk is over.
    bottom: (status === 'finished' ? panelHeight : readyMin) + space.md,
    transform: [{ translateY: readyLifted }],
    opacity: sheetY.interpolate({ inputRange: [0, 1], outputRange: [1, 1] }),
  };

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.featureSurface, zIndex: 320 }]}>
      {NATIVE_MAP_AVAILABLE ? (
        // Following stops on a real drag or pinch only. The map's camera
        // events alone can't tell the fit-to-route or a follow step from a
        // gesture, and taking them for one switched following off before the
        // first fix arrived, leaving the walker off screen. A camera move
        // counts only while a finger is down; the move check covers maps
        // whose native pan swallows the camera event.
        <View
          style={StyleSheet.absoluteFill}
          onTouchStart={(event) => {
            const { pageX, pageY } = event.nativeEvent;
            touchStart.current = { x: pageX, y: pageY };
            fingerDown.current = true;
          }}
          onTouchMove={(event) => {
            const start = touchStart.current;
            const { pageX, pageY, touches } = event.nativeEvent;
            if (!start) return;
            if (touches.length > 1 || Math.hypot(pageX - start.x, pageY - start.y) > 10) {
              touchStart.current = null;
              setFollowing(false);
            }
          }}
          onTouchEnd={() => { touchStart.current = null; fingerDown.current = false; }}
          onTouchCancel={() => { touchStart.current = null; fingerDown.current = false; }}
        >
        <NativeMap
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          initialCenter={initialCenter}
          initialZoom={route ? 13 : FOLLOW_ZOOM}
          initialFitCoordinates={route && route.coords.length >= 2 ? route.coords : undefined}
          initialPadding={[topChrome + space.lg, 40, bottomInset + space.lg, 40]}
          mapStyle={mapStyle}
          polylines={polylines}
          markers={markers}
          showUserLocation={Platform.OS === 'ios'}
          onUserLocationChange={(coordinate) => {
            mapLocation.current = coordinate;
            // Until the recorder has a fix, the map's dot leads the camera.
            if (!fix && following && Date.now() - lastFollowAt.current > 1500) {
              lastFollowAt.current = Date.now();
              mapRef.current?.moveCamera(coordinate, Math.max(zoomRef.current, 14), 600, { edgePadding: followPadding() });
            }
          }}
          onZoomChange={(zoom) => { zoomRef.current = zoom; onMapScaleZoom(zoom); onLayerZoom(zoom); }}
          onGestureStart={() => { if (fingerDown.current) setFollowing(false); }}
          onCameraChange={onMapOrientation}
        />
        </View>
      ) : (
        <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xl, paddingBottom: bottomInset }]}>
          <Text style={[type.body, { color: theme.text2, textAlign: 'center' }]}>{t('trail.noMap')}</Text>
        </View>
      )}

      {/* Top: minimise, and while paused a pill saying so — the map is most of
          the screen, and a pause mistaken for recording loses a stretch of track. */}
      <View style={{ position: 'absolute', top: insets.top + space.xs, left: space.md }}>
        <MapControlButton theme={theme} element={<Icon name="chevronDown" color={theme.text} size={28} />} onPress={trail.closeTrail} accessibilityLabel={t('trail.action.minimize')} />
      </View>
      {status === 'paused' && session ? <PausedPill theme={theme} pausedAt={session.pausedAt ?? null} top={insets.top + space.xs} /> : null}
      {status === 'recording' || status === 'ready' ? <GpsPill theme={theme} gps={gps} top={insets.top + space.xs} /> : null}

      {/* The scale under the top-right of the chrome while the map zooms; a
          banner, drawn after it, takes precedence. */}
      <View pointerEvents="none" style={{ position: 'absolute', right: space.md, top: topChrome + space.xs, alignItems: 'flex-end' }}>
        <MapScaleBar scale={mapScale} theme={theme} />
      </View>

      {/* One banner at a time under the chrome; being lost outranks arriving. */}
      {status === 'finished' ? null : offRoute && progress ? (
        <Banner theme={theme} icon="info" tone="danger" title={t('trail.offRoute', { distance: formatMeters(progress.offsetM) })} body={t('trail.offRouteHint')} top={topChrome + space.xs} />
      ) : arrived ? (
        <Banner theme={theme} icon="check" tone="accent" title={t('trail.arrived')} top={topChrome + space.xs} />
      ) : null}

      {/* Map controls on top of the card: the compass in the bottom-left
          corner as Apple Maps has it, the rest down the right edge. */}
      <Animated.View pointerEvents={controlsPointerEvents} style={[controlsRide, { left: space.md, alignItems: 'flex-start' }]}>
        {/* Only while the map is turned: north-up has nothing to reset. */}
        <MapCompassReveal visible={mapOffNorth}>
          <MapRoundButton
            theme={theme}
            heading={mapHeading}
            onPress={() => mapRef.current?.resetNorth()}
            accessibilityLabel={t('trail.action.north')}
          />
        </MapCompassReveal>
      </Animated.View>
      <Animated.View pointerEvents={controlsPointerEvents} style={[controlsRide, { right: space.md, alignItems: 'flex-end' }]}>
        {/* Above the map controls, on its own: it adds to the walk rather than
            moving the map. Only while there is a walk to add to. */}
        {live ? (
          <MapControlGroup theme={theme} style={{ marginBottom: space.sm }}>
            <MapControlButton theme={theme} icon="camera" active={marking} onPress={() => void markHere()} accessibilityLabel={t('trail.action.mark')} />
          </MapControlGroup>
        ) : null}
        <MapControlGroup theme={theme}>
          <MapControlButton
            theme={theme}
            icon="layers"
            active={layersOpen}
            onPress={() => setLayersOpen(true)}
            accessibilityLabel={t('trail.action.layers')}
          />
          <MapControlButton theme={theme} icon={following ? 'locate' : 'locateOutline'} active={following} onPress={followMe} accessibilityLabel={t('trail.action.follow')} />
        </MapControlGroup>
      </Animated.View>

      {live && session ? (
        <>
          <TrailSheet
            theme={theme}
            snapHeights={snapHeights}
            initialIndex={1}
            onIndexChange={setSheetIndex}
            header={null}
            dismissOnDrag={false}
            backgroundColor={theme.featureSurface}
            borderless
            bottomAccessory={liveFooter}
            animatedTranslateY={sheetY}
            containerStyle={{ borderTopLeftRadius: 26, borderTopRightRadius: 26, boxShadow: theme.dark ? '0px -2px 16px rgba(0,0,0,0.4)' : '0px -2px 16px rgba(0,0,0,0.08)' }}
          >
            <LiveSheetBody
              theme={theme}
              session={session}
              fix={fix}
              error={error}
              progress={progress}
              routeFraction={routeFraction}
              remainingAscentM={route && progress && route.elevation ? remainingAscent(route.elevation, routeFraction * profileKm * 1000) : null}
              waypoint={guide.nextWaypoint}
              movingMs={movingMs}
              voice={guide.voiceAvailable ? guide.voice : null}
              onVoice={toggleVoice}
              footerHeight={footerHeight}
              compact={sheetIndex === 0}
              onPause={() => void pauseTrail()}
              compactOpacity={sheetY.interpolate({ inputRange: [(snapHeights[2] - snapHeights[1]) + (snapHeights[1] - snapHeights[0]) / 2, snapHeights[2] - snapHeights[0]], outputRange: [0, 1], extrapolate: 'clamp' })}
              onQuickHeight={setQuickHeight}
              onMidHeight={setMidHeight}
              restOpacity={sheetY.interpolate({ inputRange: [snapHeights[2] - snapHeights[1], snapHeights[2] - snapHeights[0]], outputRange: [1, 0], extrapolate: 'clamp' })}
              settingsActive={sheetIndex >= 2}
              settingsOpacity={sheetY.interpolate({ inputRange: [0, snapHeights[2] - snapHeights[1]], outputRange: [1, 0], extrapolate: 'clamp' })}
            />
          </TrailSheet>
        </>
      ) : status !== 'finished' ? (
        // Before starting the card is docked edge to edge, the same shape as
        // the recording sheet, so 开始 doesn't change the card's outline. It is
        // as tall as the open card: the settings wait past the bottom edge and
        // come up with the drag, and 收起 leaves the row band on screen. The
        // spare padding below them is what an over-drag past 展开 spends.
        <Animated.View
          {...readyDrag.panHandlers}
          onLayout={(event) => setReadyHeight(Math.round(event.nativeEvent.layout.height))}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            transform: [{ translateY: readySlide }],
            paddingBottom: readyOver,
            borderTopLeftRadius: 26,
            borderTopRightRadius: 26,
            backgroundColor: theme.featureSurface,
            boxShadow: theme.dark ? '0px -2px 16px rgba(0,0,0,0.4)' : '0px -2px 16px rgba(0,0,0,0.08)',
          }}
        >
          <ReadyPanel
            theme={theme}
            expanded={readyOpen}
            onToggle={() => restReady(!readyOpen)}
            onHiddenHeight={setReadyHidden}
            routeName={route?.name}
            totalM={measure?.totalMeters ?? null}
            ascentM={route?.elevation ? remainingAscent(route.elevation, 0) : null}
            toStartM={route && fix ? distanceMeters([fix.lng, fix.lat], route.coords[0]) : null}
            error={error}
            starting={starting}
            onStart={() => void start()}
            voice={guide.voiceAvailable ? guide.voice : null}
            onVoice={toggleVoice}
            overlayHint={overlayHint}
            onOverlays={() => setOverlayPicker(true)}
          />
        </Animated.View>
      ) : (
        <View
          onLayout={(event) => setPanelHeight(Math.round(event.nativeEvent.layout.height))}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            paddingTop: space.lg,
            paddingHorizontal: space.lg,
            paddingBottom: insets.bottom + space.md,
            borderTopLeftRadius: 26,
            borderTopRightRadius: 26,
            backgroundColor: theme.featureSurface,
            boxShadow: theme.dark ? '0px -2px 16px rgba(0,0,0,0.4)' : '0px -2px 16px rgba(0,0,0,0.08)',
          }}
        >
          {session ? <TrailSummary theme={theme} session={session} arrived={arrived} /> : null}
        </View>
      )}

      <MarkDetail
        theme={theme}
        items={markItems}
        index={openMark}
        onClose={() => setOpenMark(null)}
        // Swiping the card moves the pin, and the map with it.
        onPageChange={(page) => setOpenMark(page)}
        onRename={(item, name) => void renameTrailMark(item.key, name)}
        onDelete={(item) => void removeTrailMark(item.key)}
      />
      <MarkDetail
        theme={theme}
        items={waypointItems}
        index={waypointLine && openWaypoint != null ? openWaypoint - waypointLine.start : null}
        onClose={() => setOpenWaypoint(null)}
        onPageChange={(page) => setOpenWaypoint((waypointLine?.start ?? 0) + page)}
      />

      <TrailOverlaySheet
        theme={theme}
        visible={overlayPicker}
        tracks={overlayCandidates}
        selectedIds={overlayIds}
        colors={OVERLAY_COLORS}
        onClose={(ids) => {
          setOverlayPicker(false);
          setTrailOverlays(ids);
        }}
      />

      {layersOpen ? (
        <MapStylePickerSheet
          theme={theme}
          title={t('journey.map.layerTitle')}
          closeLabel={t('common.close')}
          styleOptions={([
            { id: 'standard', label: t('journey.map.layerStandard') },
            { id: 'satellite', label: t('journey.map.layerSatellite') },
          ] satisfies { id: MapPresentationStyle; label: string }[])}
          value={mapStyle}
          sections={[{
            id: 'trail-display',
            title: t('journey.map.displayTitle'),
            options: [
              {
                id: 'distance-markers',
                label: t('journey.map.trackDistanceMarkers'),
                value: layers.km,
                onChange: (on: boolean) => setTrailLayer('km', on),
              },
              {
                id: 'waypoints',
                label: t('journey.map.trackWaypointMarkers'),
                value: layers.waypoints,
                onChange: (on: boolean) => setTrailLayer('waypoints', on),
              },
            ],
          }, {
            id: 'trail-overlays',
            title: t('trail.overlay.title'),
            options: [
              ...overlayTracks.map((track, index) => ({
                id: track.id,
                label: track.name,
                distance: track.distM != null ? formatTrackDistance(track.distM) : undefined,
                color: OVERLAY_COLORS[index % OVERLAY_COLORS.length],
                visible: true,
                // Off means gone: an overlay keeps no separate hidden state.
                onChange: (on: boolean) => {
                  if (!on) setTrailOverlays(overlayIds.filter((id) => id !== track.id));
                },
              })),
              {
                id: 'add-overlay',
                label: t('trail.overlay.add'),
                accent: true,
                hint: overlayTracks.length ? undefined : overlayHint,
                // Swap panels rather than stack them: the picker is a Modal
                // and would leave this one waiting underneath.
                onPress: () => {
                  setLayersOpen(false);
                  setOverlayPicker(true);
                },
              },
            ],
          }]}
          bottomInset={insets.bottom}
          onChange={setMapStyle}
          onClose={() => setLayersOpen(false)}
        />
      ) : null}

      <AppActionDialog
        theme={theme}
        visible={lockGuide}
        title={t('trail.lockGuide.title')}
        message={t('trail.lockGuide.message')}
        confirmLabel={t('trail.lockGuide.open')}
        cancelLabel={t('trail.lockGuide.later')}
        onConfirm={() => closeLockGuide(true)}
        onCancel={() => closeLockGuide(false)}
      />

    </View>
  );
}

function formatMeters(meters: number): string {
  const { value, unit } = splitDistance(meters);
  return `${value} ${unit}`;
}

function pausedDuration(ms: number, t: ReturnType<typeof useI18n>['t']): string | null {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return t('trail.voice.minutes', { m });
  return m === 0 ? t('trail.voice.hours', { h }) : t('trail.voice.hoursMinutes', { h, m });
}

// Display only: 继续 is the big button at the bottom. Counts whole minutes, so
// it re-renders itself on a slow tick instead of driving the page's clock.
function PausedPill({ theme, pausedAt, top }: { theme: Theme; pausedAt: number | null; top: number }) {
  const { t } = useI18n();
  const [now, setNow] = useState(() => Date.now());
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (pausedAt == null) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, [pausedAt]);

  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled || reduce) return;
      loop = Animated.loop(Animated.sequence([
        Animated.timing(pulse, { toValue: 0.35, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
      ]));
      loop.start();
    }).catch(() => undefined);
    return () => {
      cancelled = true;
      loop?.stop();
      pulse.setValue(1);
    };
  }, [pulse]);

  const duration = pausedAt != null ? pausedDuration(now - pausedAt, t) : null;
  const label = duration ? t('trail.pausedFor', { time: duration }) : t('trail.status.paused');
  return (
    <TopPill theme={theme} label={label} top={top}>
      <Animated.View style={{ opacity: pulse }}>
        <Icon name="play" color={theme.text} size={14} />
      </Animated.View>
    </TopPill>
  );
}

// Ready and recording, never in the sheet: it faded out at the lowest detent, the one
// most walks are spent at. No pulse — on the paused pill that means "not
// recording". Paused, that pill takes this spot instead.
function GpsPill({ theme, gps, top }: { theme: Theme; gps: string; top: number }) {
  const { t } = useI18n();
  if (gps !== 'searching' && gps !== 'weak') return null;
  return (
    <TopPill theme={theme} label={t(`trail.status.${gps}`)} top={top}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: gps === 'weak' ? theme.danger : theme.text3 }} />
    </TopPill>
  );
}

// Centred between the minimise button and the right-hand controls.
function TopPill({ theme, label, top, children }: { theme: Theme; label: string; top: number; children: ReactNode }) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top, left: space.md + 48, right: space.md + 48, height: 40, alignItems: 'center', justifyContent: 'center' }}>
      <View
        accessible
        accessibilityRole="text"
        accessibilityLabel={label}
        accessibilityLiveRegion="polite"
        style={{ height: 36, maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingHorizontal: space.md, borderRadius: 18, backgroundColor: theme.controlSurface, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.fieldBorder, boxShadow: theme.dark ? '0px 4px 12px rgba(0,0,0,0.38)' : '0px 4px 12px rgba(0,0,0,0.08)' }}
      >
        {children}
        <Text numberOfLines={1} style={[type.labelStrong, { color: theme.text, flexShrink: 1 }]}>{label}</Text>
      </View>
    </View>
  );
}

function Banner({ theme, icon, tone, title, body, top }: { theme: Theme; icon: IconName; tone: 'danger' | 'accent'; title: string; body?: string; top: number }) {
  const color = tone === 'danger' ? theme.danger : theme.accent;
  return (
    <View
      accessibilityLiveRegion="assertive"
      style={{ position: 'absolute', top, left: space.md, right: space.md, flexDirection: 'row', gap: space.sm, alignItems: 'flex-start', paddingVertical: space.sm, paddingHorizontal: space.md, borderRadius: radius.card, backgroundColor: theme.controlSurface, borderWidth: StyleSheet.hairlineWidth, borderColor: color, boxShadow: theme.dark ? '0px 4px 12px rgba(0,0,0,0.38)' : '0px 4px 12px rgba(0,0,0,0.08)' }}
    >
      <View style={{ paddingTop: 1 }}>
        <Icon name={icon} color={color} size={18} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[type.cardTitle, { color }]}>{title}</Text>
        {body ? <Text style={[type.hint, { color: theme.text2, marginTop: 2 }]}>{body}</Text> : null}
      </View>
    </View>
  );
}

// Before starting, after komoot: what is about to be recorded on the left,
// one pill to start on the right, and the settings under the grab handle —
// drag the card up (or tap the handle) to bring them on screen. No zeroed
// time and distance: they say nothing yet.
function ReadyPanel({
  theme,
  routeName,
  totalM,
  ascentM,
  toStartM,
  error,
  starting,
  onStart,
  voice,
  onVoice,
  overlayHint,
  onOverlays,
  expanded,
  onToggle,
  onHiddenHeight,
}: {
  theme: Theme;
  routeName?: string;
  totalM: number | null;
  ascentM: number | null;
  toStartM: number | null;
  error: Parameters<typeof ErrorLine>[0]['error'] | null;
  starting: boolean;
  onStart: () => void;
  voice: boolean | null;
  onVoice: () => void;
  overlayHint: string;
  onOverlays: () => void;
  expanded: boolean;
  onToggle: () => void;
  onHiddenHeight: (height: number) => void;
}) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  // The band the card ends on: under the row when 收起, under the settings when
  // open. It belongs to the row so the fold lands exactly at the card's edge.
  const band = Math.max(insets.bottom, space.md);
  const isRoute = routeName != null;
  const { width: windowWidth } = useWindowDimensions();
  // The live grid's column, so 里程 sits where it will once the numbers run.
  const statColumn = (windowWidth - space.lg * 2) / 3;
  const zeroDistance = splitDistance(0);
  const facts = isRoute
    ? [
      totalM != null ? `${t('trail.fact.total')} ${formatMeters(totalM)}` : null,
      ascentM != null ? `${t('trail.fact.ascent')} ${ascentM} m` : null,
      toStartM != null ? `${t('trail.fact.toStart')} ${formatMeters(toStartM)}` : null,
    ].filter(Boolean).join('   ')
    : '';

  return (
    <View>
      {/* 叠加轨迹 is always there, so the handle always is. */}
      <View style={{ paddingHorizontal: space.lg, paddingBottom: band }}>
        <Press
          onPress={onToggle}
          accessibilityRole="button"
          accessibilityLabel={t('trail.settings.title')}
          accessibilityState={{ expanded }}
          hitSlop={8}
          style={{ alignSelf: 'stretch', alignItems: 'center', paddingTop: space.xs, paddingBottom: space.sm }}
        >
          <View style={{ width: 30, height: 4, borderRadius: 2, backgroundColor: theme.fieldBorder }} />
        </Press>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            {/* A free walk has nothing to say before it starts, so it shows the
                live row at zero: on 开始 the same numbers begin to run in place.
                The columns are the live grid's, so 里程 doesn't move on 开始. */}
            {isRoute ? (
              <Text numberOfLines={2} style={[type.cardTitle, { color: theme.text }]}>{routeName}</Text>
            ) : (
              <View accessible accessibilityLabel={t('trail.freeTitle')} style={{ flexDirection: 'row' }}>
                <View style={{ width: statColumn, minWidth: 0, paddingRight: space.sm }}>
                  <LiveValue theme={theme} dim label={t('trail.stat.time')} value={formatClock(0)} />
                </View>
                <View style={{ width: statColumn, minWidth: 0, paddingRight: space.sm }}>
                  <LiveValue theme={theme} dim label={t('trail.stat.distance')} value={zeroDistance.value} unit={zeroDistance.unit} />
                </View>
              </View>
            )}
            {facts ? <Text numberOfLines={1} style={[type.small, { color: theme.text2, marginTop: space.xxs, fontVariant: ['tabular-nums'] }]}>{facts}</Text> : null}
          </View>
          <Press
            onPress={onStart}
            disabled={starting}
            accessibilityRole="button"
            accessibilityLabel={isRoute ? t('trail.startRoute') : t('trail.startFree')}
            accessibilityState={{ busy: starting }}
            style={{ height: 52, paddingHorizontal: space.xl, borderRadius: radius.pill, backgroundColor: theme.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, opacity: starting ? 0.6 : 1 }}
          >
            <Icon name="play" color="#FFFFFF" size={18} />
            <Text style={[type.quickReply, { color: '#FFFFFF' }]}>{starting ? t('trail.starting') : t('trail.action.start')}</Text>
          </Press>
        </View>
        {isRoute && toStartM != null && toStartM > 500 ? (
          <Text style={[type.hint, { color: theme.text2, marginTop: space.xs }]}>{t('trail.farFromStart', { distance: formatMeters(toStartM) })}</Text>
        ) : null}
        {!trailBackgroundSupported() ? (
          <Text style={[type.hint, { color: theme.text3, marginTop: space.xs }]}>{t('trail.foregroundOnly')}</Text>
        ) : null}
        {error ? <ErrorLine theme={theme} error={error} /> : null}
      </View>
      {/* Under the screen's bottom edge until the card is dragged up, so the
          fold lands exactly after the row band and these rows keep their own
          room from the home indicator once the card is open. */}
      <View
        onLayout={(event) => onHiddenHeight(Math.round(event.nativeEvent.layout.height))}
        accessibilityElementsHidden={!expanded}
        importantForAccessibility={expanded ? 'auto' : 'no-hide-descendants'}
        style={{ paddingHorizontal: space.lg, paddingBottom: band }}
      >
        <OverlayRow theme={theme} hint={overlayHint} onPress={onOverlays} />
        <LayerRows theme={theme} />
        {voice != null ? (
          <SettingRow theme={theme} icon="volume" title={t('trail.settings.voice')} hint={t('trail.settings.voiceHint')}>
            <Switch
              accessibilityLabel={t('trail.settings.voice')}
              value={voice}
              onValueChange={onVoice}
              trackColor={{ false: theme.progressTrack, true: theme.accent }}
              thumbColor="#FFFFFF"
              ios_backgroundColor={theme.progressTrack}
              style={{ alignSelf: 'center' }}
            />
          </SettingRow>
        ) : null}
      </View>
    </View>
  );
}

function ErrorLine({ theme, error }: { theme: Theme; error: 'permission' | 'services_disabled' | 'unavailable' }) {
  const { t } = useI18n();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: space.sm, gap: space.xs }}>
      <Text style={[type.hint, { color: theme.danger }]}>{t(`trail.error.${error}`)}</Text>
      {error !== 'unavailable' ? (
        <Press onPress={() => void Linking.openSettings()} accessibilityRole="link" hitSlop={12}>
          <Text style={[type.hint, { color: theme.accent, fontWeight: '700' }]}>{t('trail.error.openSettings')}</Text>
        </Press>
      ) : null}
    </View>
  );
}

type LiveSheetProps = {
  theme: Theme;
  session: TrailSession;
  fix: TrailFix | null;
  error: Parameters<typeof ErrorLine>[0]['error'] | null;
  progress: RouteProgress | null;
  routeFraction: number;
  remainingAscentM: number | null;
  waypoint: { name: string; aheadM: number } | null;
  movingMs: number;
  voice: boolean | null;
  onVoice: () => void;
  footerHeight: number;
  compact: boolean;
  onPause: () => void;
  compactOpacity: Animated.AnimatedInterpolation<number>;
  onQuickHeight: (height: number) => void;
  onMidHeight: (height: number) => void;
  restOpacity: Animated.AnimatedInterpolation<number>;
  settingsOpacity: Animated.AnimatedInterpolation<number>;
  settingsActive: boolean;
};

// The live sheet's content, top to bottom in the order the detents reveal it.
// The first two blocks are measured: the lowest detent ends under the quick
// row, the middle one under the numbers and profile.
function LiveSheetBody({
  theme,
  session,
  fix,
  error,
  progress,
  routeFraction,
  remainingAscentM,
  waypoint,
  movingMs,
  voice,
  onVoice,
  footerHeight,
  compact,
  onPause,
  compactOpacity,
  onQuickHeight,
  onMidHeight,
  restOpacity,
  settingsOpacity,
  settingsActive,
}: LiveSheetProps) {
  const { t } = useI18n();
  const { width: windowWidth } = useWindowDimensions();
  const route = session.route;
  const paused = session.status === 'paused';
  const { distM, ascM, descM, maxAlt } = session.totals;
  // One size for every number in the grid, so they line up: as big as lets
  // the widest value, an h:mm:ss clock, fit a third of the sheet. Shrinking
  // cells one by one left the clock smaller than its neighbours and, on
  // Android, off their baseline.
  const columnWidth = (windowWidth - space.lg * 2) / 3 - space.sm;
  const valueSize = Math.max(22, Math.min(type.liveValueLarge.fontSize, Math.floor(columnWidth / (7 * 0.62))));
  const distance = splitDistance(distM);
  const remaining = splitDistance(progress?.remainingM);
  const pace = formatPace(distM, movingMs);
  const speed = !paused && fix?.speed != null ? (fix.speed * 3.6).toFixed(1) : '--';
  const avgSpeed = distM >= 50 && movingMs >= 60_000 ? (distM / 1000 / (movingMs / 3_600_000)).toFixed(1) : '--';
  const altitude = fix?.alt != null ? Math.round(fix.alt).toLocaleString('en-US') : '--';
  const highest = maxAlt != null ? Math.round(maxAlt).toLocaleString('en-US') : '--';
  // A free walk draws the climb it has recorded so far.
  const recordedProfile = useMemo(
    () => (route ? null : recordedElevation(session.segments)),
    // Segments grow in place; the point count says when.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [route, session.id, session.segments.length, session.totals.pointCount],
  );
  const profile = route?.elevation && route.elevation.length >= 2 ? route.elevation : recordedProfile;

  const stat = (label: string, value: string, unit?: string) => (
    <Stat theme={theme} dim={paused} label={label} value={value} unit={value !== '--' ? unit : undefined} size={valueSize} />
  );
  // On a route what is left leads; on a free walk, how fast. All of them fit
  // the middle detent, which leaves out only the settings.
  const stats = route
    ? [
      stat(t('trail.stat.remaining'), progress ? remaining.value : '--', remaining.unit),
      stat(t('trail.stat.remainingAscent'), remainingAscentM != null ? String(remainingAscentM) : '--', 'm'),
      stat(t('trail.stat.pace'), pace, '/km'),
      stat(t('trail.stat.altitude'), altitude, 'm'),
      stat(t('trail.stat.descent'), String(Math.round(descM)), 'm'),
      stat(t('trail.stat.speed'), speed, 'km/h'),
    ]
    : [
      stat(t('trail.stat.pace'), pace, '/km'),
      stat(t('trail.stat.speed'), speed, 'km/h'),
      stat(t('trail.stat.avgSpeed'), avgSpeed, 'km/h'),
      stat(t('trail.stat.altitude'), altitude, 'm'),
      stat(t('trail.stat.maxAltitude'), highest, 'm'),
      stat(t('trail.stat.descent'), String(Math.round(descM)), 'm'),
    ];

  return (
    <View style={{ paddingHorizontal: space.lg }}>
      <View onLayout={(event) => onMidHeight(Math.round(event.nativeEvent.layout.height))}>
        {/* Time and distance hold their columns at every detent; only the
            third trades places: 爬升 above the lowest detent, and there the
            pause button (paused, 继续 waits in the footer, so 爬升 stays). */}
        <View onLayout={(event) => onQuickHeight(Math.round(event.nativeEvent.layout.height))} style={{ paddingTop: space.xs, paddingBottom: space.md }}>
          <StatGrid>
            {[
              stat(t('trail.stat.time'), formatClock(movingMs)),
              stat(route ? t('trail.stat.walked') : t('trail.stat.distance'), distance.value, distance.unit),
              paused ? stat(t('trail.stat.ascent'), String(Math.round(ascM)), 'm') : (
                <View>
                  <Animated.View
                    accessibilityElementsHidden={compact}
                    importantForAccessibility={compact ? 'no-hide-descendants' : 'auto'}
                    style={{ opacity: Animated.subtract(1, compactOpacity) }}
                  >
                    {stat(t('trail.stat.ascent'), String(Math.round(ascM)), 'm')}
                  </Animated.View>
                  <Animated.View
                    pointerEvents={compact ? 'box-none' : 'none'}
                    accessibilityElementsHidden={!compact}
                    importantForAccessibility={compact ? 'auto' : 'no-hide-descendants'}
                    style={{ position: 'absolute', top: 0, bottom: 0, right: -space.sm, justifyContent: 'center', opacity: compactOpacity }}
                  >
                    <Press
                      onPress={onPause}
                      accessibilityRole="button"
                      accessibilityLabel={t('trail.action.pause')}
                      style={{ width: 96, height: 52, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.fieldSurface }}
                    >
                      <Icon name="pause" color={theme.text} size={20} />
                    </Press>
                  </Animated.View>
                </View>
              ),
            ]}
          </StatGrid>
        </View>
        {/* Below the quick row everything fades out toward the lowest detent:
            the sheet runs on under the footer, where the top of the grid would
            otherwise peek out. */}
        <Animated.View style={{ opacity: restOpacity }}>
          <StatGrid>{stats}</StatGrid>
          {profile ? (
            <View style={{ marginTop: space.xl }}>
              <TrailProfile theme={theme} profile={profile} fraction={route ? routeFraction : 1} />
            </View>
          ) : route ? (
            <View style={{ marginTop: space.xl }}>
              <AppProgressBar theme={theme} value={routeFraction * 100} />
            </View>
          ) : null}
          {waypoint ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs, marginTop: space.md }}>
              <Icon name="pin" color={theme.text2} size={15} />
              <Text numberOfLines={1} style={[type.small, { color: theme.text, flexShrink: 1, fontWeight: '600' }]}>{t('trail.nextWaypoint', { name: waypoint.name })}</Text>
              <Text style={[type.small, { color: theme.text2, fontVariant: ['tabular-nums'] }]}>{t('trail.nextWaypointAhead', { distance: formatMeters(waypoint.aheadM) })}</Text>
            </View>
          ) : null}
          {!session.background ? <Text style={[type.hint, { color: theme.text3, marginTop: space.sm }]}>{t('trail.foregroundOnly')}</Text> : null}
          {error ? <ErrorLine theme={theme} error={error} /> : null}
        </Animated.View>
      </View>

      {/* Only fully open shows the settings, as a list under a rule; at the
          middle detent they would sit in the space left above the footer. */}
      <Animated.View pointerEvents={settingsActive ? 'auto' : 'none'} style={{ opacity: settingsOpacity }}>
        <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.fieldBorder, marginTop: space.xl, marginBottom: space.xs }} />
        <LayerRows theme={theme} />
        {voice != null ? (
          <SettingRow theme={theme} icon="volume" title={t('trail.settings.voice')} hint={t('trail.settings.voiceHint')}>
            <Switch
              accessibilityLabel={t('trail.settings.voice')}
              value={voice}
              onValueChange={onVoice}
              trackColor={{ false: theme.progressTrack, true: theme.accent }}
              thumbColor="#FFFFFF"
              ios_backgroundColor={theme.progressTrack}
              style={{ alignSelf: 'center' }}
            />
          </SettingRow>
        ) : null}
      </Animated.View>
      <View style={{ height: footerHeight }} />
    </View>
  );
}

// Elevation against distance walked, from the recorded points that carry an
// altitude; thinned to a few hundred samples, which is all a phone-wide chart
// can show. Pauses split segments, and the gap between them isn't walked.
function recordedElevation(segments: TrailSession['segments']): { km: number; ele: number }[] | null {
  const total = segments.reduce((sum, segment) => sum + segment.length, 0);
  const step = Math.max(1, Math.ceil(total / 240));
  const samples: { km: number; ele: number }[] = [];
  let meters = 0;
  let index = 0;
  for (const segment of segments) {
    for (let i = 0; i < segment.length; i += 1, index += 1) {
      const [lng, lat, alt] = segment[i];
      if (i > 0) meters += distanceMeters([segment[i - 1][0], segment[i - 1][1]], [lng, lat]);
      if (alt != null && (index % step === 0 || index === total - 1)) samples.push({ km: meters / 1000, ele: alt });
    }
  }
  return samples.length >= 2 && samples[samples.length - 1].km > 0 ? samples : null;
}

// The zeroed time and distance a free walk shows before it starts.
function LiveValue({ theme, label, value, unit, dim }: { theme: Theme; label: string; value: string; unit?: string; dim?: boolean }) {
  return (
    <View style={{ minWidth: 0, flexShrink: 1 }} accessible accessibilityLabel={`${label} ${value}${unit ? ` ${unit}` : ''}`}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
        <Text numberOfLines={1} adjustsFontSizeToFit style={[type.liveValue, { color: dim ? theme.text3 : theme.text }]}>{value}</Text>
        {unit ? <Text style={[type.liveUnit, { color: theme.text2 }]}>{unit}</Text> : null}
      </View>
      <Text numberOfLines={1} style={[type.caption, { color: theme.text2, marginTop: 2 }]}>{label}</Text>
    </View>
  );
}

// Three to a row, after AllTrails: a big number with its unit, the label under it.
function StatGrid({ children }: { children: React.ReactNode[] }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: space.lg }}>
      {children.map((child, index) => <View key={index} style={{ width: '33.333%', paddingRight: space.sm }}>{child}</View>)}
    </View>
  );
}

function Stat({ theme, label, value, unit, dim, size }: { theme: Theme; label: string; value: string; unit?: string; dim?: boolean; size: number }) {
  const empty = value === '--';
  return (
    <View accessible accessibilityLabel={`${label} ${value}${unit ? ` ${unit}` : ''}`}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
        <Text numberOfLines={1} style={[type.liveValueLarge, { fontSize: size, lineHeight: Math.round(size * 1.2), flexShrink: 1, color: dim ? theme.text2 : empty ? theme.text3 : theme.text }]}>{value}</Text>
        {unit ? <Text style={[type.liveUnit, { color: theme.text2 }]}>{unit}</Text> : null}
      </View>
      <Text numberOfLines={1} style={[type.small, { color: theme.text2, marginTop: 2 }]}>{label}</Text>
    </View>
  );
}

/** The route card's 距离标记 and 标注点 switches. They read and write the
    shared trail-layer setting themselves, so both panels show the same. */
function LayerRows({ theme }: { theme: Theme }) {
  const { t } = useI18n();
  const layers = useSyncExternalStore(subscribeTrailLayers, getTrailLayers, getTrailLayers);
  const rows: { key: 'km' | 'waypoints'; icon: IconName; title: string; hint: string }[] = [
    { key: 'km', icon: 'distance', title: t('trail.layers.km'), hint: t('trail.layers.kmHint') },
    { key: 'waypoints', icon: 'pin', title: t('trail.layers.waypoints'), hint: t('trail.layers.waypointsHint') },
  ];
  return (
    <>
      {rows.map((row) => (
        <SettingRow key={row.key} theme={theme} icon={row.icon} title={row.title} hint={row.hint}>
          <Switch
            accessibilityLabel={row.title}
            value={layers[row.key]}
            onValueChange={(on) => setTrailLayer(row.key, on)}
            trackColor={{ false: theme.progressTrack, true: theme.accent }}
            thumbColor="#FFFFFF"
            ios_backgroundColor={theme.progressTrack}
            style={{ alignSelf: 'center' }}
          />
        </SettingRow>
      ))}
    </>
  );
}

function OverlayRow({ theme, hint, onPress }: { theme: Theme; hint: string; onPress: () => void }) {
  const { t } = useI18n();
  return (
    <Press onPress={onPress} accessibilityRole="button" accessibilityLabel={`${t('trail.overlay.title')} ${hint}`}>
      <SettingRow theme={theme} icon="layers" title={t('trail.overlay.title')} hint={hint}>
        <Icon name="chevronR" color={theme.text3} size={20} />
      </SettingRow>
    </Press>
  );
}

// A marked spot on the map: a number, as 两步路 numbers its 标注. Text only,
// since Android snapshots marker views and the endpoint badges draw this way.
function MarkBadge({ theme, label }: { theme: Theme; label: string }) {
  return (
    <View style={{ minWidth: 24, height: 24, paddingHorizontal: 5, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.accent, borderWidth: 2, borderColor: '#FFFFFF' }}>
      <Text style={{ fontSize: 12, fontWeight: '800', color: '#FFFFFF', fontVariant: ['tabular-nums'] }}>{label}</Text>
    </View>
  );
}

function SettingRow({ theme, icon, title, hint, children }: { theme: Theme; icon: IconName; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={{ minHeight: layout.listRowMinHeight, paddingVertical: space.xs, flexDirection: 'row', alignItems: 'center', gap: space.md }}>
      <Icon name={icon} color={theme.text} size={24} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[type.cardTitle, { color: theme.text, fontWeight: '500' }]}>{title}</Text>
        {hint ? <Text numberOfLines={1} style={[type.meta, { color: theme.text2 }]}>{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function hashString(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) hash = ((hash << 5) + hash + value.charCodeAt(i)) | 0;
  return (hash >>> 0).toString(36);
}
