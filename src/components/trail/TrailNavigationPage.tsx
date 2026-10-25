// TrailNavigationPage.tsx — 徒步导航: follow a planned route or record freely.
//
// The map owns the whole screen and the chrome floats on it (DESIGN.md §1.8):
// round 44pt buttons at the top and down the right edge, one panel at the
// bottom. The panel changes with the recording's state — ready, recording,
// paused, finished — but keeps its place, so the walker's thumb always finds
// the controls in the same spot. Numbers are the hero: what is left on a
// route, or how far on a free walk, is the largest thing on the screen.
//
// Minimising never stops anything. The recording lives in trailRecorder.ts
// and a pill at the top of every screen leads back here (TrailMiniBar).
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppActionDialog, AppIconButton, AppProgressBar, motion, radius, space, type } from '../../design-system';
import { useI18n } from '../../i18n';
import { useNav } from '../../nav/NavContext';
import { MONO } from '../../theme/fonts';
import type { Theme } from '../../theme/theme';
import { useTrail, useTrailSnapshot } from '../../trail/TrailContext';
import { distanceMeters, JOURNEY_SEGMENT_COLORS, type Coordinate } from '../../lib/routeSegments';
import {
  BACK_ON_ROUTE_METERS,
  formatClock,
  formatPace,
  locateOnRoute,
  nextWaypoint,
  OFF_ROUTE_METERS,
  remainingAscent,
  routeMeasure,
  splitDistance,
  type RouteProgress,
} from '../../lib/trailGeo';
import {
  clearTrailError,
  finishTrail,
  pauseTrail,
  resumeTrail,
  startTrail,
  trailBackgroundSupported,
  trailMovingMs,
  watchTrailPosition,
} from '../../lib/trailRecorder';
import { CurrentLocationMarker } from '../globe/CurrentLocationMarker';
import { buildRouteEndpointMarkers } from '../discover/routeEndpointMarkers';
import { useMapPresentation } from '../maps/MapPresentationContext';
import { NativeMap, NATIVE_MAP_AVAILABLE, type NativeMapHandle, type NativeMapMarker, type NativeMapPolyline } from '../maps/NativeMap';
import { Icon, type IconName } from '../Icon';
import { Press } from '../Press';
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
  const [panelHeight, setPanelHeight] = useState(280);
  const [following, setFollowing] = useState(true);
  const [starting, setStarting] = useState(false);
  const [finishConfirmOpen, setFinishConfirmOpen] = useState(false);
  const [, setTick] = useState(0);

  const route = session ? session.route : trail.plannedRoute;
  const status = session?.status ?? 'ready';
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
      if (finishConfirmOpen) setFinishConfirmOpen(false);
      else trail.closeTrail();
      return true;
    });
    return () => subscription.remove();
  }, [finishConfirmOpen, trail]);

  useEffect(() => {
    nav.setTabBarHidden('trail', true);
    return () => nav.setTabBarHidden('trail', false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── where the walker is on the route ─────────────────────────────────────
  const alongRef = useRef<number | null>(null);
  const offRouteRef = useRef(false);
  const progress: RouteProgress | null = useMemo(() => {
    if (!measure || !fix) return null;
    const located = locateOnRoute(measure, [fix.lng, fix.lat], alongRef.current);
    return located;
  }, [measure, fix]);
  if (progress && status !== 'ready') alongRef.current = progress.alongM;

  // Off route is judged only on a fix good enough to trust, with hysteresis so
  // GPS wander along the edge doesn't flicker the banner.
  const trustworthy = fix != null && (fix.acc == null || fix.acc <= 40);
  if (progress && trustworthy && status === 'recording') {
    if (!offRouteRef.current && progress.offsetM > OFF_ROUTE_METERS) offRouteRef.current = true;
    else if (offRouteRef.current && progress.offsetM < BACK_ON_ROUTE_METERS) offRouteRef.current = false;
  } else if (status !== 'recording') {
    offRouteRef.current = false;
  }
  const offRoute = offRouteRef.current;
  const wasOffRoute = useRef(false);
  useEffect(() => {
    if (offRoute && !wasOffRoute.current) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
    wasOffRoute.current = offRoute;
  }, [offRoute]);

  const arrived = !!progress && status === 'recording' && progress.remainingM < 40 && progress.alongM > progress.totalM * 0.5;

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

  const endpointMarkers = useMemo(() => (route && route.coords.length >= 2
    ? buildRouteEndpointMarkers({
      theme,
      drawnCoords: route.coords,
      loop: distanceMeters(route.coords[0], route.coords[route.coords.length - 1]) <= 300,
      labels: { start: t('route.direction.start'), finish: t('route.direction.finish'), action: '' },
      actionOpen: false,
      onEndpointPress: () => undefined,
      onActionPress: () => undefined,
    })
    : NO_MARKERS), [route, t, theme]);

  // MapKit draws its own location dot; AMap's doesn't match the app, so
  // Android gets the shared marker. Heading is bucketed because Android
  // snapshots marker content by id.
  const headingKey = fix?.heading != null ? Math.round(fix.heading / 15) * 15 : null;
  const markers = useMemo<NativeMapMarker[]>(() => {
    if (Platform.OS !== 'android' || !fix) return endpointMarkers;
    return [...endpointMarkers, {
      id: `trail-location-${headingKey ?? 'none'}`,
      coordinate: [fix.lng, fix.lat],
      anchor: { x: 0.5, y: 0.5 },
      zIndex: 10,
      content: <CurrentLocationMarker theme={theme} heading={headingKey ?? undefined} />,
    }];
  }, [endpointMarkers, fix, headingKey, theme]);

  const topChrome = insets.top + space.xs + 44;
  const cameraPadding = useCallback((): [number, number, number, number] => [topChrome + space.lg, 40, panelHeight + space.lg, 40], [panelHeight, topChrome]);

  // Follow the walker; a pan or pinch hands the camera back to them.
  const lastFollowAt = useRef(0);
  useEffect(() => {
    if (!following || !fix) return;
    const now = Date.now();
    if (now - lastFollowAt.current < 1500) return;
    lastFollowAt.current = now;
    mapRef.current?.moveCamera([fix.lng, fix.lat], Math.max(zoomRef.current, 14), 600, { edgePadding: cameraPadding() });
  }, [fix, following, cameraPadding]);

  const fitRoute = () => {
    if (!route || route.coords.length < 2) return;
    setFollowing(false);
    mapRef.current?.fitCoordinates(route.coords, cameraPadding(), motion.emphasized * 2);
  };

  const followMe = () => {
    setFollowing(true);
    lastFollowAt.current = 0;
    if (fix) mapRef.current?.moveCamera([fix.lng, fix.lat], FOLLOW_ZOOM, 600, { edgePadding: cameraPadding() });
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
  const initialCenter: Coordinate = route?.coords[0] ?? (fix ? [fix.lng, fix.lat] : [116.39, 39.9]);

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.featureSurface, zIndex: 320 }]}>
      {NATIVE_MAP_AVAILABLE ? (
        <NativeMap
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          initialCenter={initialCenter}
          initialZoom={route ? 13 : FOLLOW_ZOOM}
          initialFitCoordinates={route && route.coords.length >= 2 ? route.coords : undefined}
          initialPadding={[topChrome + space.lg, 40, panelHeight + space.lg, 40]}
          mapStyle={mapStyle}
          showUserLocation={Platform.OS === 'ios'}
          polylines={polylines}
          markers={markers}
          onZoomChange={(zoom) => { zoomRef.current = zoom; }}
          onGestureStart={() => setFollowing(false)}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xl, paddingBottom: panelHeight }]}>
          <Text style={[type.body, { color: theme.text2, textAlign: 'center' }]}>{t('trail.noMap')}</Text>
        </View>
      )}

      {/* Top chrome: minimise, state, map style. */}
      <View style={{ position: 'absolute', top: insets.top + space.xs, left: space.md, right: space.md, flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
        <AppIconButton theme={theme} name="chevronDown" onPress={trail.closeTrail} accessibilityLabel={t('trail.action.minimize')} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <StatusPill theme={theme} status={status} gps={gps} />
        </View>
        <AppIconButton
          theme={theme}
          name="layers"
          onPress={() => setMapStyle((value) => (value === 'satellite' ? 'standard' : 'satellite'))}
          accessibilityLabel={t('trail.action.layers')}
        />
      </View>

      {/* One banner at a time under the chrome; being lost outranks arriving. */}
      {offRoute && progress ? (
        <Banner theme={theme} icon="info" tone="danger" title={t('trail.offRoute', { distance: formatMeters(progress.offsetM) })} body={t('trail.offRouteHint')} top={topChrome + space.xs} />
      ) : arrived ? (
        <Banner theme={theme} icon="flag" tone="accent" title={t('trail.arrived')} top={topChrome + space.xs} />
      ) : null}

      {/* Map controls down the right edge, just above the panel. */}
      <View style={{ position: 'absolute', right: space.md, bottom: panelHeight + space.sm, gap: space.sm }}>
        <AppIconButton theme={theme} name="compassN" onPress={() => mapRef.current?.resetNorth()} accessibilityLabel={t('trail.action.north')} />
        {route ? <AppIconButton theme={theme} name="expand" onPress={fitRoute} accessibilityLabel={t('trail.action.fitRoute')} /> : null}
        <AppIconButton theme={theme} name="locate" active={following} onPress={followMe} accessibilityLabel={t('trail.action.follow')} />
      </View>

      {/* The panel. */}
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
          borderTopLeftRadius: radius.showcase,
          borderTopRightRadius: radius.showcase,
          backgroundColor: theme.controlSurface,
          boxShadow: theme.dark ? '0px -4px 24px rgba(0,0,0,0.45)' : '0px -4px 24px rgba(0,0,0,0.10)',
        }}
      >
        {status === 'finished' && session ? (
          <TrailSummary theme={theme} session={session} />
        ) : status === 'ready' ? (
          <ReadyPanel
            theme={theme}
            routeName={route?.name}
            totalM={measure?.totalMeters ?? null}
            ascentM={route?.elevation ? remainingAscent(route.elevation, 0) : null}
            toStartM={route && fix ? distanceMeters([fix.lng, fix.lat], route.coords[0]) : null}
            error={error}
            starting={starting}
            onStart={() => void start()}
          />
        ) : session ? (
          <>
            {route && progress ? (
              <RouteHero
                theme={theme}
                remainingM={progress.remainingM}
                walkedM={session.totals.distM}
                fraction={progress.totalM > 0 ? progress.alongM / progress.totalM : 0}
                waypoint={nextWaypoint(route.waypoints, progress.alongM)}
              />
            ) : (
              <Hero theme={theme} label={t('trail.stat.distance')} meters={session.totals.distM} />
            )}
            <View style={{ flexDirection: 'row', marginTop: space.md }}>
              <Stat theme={theme} label={t('trail.stat.time')} value={formatClock(movingMs)} />
              <Stat theme={theme} label={t('trail.stat.ascent')} value={`+${Math.round(session.totals.ascM)}`} unit="m" />
              {route ? (
                <Stat
                  theme={theme}
                  label={t('trail.stat.remainingAscent')}
                  value={progress && route.elevation ? `${remainingAscent(route.elevation, progress.alongM) ?? '--'}` : '--'}
                  unit={progress && route.elevation ? 'm' : undefined}
                />
              ) : (
                <Stat theme={theme} label={t('trail.stat.pace')} value={formatPace(session.totals.distM, movingMs)} />
              )}
              <Stat theme={theme} label={t('trail.stat.altitude')} value={fix?.alt != null ? Math.round(fix.alt).toLocaleString('en-US') : '--'} unit={fix?.alt != null ? 'm' : undefined} />
            </View>
            {!session.background ? (
              <Text style={[type.hint, { color: theme.text3, marginTop: space.sm }]}>{t('trail.foregroundOnly')}</Text>
            ) : null}
            {error ? <ErrorLine theme={theme} error={error} /> : null}
            <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.lg }}>
              {status === 'recording' ? (
                <ControlButton theme={theme} icon="pause" label={t('trail.action.pause')} onPress={() => void pauseTrail()} />
              ) : (
                <ControlButton theme={theme} icon="play" label={t('trail.action.resume')} primary onPress={() => void resumeTrail()} />
              )}
              <ControlButton theme={theme} icon="flag" label={t('trail.action.finish')} danger onPress={() => setFinishConfirmOpen(true)} />
            </View>
          </>
        ) : null}
      </View>

      <AppActionDialog
        theme={theme}
        visible={finishConfirmOpen}
        title={t('trail.finishConfirm.title')}
        message={t('trail.finishConfirm.message')}
        confirmLabel={t('trail.finishConfirm.confirm')}
        cancelLabel={t('common.cancel')}
        confirmIcon="flag"
        onCancel={() => setFinishConfirmOpen(false)}
        onConfirm={() => {
          setFinishConfirmOpen(false);
          void finishTrail();
        }}
      />
    </View>
  );
}

function formatMeters(meters: number): string {
  const { value, unit } = splitDistance(meters);
  return `${value} ${unit}`;
}

function StatusPill({ theme, status, gps }: { theme: Theme; status: 'ready' | 'recording' | 'paused' | 'finished'; gps: string }) {
  const { t } = useI18n();
  // A GPS problem is what the walker needs to know first.
  const gpsProblem = gps === 'searching' || gps === 'weak';
  const label = gpsProblem ? t(`trail.status.${gps}`) : t(`trail.status.${status}`);
  const dot = gpsProblem ? theme.text3 : status === 'recording' ? theme.trailMine : status === 'paused' ? theme.text2 : theme.accent;
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{ height: 36, maxWidth: '100%', paddingHorizontal: space.md, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: space.xs, backgroundColor: theme.controlSurface, boxShadow: theme.dark ? '0px 2px 10px rgba(0,0,0,0.5)' : '0px 2px 10px rgba(0,0,0,0.14)' }}
    >
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} />
      <Text numberOfLines={1} style={[type.labelStrong, { color: gpsProblem ? theme.text2 : theme.text, flexShrink: 1 }]}>{label}</Text>
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
}: {
  theme: Theme;
  routeName?: string;
  totalM: number | null;
  ascentM: number | null;
  toStartM: number | null;
  error: Parameters<typeof ErrorLine>[0]['error'] | null;
  starting: boolean;
  onStart: () => void;
}) {
  const { t } = useI18n();
  const isRoute = routeName != null;
  return (
    <View>
      <Text numberOfLines={2} style={[type.planTitle, { color: theme.text }]}>{routeName ?? t('trail.freeTitle')}</Text>
      {isRoute ? (
        <View style={{ flexDirection: 'row', marginTop: space.md }}>
          <Stat theme={theme} label={t('trail.fact.total')} {...measureParts(totalM)} />
          <Stat theme={theme} label={t('trail.fact.ascent')} value={ascentM != null ? `+${ascentM}` : '--'} unit={ascentM != null ? 'm' : undefined} />
          <Stat theme={theme} label={t('trail.fact.toStart')} {...measureParts(toStartM)} />
        </View>
      ) : (
        <Text style={[type.lead, { color: theme.text2, marginTop: space.xs }]}>{t('trail.freeLead')}</Text>
      )}
      {isRoute && toStartM != null && toStartM > 500 ? (
        <Text style={[type.hint, { color: theme.text2, marginTop: space.sm }]}>{t('trail.farFromStart', { distance: formatMeters(toStartM) })}</Text>
      ) : null}
      {!trailBackgroundSupported() ? (
        <Text style={[type.hint, { color: theme.text3, marginTop: space.sm }]}>{t('trail.foregroundOnly')}</Text>
      ) : null}
      {error ? <ErrorLine theme={theme} error={error} /> : null}
      <Press
        onPress={onStart}
        disabled={starting}
        accessibilityRole="button"
        accessibilityState={{ busy: starting }}
        style={{ marginTop: space.lg, height: 56, borderRadius: radius.pill, backgroundColor: theme.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, opacity: starting ? 0.6 : 1 }}
      >
        <Icon name="play" color="#FFFFFF" size={20} />
        <Text style={[type.quickReply, { color: '#FFFFFF' }]}>
          {starting ? t('trail.starting') : isRoute ? t('trail.startRoute') : t('trail.startFree')}
        </Text>
      </Press>
    </View>
  );
}

function measureParts(meters: number | null): { value: string; unit?: string } {
  if (meters == null) return { value: '--' };
  return splitDistance(meters);
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

function RouteHero({
  theme,
  remainingM,
  walkedM,
  fraction,
  waypoint,
}: {
  theme: Theme;
  remainingM: number;
  walkedM: number;
  fraction: number;
  waypoint: { name: string; aheadM: number } | null;
}) {
  const { t } = useI18n();
  const walked = splitDistance(walkedM);
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: space.md }}>
        <Hero theme={theme} label={t('trail.stat.remaining')} meters={remainingM} />
        <View style={{ alignItems: 'flex-end', paddingBottom: 6 }}>
          <Text style={[type.readoutLabel, { color: theme.text2 }]}>{t('trail.stat.walked')}</Text>
          <Text style={[type.fieldValue, { color: theme.text }]}>
            {walked.value}
            <Text style={[type.chip, { color: theme.text2 }]}> {walked.unit}</Text>
          </Text>
        </View>
      </View>
      <View style={{ marginTop: space.sm }}>
        <AppProgressBar theme={theme} value={fraction * 100} />
      </View>
      {waypoint ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs, marginTop: space.sm }}>
          <Icon name="flag" color={theme.text2} size={15} />
          <Text numberOfLines={1} style={[type.small, { color: theme.text, flexShrink: 1, fontWeight: '600' }]}>{t('trail.nextWaypoint', { name: waypoint.name })}</Text>
          <Text style={[type.small, { color: theme.text2, fontVariant: ['tabular-nums'] }]}>{t('trail.nextWaypointAhead', { distance: formatMeters(waypoint.aheadM) })}</Text>
        </View>
      ) : null}
    </View>
  );
}

// The panel's one large number. `display` is the measurement role; 56 keeps
// the panel short enough to leave the map most of the screen.
function Hero({ theme, label, meters }: { theme: Theme; label: string; meters: number }) {
  const { value, unit } = splitDistance(meters);
  return (
    <View accessible accessibilityLabel={`${label} ${value} ${unit}`}>
      <Text style={[type.readoutLabel, { color: theme.text2 }]}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.xxs }}>
        <Text numberOfLines={1} style={[type.display, { fontSize: 56, lineHeight: 64, letterSpacing: -2, color: theme.text }]}>{value}</Text>
        <Text style={[type.displayUnit, { color: theme.text2 }]}>{unit}</Text>
      </View>
    </View>
  );
}

function Stat({ theme, label, value, unit }: { theme: Theme; label: string; value: string; unit?: string }) {
  return (
    <View style={{ flex: 1, minWidth: 0 }} accessible accessibilityLabel={`${label} ${value}${unit ? ` ${unit}` : ''}`}>
      <Text numberOfLines={1} style={[type.caption, { color: theme.text2 }]}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2, marginTop: 2 }}>
        <Text numberOfLines={1} adjustsFontSizeToFit style={[type.metric, { fontFamily: MONO, color: value === '--' ? theme.text3 : theme.text }]}>{value}</Text>
        {unit ? <Text style={[type.caption, { color: theme.text2 }]}>{unit}</Text> : null}
      </View>
    </View>
  );
}

function ControlButton({ theme, icon, label, primary, danger, onPress }: { theme: Theme; icon: IconName; label: string; primary?: boolean; danger?: boolean; onPress: () => void }) {
  const color = primary ? '#FFFFFF' : danger ? theme.danger : theme.text;
  return (
    <Press
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ flex: 1, height: 56, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, backgroundColor: primary ? theme.accent : theme.fieldSurface, borderWidth: primary ? 0 : StyleSheet.hairlineWidth, borderColor: theme.fieldBorder }}
    >
      <Icon name={icon} color={color} size={20} />
      <Text style={[type.quickReply, { color }]}>{label}</Text>
    </Press>
  );
}
