// TrailNavigationPage.tsx — 徒步导航: follow a planned route or record freely.
//
// The map owns the whole screen and the chrome floats on it (DESIGN.md §1.8):
// minimise at the top left, one column of map controls on the right, and
// everything else in a card at the bottom.
//
// Before starting and once finished the card is a plain panel. While
// recording it is a sheet with three detents, after AllTrails and Komoot: the
// lowest shows only time, distance and pause, so the map gets the screen; the
// middle adds the live numbers (and the elevation profile on a route); fully
// open adds the rest and the settings. Paused, 继续 and 结束 sit pinned under
// the sheet at every detent. Spacing, not rules, separates the parts.
//
// Minimising never stops anything. The recording lives in trailRecorder.ts
// and a pill at the top of every screen leads back here (TrailMiniBar).
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, BackHandler, Linking, Platform, StyleSheet, Switch, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { platformLocationImage } from '../maps/locationImage';
import { AppProgressBar, motion, radius, space, type } from '../../design-system';
import { useI18n } from '../../i18n';
import { useNav } from '../../nav/NavContext';
import type { Theme } from '../../theme/theme';
import { useTrail, useTrailGuide, useTrailSnapshot } from '../../trail/TrailContext';
import { distanceMeters, JOURNEY_SEGMENT_COLORS, type Coordinate } from '../../lib/routeSegments';
import { formatClock, formatPace, remainingAscent, routeMeasure, splitDistance, type RouteProgress, type TrailFix } from '../../lib/trailGeo';
import { previewTrailVoice, setTrailVoice } from '../../lib/trailGuide';
import {
  clearTrailError,
  finishTrail,
  pauseTrail,
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
import { useMapPresentation } from '../maps/MapPresentationContext';
import { MapCompassGlyph, MapCompassReveal, useMapHeading } from '../maps/MapCompass';
import { NativeMap, NATIVE_MAP_AVAILABLE, type NativeMapHandle, type NativeMapMarker, type NativeMapPolyline } from '../maps/NativeMap';
import { Icon, type IconName } from '../Icon';
import { Press } from '../Press';
import { TrailProfile } from './TrailProfile';
import { TrailSummary } from './TrailSummary';

// The planned line in the same blue the route card uses for navigation.
const PLANNED_ROUTE_COLOR = JOURNEY_SEGMENT_COLORS[0];
const FOLLOW_ZOOM = 16;
const NO_MARKERS: NativeMapMarker[] = [];

export function TrailNavigationPage({ theme }: { theme: Theme }) {
  const { t } = useI18n();
  const nav = useNav();
  const insets = useSafeAreaInsets();
  const trail = useTrail();
  const { session, fix, gps, error } = useTrailSnapshot();
  const { mapStyle, setMapStyle } = useMapPresentation();
  const mapRef = useRef<NativeMapHandle>(null);
  const zoomRef = useRef(FOLLOW_ZOOM);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const fingerDown = useRef(false);
  // Where the map's own location dot is (Android), for "locate" before the
  // recorder has a fix of its own.
  const mapLocation = useRef<Coordinate | null>(null);
  const { height: windowHeight } = useWindowDimensions();
  const [panelHeight, setPanelHeight] = useState(280);
  const [sheetIndex, setSheetIndex] = useState(1);
  const sheetY = useRef(new Animated.Value(0)).current;
  // Measured so the lower two detents end exactly under their content.
  const [quickHeight, setQuickHeight] = useState(68);
  const [midHeight, setMidHeight] = useState(300);
  const [following, setFollowing] = useState(true);
  // Whether the camera still shows the whole route; the fit button is tinted
  // while it does, the way the locate button is while following.
  const [routeFramed, setRouteFramed] = useState(false);
  const { heading: mapHeading, offNorth: mapOffNorth, onOrientation: onMapOrientation } = useMapHeading();
  const [starting, setStarting] = useState(false);
  const [, setTick] = useState(0);

  const route = session ? session.route : trail.plannedRoute;
  const status = session?.status ?? 'ready';
  const live = session != null && (status === 'recording' || status === 'paused');
  const measure = useMemo(() => routeMeasure(route?.coords), [route?.coords]);

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
    if (route && route.coords.length >= 2) {
      lines.push({ id: `trail-route-${route.id}`, coordinates: route.coords, color: PLANNED_ROUTE_COLOR, width: 6, opacity: 0.9 });
    }
    recordedCoords.forEach((coordinates, index) => {
      if (coordinates.length >= 2) lines.push({ id: `trail-recorded-${index}`, coordinates, color: theme.trailMine, width: 4 });
    });
    return lines;
  }, [route, recordedCoords, theme.trailMine]);

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

  // "You are here". Android uses AMap's own location layer wearing the shared
  // marker's image: the marker itself is a snapshotted custom view there, and
  // on the trail map it did not show up on device. iOS draws the shared
  // marker from the recorder's fix.
  const headingKey = fix?.heading != null ? Math.round(fix.heading / 15) * 15 : null;
  const markers = useMemo<NativeMapMarker[]>(() => {
    if (Platform.OS === 'android' || !fix) return endpointMarkers;
    return [...endpointMarkers, {
      id: `trail-location-${headingKey ?? 'none'}`,
      coordinate: [fix.lng, fix.lat],
      anchor: { x: 0.5, y: 0.5 },
      zIndex: 10,
      content: <CurrentLocationMarker theme={theme} heading={headingKey ?? undefined} />,
    }];
  }, [endpointMarkers, fix, headingKey, theme]);

  const topChrome = insets.top + space.xs + 36;

  // ─── the live sheet ───────────────────────────────────────────────────────
  const sheetGrabber = 19; // TrailSheet's grab handle above the body
  const footerHeight = status === 'paused' ? space.sm + 52 + space.sm + insets.bottom : 0;
  const snapHeights = useMemo(() => {
    const min = sheetGrabber + quickHeight + space.xs + insets.bottom + footerHeight;
    const mid = Math.max(min + 40, sheetGrabber + midHeight + space.md + insets.bottom + footerHeight);
    const full = Math.max(mid + 40, windowHeight - topChrome - space.sm);
    return [min, mid, full];
  }, [quickHeight, midHeight, footerHeight, insets.bottom, windowHeight, topChrome]);
  useEffect(() => {
    if (!live) setSheetIndex(1);
  }, [live]);
  // Fully open covers the map, so the camera keeps framing for the middle.
  const bottomInset = live ? snapHeights[Math.min(sheetIndex, 1)] : panelHeight;
  const cameraPadding = useCallback((): [number, number, number, number] => [topChrome + space.lg, 40, bottomInset + space.lg, 40], [bottomInset, topChrome]);

  // Follow the walker; a pan or pinch hands the camera back to them.
  const lastFollowAt = useRef(0);
  useEffect(() => {
    if (!following || !fix) return;
    const now = Date.now();
    if (now - lastFollowAt.current < 1500) return;
    lastFollowAt.current = now;
    setRouteFramed(false);
    mapRef.current?.moveCamera([fix.lng, fix.lat], Math.max(zoomRef.current, 14), 600, { edgePadding: cameraPadding() });
  }, [fix, following, cameraPadding]);

  // Frame the finished walk once its summary has laid out, so the padding
  // knows how tall the panel is.
  const framedSessionId = useRef<string | null>(null);
  useEffect(() => {
    if (!finishedCoords || !session || panelHeight <= 0 || framedSessionId.current === session.id) return;
    framedSessionId.current = session.id;
    setFollowing(false);
    setRouteFramed(false);
    mapRef.current?.fitCoordinates(finishedCoords, cameraPadding(), motion.emphasized * 2);
  }, [finishedCoords, session, panelHeight, cameraPadding]);
  useEffect(() => {
    if (status !== 'finished') framedSessionId.current = null;
  }, [status]);

  const fitRoute = () => {
    if (!route || route.coords.length < 2) return;
    setFollowing(false);
    setRouteFramed(true);
    mapRef.current?.fitCoordinates(route.coords, cameraPadding(), motion.emphasized * 2);
  };

  const followMe = () => {
    setFollowing(true);
    setRouteFramed(false);
    lastFollowAt.current = 0;
    const here: Coordinate | null = fix ? [fix.lng, fix.lat] : mapLocation.current;
    if (here) mapRef.current?.moveCamera(here, FOLLOW_ZOOM, 600, { edgePadding: cameraPadding() });
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
    }
  };

  const movingMs = trailMovingMs(session);
  const toggleVoice = () => {
    const next = !guide.voice;
    setTrailVoice(next);
    if (next) previewTrailVoice();
  };
  const initialCenter: Coordinate = route?.coords[0] ?? (fix ? [fix.lng, fix.lat] : [116.39, 39.9]);

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
              setRouteFramed(false);
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
          platformLocationIndicator={Platform.OS === 'android'}
          platformLocationImage={platformLocationImage(theme.accent)}
          polylines={polylines}
          markers={markers}
          onUserLocationChange={(coordinate) => {
            mapLocation.current = coordinate;
            // Until the recorder has a fix, the map's dot leads the camera.
            if (!fix && following && Date.now() - lastFollowAt.current > 1500) {
              lastFollowAt.current = Date.now();
              setRouteFramed(false);
              mapRef.current?.moveCamera(coordinate, Math.max(zoomRef.current, 14), 600, { edgePadding: cameraPadding() });
            }
          }}
          onZoomChange={(zoom) => { zoomRef.current = zoom; }}
          onGestureStart={() => { if (fingerDown.current) { setFollowing(false); setRouteFramed(false); } }}
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
        <MapControl theme={theme} icon="chevronDown" onPress={trail.closeTrail} accessibilityLabel={t('trail.action.minimize')} />
      </View>
      {status === 'paused' && session ? <PausedPill theme={theme} pausedAt={session.pausedAt ?? null} top={insets.top + space.xs} /> : null}

      {/* One banner at a time under the chrome; being lost outranks arriving. */}
      {status === 'finished' ? null : offRoute && progress ? (
        <Banner theme={theme} icon="info" tone="danger" title={t('trail.offRoute', { distance: formatMeters(progress.offsetM) })} body={t('trail.offRouteHint')} top={topChrome + space.xs} />
      ) : arrived ? (
        <Banner theme={theme} icon="check" tone="accent" title={t('trail.arrived')} top={topChrome + space.xs} />
      ) : null}

      {/* Map controls down the right edge, riding on top of the card. On the
          live sheet they follow it as it is dragged and fade out before it
          reaches the top. */}
      <Animated.View
        pointerEvents={live && sheetIndex >= 2 ? 'none' : 'box-none'}
        style={live ? {
          position: 'absolute',
          right: space.md,
          bottom: snapHeights[2] + space.md,
          transform: [{ translateY: sheetY }],
          opacity: sheetY.interpolate({ inputRange: [(snapHeights[2] - snapHeights[1]) / 2, snapHeights[2] - snapHeights[1]], outputRange: [0, 1], extrapolate: 'clamp' }),
        } : { position: 'absolute', right: space.md, bottom: panelHeight + space.md }}
      >
        {/* Its own button above the group, and only while the map is turned:
            north-up has nothing to reset. */}
        <MapCompassReveal visible={mapOffNorth}>
          <Press
            onPress={() => mapRef.current?.resetNorth()}
            accessibilityRole="button"
            accessibilityLabel={t('trail.action.north')}
            style={{ width: 40, height: 40, borderRadius: 20, marginBottom: space.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.controlSurface, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.fieldBorder }}
          >
            <MapCompassGlyph heading={mapHeading} color={theme.text} />
          </Press>
        </MapCompassReveal>
        <View style={{ borderRadius: 20, backgroundColor: theme.controlSurface, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.fieldBorder }}>
          <MapControl
            theme={theme}
            icon="layers"
            active={mapStyle === 'satellite'}
            onPress={() => setMapStyle((value) => (value === 'satellite' ? 'standard' : 'satellite'))}
            accessibilityLabel={t('trail.action.layers')}
          />
          {route ? <MapControl theme={theme} icon="expand" active={routeFramed} onPress={fitRoute} accessibilityLabel={t('trail.action.fitRoute')} /> : null}
          <MapControl theme={theme} icon="locate" active={following} onPress={followMe} accessibilityLabel={t('trail.action.follow')} />
        </View>
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
            animatedTranslateY={sheetY}
            containerStyle={{ borderTopLeftRadius: 26, borderTopRightRadius: 26, boxShadow: theme.dark ? '0px -2px 16px rgba(0,0,0,0.4)' : '0px -2px 16px rgba(0,0,0,0.08)' }}
          >
            <LiveSheetBody
              theme={theme}
              session={session}
              fix={fix}
              gps={gps}
              error={error}
              progress={progress}
              routeFraction={routeFraction}
              remainingAscentM={route && progress && route.elevation ? remainingAscent(route.elevation, routeFraction * profileKm * 1000) : null}
              waypoint={guide.nextWaypoint}
              movingMs={movingMs}
              voice={guide.voiceAvailable ? guide.voice : null}
              onVoice={toggleVoice}
              onPause={() => void pauseTrail()}
              footerHeight={footerHeight}
              onQuickHeight={setQuickHeight}
              onMidHeight={setMidHeight}
            />
          </TrailSheet>
          {status === 'paused' ? (
            <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: space.sm, paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: insets.bottom + space.sm, backgroundColor: theme.featureSurface }}>
              <ControlButton theme={theme} icon="stop" label={t('trail.action.finish')} danger onPress={() => void finishTrail()} />
              <ControlButton theme={theme} icon="play" label={t('trail.action.resume')} primary grow={2} onPress={() => void resumeTrail()} />
            </View>
          ) : null}
        </>
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
          {status === 'finished' && session ? (
            <TrailSummary theme={theme} session={session} arrived={arrived} />
          ) : (
            <ReadyPanel
              theme={theme}
              routeName={route?.name}
              totalM={measure?.totalMeters ?? null}
              ascentM={route?.elevation ? remainingAscent(route.elevation, 0) : null}
              toStartM={route && fix ? distanceMeters([fix.lng, fix.lat], route.coords[0]) : null}
              error={error}
              starting={starting}
              onStart={() => void start()}
              gps={gps}
            />
          )}
        </View>
      )}

    </View>
  );
}

function formatMeters(meters: number): string {
  const { value, unit } = splitDistance(meters);
  return `${value} ${unit}`;
}

// Says something only when the GPS is the problem. A good signal goes
// unsaid: the dot moving on the map already shows it, and what the recording
// is doing shows in its buttons (and the greyed numbers while paused).
function GpsNotice({ theme, gps }: { theme: Theme; gps: string }) {
  const { t } = useI18n();
  if (gps !== 'searching' && gps !== 'weak') return null;
  return (
    <View style={{ minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: gps === 'weak' ? theme.danger : theme.text3 }} />
      <Text accessibilityLiveRegion="polite" numberOfLines={1} style={[type.small, { flex: 1, color: theme.text2 }]}>{t(`trail.status.${gps}`)}</Text>
    </View>
  );
}

// One stop in the right-hand control column: the column is the surface, each
// control only an icon that turns accent while its state is on.
function MapControl({ theme, icon, active, onPress, accessibilityLabel }: { theme: Theme; icon: IconName; active?: boolean; onPress: () => void; accessibilityLabel: string }) {
  return (
    <Press
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={active != null ? { selected: active } : undefined}
      style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
    >
      <Icon name={icon} color={active ? theme.accent : theme.text} size={18} />
    </Press>
  );
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
    <View pointerEvents="none" style={{ position: 'absolute', top, left: space.md + 48, right: space.md + 48, height: 40, alignItems: 'center', justifyContent: 'center' }}>
      <View
        accessible
        accessibilityRole="text"
        accessibilityLabel={label}
        accessibilityLiveRegion="polite"
        style={{ height: 36, flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingHorizontal: space.md, borderRadius: 18, backgroundColor: theme.controlSurface, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.fieldBorder, boxShadow: theme.dark ? '0px 4px 12px rgba(0,0,0,0.38)' : '0px 4px 12px rgba(0,0,0,0.08)' }}
      >
        <Animated.View style={{ opacity: pulse }}>
          <Icon name="pause" color={theme.text} size={14} />
        </Animated.View>
        <Text numberOfLines={1} style={[type.labelStrong, { color: theme.text }]}>{label}</Text>
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

function ReadyPanel({
  theme,
  routeName,
  totalM,
  ascentM,
  toStartM,
  error,
  starting,
  onStart,
  gps,
}: {
  theme: Theme;
  routeName?: string;
  totalM: number | null;
  ascentM: number | null;
  toStartM: number | null;
  error: Parameters<typeof ErrorLine>[0]['error'] | null;
  starting: boolean;
  onStart: () => void;
  gps: string;
}) {
  const { t } = useI18n();
  const isRoute = routeName != null;
  const facts = isRoute
    ? [
      totalM != null ? `${t('trail.fact.total')} ${formatMeters(totalM)}` : null,
      ascentM != null ? `${t('trail.fact.ascent')} ${ascentM} m` : null,
      toStartM != null ? `${t('trail.fact.toStart')} ${formatMeters(toStartM)}` : null,
    ].filter(Boolean).join('   ')
    : '';
  const zero = splitDistance(0);
  return (
    <View>
      {isRoute ? (
        <View style={{ marginBottom: space.sm }}>
          <Text numberOfLines={2} style={[type.planTitle, { color: theme.text }]}>{routeName}</Text>
          {facts ? <Text style={[type.small, { color: theme.text2, marginTop: space.xxs, fontVariant: ['tabular-nums'] }]}>{facts}</Text> : null}
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', gap: space.xl }}>
          <LiveValue theme={theme} label={t('trail.stat.time')} value={formatClock(0)} />
          <LiveValue theme={theme} label={t('trail.stat.distance')} value={zero.value} unit={zero.unit} />
        </View>
        <Press
          onPress={onStart}
          disabled={starting}
          accessibilityRole="button"
          accessibilityLabel={isRoute ? t('trail.startRoute') : t('trail.startFree')}
          accessibilityState={{ busy: starting }}
          style={{ height: 52, paddingHorizontal: space.xl, borderRadius: radius.card, backgroundColor: theme.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, opacity: starting ? 0.6 : 1 }}
        >
          <Icon name="play" color="#FFFFFF" size={18} />
          <Text style={[type.quickReply, { color: '#FFFFFF' }]}>{starting ? t('trail.starting') : t('trail.action.start')}</Text>
        </Press>
      </View>
      <View style={{ marginTop: space.xs }}>
        <GpsNotice theme={theme} gps={gps} />
      </View>
      {isRoute && toStartM != null && toStartM > 500 ? (
        <Text style={[type.hint, { color: theme.text2, marginTop: space.xxs }]}>{t('trail.farFromStart', { distance: formatMeters(toStartM) })}</Text>
      ) : null}
      {!trailBackgroundSupported() ? (
        <Text style={[type.hint, { color: theme.text3, marginTop: space.xxs }]}>{t('trail.foregroundOnly')}</Text>
      ) : null}
      {error ? <ErrorLine theme={theme} error={error} /> : null}
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
  gps: string;
  error: Parameters<typeof ErrorLine>[0]['error'] | null;
  progress: RouteProgress | null;
  routeFraction: number;
  remainingAscentM: number | null;
  waypoint: { name: string; aheadM: number } | null;
  movingMs: number;
  voice: boolean | null;
  onVoice: () => void;
  onPause: () => void;
  footerHeight: number;
  onQuickHeight: (height: number) => void;
  onMidHeight: (height: number) => void;
};

// The live sheet's content, top to bottom in the order the detents reveal it.
// The first two blocks are measured: the lowest detent ends under the quick
// row, the middle one under the numbers and profile.
function LiveSheetBody({
  theme,
  session,
  fix,
  gps,
  error,
  progress,
  routeFraction,
  remainingAscentM,
  waypoint,
  movingMs,
  voice,
  onVoice,
  onPause,
  footerHeight,
  onQuickHeight,
  onMidHeight,
}: LiveSheetProps) {
  const { t } = useI18n();
  const route = session.route;
  const paused = session.status === 'paused';
  const { distM, ascM, descM } = session.totals;
  const distance = splitDistance(distM);
  const remaining = splitDistance(progress?.remainingM);
  const pace = formatPace(distM, movingMs);
  const speed = !paused && fix?.speed != null ? (fix.speed * 3.6).toFixed(1) : '--';
  const avgSpeed = distM >= 50 && movingMs >= 60_000 ? (distM / 1000 / (movingMs / 3_600_000)).toFixed(1) : '--';
  const altitude = fix?.alt != null ? Math.round(fix.alt).toLocaleString('en-US') : '--';

  const cells = {
    remaining: <GridStat theme={theme} dim={paused} label={t('trail.stat.remaining')} value={progress ? remaining.value : '--'} unit={progress ? remaining.unit : undefined} />,
    ascent: <GridStat theme={theme} dim={paused} label={t('trail.stat.ascent')} value={String(Math.round(ascM))} unit="m" />,
    descent: <GridStat theme={theme} dim={paused} label={t('trail.stat.descent')} value={String(Math.round(descM))} unit="m" />,
    altitude: <GridStat theme={theme} dim={paused} label={t('trail.stat.altitude')} value={altitude} unit={altitude !== '--' ? 'm' : undefined} />,
    pace: <GridStat theme={theme} dim={paused} label={t('trail.stat.pace')} value={pace} unit={pace !== '--' ? '/km' : undefined} />,
    speed: <GridStat theme={theme} dim={paused} label={t('trail.stat.speed')} value={speed} unit={speed !== '--' ? 'km/h' : undefined} />,
    avgSpeed: <GridStat theme={theme} dim={paused} label={t('trail.stat.avgSpeed')} value={avgSpeed} unit={avgSpeed !== '--' ? 'km/h' : undefined} />,
    remainingAscent: <GridStat theme={theme} dim={paused} label={t('trail.stat.remainingAscent')} value={remainingAscentM != null ? String(remainingAscentM) : '--'} unit={remainingAscentM != null ? 'm' : undefined} />,
  };
  // On a route what is left leads; on a free walk, the climb.
  const main = route ? [cells.remaining, cells.ascent, cells.altitude, cells.pace] : [cells.ascent, cells.pace, cells.altitude, cells.speed];
  const more = route ? [cells.remainingAscent, cells.descent] : [cells.descent, cells.avgSpeed];

  return (
    <View style={{ paddingHorizontal: space.lg }}>
      <View onLayout={(event) => onMidHeight(Math.round(event.nativeEvent.layout.height))}>
        <View
          onLayout={(event) => onQuickHeight(Math.round(event.nativeEvent.layout.height))}
          style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingBottom: space.xs }}
        >
          <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', gap: space.xl }}>
            <LiveValue theme={theme} dim={paused} label={t('trail.stat.time')} value={formatClock(movingMs)} />
            <LiveValue theme={theme} dim={paused} label={route ? t('trail.stat.walked') : t('trail.stat.distance')} value={distance.value} unit={distance.unit} />
          </View>
          {/* Paused, 继续 and 结束 wait in the footer instead. */}
          {!paused ? (
            <Press
              onPress={onPause}
              accessibilityRole="button"
              accessibilityLabel={t('trail.action.pause')}
              style={{ width: 52, height: 52, borderRadius: radius.card, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.fieldSurface }}
            >
              <Icon name="pause" color={theme.text} size={20} />
            </Press>
          ) : null}
        </View>
        <GpsNotice theme={theme} gps={gps} />
        <StatGrid>{main}</StatGrid>
        {route ? (
          <View style={{ marginTop: space.md }}>
            {route.elevation && route.elevation.length >= 2
              ? <TrailProfile theme={theme} profile={route.elevation} fraction={routeFraction} />
              : <AppProgressBar theme={theme} value={routeFraction * 100} />}
            {waypoint ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs, marginTop: space.sm }}>
                <Icon name="pin" color={theme.text2} size={15} />
                <Text numberOfLines={1} style={[type.small, { color: theme.text, flexShrink: 1, fontWeight: '600' }]}>{t('trail.nextWaypoint', { name: waypoint.name })}</Text>
                <Text style={[type.small, { color: theme.text2, fontVariant: ['tabular-nums'] }]}>{t('trail.nextWaypointAhead', { distance: formatMeters(waypoint.aheadM) })}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
        {!session.background ? <Text style={[type.hint, { color: theme.text3, marginTop: space.sm }]}>{t('trail.foregroundOnly')}</Text> : null}
        {error ? <ErrorLine theme={theme} error={error} /> : null}
      </View>

      <View style={{ marginTop: space.lg }}>
        <StatGrid>{more}</StatGrid>
      </View>

      <Text style={[type.eyebrow, { color: theme.text2, marginTop: space.xxl, marginBottom: space.xxs }]}>{t('trail.settings.title')}</Text>
      {voice != null ? (
        <SettingRow theme={theme} icon="volume" title={t('trail.settings.voice')} hint={t('trail.settings.voiceHint')}>
          <Switch
            accessibilityLabel={t('trail.settings.voice')}
            value={voice}
            onValueChange={onVoice}
            trackColor={{ false: theme.progressTrack, true: theme.accent }}
            thumbColor="#FFFFFF"
            ios_backgroundColor={theme.progressTrack}
          />
        </SettingRow>
      ) : null}
      <View style={{ height: footerHeight }} />
    </View>
  );
}

// The quick row's two readouts: always visible, so the walker never has to
// open the sheet for time and distance.
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

function StatGrid({ children }: { children: React.ReactNode[] }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: space.md, marginTop: space.sm }}>
      {children.map((child, index) => <View key={index} style={{ width: '50%', paddingRight: space.sm }}>{child}</View>)}
    </View>
  );
}

function GridStat({ theme, label, value, unit, dim }: { theme: Theme; label: string; value: string; unit?: string; dim?: boolean }) {
  const empty = value === '--';
  return (
    <View accessible accessibilityLabel={`${label} ${value}${unit ? ` ${unit}` : ''}`}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
        <Text numberOfLines={1} adjustsFontSizeToFit style={[type.liveValueLarge, { color: dim || empty ? theme.text3 : theme.text }]}>{value}</Text>
        {unit ? <Text style={[type.liveUnit, { color: theme.text2 }]}>{unit}</Text> : null}
      </View>
      <Text numberOfLines={1} style={[type.caption, { color: theme.text2, marginTop: 2 }]}>{label}</Text>
    </View>
  );
}

function SettingRow({ theme, icon, title, hint, children }: { theme: Theme; icon: IconName; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={{ minHeight: 56, paddingVertical: space.xs, flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
      <Icon name={icon} color={theme.text2} size={18} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[type.rowTitle, { color: theme.text }]}>{title}</Text>
        {hint ? <Text numberOfLines={1} style={[type.meta, { color: theme.text2 }]}>{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function ControlButton({ theme, icon, label, primary, danger, grow = 1, onPress }: { theme: Theme; icon: IconName; label: string; primary?: boolean; danger?: boolean; grow?: number; onPress: () => void }) {
  const color = primary ? '#FFFFFF' : danger ? theme.danger : theme.text;
  return (
    <Press
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ flex: grow, height: 52, borderRadius: radius.card, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, backgroundColor: primary ? theme.accent : theme.fieldSurface }}
    >
      <Icon name={icon} color={color} size={18} />
      <Text style={[type.quickReply, { color }]}>{label}</Text>
    </Press>
  );
}
