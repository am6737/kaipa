// DiscoverScreen.tsx — the 发现 tab. A platform-native map (SVG fallback) of routes
// (探索) or the user's journeys (旅程), with a draggable bottom sheet listing them
// and an in-place route/journey detail panel.
import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { ActivityIndicator, Animated, BackHandler, Easing, InteractionManager, Platform, Pressable, ScrollView, View, Text, TextInput, useWindowDimensions, StyleSheet, Alert, Modal } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { Theme } from '../theme/theme';
import { useNav } from '../nav/NavContext';
import { countRender } from '../lib/tabSwitchProbe';
import { visiblePinKeys as railVisibleKeys } from '../lib/pinVisibility';
import { useI18n } from '../i18n';
import { Poi } from '../data/pois';
import type { TLRow } from '../data/timeline';
import { JourneyGroupMoveSheet } from '../components/journey/JourneyGroupMoveSheet';
import { buildJourneyGroupChoices, journeyMoveDestinations } from '../lib/journeyGroupChoices';
import { useData } from '../data/DataContext';
import { Globe, NATIVE_MAP_ENABLED, pinKey, type GlobeCameraAction, type PinVisibilityApi, type GlobeJourneyDayLabel, type GlobeJourneyLeg, type GlobeJourneyStop, type GlobeMapStyle, type GlobeProps, type GlobeRouteSegment } from '../components/globe';
import { Glass } from '../components/Glass';
import { Icon, type IconName } from '../components/Icon';
import { Press } from '../components/Press';
import { TrailSheet, TrailSheetHandle } from '../components/Sheet';
import { KPState, KPSkeletonLine } from '../components/State';
import { DiscoverCollectionHeader, DiscoverRouteList } from '../components/discover/DiscoverCollection';
import { RoutePreviewIdentity, RoutePreviewPanel, RoutePreviewStickyHeader, type RoutePreviewSection, type RoutePreviewSectionKey } from '../components/discover/RoutePreviewPanel';
import { routeSectionIndexAtScroll } from '../lib/routePreview';
import { RoutePreviewBottomBar } from '../components/discover/RoutePreviewBottomBar';
import { TrackDetailPage } from '../components/tracks/TrackDetailPage';
import { journeyDatePhase } from '../components/journey/journeyDatePresentation';
import type { TrailRouteRef } from '../lib/trailRecorder';
import {
  trailRouteFromJourney,
  trailRouteFromPoi,
  useOpenTrail,
} from '../trail/trailRoutes';
import { useTrailSnapshot } from '../trail/TrailContext';
import { routeShareActions, shareRoute, type RouteShareAction } from '../lib/routeShare';
import { buildRouteWaypointMarkers, buildWaypointLayer, estimateRouteWaypointZoom, waypointOrder, type WaypointLayer, type WaypointLayerLine } from '../components/discover/routeWaypointMarkers';
import { buildRouteEndpointMarkers } from '../components/discover/routeEndpointMarkers';
import { isLoopTrack } from '../lib/routeDirection';
import { directedClimb } from '../data/elevation';
import { AppActionDialog, AppFilterButton, layout, motion, radius, space, type } from '../design-system';
import { SelectedPoiCard, type JourneyMomentFilterMenuController } from './JourneyCard';
import { Avatar } from '../components/Avatar';
import { DropPin, dropPinPlacement, useDropPinPhoto, waypointDropPinMarker, type DropPinContent } from '../components/maps/DropPin';
import { useCompanionLocations } from '../hooks/useCompanionPresence';
import {
  PRESENCE_DROP_MS,
  PRESENCE_STALE_MS,
  setSharingJourneyId,
  useLastSelfPresence,
  useSharingJourneyId,
} from '../lib/companionPresence';
import type { NativeMapMarker } from '../components/maps/types';
import { useMapPresentation } from '../components/maps/MapPresentationContext';
import { MapCompassReveal, useMapHeading } from '../components/maps/MapCompass';
import { MapScaleBar, useMapScale } from '../components/maps/MapScale';
import { MAP_CONTROL_SIZE, MapControlButton, MapControlGroup, MapRoundButton } from '../components/MapControls';
import { HaloIconButton } from '../components/HaloIconButton';
import { FloatingMenu, MenuRow } from '../components/gear/GearItemsList';
import { usePendingMenuAction } from '../components/gear/GearMenuTransition';
import { JourneyChecklistPickerSheet, type JourneyChecklistFilterMenuController } from '../components/journey/JourneyChecklistTab';
import { refetchJourneyTimeline, useTimeline } from '../hooks/useTimeline';
import { useJourneyLegGeometry } from '../hooks/useJourneyLegGeometry';
import { buildJourneyLegs, buildJourneyStops, journeyDayOrder, measureJourneyDays, type JourneyLeg } from '../lib/journeyStops';
import { journeyRouteIds, journeyTracks } from '../lib/journeyTracks';
import { journeyDayDisplayLabel } from '../lib/journeyDays';
import { JOURNEY_SEGMENT_COLORS, measureTrack } from '../lib/routeSegments';
import { planJourneyDirections, type PlannedLeg } from '../lib/amapGeocoding';
import { CurrentPositionError, framingFailureKey, getCurrentPosition, locateForFraming } from '../lib/currentPosition';
import { launchRegion, launchRegionPicked, rememberLaunchRegion, rememberPickedRegion } from '../lib/launchRegion';
import { isWriteBusy } from '../lib/writeErrors';
import { BOTTOM_TABS_HEIGHT } from '../components/BottomTabs';
import { MapStylePickerSheet, type MapPresentationStyle } from '../components/MapStylePickerSheet';
import { activeRouteFilterCount, applyRouteFilters, DEFAULT_ROUTE_FILTERS, RouteFilterSheet, type RouteFilters } from '../components/discover/RouteFilterSheet';
import { AssistantMark } from '../components/assistant/AssistantMark';
import { MarkDetail, type MarkDetailItem } from '../components/trail/MarkDetail';
import { Focus, Maximize2, RotateCcw, Search } from 'lucide-react-native';
import { restoreJourneyVersion } from '../hooks/useJourneyVersions';
import { refetchJourneyInspo } from '../hooks/useInspo';
import { refetchJourneyPacking } from '../hooks/useJourneyPacking';
import { FeedbackPage } from '../components/me/FeedbackPage';

const ADMIN_REGION_OPTIONS = [
  '全国', '北京', '上海', '天津', '重庆',
  '河北', '山西', '辽宁', '吉林', '黑龙江', '江苏', '浙江', '安徽', '福建', '江西', '山东',
  '河南', '湖北', '湖南', '广东', '海南', '四川', '贵州', '云南', '陕西', '甘肃', '青海',
  '台湾', '内蒙古', '广西', '西藏', '宁夏', '新疆', '香港', '澳门',
] as const;
const INTERNATIONAL_REGION_OPTIONS = ['尼泊尔'] as const;
// Geographic extents (southwest / northeast), independent of route coverage.
// Fit the whole administrative region to the actual map viewport on each device.
const ADMIN_REGION_BOUNDS: Record<string, [number, number][]> = {
  全国: [[73.5, 18.1], [135.1, 53.6]],
  北京: [[115.4, 39.4], [117.6, 41.1]],
  上海: [[120.85, 30.65], [122.2, 31.9]],
  广东: [[109.6, 20.2], [117.35, 25.55]],
  湖南: [[108.75, 24.6], [114.25, 30.15]],
  浙江: [[118.0, 27.0], [123.0, 31.2]],
  江西: [[113.55, 24.3], [118.5, 30.1]],
  四川: [[97.35, 26.0], [108.55, 34.35]],
  云南: [[97.5, 21.1], [106.2, 29.25]],
  陕西: [[105.45, 31.7], [111.3, 39.6]],
  湖北: [[108.35, 29.0], [116.15, 33.3]],
  福建: [[115.8, 23.5], [120.75, 28.35]],
  重庆: [[105.15, 28.1], [110.2, 32.25]],
  天津: [[116.7, 38.5], [118.1, 40.3]],
  河北: [[113.4, 36.0], [119.9, 42.6]],
  山西: [[110.2, 35.2], [114.6, 40.8]],
  辽宁: [[118.8, 38.7], [125.8, 43.5]],
  吉林: [[121.6, 40.8], [131.2, 46.3]],
  黑龙江: [[121.2, 43.4], [135.1, 53.6]],
  江苏: [[116.3, 30.7], [121.9, 35.2]],
  安徽: [[114.8, 29.4], [119.7, 34.7]],
  山东: [[114.8, 34.2], [122.7, 38.4]],
  河南: [[110.3, 31.4], [116.7, 36.4]],
  海南: [[108.5, 18.1], [111.2, 20.2]],
  贵州: [[103.5, 24.6], [109.6, 29.3]],
  广西: [[104.4, 20.9], [112.1, 26.4]],
  甘肃: [[92.3, 32.6], [108.8, 42.8]],
  青海: [[89.4, 31.6], [103.1, 39.2]],
  台湾: [[119.9, 21.8], [122.1, 25.4]],
  内蒙古: [[97.2, 37.4], [121.3, 53.3]],
  西藏: [[78.4, 26.8], [99.1, 36.5]],
  宁夏: [[104.0, 35.2], [107.7, 39.4]],
  新疆: [[73.5, 34.2], [96.4, 49.2]],
  香港: [[113.8, 22.1], [114.5, 22.6]],
  澳门: [[113.4, 22.0], [113.7, 22.3]],
  尼泊尔: [[80.05, 26.35], [88.25, 30.45]],
};

// The province the map opens on. A geocoded name ("广东省", "广西壮族自治区")
// wins when it maps onto an option; otherwise (offline, English-locale
// geocoder) the smallest box holding the point decides, which is right for
// every city and only wrong within a few km of a border. Abroad gives null.
function provinceAt(lng: number, lat: number, geocoded?: string | null): string | null {
  const named = geocoded?.trim();
  if (named) {
    const match = ADMIN_REGION_OPTIONS.find((region) => region !== '全国' && named.startsWith(region));
    if (match) return match;
  }
  let best: string | null = null;
  let bestArea = Infinity;
  for (const region of ADMIN_REGION_OPTIONS) {
    const bounds = region === '全国' ? undefined : ADMIN_REGION_BOUNDS[region];
    if (!bounds) continue;
    const [[west, south], [east, north]] = bounds;
    if (lng < west || lng > east || lat < south || lat > north) continue;
    const area = (east - west) * (north - south);
    if (area < bestArea) { best = region; bestArea = area; }
  }
  return best;
}

// A province's bounding box is mostly empty corners, so fitting all of it
// leaves the province small on screen. Fit the middle of the box instead; the
// edges stay a short pan away. The national view keeps its full extent.
const ADMIN_REGION_FIT_SCALE = 0.8;

function adminRegionFit(region: string): [number, number][] | undefined {
  const bounds = ADMIN_REGION_BOUNDS[region];
  if (!bounds || region === '全国') return bounds;
  const [[west, south], [east, north]] = bounds;
  const lng = (west + east) / 2;
  const lat = (south + north) / 2;
  const halfLng = ((east - west) / 2) * ADMIN_REGION_FIT_SCALE;
  const halfLat = ((north - south) / 2) * ADMIN_REGION_FIT_SCALE;
  return [[lng - halfLng, lat - halfLat], [lng + halfLng, lat + halfLat]];
}

// Once per app launch: a remount (or a region the user picked) must not pull
// the map back to the located province.
let launchProvinceSettled = false;
// The map's first frame is the launch region itself, not a flight to it.
let launchRegionFitted = false;

// Location layer updates closer than this to the last one are dropped.
const LOCATION_UPDATE_MIN_METRES = 3;

function metresBetween(a: { lng: number; lat: number }, b: { lng: number; lat: number }): number {
  const cos = Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
  const dx = (b.lng - a.lng) * cos;
  const dy = b.lat - a.lat;
  return Math.sqrt(dx * dx + dy * dy) * 111_320;
}

function adminRegionOf(poi: Poi): string {
  return poi.region.split('·')[0]?.trim() || poi.region;
}

type FilterMenuAnchor = { x: number; y: number; width: number; height: number };

const MAP_DISPLAY_SETTINGS_KEY = 'kaipa:discover-map-display:v1';

type PersistedMapDisplaySettings = {
  mapStyle?: GlobeMapStyle;
  journeyStopsVisible?: boolean;
  journeyTrackVisible?: boolean;
  journeyDistanceVisible?: boolean;
  mapLabelsVisible?: boolean;
  mapDistanceMarkersVisible?: boolean;
  routeWaypointsVisible?: boolean;
  /** Written before the itinerary had three separate switches: one flag covered
   *  stops, track and distance capsules alike. Read on hydrate to seed them,
   *  never written again. */
  journeyMapDetailsVisible?: boolean;
};

function mapDisplaySettingsKey(userId: string | null) {
  return `${MAP_DISPLAY_SETTINGS_KEY}:${userId || 'anonymous'}`;
}

// The tallest top-right chrome: the journey card's 52pt share/settings row at
// insets.top + 5 (the list's search button ends a little higher).
const MAP_TOP_CHROME_HEIGHT = 57;

// List sheet detents: peek (header only), half (map over the first cards), full.
// It opens at half, the height the two-detent sheet used to open at.
// Explore keeps the list mounted under the map and rests at peek, where the
// tab bar stays visible; the journey list still opens at half.
const LIST_SHEET_PEEK = 0;
// How long 搜索此区域 stays up after the map stops moving.
const AREA_SEARCH_OFFER_MS = 6000;
const LIST_SHEET_INITIAL = 1;
const LIST_SHEET_FULL = 2;

function anchoredFilterMenuStyle(anchor: FilterMenuAnchor | undefined, windowWidth: number, windowHeight: number, topInset: number, bottomInset: number, menuWidth: number, preferredHeight: number) {
  if (!anchor) {
    return { right: space.lg, bottom: Math.max(bottomInset, space.md) + 68, maxHeight: preferredHeight };
  }
  const gap = space.xs;
  const right = Math.min(
    Math.max(space.md, windowWidth - anchor.x - anchor.width),
    Math.max(space.md, windowWidth - menuWidth - space.md),
  );
  const availableBelow = windowHeight - bottomInset - anchor.y - anchor.height - gap;
  const availableAbove = anchor.y - topInset - gap;
  const placeBelow = availableBelow >= Math.min(preferredHeight, 240) || availableBelow >= availableAbove;
  if (placeBelow) {
    return {
      right,
      top: anchor.y + anchor.height + gap,
      maxHeight: Math.min(preferredHeight, Math.max(120, availableBelow)),
    };
  }
  return {
    right,
    bottom: windowHeight - anchor.y + gap,
    maxHeight: Math.min(preferredHeight, Math.max(120, availableAbove)),
  };
}

function JourneyFooterActionLabel({
  theme,
  icon,
  label,
  danger = false,
  disabled = false,
  onAccent = false,
}: {
  theme: Theme;
  icon: IconName;
  label: string;
  danger?: boolean;
  disabled?: boolean;
  onAccent?: boolean;
}) {
  const color = onAccent ? '#FFFFFF' : disabled ? theme.text3 : danger ? theme.danger : theme.text;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
      <Icon name={icon} color={color} size={17} strokeWidth={2} />
      <Text style={{ color, fontSize: 15, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

// The journey-detail floating dock pill: a borderless capsule with a soft,
// wide drop shadow. The old 38pt pill carried a hairline border, which read
// as clutter over the map; the dock now floats on shadow alone.
// `muted` is the inactive/disabled look — sunken surface, no shadow.
function journeyFooterPill(theme: Theme, muted = false) {
  return {
    height: 46,
    minWidth: 46,
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: muted ? theme.fieldSurface : theme.controlSurface,
    boxShadow: muted
      ? 'none'
      : theme.dark
        ? '0px 8px 24px rgba(0,0,0,0.45)'
        : '0px 8px 24px rgba(0,0,0,0.10)',
  };
}

// In the dock the add action is the page's primary action, so — the way the
// collection pages do it — it takes the accent fill and white glyph, while every
// other pill stays on `controlSurface`.
function journeyFooterAccentPill(theme: Theme) {
  return {
    ...journeyFooterPill(theme),
    backgroundColor: theme.accent,
    boxShadow: theme.dark ? '0px 8px 24px rgba(0,0,0,0.55)' : '0px 8px 24px rgba(0,0,0,0.22)',
  };
}

// The 总览 dock's navigation entry. It only opens the 徒步导航 page with the
// journey's own track as the planned line; recording starts on that page, so
// this pill never begins one. `primary` is the trip window: the pill turns into
// the dock's accent primary and takes the row.
function JourneyTrailFooterPill({
  theme,
  route,
  primary,
}: {
  theme: Theme;
  route: TrailRouteRef;
  primary: boolean;
}) {
  const { t } = useI18n();
  const openTrail = useOpenTrail();
  const { session } = useTrailSnapshot();
  const running = !!session && session.status !== 'finished' && session.route?.id === route.id;
  return (
    <Press
      hitSlop={3}
      onPress={() => openTrail(route)}
      accessibilityRole="button"
      style={primary ? { ...journeyFooterAccentPill(theme), flex: 1 } : journeyFooterPill(theme)}
    >
      <JourneyFooterActionLabel
        theme={theme}
        icon="hiker"
        label={t(running ? 'journey.overview.resumeTrail' : 'journey.overview.startTrail')}
        onAccent={primary}
      />
    </Press>
  );
}

// The companion live-location share control: the 路线 pill's anatomy (hairline
// border, no shadow) shrunk one notch — 30pt tall, label first, the switch
// trails it. The switch is drawn, not native: RN's <Switch> is fixed at 51x31
// and only shrinks by scaling the whole thing, which stayed too loud for this
// pill. The whole pill is the tap target.
const MINI_TRACK_W = 26;
const MINI_TRACK_H = 15;
const MINI_THUMB = 11;
function CompanionShareSwitchPill({
  theme,
  label,
  on,
  onToggle,
}: {
  theme: Theme;
  label: string;
  on: boolean;
  onToggle: () => void;
}) {
  const progress = React.useRef(new Animated.Value(on ? 1 : 0)).current;
  const thumbTranslate = React.useMemo(
    () => progress.interpolate({ inputRange: [0, 1], outputRange: [0, MINI_TRACK_W - MINI_THUMB - 4] }),
    [progress],
  );
  useEffect(() => {
    Animated.timing(progress, {
      toValue: on ? 1 : 0,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
      // The map/detail screen can perform a heavy render after the toggle.
      // This tiny native animation must not hold an InteractionManager handle
      // or wait behind that work.
      isInteraction: false,
    }).start();
  }, [on, progress]);
  return (
    <Press
      onPress={onToggle}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        height: 30,
        paddingLeft: 9,
        paddingRight: 6,
        borderRadius: 15,
        backgroundColor: theme.controlSurface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.fieldBorder,
      }}
    >
      <Text style={{ fontSize: 11, fontWeight: '800', color: theme.text2 }}>{label}</Text>
      <View style={{
        width: MINI_TRACK_W,
        height: MINI_TRACK_H,
        borderRadius: MINI_TRACK_H / 2,
        backgroundColor: on ? theme.accent : (theme.dark ? 'rgba(120,120,128,0.42)' : 'rgba(120,120,128,0.26)'),
        justifyContent: 'center',
      }}>
        <Animated.View style={{
          width: MINI_THUMB,
          height: MINI_THUMB,
          borderRadius: MINI_THUMB / 2,
          backgroundColor: '#FFFFFF',
          marginLeft: 2,
          transform: [{ translateX: thumbTranslate }],
          boxShadow: '0px 1px 3px rgba(0,0,0,0.25)',
        }} />
      </View>
    </Press>
  );
}


function num(s: string) {
  const m = s.replace(/,/g, '').match(/[\d.]+/);
  return m ? parseFloat(m[0]) : 0;
}

function isServicesDisabled(error: unknown): boolean {
  return error instanceof CurrentPositionError && error.code === 'services_disabled';
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(resolve, reject).finally(() => clearTimeout(timeout));
  });
}

// Map avatars represent a trailhead. Once a journey has real track data, the
// track start is more trustworthy than an older manually entered place point.
function poiMapCoordinate(p: Poi): [number, number] {
  const start = p.trackCoords?.[0];
  if (start && Number.isFinite(start[0]) && Number.isFinite(start[1])) return start;
  return [p.lng ?? 0, p.lat ?? 0];
}

// 搜索此区域: the routes whose trailhead sits inside a screen rectangle of the
// current camera. Zoom is the native maps' shared Mercator scale (the world is
// 256 * 2^zoom points wide) with the camera centre at the middle of the screen;
// heading turns the screen against north. Pitch is ignored, which only loosens
// the far edge of a tilted map.
function poisInViewport(
  list: Poi[],
  camera: { center: [number, number]; zoom: number },
  heading: number,
  screen: { width: number; height: number },
  rect: { top: number; bottom: number },
): Set<string> {
  const world = 256 * 2 ** camera.zoom;
  const project = ([lng, lat]: [number, number]) => {
    const phi = (Math.max(-85, Math.min(85, lat)) * Math.PI) / 180;
    return [((lng + 180) / 360) * world, ((1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2) * world];
  };
  const [cx, cy] = project(camera.center);
  const h = (heading * Math.PI) / 180;
  const cos = Math.cos(h);
  const sin = Math.sin(h);
  const ids = new Set<string>();
  list.forEach((poi) => {
    const [px, py] = project(poiMapCoordinate(poi));
    let dx = px - cx;
    if (dx > world / 2) dx -= world;
    else if (dx < -world / 2) dx += world;
    const dy = py - cy;
    const x = screen.width / 2 + dx * cos + dy * sin;
    const y = screen.height / 2 - dx * sin + dy * cos;
    if (x >= 0 && x <= screen.width && y >= rect.top && y <= rect.bottom) ids.add(poi.id);
  });
  return ids;
}

// One pin per place: journeys sharing a trailhead are grouped under one marker.
const placeKey = (p: Poi) => {
  const [lng, lat] = poiMapCoordinate(p);
  return `${lng.toFixed(4)},${lat.toFixed(4)}`;
};

function groupByPlace(list: Poi[]): { rep: Poi; group: Poi[] }[] {
  const byPlace = new Map<string, Poi[]>();
  for (const p of list) {
    const k = placeKey(p);
    const arr = byPlace.get(k);
    if (arr) arr.push(p);
    else byPlace.set(k, [p]);
  }
  return [...byPlace.values()].map((group) => ({
    rep: group[0],
    group,
  }));
}

/**
 * One pin per place, for one 探索/旅程 layer.
 *
 * `layer` is part of the pin because the map keeps both layers mounted and hides one
 * of them by key - see `PinVisibilityApi`. `openRoute` is the route-detail case: the
 * open route's own pin is off the map (the card is showing it), so a shared trailhead
 * keeps exposing the next candidate.
 */
function pinsFromGroups(
  groups: { rep: Poi; group: Poi[] }[],
  layer: 'explore' | 'memory',
  openRoute: { id: string } | null,
) {
  return groups.flatMap(({ rep, group }) => {
    const markerCandidates = openRoute
      ? group.filter((item) => item.id !== openRoute.id)
      : group;
    const markerPoi = markerCandidates[0] ?? rep;
    if (openRoute && markerCandidates.length === 0) return [];
    const [lng, lat] = poiMapCoordinate(markerPoi);
    return [{
      id: rep.id,
      layer,
      lng,
      lat,
      mine: markerPoi.mine,
      tone: markerPoi.tone,
      count: markerCandidates.length,
      coverUri: markerPoi.photoUris?.[0],
      label: markerPoi.name,
    }];
  });
}

interface JourneySegmentGeometry {
  id: string;
  label: string;
  coordinates: [number, number][];
  color: string;
  /** Days that walk this segment. Null means the segment covers the whole journey. */
  days: string[] | null;
}

// Stable identity: a fresh empty array per render would rebuild the map's
// polyline and marker lists on every DiscoverScreen render.
const NO_ITINERARY_LEGS: JourneyLeg[] = [];
const NO_HIDDEN_JOURNEY_ROUTES: ReadonlySet<string> = new Set();

// The map's props that must never change identity between renders, or its whole
// annotation subtree is rebuilt. See the handler ref inside DiscoverScreen.
type MapHandlerSet = {
  onCameraGestureStart: NonNullable<GlobeProps['onCameraGestureStart']>;
  onCameraPositionChange: NonNullable<GlobeProps['onCameraPositionChange']>;
  onCameraOrientationChange: NonNullable<GlobeProps['onCameraOrientationChange']>;
  onCameraZoomChange: NonNullable<GlobeProps['onCameraZoomChange']>;
  onJourneyDayLabelPress: NonNullable<GlobeProps['onJourneyDayLabelPress']>;
  onJourneyStopPress: NonNullable<GlobeProps['onJourneyStopPress']>;
  onUserLocationChange: NonNullable<GlobeProps['onUserLocationChange']>;
  onPoiPress: NonNullable<GlobeProps['onPoiPress']>;
  onBackgroundPress: NonNullable<GlobeProps['onBackgroundPress']>;
};

// Fallback for the kilometre labels when the camera never reports a move: the
// fit's own duration (MapGlobe uses 250ms on iOS, 760ms on AMap) plus a little,
// so the labels cannot land inside an animation that is still running.
const DISTANCE_LABEL_FALLBACK_MS = Platform.OS === 'android' ? 820 : 420;

const NO_FOCUS_SEGMENTS: GlobeRouteSegment[] = [];

const NO_COMPANION_PINS: NativeMapMarker[] = [];
const NO_ROUTE_WAYPOINT_MARKERS: NativeMapMarker[] = [];
const NO_ROUTE_WAYPOINTS: WaypointLayer = { list: [], details: [], lines: [] };

function DiscoverScreenView({
  theme,
  active = true,
  keepMapWarm = false,
  covered = false,
  externalOverlayOpen = false,
  onBlockingOverlayChange,
}: {
  theme: Theme;
  active?: boolean;
  keepMapWarm?: boolean;
  /** An opaque page of ours fully covers the map, so it is worth no frames. */
  covered?: boolean;
  externalOverlayOpen?: boolean;
  onBlockingOverlayChange?: (open: boolean) => void;
}) {
  countRender('Discover');
  const nav = useNav();
  const { t, resolved } = useI18n();
  const data = useData();
  const { routes, journeys, routesLoading, journeysLoading, userId } = data;
  // The card list cascades in one-by-one on the first data load only; later
  // list changes (chip filters, edits, refetches) mount instantly.
  const [entrancePlayed, setEntrancePlayed] = useState(false);
  const dataLoading = routesLoading || journeysLoading;
  useEffect(() => {
    if (!dataLoading && !entrancePlayed) setEntrancePlayed(true);
  }, [dataLoading, entrancePlayed]);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { mapStyle, setMapStyle, mapLabelsVisible, setMapLabelsVisible } = useMapPresentation();
  const [mapStylePickerOpen, setMapStylePickerOpen] = useState(false);
  const [routeFeedbackOpen, setRouteFeedbackOpen] = useState(false);
  const [routeMoreOpen, setRouteMoreOpen] = useState(false);
  // The ⋯ menu finishes closing before its action runs, as on a track card.
  const routeMenuAction = usePendingMenuAction();
  const closeRouteMoreThen = (action: () => void) => {
    routeMenuAction.run(action);
    setRouteMoreOpen(false);
  };
  // 分享 opens the system share sheet straight away; the GPX / original-file
  // exports live in the ⋯ menu and run once that card has closed.
  const routeSharingRef = React.useRef(false);
  const shareOpenRoute = (action: RouteShareAction) => {
    const point = nav.pointInfo;
    if (point?.kind !== 'route' || routeSharingRef.current) return;
    routeSharingRef.current = true;
    void shareRoute(nav.merged(point), action).then((ok) => {
      routeSharingRef.current = false;
      if (!ok) nav.showToast(t('discover.routeExportFailed'));
    });
  };
  const [journeyStopsVisible, setJourneyStopsVisible] = useState(true);
  const [journeyTrackVisible, setJourneyTrackVisible] = useState(true);
  const [journeyDistanceVisible, setJourneyDistanceVisible] = useState(true);
  const [mapAtRouteFrame, setMapAtRouteFrame] = useState(true);
  // The frame button's second step, as Komoot has it: the route and the reader
  // together. It holds only while the camera action that framed it is the
  // latest one and no gesture has taken the camera since.
  const [mapFrameMeRevision, setMapFrameMeRevision] = useState<number | null>(null);
  const [framingMe, setFramingMe] = useState(false);
  // Only a twist off north reveals the compass; see MapCompass.
  const { heading: mapHeading, offNorth: mapNorthOff, onOrientation: onMapOrientation } = useMapHeading();
  const { scale: mapScale, onZoom: onMapScaleZoom, onLatitude: onMapScaleLatitude } = useMapScale();
  const [mapDistanceMarkersVisible, setMapDistanceMarkersVisible] = useState(false);
  const [routeWaypointsVisible, setRouteWaypointsVisible] = useState(false);
  const [routeReversed, setRouteReversed] = useState(false);
  // The route card's 海拔 row opens the track page for that route, full screen.
  const [routeElevationOpen, setRouteElevationOpen] = useState(false);
  const [mapCameraAction, setMapCameraAction] = useState<GlobeCameraAction>();
  const mapDisplaySettingsHydratedRef = React.useRef(false);
  const mapCameraRef = React.useRef<{ center: [number, number]; zoom: number } | null>(null);
  const mapBeforePointRef = React.useRef<{ center: [number, number]; zoom: number } | null>(null);
  const mapPointGestureRef = React.useRef(false);
  const mapMarkerPressAtRef = React.useRef(0);
  const wasMapActiveRef = React.useRef(active);
  const mapCameraEventRef = React.useRef<{ at: number } | null>(null);
  // Track annotations on the open route card: which waypoint's detail sheet is
  // open, and the (debounced, half-step) zoom the annotation groups are clustered at.
  const [openRouteWaypoint, setOpenRouteWaypoint] = useState<number | null>(null);
  // A spot pressed on the map opens as the sheet over it; one read from the
  // 途经点 row or the curve opens as the floating card, where the sheet would
  // only cover what the reader was looking at.
  const [routeWaypointPresentation, setRouteWaypointPresentation] = useState<'sheet' | 'card'>('sheet');
  // The card's 在地图上查看 hands the spot back to the map, and reopens it as the
  // sheet once the card has finished dismissing — iOS won't present over it.
  const waypointReopenRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  // The itinerary stop (by row id) whose detail sheet is open over the journey
  // map — the same sheet and drop pin a route waypoint gets.
  const [openJourneyStopId, setOpenJourneyStopId] = useState<string | null>(null);
  // Whether the finish (or a loop's trailhead) shows its 「从这里出发」 bubble.
  const [routeEndpointActionOpen, setRouteEndpointActionOpen] = useState(false);
  const [waypointClusterZoom, setWaypointClusterZoom] = useState<number | null>(null);
  const waypointZoomTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [currentLocation, setCurrentLocation] = useState<{ lng: number; lat: number; heading?: number; accuracy?: number } | null>(null);
  const [routeNavigation, setRouteNavigation] = useState<PlannedLeg | null>(null);
  // Keep the selected route active while its navigation request is being
  // resolved, so the navigation button gives immediate feedback and can cancel.
  const [routeNavigationRouteId, setRouteNavigationRouteId] = useState<string | null>(null);
  const routeNavigationRequestRef = React.useRef<AbortController | null>(null);
  useEffect(() => {
    routeNavigationRequestRef.current?.abort();
    routeNavigationRequestRef.current = null;
    setRouteNavigation(null);
    setRouteNavigationRouteId(null);
    return () => routeNavigationRequestRef.current?.abort();
  }, [nav.pointInfo?.id]);
  useEffect(() => {
    setOpenRouteWaypoint(null);
    setOpenJourneyStopId(null);
    setRouteEndpointActionOpen(false);
    setRouteElevationOpen(false);
    setWaypointClusterZoom(null);
    if (waypointZoomTimerRef.current) clearTimeout(waypointZoomTimerRef.current);
    waypointZoomTimerRef.current = null;
  }, [nav.pointInfo?.id]);
  useEffect(() => () => {
    if (waypointZoomTimerRef.current) clearTimeout(waypointZoomTimerRef.current);
  }, []);

  const openTrail = useOpenTrail();
  const followRoute = (route: Poi) => openTrail(trailRouteFromPoi(route, routeReversed));
  // The journey's navigation entry: its own line, and how loud the footer pill
  // wears it — the accent primary through the trip, a quiet pill before it.
  const journeyTrailEntry = useMemo(() => {
    const journey = nav.pointInfo?.kind === 'journey' ? nav.pointInfo : null;
    if (!journey) return null;
    const route = trailRouteFromJourney(
      journey,
      journey.trackId ? data.allTracks.find((track) => track.id === journey.trackId) ?? null : null,
    );
    if (!route) return null;
    const phase = journeyDatePhase(journey);
    return phase === 'after' ? null : { route, primary: phase === 'during' };
  }, [data.allTracks, nav.pointInfo]);
  const navigateToRoute = async (route: Poi, mode: 'driving' | 'walking' = 'driving') => {
    if (routeNavigationRouteId === route.id) {
      routeNavigationRequestRef.current?.abort();
      routeNavigationRequestRef.current = null;
      setRouteNavigation(null);
      setRouteNavigationRouteId(null);
      return;
    }
    routeNavigationRequestRef.current?.abort();
    const controller = new AbortController();
    routeNavigationRequestRef.current = controller;
    setRouteNavigation(null);
    setRouteNavigationRouteId(route.id);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      let permission = await Location.getForegroundPermissionsAsync();
      if (!permission.granted && permission.canAskAgain) permission = await Location.requestForegroundPermissionsAsync();
      if (controller.signal.aborted) return;
      if (!permission.granted) throw new Error('permission');
      const position = await getCurrentPosition();
      if (controller.signal.aborted) return;
      const from: [number, number] = [position.lng, position.lat];
      setCurrentLocation({ lng: from[0], lat: from[1] });
      timer = setTimeout(() => controller.abort(), 30000);
      let result: PlannedLeg | undefined;
      // Walked backwards, the route starts at its recorded finish, not at its pin.
      const finish = routeReversed ? route.trackCoords?.[route.trackCoords.length - 1] : undefined;
      const to: [number, number] = finish ?? [route.lng, route.lat];
      await planJourneyDirections([{ id: route.id, mode, from, to }], controller.signal, (leg) => { result = leg; });
      if (controller.signal.aborted) throw new Error('plan');
      if (!result?.coordinates || result.coordinates.length < 2) throw new Error('plan');
      setRouteNavigation(result);
      setMapAtRouteFrame(true);
      setMapCameraAction({ type: 'fitCoordinates', revision: Date.now(), coordinates: result.coordinates });
      sheetRef.current?.snapTo(1);
    } catch (error) {
      if (routeNavigationRequestRef.current !== controller) return;
      const message = error instanceof Error && error.message === 'permission'
        ? t('discover.locationPermissionDenied')
        : isServicesDisabled(error) ? t('discover.locationServicesDisabled') : t('discover.routeNavigateUnavailable');
      setRouteNavigation(null);
      setRouteNavigationRouteId(null);
      Alert.alert(t('discover.routeNavigate'), message);
    } finally {
      clearTimeout(timer);
    }
  };
  const [locating, setLocating] = useState(false);
  const [mapAtCurrentLocation, setMapAtCurrentLocation] = useState(false);
  // Permission/service checks are asynchronous. Ignore repeated taps while a
  // check is in flight so an older result cannot turn sharing back on after a
  // later tap intended to turn it off.
  const locationShareToggleInFlightRef = React.useRef(false);
  const headingSubscriptionRef = React.useRef<Location.LocationSubscription | null>(null);
  const positionSubscriptionRef = React.useRef<Location.LocationSubscription | null>(null);
  // When a clustered map pin is tapped, the same journey-list sheet is scoped to
  // that trailhead (coordinate key) — only the header copy changes to 这个地点的旅程.
  const [placeSel, setPlaceSel] = React.useState<string | null>(null);
  const adminRegion = nav.discoverRegion;
  const [adminRegionPickerOpen, setAdminRegionPickerOpen] = React.useState(false);
  const [adminRegionPickerMounted, setAdminRegionPickerMounted] = React.useState(false);
  const [adminRegionQuery, setAdminRegionQuery] = React.useState('');
  const [adminRegionScope, setAdminRegionScope] = React.useState<'china' | 'international'>('china');
  const adminRegionChevronProgress = React.useRef(new Animated.Value(0)).current;
  const adminRegionPickerProgress = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    Animated.timing(adminRegionChevronProgress, {
      toValue: adminRegionPickerOpen ? 1 : 0,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    if (adminRegionPickerOpen) setAdminRegionPickerMounted(true);
    const pickerAnimation = Animated.timing(adminRegionPickerProgress, {
      toValue: adminRegionPickerOpen ? 1 : 0,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    pickerAnimation.start(({ finished }) => {
      if (finished && !adminRegionPickerOpen) setAdminRegionPickerMounted(false);
    });
    return () => pickerAnimation.stop();
  }, [adminRegionChevronProgress, adminRegionPickerOpen, adminRegionPickerProgress]);
  React.useEffect(() => {
    if (!adminRegionPickerOpen || Platform.OS === 'web') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setAdminRegionPickerOpen(false);
      return true;
    });
    return () => subscription.remove();
  }, [adminRegionPickerOpen]);
  // The route card's elevation page is the topmost surface here, so Android's
  // back button closes it rather than dropping the card.
  React.useEffect(() => {
    if (!routeElevationOpen || Platform.OS === 'web') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setRouteElevationOpen(false);
      return true;
    });
    return () => subscription.remove();
  }, [routeElevationOpen]);
  const [focusReturnToList, setFocusReturnToList] = React.useState(false);
  const sheetRef = React.useRef<TrailSheetHandle>(null);
  const routeJourneyTransitionRef = React.useRef(false);
  const journeyDetailScrollY = React.useRef(new Animated.Value(0)).current;
  const pointSheetTranslateY = React.useRef(new Animated.Value(0)).current;
  // The list sheet's own mirror: the map tools ride it between its lower two
  // detents, and the index says when the list covers the map (LIST_SHEET_FULL).
  const listSheetTranslateY = React.useRef(new Animated.Value(0)).current;
  const [listSheetIndex, setListSheetIndex] = React.useState(LIST_SHEET_PEEK);
  const [routeFilters, setRouteFilters] = React.useState<RouteFilters>(DEFAULT_ROUTE_FILTERS);
  const [routeFilterOpen, setRouteFilterOpen] = React.useState(false);
  // 搜索此区域: the pill appears after a hand-made pan or zoom; tapping it scopes
  // the list to the routes on screen until a province is picked again.
  const [areaSearchOffered, setAreaSearchOffered] = React.useState(false);
  // The offer goes away once the map has been still for a while; the next pan
  // or zoom brings it back.
  const areaOfferTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const offerAreaSearch = React.useCallback(() => {
    setAreaSearchOffered(true);
    if (areaOfferTimerRef.current) clearTimeout(areaOfferTimerRef.current);
    areaOfferTimerRef.current = setTimeout(() => {
      areaOfferTimerRef.current = null;
      setAreaSearchOffered(false);
    }, AREA_SEARCH_OFFER_MS);
  }, []);
  useEffect(() => () => {
    if (areaOfferTimerRef.current) clearTimeout(areaOfferTimerRef.current);
  }, []);
  // Fades rather than pops, and stays mounted until the fade-out is done.
  const areaPillOpacity = React.useRef(new Animated.Value(0)).current;
  const [areaPillMounted, setAreaPillMounted] = React.useState(false);
  const [areaRouteIds, setAreaRouteIds] = React.useState<Set<string> | null>(null);
  const mapHeadingRef = React.useRef(0);

  useEffect(() => {
    let cancelled = false;
    mapDisplaySettingsHydratedRef.current = false;
    setMapStyle('standard');
    setJourneyStopsVisible(true);
    setJourneyTrackVisible(true);
    setJourneyDistanceVisible(true);
    setMapLabelsVisible(true);
    setMapDistanceMarkersVisible(false);
    setRouteWaypointsVisible(false);
    AsyncStorage.getItem(mapDisplaySettingsKey(userId))
      .then((raw) => {
        if (cancelled || !raw) return;
        try {
          const saved = JSON.parse(raw) as PersistedMapDisplaySettings;
          if (saved.mapStyle === 'standard' || saved.mapStyle === 'terrain' || saved.mapStyle === 'satellite') {
            setMapStyle(saved.mapStyle);
          }
          // A stored preference from before the itinerary split into three
          // switches carried one combined flag; let it seed all of them so a
          // user who had the chain hidden keeps it hidden.
          const legacy = saved.journeyMapDetailsVisible;
          setJourneyStopsVisible(
            typeof saved.journeyStopsVisible === 'boolean'
              ? saved.journeyStopsVisible
              : legacy ?? true,
          );
          // The connections switch left the layers panel, so a stored "hidden"
          // is not restored: nothing in the UI could turn it back on.
          setJourneyDistanceVisible(
            typeof saved.journeyDistanceVisible === 'boolean'
              ? saved.journeyDistanceVisible
              : legacy ?? true,
          );
          if (typeof saved.mapLabelsVisible === 'boolean') setMapLabelsVisible(saved.mapLabelsVisible);
          if (typeof saved.mapDistanceMarkersVisible === 'boolean') setMapDistanceMarkersVisible(saved.mapDistanceMarkersVisible);
          if (typeof saved.routeWaypointsVisible === 'boolean') setRouteWaypointsVisible(saved.routeWaypointsVisible);
        } catch {
          // Ignore malformed local preferences and keep the defaults.
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) mapDisplaySettingsHydratedRef.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!mapDisplaySettingsHydratedRef.current) return;
    const settings: PersistedMapDisplaySettings = {
      mapStyle,
      journeyStopsVisible,
      journeyTrackVisible,
      journeyDistanceVisible,
      mapLabelsVisible,
      mapDistanceMarkersVisible,
      routeWaypointsVisible,
    };
    AsyncStorage.setItem(mapDisplaySettingsKey(userId), JSON.stringify(settings)).catch(() => {});
  }, [journeyDistanceVisible, journeyStopsVisible, journeyTrackVisible, mapDistanceMarkersVisible, mapLabelsVisible, mapStyle, routeWaypointsVisible, userId]);

  const openPointFromCurrentMap = (poi: Poi, from: 'pin' | 'list' = 'list') => {
    // Switching from one card to another keeps the camera snapshot taken when the
    // first opened, so backing out returns to where the reader came from.
    if (!nav.pointInfo) mapBeforePointRef.current = mapCameraRef.current;
    mapPointGestureRef.current = false;
    nav.openPoint(poi);
  };

  const restoreMapAfterPoint = () => {
    const camera = mapBeforePointRef.current;
    if (camera) {
      setMapCameraAction((current) => ({
        type: 'restore',
        coordinate: camera.center,
        zoom: camera.zoom,
        revision: (current?.revision ?? 0) + 1,
      }));
    }
    mapBeforePointRef.current = null;
    mapPointGestureRef.current = false;
  };

  const dismissPointSheet = () => {
    restoreMapAfterPoint();
    sheetRef.current?.dismiss();
  };

  // Opening a card from outside the map (旅程 tab、我的、通知、助手) never captured
  // the discover camera, so closing it left the map framed on the journey and the
  // list sheet dismissed — the page read as reset on the way out. Take the same
  // snapshot the in-map open does, and re-apply it whenever a detail closes.
  // The detail's own framing fires camera events that overwrite mapCameraRef with
  // the journey view, so on the way out the snapshot must also replace it: the
  // thaw restore (and any remount) reads mapCameraRef and would otherwise put the
  // map wherever the detail left it instead of where it was before the open.
  const pointOpenRef = React.useRef(false);
  const prePointSheetOpenRef = React.useRef(false);
  const entryCameraRef = React.useRef<{ center: [number, number]; zoom: number } | null>(null);
  React.useEffect(() => {
    const open = !!nav.pointInfo;
    const was = pointOpenRef.current;
    if (open && !was) {
      entryCameraRef.current = mapBeforePointRef.current ?? mapCameraRef.current;
      if (!mapBeforePointRef.current) mapBeforePointRef.current = mapCameraRef.current;
    }
    if (!open && was) {
      restoreMapAfterPoint();
      if (entryCameraRef.current) mapCameraRef.current = entryCameraRef.current;
      entryCameraRef.current = null;
      if (prePointSheetOpenRef.current) nav.openSheet();
    }
    pointOpenRef.current = open;
    if (!open) prePointSheetOpenRef.current = nav.sheetOpen;
  }, [nav.pointInfo, nav.sheetOpen]);

  const planRouteJourney = React.useCallback((route: Poi) => {
    routeJourneyTransitionRef.current = true;
    // hide is an imperative animation and does not emit the sheet's index
    // callback. Keep floating route actions in sync while it leaves the screen.
    setRouteSheetIndex(0);
    // Fully move the route card off-screen before mounting the planner. Going
    // to the lowest detent first leaves a visible pause at the minimized card.
    sheetRef.current?.hide(() => nav.openNewJourney(route, { reversed: routeReversed }));
  }, [nav, routeReversed]);

  React.useEffect(() => {
    if (nav.newJourneyOpen || nav.pointInfo?.kind !== 'route' || !routeJourneyTransitionRef.current) return;
    routeJourneyTransitionRef.current = false;
    sheetRef.current?.snapTo(1);
  }, [nav.newJourneyOpen, nav.pointInfo?.kind]);

  React.useEffect(() => {
    if (active === wasMapActiveRef.current) return;
    wasMapActiveRef.current = active;
    if (!active) {
      // Anything the map reports after this point moved on its own while hidden.
      mapCameraEventRef.current = null;
      return;
    }
    const reloaded = mapReloadedWhileAwayRef.current;
    mapReloadedWhileAwayRef.current = false;
    const caughtUp = lastActiveFrameSignatureRef.current !== mapFrameSignature;
    if (!caughtUp && !reloaded) return;
    const camera = mapCameraRef.current;
    if (!camera) return;
    setMapAtRouteFrame(false);
    setMapCameraAction((current) => ({
      type: 'restore',
      coordinate: camera.center,
      zoom: camera.zoom,
      revision: (current?.revision ?? 0) + 1,
    }));
  }, [active]);

  const [planEditorOpen, setPlanEditorOpen] = useState(false);
  const [journeySheetIndex, setJourneySheetIndex] = useState(1);
  const [detailBodyHeight, setDetailBodyHeight] = useState(0);
  const [detailHeaderHeight, setDetailHeaderHeight] = useState(0);
  const [journeyIdentityHeight, setJourneyIdentityHeight] = useState(0);
  useEffect(() => {
    setJourneyIdentityHeight(0);
  }, [nav.pointInfo?.id]);
  const [routeSheetIndex, setRouteSheetIndex] = useState(1);
  // Route detail section tabs, shown only at the fullscreen detent: the panel
  // reports each section's top in the body's scroll content, the pinned header
  // reports its own height, and the tab pick follows the scroll offset through
  // `routeSectionIndexAtScroll` — state moves only when the pick actually
  // changes, never per frame.
  const routeDetailScrollY = React.useRef(new Animated.Value(0)).current;
  const [routeSections, setRouteSections] = useState<RoutePreviewSection[]>([]);
  const [routeStickyHeight, setRouteStickyHeight] = useState(0);
  const [routeActiveSection, setRouteActiveSection] = useState<RoutePreviewSectionKey>('overview');
  const routeActiveSectionRef = React.useRef<RoutePreviewSectionKey>('overview');
  const routeSectionLockUntilRef = React.useRef(0);
  const handleRouteSections = useCallback((sections: RoutePreviewSection[]) => {
    setRouteSections((current) => (
      current.length === sections.length && current.every((entry, index) => entry.key === sections[index].key && entry.y === sections[index].y)
        ? current
        : sections
    ));
  }, []);
  useEffect(() => {
    // A new card re-measures its sections from scratch.
    setRouteSections([]);
    routeActiveSectionRef.current = 'overview';
    setRouteActiveSection('overview');
  }, [nav.pointInfo?.id]);
  useEffect(() => {
    // The title block lives in the scroll body at the mid detent and moves into
    // the pinned header at fullscreen. Start each detent from the top so the
    // two copies never show through each other mid-switch.
    if (nav.pointInfo?.kind !== 'route') return;
    sheetRef.current?.scrollTo(0, false);
    routeSectionLockUntilRef.current = Date.now() + 600;
    routeActiveSectionRef.current = 'overview';
    setRouteActiveSection('overview');
  }, [routeSheetIndex, nav.pointInfo?.kind]);
  useEffect(() => {
    if (nav.pointInfo?.kind !== 'route' || routeSheetIndex !== 2) return undefined;
    const offsets = routeSections.map((section) => section.y);
    if (!offsets.length) return undefined;
    const token = routeDetailScrollY.addListener(({ value }) => {
      if (Date.now() < routeSectionLockUntilRef.current) return;
      const key = routeSections[routeSectionIndexAtScroll(offsets, value, routeStickyHeight)]?.key;
      if (!key || key === routeActiveSectionRef.current) return;
      routeActiveSectionRef.current = key;
      setRouteActiveSection(key);
    });
    return () => routeDetailScrollY.removeListener(token);
  }, [nav.pointInfo?.kind, routeSheetIndex, routeSections, routeStickyHeight, routeDetailScrollY]);
  const selectRouteSection = useCallback((key: RoutePreviewSectionKey) => {
    const section = routeSections.find((entry) => entry.key === key);
    // The header floats over the body, so land the section right under it.
    sheetRef.current?.scrollTo(Math.max(0, (section?.y ?? 0) - routeStickyHeight));
    // Trust the tapped target while the animated scroll runs; the spy would
    // otherwise flicker through the sections the glide passes over.
    routeSectionLockUntilRef.current = Date.now() + 700;
    routeActiveSectionRef.current = key;
    setRouteActiveSection(key);
  }, [routeSections, routeStickyHeight]);
  const [mapImmersive, setMapImmersive] = useState(false);
  const [selectedPlanDays, setSelectedPlanDays] = useState<Set<string>>(() => new Set());
  const [selectedJourneyDay, setSelectedJourneyDay] = useState<string | undefined>();
  // Each recorded track of a journey is its own on/off switch. Only the hidden
  // set is stored, so a track that loads later is visible by default and a
  // toggle never has to know the full route list up front.
  const [hiddenJourneyRouteIds, setHiddenJourneyRouteIds] = useState<ReadonlySet<string>>(NO_HIDDEN_JOURNEY_ROUTES);
  const toggleJourneyRouteVisible = useCallback((id: string, visible: boolean) => {
    setHiddenJourneyRouteIds((current) => {
      if (current.has(id) === !visible) return current;
      const next = new Set(current);
      if (visible) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const [journeyDaySelectionRequest, setJourneyDaySelectionRequest] = useState<{ day?: string; tab?: 'checklist'; revision: number }>();
  const [selectedJourneyTab, setSelectedJourneyTab] = useState<string>('overview');
  const [momentSelectionMode, setMomentSelectionMode] = useState(false);
  const [selectedMomentIds, setSelectedMomentIds] = useState<Set<string>>(() => new Set());
  const momentAddActionRef = React.useRef<(() => void) | null>(null);
  const momentDeleteActionRef = React.useRef<(() => Promise<void>) | null>(null);
  const momentFilterMenuRef = React.useRef<JourneyMomentFilterMenuController | null>(null);
  const checklistAddActionRef = React.useRef<(() => void) | null>(null);
  const checklistDeleteActionRef = React.useRef<(() => Promise<void>) | null>(null);
  const checklistFilterActionRef = React.useRef<(() => void) | null>(null);
  const checklistFilterMenuRef = React.useRef<JourneyChecklistFilterMenuController | null>(null);
  const [checklistSelectionMode, setChecklistSelectionMode] = useState(false);
  const [selectedChecklistItemIds, setSelectedChecklistItemIds] = useState<Set<string>>(() => new Set());
  const [checklistCanEdit, setChecklistCanEdit] = useState(true);
  const [versionRestoreDialogOpen, setVersionRestoreDialogOpen] = useState(false);
  const [versionRestoring, setVersionRestoring] = useState(false);
  const [checklistFilterMenuOpen, setChecklistFilterMenuOpen] = useState(false);
  const checklistPickerProgress = React.useRef(new Animated.Value(0)).current;
  const checklistPickerTarget = React.useRef(false);
  const animateChecklistPicker = useCallback((open: boolean) => {
    if (checklistPickerTarget.current === open) return;
    checklistPickerTarget.current = open;
    checklistPickerProgress.stopAnimation();
    Animated.timing(checklistPickerProgress, {
      toValue: open ? 1 : 0,
      duration: motion.standard,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [checklistPickerProgress]);
  const setChecklistFilterMenuVisible = useCallback((open: boolean) => {
    animateChecklistPicker(open);
    setChecklistFilterMenuOpen(open);
  }, [animateChecklistPicker]);
  const [momentFilterAnchor, setMomentFilterAnchor] = useState<FilterMenuAnchor>();
  const [momentFilterMenuOpen, setMomentFilterMenuOpen] = useState(false);
  const momentFilterMenuProgress = React.useRef(new Animated.Value(0)).current;
  const setMomentFilterMenuVisible = useCallback((open: boolean, anchor?: FilterMenuAnchor) => {
    if (anchor) setMomentFilterAnchor(anchor);
    momentFilterMenuProgress.stopAnimation();
    Animated.timing(momentFilterMenuProgress, {
      toValue: open ? 1 : 0,
      duration: open ? 140 : 90,
      easing: open
        ? Easing.bezier(0.16, 1, 0.3, 1)
        : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start();
    setMomentFilterMenuOpen(open);
  }, [momentFilterMenuProgress]);
  const [availableJourneyDays, setAvailableJourneyDays] = useState<string[]>([]);
  const [timelineSelectionMode, setTimelineSelectionMode] = useState(false);
  const [selectedTimelineItemIds, setSelectedTimelineItemIds] = useState<Set<string>>(() => new Set());
  const focusedJourneyId = nav.pointInfo?.kind === 'journey' ? nav.pointInfo.id : undefined;
  const focusedRouteId = nav.pointInfo?.kind === 'route' ? nav.pointInfo.id : undefined;
  const moveInFlightRef = React.useRef(false);
  const focusedJourneyIdRef = React.useRef(focusedJourneyId);
  focusedJourneyIdRef.current = focusedJourneyId;
  const [timelineMovePicker, setTimelineMovePicker] = useState<{ rows: TLRow[]; journeyId: string } | null>(null);
  const [movingGroup, setMovingGroup] = useState<string | undefined>();
  const [timelineMoveError, setTimelineMoveError] = useState<string>();
  useEffect(() => { setTimelineMovePicker(null); }, [focusedJourneyId, timelineSelectionMode, selectedJourneyDay]);

  const versionTimelinePreview = useMemo(
    () => nav.journeyVersionPreview
      ? { rows: nav.journeyVersionPreview.version.snapshot.timelineRows, groups: nav.journeyVersionPreview.version.snapshot.timelineGroups }
      : undefined,
    [nav.journeyVersionPreview],
  );
  const focusedTimeline = useTimeline(focusedJourneyId, userId, versionTimelinePreview);
  const timelineMoveChoices = useMemo(() => journeyMoveDestinations(
    buildJourneyGroupChoices(focusedTimeline.rows, availableJourneyDays, resolved, t),
    timelineMovePicker?.rows ?? [],
  ), [focusedTimeline.rows, availableJourneyDays, resolved, t, timelineMovePicker]);

  React.useEffect(() => {
    if (!nav.journeyVersionPreview) return;
    setPlanEditorOpen(false);
    setSelectedPlanDays(new Set());
    setTimelineSelectionMode(false);
    setSelectedTimelineItemIds(new Set());
    setMomentSelectionMode(false);
    setSelectedMomentIds(new Set());
    setChecklistSelectionMode(false);
    setSelectedChecklistItemIds(new Set());
  }, [nav.journeyVersionPreview?.version.id]);

  const restorePreviewVersion = async () => {
    const preview = nav.journeyVersionPreview;
    if (!preview || versionRestoring) return;
    setVersionRestoring(true);
    try {
      await restoreJourneyVersion(preview.version.id);
      const [refreshedJourneys] = await Promise.all([
        data.refetchJourneys(),
        refetchJourneyTimeline(preview.poi.id),
        refetchJourneyInspo(preview.poi.id),
        refetchJourneyPacking(preview.poi.id),
      ]);
      const restored = refreshedJourneys.find((journey) => journey.id === preview.poi.id);
      if (restored) {
        nav.syncJourney(restored);
        nav.completeJourneyVersionPreview(restored);
      } else {
        nav.completeJourneyVersionPreview(preview.sourcePoi);
      }
      setVersionRestoreDialogOpen(false);
      nav.showToast(t('journey.version.restoreSuccess'));
    } catch {
      nav.showToast(t('journey.version.restoreFailed'));
    } finally {
      setVersionRestoring(false);
    }
  };
  const handleSelectedJourneyDayChange = useCallback((day?: string) => {
    setSelectedJourneyDay(day);
    if (day == null) {
      setTimelineSelectionMode(false);
      setSelectedTimelineItemIds(new Set());
    }
  }, []);
  const journeyDayRequestRevision = React.useRef(0);
  // Selecting a day from the map has to move the card's tab pager as well, and
  // the request channel is the only way in from outside that pager.
  const selectJourneyDayFromMap = useCallback((day?: string) => {
    // A marker press also bubbles to NativeMap.onPress on both platforms, and
    // that background event dismisses the detail sheet. Same guard as onPoiPress.
    mapMarkerPressAtRef.current = Date.now();
    journeyDayRequestRevision.current += 1;
    setJourneyDaySelectionRequest({ day, revision: journeyDayRequestRevision.current });
    handleSelectedJourneyDayChange(day);
  }, [handleSelectedJourneyDayChange]);
  const handleSelectedJourneyTabChange = useCallback((tab: string) => {
    setSelectedJourneyTab(tab);
    if (tab === 'moments') {
      setSelectedJourneyDay(undefined);
      setTimelineSelectionMode(false);
      setSelectedTimelineItemIds(new Set());
    }
    if (tab !== 'moments') {
      momentFilterMenuProgress.setValue(0);
      setMomentFilterMenuOpen(false);
      setMomentSelectionMode(false);
      setSelectedMomentIds(new Set());
    }
    if (tab !== 'checklist') {
      checklistPickerTarget.current = false;
      checklistPickerProgress.setValue(0);
      setChecklistFilterMenuOpen(false);
      setChecklistSelectionMode(false);
      setSelectedChecklistItemIds(new Set());
    }
  }, []);
  const handleChecklistCanEditChange = useCallback((canEdit: boolean) => {
    setChecklistCanEdit(canEdit);
    if (!canEdit) {
      setChecklistSelectionMode(false);
      setSelectedChecklistItemIds((current) => current.size ? new Set() : current);
    }
  }, []);

  // 行程, 清单 and 瞬间 are read by scrolling, so arriving on one pulls the sheet
  // to its top detent. Only the arrival does it: a reader who then pushes the
  // sheet back down to the map stays down.
  const expandedJourneyTabRef = React.useRef<string | undefined>(undefined);
  React.useEffect(() => {
    const arrived = expandedJourneyTabRef.current !== selectedJourneyTab;
    expandedJourneyTabRef.current = selectedJourneyTab;
    if (!arrived) return;
    if (nav.pointInfo?.kind !== 'journey') return;
    if (selectedJourneyTab !== 'plan' && selectedJourneyTab !== 'checklist' && selectedJourneyTab !== 'moments') return;
    sheetRef.current?.snapTo(2);
  }, [nav.pointInfo?.kind, selectedJourneyTab]);

  React.useEffect(() => {
    setPlanEditorOpen(false);
    setJourneySheetIndex(1);
    setMapStylePickerOpen(false);
    setMapAtRouteFrame(true);
    if (focusedJourneyId) setMapCameraAction(undefined);
    setSelectedPlanDays(new Set());
    setSelectedJourneyDay(undefined);
    setJourneyDaySelectionRequest(undefined);
    setSelectedJourneyTab('overview');
    setMomentSelectionMode(false);
    setSelectedMomentIds(new Set());
    momentAddActionRef.current = null;
    momentDeleteActionRef.current = null;
    momentFilterMenuProgress.setValue(0);
    setMomentFilterMenuOpen(false);
    checklistAddActionRef.current = null;
    checklistDeleteActionRef.current = null;
    checklistFilterActionRef.current = null;
    setChecklistSelectionMode(false);
    setSelectedChecklistItemIds(new Set());
    setChecklistCanEdit(true);
    checklistPickerTarget.current = false;
    checklistPickerProgress.setValue(0);
    setChecklistFilterMenuOpen(false);
    setAvailableJourneyDays([]);
    setTimelineSelectionMode(false);
    setSelectedTimelineItemIds(new Set());
    journeyDetailScrollY.setValue(0);
  }, [focusedJourneyId, journeyDetailScrollY, momentFilterMenuProgress, t]);

  // Declared after the reset above so a tab asked for alongside opening the
  // journey survives that reset.
  React.useEffect(() => {
    const request = nav.journeyTabRequest;
    if (!request || request.journeyId !== focusedJourneyId) return;
    journeyDayRequestRevision.current += 1;
    setJourneyDaySelectionRequest({ tab: request.tab, day: request.day, revision: journeyDayRequestRevision.current });
    nav.clearJourneyTabRequest();
  }, [focusedJourneyId, nav.journeyTabRequest]);

  const previousFocusedRouteIdRef = React.useRef<string | undefined>(undefined);
  React.useEffect(() => {
    // Route→route is a switch, not a fresh open: the sheet keeps the snap the
    // reader put it at, so its index stays as it is and only the card changes.
    const switched = !!focusedRouteId && !!previousFocusedRouteIdRef.current;
    previousFocusedRouteIdRef.current = focusedRouteId;
    if (!switched) setRouteSheetIndex(1);
    setMapStylePickerOpen(false);
    setMapAtRouteFrame(true);
    setRouteReversed(false);
    setRouteMoreOpen(false);
    if (focusedRouteId) setMapCameraAction(undefined);
  }, [focusedRouteId]);

  React.useEffect(() => () => {
    headingSubscriptionRef.current?.remove();
    positionSubscriptionRef.current?.remove();
  }, []);

  const deleteSelectedPlanDays = () => {
    if (!selectedPlanDays.size) return;
    const selected = [...selectedPlanDays];
    const itemCount = focusedTimeline.rows.filter((row) => selectedPlanDays.has(row.day)).length;
    Alert.alert(
      t('journey.timeline.batchDeleteGroupTitle', { count: selected.length }),
      t('journey.timeline.batchDeleteGroupMessage', { count: itemCount }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            void Promise.all(selected.map((day) => focusedTimeline.removeGroup(day)));
            setSelectedPlanDays(new Set());
          },
        },
      ],
    );
  };

  const deleteSelectedTimelineItems = () => {
    if (!selectedTimelineItemIds.size) return;
    Alert.alert(
      t('journey.timeline.batchDeleteConfirmTitle', { count: selectedTimelineItemIds.size }),
      t('journey.timeline.deleteConfirmMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await Promise.all([...selectedTimelineItemIds].map((id) => focusedTimeline.remove(id)));
                setSelectedTimelineItemIds(new Set());
              } catch (error) {
                // Keep the selection so the same delete can be retried.
                if (isWriteBusy(error)) {
                  Alert.alert(t('journey.timeline.saveBusyTitle'), t('journey.timeline.saveBusyMessage'));
                } else {
                  Alert.alert(t('journey.timeline.deleteFailedTitle'), t('journey.timeline.deleteFailedMessage'));
                }
              }
            })();
          },
        },
      ],
    );
  };

  const moveSelectedTimelineItems = () => {
    if (!focusedJourneyId || moveInFlightRef.current || !selectedTimelineItemIds.size) return;
    const rows = focusedTimeline.rows.filter((row) => selectedTimelineItemIds.has(row.id));
    const choices = buildJourneyGroupChoices(focusedTimeline.rows, availableJourneyDays, resolved, t);
    if (!journeyMoveDestinations(choices, rows).length) return;
    setTimelineMoveError(undefined);
    setTimelineMovePicker({ rows, journeyId: focusedJourneyId });
  };
  const closeTimelineMovePicker = () => {
    if (!moveInFlightRef.current) setTimelineMovePicker(null);
  };
  const moveTimelineItemsToGroup = async (group: string) => {
    if (!timelineMovePicker || moveInFlightRef.current || focusedJourneyId !== timelineMovePicker.journeyId) return;
    const { rows, journeyId } = timelineMovePicker;
    moveInFlightRef.current = true;
    setMovingGroup(group);
    setTimelineMoveError(undefined);
    try {
      // Settle every write before enabling another move, including partial failures.
      const results = await Promise.allSettled(rows.filter((row) => row.day !== group).map((row) => focusedTimeline.update(row.id, { day: group })));
      const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
      if (failure) throw failure.reason;
      setTimelineMovePicker(null);
      if (focusedJourneyIdRef.current === journeyId) {
        setSelectedTimelineItemIds(new Set());
        nav.showToast(t('journey.timeline.moveSuccess', { group: group || t('journey.timeline.pendingGroup') }));
      }
    } catch (error) {
      // Preserve the selection so an unsuccessful move can be retried.
      setTimelineMoveError(t(isWriteBusy(error) ? 'journey.timeline.saveBusyMessage' : 'journey.timeline.moveFailedMessage'));
    } finally {
      moveInFlightRef.current = false;
      setMovingGroup(undefined);
    }
  };


  const chromeTheme = theme;

  // Public-track journeys to inject into explore tab: shared journeys from
  // the user (and eventually from other users) that are trackPublic + have track data.
  const publicTrackPois: Poi[] = useMemo(() => {
    const all = [...nav.extraJourneys, ...journeys];
    const seen = new Set<string>();
    return all
      .filter((p) => { if (seen.has(p.id)) return false; seen.add(p.id); return true; })
      .filter((p) => !nav.removedIds.includes(p.id))
      .map((p) => nav.merged(p)) // apply journeyPatch (e.g. trackPublic toggle before DB sync)
      .filter((p) => p.trackPublic && p.trackCoords && p.trackCoords.length > 0)
      .map((p) => ({ ...p, kind: 'route' as const, mine: true, fav: false })); // show as route card in explore tab
  }, [nav.extraJourneys, journeys, nav.removedIds, nav.journeyPatch]);

  // Built without the route-detail rules, because those say which pins are visible
  // and not what a pin is: see the rail below.
  const exploreBasePois: Poi[] = useMemo(() => {
    const merged = [...nav.savedRoutes, ...routes, ...publicTrackPois];
    const seen = new Set<string>();
    return merged.filter((p) => { if (seen.has(p.id)) return false; seen.add(p.id); return true; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav.savedRoutes, routes, publicTrackPois]);

  // The camera follows adminRegion at once; the region's list and pins follow a
  // frame later. Switching the data re-renders the list and reveals the region's
  // pins - ~150ms of JS for 全国 - and doing it in the same commit held the zoom
  // back by that much. MapKit animates on the main thread, so the same work done
  // once the zoom is running costs it nothing.
  const [dataRegion, setDataRegion] = useState(adminRegion);
  useEffect(() => {
    if (dataRegion === adminRegion) return;
    // Two frames: the region effect's camera action renders and starts the fit
    // in the first.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => setDataRegion(adminRegion));
    });
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminRegion]);
  const regionBasePois = useMemo(
    () => dataRegion === '全国'
      ? exploreBasePois
      : exploreBasePois.filter((poi) => adminRegionOf(poi) === dataRegion),
    [dataRegion, exploreBasePois],
  );
  const basePois: Poi[] = regionBasePois;

  const areaBasePois = useMemo(
    () => (areaRouteIds ? exploreBasePois.filter((p) => areaRouteIds.has(p.id)) : basePois),
    [areaRouteIds, exploreBasePois, basePois],
  );
  // Only 离我最近 reads the location. Keying every sort on it rebuilt the list,
  // the place groups and (on Android) every pin marker on each location update,
  // starting with the launch fix that lands mid province fit.
  const sortLocation = routeFilters.sort === 'near' ? currentLocation : null;
  const pois = useMemo(
    () => applyRouteFilters(areaBasePois, routeFilters, { location: sortLocation }),
    [areaBasePois, routeFilters, sortLocation],
  );

  // The sheet's list: scoped to one trailhead when a clustered pin is tapped,
  // otherwise the full (chip-filtered) list. The map still shows every place.
  const displayPois = useMemo(
    () => (placeSel ? pois.filter((p) => placeKey(p) === placeSel) : pois),
    [pois, placeSel]
  );

  const visibleAdminRegions = useMemo(() => {
    const query = adminRegionQuery.trim();
    const source: readonly string[] = adminRegionScope === 'china' ? ADMIN_REGION_OPTIONS : INTERNATIONAL_REGION_OPTIONS;
    const available = new Set<string>(source);
    if (adminRegionScope === 'china') {
      exploreBasePois.map(adminRegionOf).forEach((region) => {
        if (source.includes(region)) available.add(region);
      });
    }
    return [...available].sort((a, b) => a === '全国' ? -1 : b === '全国' ? 1 : a.localeCompare(b))
      .filter((region) => !query || region.includes(query));
  }, [adminRegionQuery, adminRegionScope, exploreBasePois]);

  const chooseAdminRegion = useCallback((region: string) => {
    launchProvinceSettled = true;
    rememberPickedRegion(region);
    nav.setDiscoverRegion(region);
    setAdminRegionPickerOpen(false);
    setAdminRegionQuery('');
    setPlaceSel(null);
    // A new region is framed by the effect below; fitting here as well started a
    // second camera animation on top of the first. Only re-picking the current
    // region, which that effect never sees, re-frames from here.
    const coordinates = region === adminRegionRef.current ? adminRegionFit(region) : undefined;
    if (coordinates) {
      setMapAtCurrentLocation(false);
      setMapCameraAction((current) => ({
        type: 'fitCoordinates',
        revision: (current?.revision ?? 0) + 1,
        coordinates,
        // Administrative overviews should be centred in the full map viewport;
        // the usual route padding reserves space above the journey sheet and
        // makes a province appear too high on the screen.
        padding: [24, 24, 24, 24],
      }));
    }
  }, []);

  // Picking a province again leaves the searched area.
  useEffect(() => {
    setAreaRouteIds(null);
    setAreaSearchOffered(false);
  }, [adminRegion]);

  // The shared search page can change the active destination directly through
  // navigation state. Keep the map camera in sync with that selection.
  useEffect(() => {
    const coordinates = adminRegionFit(adminRegion);
    if (!coordinates) return;
    const animated = launchRegionFitted;
    launchRegionFitted = true;
    setMapAtCurrentLocation(false);
    setPlaceSel(null);
    setMapCameraAction((current) => ({
      type: 'fitCoordinates',
      revision: (current?.revision ?? 0) + 1,
      coordinates,
      padding: [24, 24, 24, 24],
      animated,
    }));
  }, [adminRegion]);

  // The whole country is a heap of overlapping avatars, so the map opens on
  // the user's province instead. It starts on the province the last launch
  // located (see launchRegion), then locates once and switches only if the user
  // has moved, which the effect above turns into a camera fit. A region the
  // user picked while the fix was pending is left alone.
  const adminRegionRef = React.useRef(adminRegion);
  adminRegionRef.current = adminRegion;
  useEffect(() => {
    if (launchProvinceSettled) return;
    let cancelled = false;
    void (async () => {
      try {
        let permission = await Location.getForegroundPermissionsAsync();
        if (!permission.granted && permission.canAskAgain) permission = await Location.requestForegroundPermissionsAsync();
        if (!permission.granted || cancelled) return;
        const position = await getCurrentPosition();
        if (cancelled) return;
        setCurrentLocation((current) => current ?? { lng: position.lng, lat: position.lat, heading: position.heading, accuracy: position.accuracy ?? undefined });
        let geocoded = position.place?.region;
        if (!geocoded) {
          let timer: ReturnType<typeof setTimeout> | undefined;
          const addresses = await Promise.race([
            Location.reverseGeocodeAsync({ latitude: position.lat, longitude: position.lng }).catch(() => null),
            new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), 2000); }),
          ]);
          clearTimeout(timer);
          geocoded = addresses?.[0]?.region ?? undefined;
        }
        const province = provinceAt(position.lng, position.lat, geocoded);
        if (cancelled || launchProvinceSettled) return;
        launchProvinceSettled = true;
        rememberLaunchRegion(province);
        // Abroad goes back to the national view, as a first launch would show.
        const located = province ?? '全国';
        if (!launchRegionPicked() && adminRegionRef.current === launchRegion() && located !== adminRegionRef.current) nav.setDiscoverRegion(located);
      } catch (error) {
        // Without a fix the map simply stays on the national view.
        console.warn('Failed to locate launch province', error instanceof Error ? error.message : error);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);



  // In place view the header ＋ means 再次出发 on this trailhead: seed the new
  // journey flow with the place's first matching route as the template.
  // Drawn from basePois so it survives chip filtering hiding every row.
  const placePreset = useMemo(() => {
    if (!placeSel) return undefined;
    return basePois.find((p) => placeKey(p) === placeSel);
  }, [placeSel, basePois]);

  // Map pins: one per place, with a count badge when several journeys share it.
  const placeGroups = useMemo(() => groupByPlace(pois), [pois]);
  const repIdToGroup = useMemo(() => {
    const m = new Map<string, Poi[]>();
    placeGroups.forEach((g) => m.set(g.rep.id, g.group));
    return m;
  }, [placeGroups]);
  // Highlight the place's pin whenever any journey at that place is selected
  // (the selected sibling may not be the representative shown on the map).
  const activeRepId = useMemo(() => {
    const sel = nav.pointInfo?.id;
    if (!sel) return null;
    const g = placeGroups.find((grp) => grp.group.some((p) => p.id === sel));
    return g ? g.rep.id : sel;
  }, [placeGroups, nav.pointInfo?.id]);

  const globeSize = Math.min(width * 0.86, 360);
  const tabSpace = insets.bottom + 76;
  const collapsed = Math.round(height * 0.4);
  // Measure through the duration/distance/participants row, before the tabs.
  // Include the sheet grabber so wrapped titles and font scaling remain flush
  // with the bottom edge. The fallback is only used before the first layout.
  const journeyMinimum = nav.pointInfo?.kind === 'journey' && journeyIdentityHeight > 0 && detailHeaderHeight > 0
    ? detailHeaderHeight + journeyIdentityHeight
    : Math.round(height * 0.15);
  const full = Math.round(height * 0.88);
  // A route card opens fully only up to its top chrome (back, share, ⋯), so
  // those stay reachable at every detent.
  const routeChromeBottom = insets.top + space.xs + layout.iconButton + space.xs;
  const routeFull = Math.round(height - routeChromeBottom);
  // The card's top detent; the map controls ride the sheet from there.
  const pointFull = nav.pointInfo?.kind === 'route' ? routeFull : full;
  const focusPanel = Math.round(height * 0.56);
  // Fullscreen leaves nothing over the map, so the fit may use the whole screen.
  // The snap-based paddings below would keep a dead band exactly as tall as the
  // card that is currently off screen.
  const immersiveFitBottom = Math.round(insets.bottom + 28);

  // The list's lowest detent shows only its header (grabber and title) above
  // the home indicator. The header is measured, like journeyMinimum.
  // The peek also clears the tab bar, which stays up at that detent.
  const listPeekBase = Math.max(insets.bottom, space.sm) + BOTTOM_TABS_HEIGHT;
  const listPeek = !nav.pointInfo && detailHeaderHeight > 0
    ? Math.min(detailHeaderHeight + listPeekBase + space.xs, collapsed - space.xxxl)
    : Math.round(height * 0.15);

  // The route list is always there under the map.
  const listShown = !nav.pointInfo;
  const sheetVisible = listShown || !!nav.pointInfo;
  // Bottom of the list-mode map tool column, shared by the compass in the
  // bottom-left corner.
  // With the list open the column is anchored at the full detent and rides the
  // sheet down from half to peek. Above half the list covers it, so it stays put.
  const listMapToolsBottom = sheetVisible ? full + 16 : tabSpace + 56;
  const listMapToolsShift = useMemo(() => (sheetVisible
    ? listSheetTranslateY.interpolate({
        inputRange: [0, full - collapsed, full - listPeek],
        outputRange: [full - collapsed, full - collapsed, full - listPeek],
        extrapolate: 'clamp',
      })
    : 0), [sheetVisible, listSheetTranslateY, full, collapsed, listPeek]);
  // The list starts at peek and keeps its detent across route cards.
  // Above peek the list covers the tab bar's strip, so the bar steps aside.
  const areaPillShown = areaSearchOffered && active && listSheetIndex !== LIST_SHEET_FULL;
  useEffect(() => {
    if (areaPillShown) setAreaPillMounted(true);
    const anim = Animated.timing(areaPillOpacity, { toValue: areaPillShown ? 1 : 0, duration: motion.standard, useNativeDriver: true });
    anim.start(({ finished }) => { if (finished && !areaPillShown) setAreaPillMounted(false); });
    return () => anim.stop();
  }, [areaPillShown, areaPillOpacity]);
  const exploreListRaised = active && listShown && listSheetIndex > LIST_SHEET_PEEK;
  useEffect(() => {
    nav.setTabBarHidden('discoverList', exploreListRaised);
  }, [exploreListRaised, nav.setTabBarHidden]);
  useEffect(() => () => nav.setTabBarHidden('discoverList', false), [nav.setTabBarHidden]);
  const rawFocusCoords = useMemo<[number, number][] | null>(() => {
    const point = nav.pointInfo;
    if (!point) return null;
    // Route-card state changes (for example, toggling favorite) replace the
    // point object but must not be treated as a new map focus target.
    if (point.kind === 'route') {
      if ((point.trackCoords?.length ?? 0) >= 2) return point.trackCoords ?? null;
      return Number.isFinite(point.lng) && Number.isFinite(point.lat) ? [[point.lng, point.lat]] : null;
    }
    const routeTracks = journeyRouteIds(point, focusedTimeline.rows, routes)
      .map((routeId) => routes.find((route) => route.id === routeId)?.trackCoords)
      .filter((coords): coords is [number, number][] => (coords?.length ?? 0) >= 2);
    // A timeline can still contain only the first route id. Prefer the
    // journey's persisted geometry when it covers at least as much data.
    const timelineCoords = routeTracks.flat();
    if ((point.trackCoords?.length ?? 0) >= 2 && point.trackCoords!.length >= timelineCoords.length) return point.trackCoords!;
    if (timelineCoords.length >= 2) return timelineCoords;
    if ((point.trackCoords?.length ?? 0) >= 2) return point.trackCoords!;

    // Older journeys may only keep the source route id. Their detail map should
    // still frame that route instead of falling back to the journey avatar pin.
    const linkedRouteTrack = point.routeId ? routes.find((route) => route.id === point.routeId)?.trackCoords : undefined;
    if ((linkedRouteTrack?.length ?? 0) >= 2) return linkedRouteTrack!;

    return Number.isFinite(point.lng) && Number.isFinite(point.lat) ? [[point.lng, point.lat]] : null;
  }, [nav.pointInfo?.id, nav.pointInfo?.kind, nav.pointInfo?.trackCoords, nav.pointInfo?.routeId, nav.pointInfo?.lng, nav.pointInfo?.lat, focusedTimeline.rows, routes]);
  // Opening a journey from the Journey tab otherwise mounts the detail tree,
  // initializes the Android map, and measures the full track in one JS frame.
  // Let the sheet/press transition get on screen first, then add the expensive
  // route geometry after native interactions settle.
  const [readyDetailId, setReadyDetailId] = useState<string | null>(null);
  useEffect(() => {
    if (!nav.pointInfo) {
      setReadyDetailId(null);
      return;
    }
    const detailId = nav.pointInfo.id;
    const task = InteractionManager.runAfterInteractions(() => setReadyDetailId(detailId));
    return () => task.cancel();
  }, [nav.pointInfo?.id]);
  const detailReady = !nav.pointInfo || readyDetailId === nav.pointInfo.id;
  const focusCoords = detailReady ? rawFocusCoords : null;
  // The kilometre labels are up to 60 snapshot markers. Mounting them in the same
  // commit that starts the camera fit puts all of that inside the animation, which
  // is exactly where the frames are — and the fit changes the zoom, so the step
  // they were built for is stale 180ms later and they are built a second time.
  // They now wait for the move to be reported; the timeout covers a card that
  // never moves the camera (the map was panned by hand before the tap).
  const [distanceMarkersReady, setDistanceMarkersReady] = useState(false);
  useEffect(() => {
    if (!nav.pointInfo || !detailReady) {
      setDistanceMarkersReady(false);
      return;
    }
    const timer = setTimeout(() => setDistanceMarkersReady(true), DISTANCE_LABEL_FALLBACK_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav.pointInfo?.id, detailReady]);
  // Which geometry the journey map draws depends only on the tracks and the day
  // boundaries. Selecting a day only changes emphasis, so the per-day slicing
  // below stays out of that path — it copies the whole track into segments.
  const journeySegmentGeometry = useMemo<JourneySegmentGeometry[]>(() => {
    if (nav.pointInfo?.kind !== 'journey') return [];
    const routeIds = journeyRouteIds(nav.pointInfo, focusedTimeline.rows, routes);
    const routeSegments = routeIds.flatMap((routeId, index) => {
      const route = routes.find((item) => item.id === routeId);
      if (!route?.trackCoords || route.trackCoords.length < 2) return [];
      const routeRows = focusedTimeline.rows.filter((row) => row.routeId === routeId);
      return [{
        id: `journey-route-${routeId}`,
        label: route.name,
        coordinates: route.trackCoords,
        color: JOURNEY_SEGMENT_COLORS[index % JOURNEY_SEGMENT_COLORS.length],
        days: [...new Set(routeRows.map((row) => row.day).filter(Boolean))] as string[],
      }];
    });
    const persistedTrack = nav.pointInfo.trackCoords;
    const timelinePointCount = routeSegments.reduce((sum, segment) => sum + segment.coordinates.length, 0);
    if (persistedTrack && persistedTrack.length >= 2 && persistedTrack.length > timelinePointCount) {
      return [{
        id: 'journey-persisted-track',
        label: nav.pointInfo.name,
        coordinates: persistedTrack,
        color: JOURNEY_SEGMENT_COLORS[0],
        days: null,
      }];
    }
    if (routeSegments.length) return routeSegments;
    return [];
  }, [focusedTimeline.rows, nav.pointInfo?.kind, nav.pointInfo?.name, routes]);
  const focusSegments = useMemo(() => journeySegmentGeometry
    // A track switched off is removed from the map entirely (and from camera
    // framing), not merely dimmed — each recorded track is an independent layer.
    .filter((segment) => !hiddenJourneyRouteIds.has(segment.id))
    .map((segment) => ({
      id: segment.id,
      label: segment.label,
      coordinates: segment.coordinates,
      color: segment.color,
      // Opening a day still only re-emphasises the visible tracks.
      active: selectedJourneyDay == null || !segment.days || segment.days.includes(selectedJourneyDay),
    })), [hiddenJourneyRouteIds, journeySegmentGeometry, selectedJourneyDay]);
  const journeyRouteOptions = useMemo(() => {
    if (nav.pointInfo?.kind !== 'journey') return [];
    const seen = new Set<string>();
    return journeySegmentGeometry.filter((segment) => {
      // Day-based fallback sections are useful on the map, but they are not
      // separate user-selectable route tracks. Only a linked route geometry or
      // the journey's own persisted track becomes a switch.
      if (!segment.id.startsWith('journey-route-') && segment.id !== 'journey-persisted-track') return false;
      if (seen.has(segment.id)) return false;
      seen.add(segment.id);
      return segment.coordinates.length >= 2;
    }).map((segment) => ({
      id: segment.id,
      label: segment.label,
      color: segment.color,
      visible: !hiddenJourneyRouteIds.has(segment.id),
      distance: `${((measureTrack(segment.coordinates)?.totalMeters ?? 0) / 1000).toFixed(1)} km`,
    }));
  }, [hiddenJourneyRouteIds, journeySegmentGeometry, nav.pointInfo?.kind]);
  useEffect(() => {
    setHiddenJourneyRouteIds(NO_HIDDEN_JOURNEY_ROUTES);
  }, [nav.pointInfo?.id]);
  const routeDetailSegments = useMemo<GlobeRouteSegment[]>(() => {
    const point = nav.pointInfo;
    const coordinates = focusCoords ?? [];
    if (point?.kind !== 'route' || coordinates.length < 2) return [];
    return [{
      id: 'route-detail-primary',
      label: point.name,
      coordinates: routeReversed ? [...coordinates].reverse() : coordinates,
      color: theme.accent,
      active: true,
      endpoints: false,
    }];
  }, [focusCoords, nav.pointInfo, routeReversed, theme.accent]);
  // The route card's own annotation layer: the track's library waypoints drawn
  // on the open route, and the detail sheet's items for the same taps — the same pair the
  // 徒步导航 page builds, so a tap opens the spot's detail there and here alike.
  // Built through `extraMarkers` rather than a MapGlobe prop because that file's
  // framing test vm-loads it against a fixed import list.
  const routeWaypointLine = useMemo<WaypointLayerLine | null>(() => {
    const point = nav.pointInfo;
    if (!point || point.kind !== 'route' || !point.trackWaypoints?.length) return null;
    const primary = focusCoords;
    if (!primary || primary.length < 2) return null;
    const drawn = routeReversed ? [...primary].reverse() : primary;
    return {
      key: `route-wp-${point.id}`,
      coords: drawn,
      waypoints: point.trackWaypoints,
      color: theme.accent,
      elevation: point.trackElevation,
      flipKm: routeReversed,
    };
  }, [focusCoords, nav.pointInfo?.id, nav.pointInfo?.kind, nav.pointInfo?.trackElevation, nav.pointInfo?.trackWaypoints, routeReversed, theme.accent]);
  // The card's detail sheet reads off this ungated layer, so a spot opens even
  // while the map's own waypoint layer is off or still waiting for its zoom.
  const routeWaypointListLayer = useMemo<WaypointLayer>(() => (
    routeWaypointLine ? buildWaypointLayer([routeWaypointLine]) : NO_ROUTE_WAYPOINTS
  ), [routeWaypointLine]);
  // The map's own copy, sharing the opening frame's budget with the kilometre
  // labels: both wait for the card's camera fit to be reported, when the real
  // zoom is known, and it rides the layer switch.
  const routeWaypointLayer = useMemo<WaypointLayer>(() => (
    routeWaypointLine && routeWaypointsVisible && distanceMarkersReady && !routeNavigation
      ? buildWaypointLayer([routeWaypointLine])
      : NO_ROUTE_WAYPOINTS
  ), [distanceMarkersReady, routeNavigation, routeWaypointLine, routeWaypointsVisible]);
  // Walking-order numbers, one per waypoint, drawn in the map's circles; they
  // renumber when the line is drawn reversed.
  const routeWaypointNumbers = useMemo(
    () => waypointOrder(routeWaypointListLayer.details),
    [routeWaypointListLayer],
  );
  // The list, its order and the direction it was built for can all change under
  // an open sheet; the spot it shows is then gone.
  useEffect(() => {
    setOpenRouteWaypoint(null);
  }, [routeWaypointListLayer]);
  // A spot the card is reading, with the map still in view above it, wears the
  // drop pin instead of its dot. Under the `card` presentation the map is
  // dimmed behind a scrim, so nothing is dropped there and the dots stay put.
  const waypointPinIndex = openRouteWaypoint != null && routeWaypointPresentation === 'sheet'
    ? openRouteWaypoint
    : null;
  const waypointPinDetail = waypointPinIndex != null ? routeWaypointListLayer.details[waypointPinIndex] : undefined;
  // Taken apart, not kept as the hook's object: a fresh object every render
  // would rebuild the marker, and the map would re-register the pin constantly.
  const {
    photoReady: pinPhotoReady,
    photoRevision: pinPhotoRevision,
    onPhotoLoad: pinPhotoLoad,
  } = useDropPinPhoto(waypointPinDetail?.photo);
  const routeWaypointMarkers = useMemo<NativeMapMarker[]>(() => {
    if (!routeWaypointLayer.list.length) return NO_ROUTE_WAYPOINT_MARKERS;
    return buildRouteWaypointMarkers({
      theme,
      waypoints: routeWaypointLayer.list,
      variant: 'numbered',
      numbers: routeWaypointNumbers,
      hideIndex: waypointPinIndex,
      // The opening box is the same whichever way the line is drawn.
      zoom: waypointClusterZoom ?? estimateRouteWaypointZoom(focusCoords ?? [], width - 108, Math.max(140, height * 0.42)),
      onWaypointPress: (index) => {
        // A marker press bubbles to the map background on both platforms; the
        // guard is what keeps the card from dismissing itself.
        mapMarkerPressAtRef.current = Date.now();
        setRouteWaypointPresentation('sheet');
        setOpenRouteWaypoint(index);
      },
      onClusterPress: (coordinates) => {
        mapMarkerPressAtRef.current = Date.now();
        setMapCameraAction({ type: 'fitCoordinates', revision: Date.now(), coordinates });
      },
      clusterSpotsLabel: (n) => t('journey.map.clusterSpots', { n }),
    });
  }, [focusCoords, routeWaypointLayer, routeWaypointNumbers, t, theme, waypointClusterZoom, waypointPinIndex, width, height]);
  const routeWaypointPin = useMemo<NativeMapMarker[]>(() => {
    const detail = waypointPinDetail;
    if (waypointPinIndex == null || !detail || detail.lng == null || detail.lat == null) return NO_ROUTE_WAYPOINT_MARKERS;
    return [waypointDropPinMarker({
      theme,
      pinKey: `route-${waypointPinIndex}`,
      coordinate: [detail.lng, detail.lat],
      number: routeWaypointNumbers[waypointPinIndex] ?? waypointPinIndex + 1,
      photo: detail.photo,
      photoReady: pinPhotoReady,
      photoRevision: pinPhotoRevision,
      onPhotoLoad: pinPhotoLoad,
      title: detail.name,
      // Reading the pin, not tapping it: the press only has to stop the
      // background tap the marker's press bubbles into.
      onPress: () => { mapMarkerPressAtRef.current = Date.now(); },
    })];
  }, [theme, waypointPinDetail, waypointPinIndex, pinPhotoReady, pinPhotoRevision, pinPhotoLoad, routeWaypointNumbers]);
  const openWaypointLine = openRouteWaypoint != null
    ? routeWaypointListLayer.lines.find((line) => openRouteWaypoint >= line.start && openRouteWaypoint < line.end)
    : undefined;
  // The sheet swipes in walking order, not the library's save order: reversing
  // the line reorders the pages too. `index` inside the sheet is the position
  // in this page list; it maps back to the layer's details index.
  const openWaypointIndexes = useMemo(() => {
    if (!openWaypointLine) return null;
    const ordered = routeWaypointListLayer.details
      .map((detail, index) => ({ index, number: routeWaypointNumbers[index] ?? index + 1 }))
      .filter((entry) => entry.index >= openWaypointLine.start && entry.index < openWaypointLine.end)
      .sort((a, b) => a.number - b.number || a.index - b.index)
      .map((entry) => entry.index);
    return ordered.length ? ordered : null;
  }, [openWaypointLine, routeWaypointListLayer, routeWaypointNumbers]);
  const routeWaypointItems = useMemo(
    () => (openWaypointIndexes
      ? openWaypointIndexes.map((index) => ({
        ...routeWaypointListLayer.details[index],
        number: routeWaypointNumbers[index] ?? index + 1,
      }))
      : []),
    [openWaypointIndexes, routeWaypointListLayer, routeWaypointNumbers],
  );
  const openWaypointPage = openRouteWaypoint != null && openWaypointIndexes
    ? openWaypointIndexes.indexOf(openRouteWaypoint)
    : -1;
  // Swiping the sheet moves the pin with it, and the map along: the new spot is
  // put back in the band above the card, at the zoom the user was already at.
  // Under the `card` presentation the map is behind a scrim and nobody has seen
  // it since the card came up, so the selection moves and the camera doesn't.
  const swipeWaypointTo = useCallback((page: number) => {
    const layerIndex = openWaypointIndexes?.[page];
    if (layerIndex == null || layerIndex === openRouteWaypoint) return;
    setOpenRouteWaypoint(layerIndex);
    if (routeWaypointPresentation !== 'sheet') return;
    const detail = routeWaypointListLayer.details[layerIndex];
    const lng = detail?.lng;
    const lat = detail?.lat;
    if (lng == null || lat == null) return;
    setMapCameraAction((current) => ({
      type: 'locate',
      revision: (current?.revision ?? 0) + 1,
      coordinate: [lng, lat],
      zoom: mapCameraRef.current?.zoom,
      inFrame: true,
    }));
  }, [openRouteWaypoint, openWaypointIndexes, routeWaypointListLayer, routeWaypointPresentation]);
  // 在地图上查看: the card was read with the map buried under the panel, so it
  // hands the spot back the way pressing its dot always did — the sheet drops to
  // the map detent, the camera goes to the spot, and it reopens as the sheet over
  // the map. The reopen waits out the card's own exit, which iOS won't allow a
  // fresh sheet to overlap.
  const showWaypointOnMap = useCallback((item: MarkDetailItem, page: number) => {
    const layerIndex = openWaypointIndexes?.[page];
    if (layerIndex == null || item.lng == null || item.lat == null) return;
    const coordinate: [number, number] = [item.lng, item.lat];
    setOpenRouteWaypoint(null);
    mapMarkerPressAtRef.current = Date.now();
    setRouteSheetIndex(1);
    sheetRef.current?.snapTo(1);
    setMapCameraAction((current) => ({ type: 'locate', revision: (current?.revision ?? 0) + 1, coordinate }));
    if (waypointReopenRef.current) clearTimeout(waypointReopenRef.current);
    waypointReopenRef.current = setTimeout(() => {
      setRouteWaypointPresentation('sheet');
      setOpenRouteWaypoint(layerIndex);
    }, 380);
  }, [openWaypointIndexes]);
  useEffect(() => () => {
    if (waypointReopenRef.current) clearTimeout(waypointReopenRef.current);
  }, []);
  // The itinerary's own navigation layer: every stop that carries a place, and
  // the road between two stops of the same day. Gated behind `detailReady`
  // because it is derived from the timeline fetch, and a journey opened from the
  // tab must not spend its first frames on it.
  const itineraryStops = useMemo(() => (
    nav.pointInfo?.kind === 'journey' && detailReady
      ? buildJourneyStops(focusedTimeline.rows, focusedTimeline.knownGroups)
      : []
  ), [detailReady, focusedTimeline.knownGroups, focusedTimeline.rows, nav.pointInfo?.kind]);
  // A day keeps one colour along the whole chain, so the itinerary reads as
  // the same sequence the day chips at the bottom of the sheet show.
  const itineraryDayColors = useMemo(() => {
    const days = journeyDayOrder(focusedTimeline.rows, focusedTimeline.knownGroups);
    return new Map(days.map((day, index) => [day, JOURNEY_SEGMENT_COLORS[index % JOURNEY_SEGMENT_COLORS.length]]));
  }, [focusedTimeline.knownGroups, focusedTimeline.rows]);
  const itineraryColor = useCallback((day: string | undefined) => itineraryDayColors.get(day ?? '') ?? theme.accent, [itineraryDayColors, theme.accent]);
  // Which recorded tracks this journey's places can sit on, resolved once so the
  // chain can draw a hiking day along the path instead of asking for a road.
  const itineraryTracks = useMemo(() => (
    nav.pointInfo?.kind === 'journey' && detailReady
      ? journeyTracks(nav.pointInfo, focusedTimeline.rows, routes)
      : []
  ), [detailReady, focusedTimeline.rows, nav.pointInfo, routes]);
  const itineraryTrackCoords = useMemo(() => new Map(
    itineraryTracks.flatMap((track) => track.ids.map((id) => [id, track.coords] as const)),
  ), [itineraryTracks]);
  const itineraryLegs = useMemo(() => (
    itineraryStops.length >= 2
      ? buildJourneyLegs(itineraryStops, (trackId) => itineraryTrackCoords.get(trackId))
      : []
  ), [focusedTimeline.rows, itineraryStops, itineraryTrackCoords]);
  // The numbered stops, the route chain and the per-day distance capsules are
  // three independent switches, but they all read off the same chain geometry
  // and the camera frames that chain. So the chain stays measured and framed as
  // long as any one of them is on.
  const journeyItineraryActive = journeyStopsVisible || journeyTrackVisible || journeyDistanceVisible;
  const legGeometry = useJourneyLegGeometry(
    journeyItineraryActive ? itineraryLegs : NO_ITINERARY_LEGS,
    journeyItineraryActive,
  );
  const journeyStops = useMemo<GlobeJourneyStop[]>(() => (
    journeyStopsVisible
      ? itineraryStops
        // Other days' places stay off the map while a day is open: their pins sit
        // between the reader and the chain being followed. Day chips below the
        // card are the way back to another day from here.
        .filter((stop) => selectedJourneyDay == null || selectedJourneyDay === (stop.day ?? ''))
        .map((stop) => ({
          id: stop.rowId,
          // Numbers belong to the open day alone: they match that day's card
          // positions. The overview shows plain dots, otherwise a previous day's
          // "2" sits in front of this day's "1" and reads as a reversed route.
          order: selectedJourneyDay != null ? stop.order : undefined,
          name: stop.name,
          coordinate: stop.coordinate,
          color: itineraryColor(stop.day),
        }))
      : []
  ), [itineraryColor, itineraryStops, journeyStopsVisible, selectedJourneyDay]);
  // A stop pressed on the map reads like a route waypoint: the sheet pages
  // through that day's places in order, and the open one wears the drop pin.
  const openJourneyStop = openJourneyStopId != null
    ? itineraryStops.find((stop) => stop.rowId === openJourneyStopId)
    : undefined;
  const openJourneyStopDay = openJourneyStop?.day;
  const journeyStopPages = useMemo(() => (
    openJourneyStop
      ? itineraryStops.filter((stop) => stop.day === openJourneyStopDay)
      : []
  ), [itineraryStops, openJourneyStop, openJourneyStopDay]);
  const journeyStopItems = useMemo<MarkDetailItem[]>(() => {
    if (!journeyStopPages.length) return [];
    const rowsById = new Map(focusedTimeline.rows.map((row) => [row.id, row]));
    // An undated stop has no day to name, so its card leaves the line off.
    const source = openJourneyStopDay
      ? { name: journeyDayDisplayLabel(openJourneyStopDay, resolved), color: itineraryColor(openJourneyStopDay) }
      : undefined;
    return journeyStopPages.map((stop) => {
      const media = rowsById.get(stop.rowId)?.media?.find((item) => item.thumb || (!item.video && item.uri));
      return {
        key: stop.rowId,
        name: stop.name,
        photo: media ? media.thumb ?? media.uri : undefined,
        lng: stop.coordinate[0],
        lat: stop.coordinate[1],
        number: stop.order,
        source,
      };
    });
  }, [focusedTimeline.rows, itineraryColor, journeyStopPages, openJourneyStopDay, resolved]);
  const openJourneyStopPage = openJourneyStop ? journeyStopPages.indexOf(openJourneyStop) : -1;
  // The list can change under an open sheet (an edit, a hidden layer); the
  // stop it shows is then gone.
  useEffect(() => {
    if (openJourneyStopId != null && (!openJourneyStop || !journeyStopsVisible)) setOpenJourneyStopId(null);
  }, [journeyStopsVisible, openJourneyStop, openJourneyStopId]);
  const {
    photoReady: journeyPinPhotoReady,
    photoRevision: journeyPinPhotoRevision,
    onPhotoLoad: journeyPinPhotoLoad,
  } = useDropPinPhoto(journeyStopItems[openJourneyStopPage]?.photo);
  const journeyStopPin = useMemo<NativeMapMarker[]>(() => {
    const item = journeyStopItems[openJourneyStopPage];
    if (!openJourneyStop || !item) return NO_ROUTE_WAYPOINT_MARKERS;
    return [waypointDropPinMarker({
      theme,
      pinKey: `journey-${openJourneyStop.rowId}`,
      coordinate: openJourneyStop.coordinate,
      number: openJourneyStop.order,
      photo: item.photo,
      photoReady: journeyPinPhotoReady,
      photoRevision: journeyPinPhotoRevision,
      onPhotoLoad: journeyPinPhotoLoad,
      title: item.name,
      onPress: () => { mapMarkerPressAtRef.current = Date.now(); },
    })];
  }, [journeyPinPhotoLoad, journeyPinPhotoReady, journeyPinPhotoRevision, journeyStopItems, openJourneyStop, openJourneyStopPage, theme]);
  // Swiping the sheet moves the pin and the map with it, as on a route.
  const swipeJourneyStopTo = useCallback((page: number) => {
    const stop = journeyStopPages[page];
    if (!stop || stop.rowId === openJourneyStopId) return;
    setOpenJourneyStopId(stop.rowId);
    setMapCameraAction((current) => ({
      type: 'locate',
      revision: (current?.revision ?? 0) + 1,
      coordinate: stop.coordinate,
      zoom: mapCameraRef.current?.zoom,
      inFrame: true,
    }));
  }, [journeyStopPages, openJourneyStopId]);
  const journeyLegs = useMemo<GlobeJourneyLeg[]>(() => (
    journeyTrackVisible
      ? itineraryLegs.filter((leg) => !leg.pendingTrack || Boolean(legGeometry[leg.id])).map((leg) => {
        const planned = legGeometry[leg.id];
        return {
          id: leg.id,
          coordinates: planned ?? leg.fallbackGeometry ?? [leg.from, leg.to],
          color: itineraryColor(leg.day),
          active: selectedJourneyDay == null || selectedJourneyDay === (leg.day ?? ''),
          // No plan yet (or none available): a plain link, not a road.
          dashed: !planned,
        };
      })
      : []
  ), [itineraryColor, itineraryLegs, journeyTrackVisible, legGeometry, selectedJourneyDay]);
  // Each day's own mileage, read off the chain rather than off a recorded
  // track: it is what that day's legs actually travel. Only the open day keeps
  // its capsule: "how far is each day" is a question the overview asks, and a
  // chip is text sitting on top of the road it labels, so the others would
  // cover the line the user is now reading. The dim chain stays tappable and
  // still switches days.
  const journeyDayLabels = useMemo<GlobeJourneyDayLabel[]>(() => (
    journeyDistanceVisible
      ? measureJourneyDays(itineraryLegs, legGeometry)
        .filter((measured) => selectedJourneyDay == null || selectedJourneyDay === (measured.day ?? ''))
        .map((measured) => ({
          day: measured.day,
          title: journeyDayDisplayLabel(measured.day, resolved),
          distance: measured.pendingTrack ? t('journey.map.trackAccessPending') : [
            `${measured.meters < 10_000 ? (measured.meters / 1000).toFixed(1) : Math.round(measured.meters / 1000)}km`,
            measured.userDrawn ? t('journey.map.drawnDistance') : null,
            // A straight link is not a distance anyone can walk or drive; say so
            // rather than let it read like the road length.
            measured.straightLine === 'all' ? t('journey.map.straightDistance') : null,
            measured.straightLine === 'part' ? t('journey.map.partlyStraightDistance') : null,
          ].filter(Boolean).join(' '),
          coordinate: measured.coordinate,
          color: itineraryColor(measured.day),
        }))
      : []
  ), [itineraryColor, itineraryLegs, journeyDistanceVisible, legGeometry, resolved, selectedJourneyDay, t]);
  const journeyDayChainRef = React.useRef<[number, number][] | null>(null);
  // What the map frames when no day is open: every leg, every place, and the
  // recorded track. The track alone is not enough — a planned day can sit well
  // away from anything actually walked. Deliberately built from leg endpoints
  // rather than road geometry: plans arrive asynchronously, and a new array here
  // would refit the camera under the user.
  const journeyOverviewFrame = useMemo<[number, number][]>(() => (
    journeyItineraryActive
      ? [
        ...itineraryLegs.flatMap((leg) => [leg.from, leg.to]),
        ...itineraryStops.map((stop) => stop.coordinate),
        ...journeySegmentGeometry.flatMap((segment) => segment.coordinates),
        ...(rawFocusCoords ?? []),
      ]
      : []
  ), [itineraryLegs, itineraryStops, journeyItineraryActive, journeySegmentGeometry, rawFocusCoords]);
  const dayLegs = journeyItineraryActive && selectedJourneyDay != null
    ? itineraryLegs.filter((leg) => (leg.day ?? '') === selectedJourneyDay)
    : [];
  const dayTrackCoords = journeyItineraryActive && selectedJourneyDay != null
    // Where the day also has recorded track of its own, keep that in frame: a
    // walked detour can leave the planned chain. A whole-journey track (which
    // carries no day) is deliberately out.
    ? journeySegmentGeometry
      .filter((segment) => segment.days?.includes(selectedJourneyDay))
      .flatMap((segment) => segment.coordinates)
    : [];
  const legCoords = (leg: JourneyLeg) => legGeometry[leg.id] ?? [leg.from, leg.to];
  journeyDayChainRef.current = !journeyItineraryActive
    ? null
    // Returning to the overview goes to the same box the journey opened with.
    : selectedJourneyDay == null
      ? journeyOverviewFrame
      // A day is its legs plus its own pins. Chains never cross into the next
      // day, so a day holding a single place has no leg at all and its pin has
      // to carry the frame on its own — MapGlobe then moves the camera to that
      // one coordinate, kept clear of the card the same way a fit is.
      : [
        ...dayLegs.flatMap(legCoords),
        ...itineraryStops.filter((stop) => (stop.day ?? '') === selectedJourneyDay).map((stop) => stop.coordinate),
        ...dayTrackCoords,
      ];
  // Framing runs off the day alone, not off the chain: the road plan for a leg
  // can arrive after the tap, and refitting then would drag the camera the user
  // may have moved on their own in the meantime.
  const journeyDayCameraRef = React.useRef<string | undefined>(undefined);
  useEffect(() => {
    const previousDay = journeyDayCameraRef.current;
    journeyDayCameraRef.current = selectedJourneyDay;
    const coordinates = journeyDayChainRef.current;
    // Back to the overview only counts as a real transition when a day was open
    // before it; on the first render there simply was no day yet.
    if (selectedJourneyDay == null && previousDay == null) return;
    if (!coordinates?.length) return;
    setMapCameraAction((current) => ({ type: 'fitCoordinates', revision: (current?.revision ?? 0) + 1, coordinates }));
  }, [selectedJourneyDay]);
  const journeyCoverUri = nav.pointInfo?.kind === 'journey' ? nav.pointInfo.photoUris?.[0] : undefined;
  const journeyHeroMode = nav.pointInfo?.kind === 'journey'
    // The gated `focusCoords` is intentionally null for the first frames of an
    // open, which would read as "this journey has no track" and swap the
    // already-mounted map out for the cover image, then remount it. The raw
    // geometry is in memory, so the hero decision never waits for the gate.
    ? nav.pointInfo.heroMode ?? ((rawFocusCoords?.length ?? 0) >= 2 ? 'track' : journeyCoverUri ? 'cover' : 'track')
    : 'track';
  const journeyShowsCover = journeyHeroMode === 'cover' && !!journeyCoverUri;
  const journeyChromeColor = journeyShowsCover ? '#FFFFFF' : theme.text;
  const journeyMapFull = nav.pointInfo?.kind === 'journey' && journeySheetIndex === 0 && !journeyShowsCover;
  const routeMapFull = nav.pointInfo?.kind === 'route' && routeSheetIndex === 0;
  // The "N km" pills clutter the line while the card is up: they read as map
  // furniture, so they belong to the fullscreen map (the lowest detent or
  // immersive), not to the mid or fully-open drawer. Journeys keep theirs.
  const routeKmLabelsVisible = nav.pointInfo?.kind === 'route' && (routeMapFull || mapImmersive);
  const mapStylePickerVisible = mapStylePickerOpen;
  // The layers panel takes the detail card's place, and hiding the card drives the
  // shared sheet value off-screen — which would drag the control columns that ride
  // it, the layers button included, down with it. While the panel is open they hold
  // their own detent offset instead of following the card away.
  const pointControlsDetentShift = Math.max(0, pointFull - [journeyMinimum, focusPanel, pointFull][nav.pointInfo?.kind === 'journey' ? journeySheetIndex : routeSheetIndex]);
  const journeyMapBottomPadding = journeySheetIndex === 0
    ? journeyMinimum + space.xl
    : journeySheetIndex === 1
      ? focusPanel + space.xl
      : full + space.md;
  // The tab pager fills the sheet body up to the card's own bottom inset, so a
  // swipe below short content still lands on the pager. The sheet's body viewport
  // is fixed (the snap animation translates the sheet, it doesn't resize it).
  const detailBottomInset = nav.pointInfo?.kind === 'journey' ? 76 : 0;
  const detailPagerBodyHeight = Math.max(0, detailBodyHeight - detailBottomInset);
  const pointMapControlsVisible = nav.pointInfo?.kind === 'journey'
    ? journeySheetIndex < 2
    : nav.pointInfo?.kind === 'route'
      ? routeSheetIndex < 2
      : false;
  const fitMapRoute = () => {
    setMapStylePickerOpen(false);
    setMapAtRouteFrame(true);
    setMapCameraAction((current) => ({ type: 'fitRoute', revision: (current?.revision ?? 0) + 1 }));
  };
  const mapFramesMe = mapAtRouteFrame && mapFrameMeRevision != null && mapCameraAction?.revision === mapFrameMeRevision;

  // One button, three states: off the route it frames the route; on the route
  // it pulls back until the reader's own position is in the frame too; from
  // there it goes back to the route.
  const cycleMapFrame = async () => {
    if (!mapAtRouteFrame || mapFramesMe || !focusCoords?.length) {
      fitMapRoute();
      return;
    }
    if (framingMe) return;
    setMapStylePickerOpen(false);
    setFramingMe(true);
    const fix = await locateForFraming();
    setFramingMe(false);
    if (!fix.ok) {
      nav.showToast(t(framingFailureKey(fix.reason)));
      return;
    }
    const { position } = fix;
    setCurrentLocation((current) => ({ lng: position.lng, lat: position.lat, heading: position.heading ?? current?.heading, accuracy: position.accuracy ?? undefined }));
    // Unique across both revision schemes in this file (+1 and Date.now()).
    const revision = Date.now();
    setMapFrameMeRevision(revision);
    setMapAtRouteFrame(true);
    setMapCameraAction({ type: 'fitCoordinates', revision, coordinates: [...focusCoords, [position.lng, position.lat]] });
  };

  // Levels the camera without moving it: centre and zoom stay where the user
  // left them, only the twist and the tilt come back to north-up.
  const resetMapNorth = () => {
    setMapStylePickerOpen(false);
    setMapCameraAction((current) => ({ type: 'resetNorth', revision: (current?.revision ?? 0) + 1 }));
  };

  // Fullscreen is a card/camera state, not another page: the detail sheet stays
  // mounted and slides off screen. Unmounting it would cost the card its active
  // tab, scroll offset and day-collapse state, and re-measure the pager on the
  // way back, so a mistimed exit would read as the detail reloading itself.
  const enterMapImmersive = () => {
    setMapStylePickerOpen(false);
    setMapImmersive(true);
    sheetRef.current?.hide();
    // Only re-frame while the camera still belongs to the route. If the user
    // panned away on their own, fullscreen must reveal the map, not move it.
    if (mapAtRouteFrame) fitMapRoute();
  };

  const exitMapImmersive = () => {
    setMapImmersive(false);
    const index = nav.pointInfo?.kind === 'route' ? routeSheetIndex : journeySheetIndex;
    sheetRef.current?.snapTo(index > 1 ? 1 : index);
    if (mapAtRouteFrame) fitMapRoute();
  };

  // Nothing inside fullscreen can close the point, but another surface can (the
  // leave-journey action in AppRoot does). Without the card there would be a map
  // with no detail on it and no chrome around it.
  React.useEffect(() => {
    if (!nav.pointInfo) setMapImmersive(false);
  }, [nav.pointInfo]);

  // The one exit from fullscreen is a tap on the map, which is invisible by
  // design. Android's back button is the safety net if that tap never lands.
  const exitMapImmersiveRef = React.useRef(exitMapImmersive);
  React.useEffect(() => {
    exitMapImmersiveRef.current = exitMapImmersive;
  });
  React.useEffect(() => {
    if (!mapImmersive || !active || Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      exitMapImmersiveRef.current();
      return true;
    });
    return () => subscription.remove();
  }, [mapImmersive, active]);

  // The layers panel takes the detail card's place at the bottom of the screen,
  // so the card slides away while the panel is open and the map above it stays
  // readable. hide() is imperative and never emits the sheet's index callback,
  // so the detent the reader was on survives; the card comes back to exactly it.
  const cardDetentBeforeLayersRef = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (!mapStylePickerOpen) {
      const detent = cardDetentBeforeLayersRef.current;
      cardDetentBeforeLayersRef.current = null;
      // A trip into fullscreen owns the sheet now; it restores the card itself.
      if (detent == null || mapImmersive || !nav.pointInfo) return;
      sheetRef.current?.snapTo(detent);
      return;
    }
    if (!nav.pointInfo || mapImmersive) {
      // No detail card to tuck away — the list sheet or fullscreen is showing,
      // so forget the detent rather than snapping back over it later.
      cardDetentBeforeLayersRef.current = null;
      return;
    }
    if (cardDetentBeforeLayersRef.current != null) return;
    cardDetentBeforeLayersRef.current = nav.pointInfo.kind === 'journey' ? journeySheetIndex : routeSheetIndex;
    sheetRef.current?.hide();
  }, [mapImmersive, mapStylePickerOpen, nav.pointInfo, nav.pointInfo?.kind, routeSheetIndex, journeySheetIndex]);

  const setRouteDirection = (reversed: boolean) => {
    if (nav.pointInfo?.kind !== 'route' || reversed === routeReversed) return;
    setRouteReversed(reversed);
    setRouteEndpointActionOpen(false);
    // A leg planned to the old trailhead now leads to the finish.
    if (routeNavigationRouteId === nav.pointInfo.id) {
      routeNavigationRequestRef.current?.abort();
      routeNavigationRequestRef.current = null;
      setRouteNavigation(null);
      setRouteNavigationRouteId(null);
    }
    setMapAtRouteFrame(true);
    setMapCameraAction((current) => ({ type: 'fitRoute', revision: (current?.revision ?? 0) + 1 }));
  };

  React.useEffect(() => {
    // Full-screen pickers must cover the bottom tab bar as well as the map.
    onBlockingOverlayChange?.(
      mapStylePickerVisible || adminRegionPickerOpen || adminRegionPickerMounted || routeFilterOpen || routeElevationOpen,
    );
  }, [adminRegionPickerMounted, adminRegionPickerOpen, mapStylePickerVisible, onBlockingOverlayChange, routeElevationOpen, routeFilterOpen]);

  const locateCurrentPosition = useCallback(async () => {
    if (locating) return;
    setLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        nav.showToast(t('discover.locationPermissionDenied'));
        return;
      }
      const approximateLocation = permission.ios?.accuracy === 'reduced'
        || permission.android?.accuracy === 'coarse';
      const position = await getCurrentPosition();
      const coordinate: [number, number] = [position.lng, position.lat];
      setCurrentLocation({ lng: position.lng, lat: position.lat, heading: position.heading, accuracy: position.accuracy ?? undefined });
      setMapCameraAction((current) => ({
        type: 'locate',
        coordinate,
        revision: (current?.revision ?? 0) + 1,
      }));
      setMapAtCurrentLocation(true);
      if (approximateLocation) nav.showToast(t('discover.locationApproximate'));

      if (!NATIVE_MAP_ENABLED) {
        positionSubscriptionRef.current?.remove();
        void Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Highest,
            distanceInterval: 2,
            timeInterval: 1000,
          },
          (updatedPosition) => {
            const updatedHeading = updatedPosition.coords.heading;
            setCurrentLocation((current) => ({
              lng: updatedPosition.coords.longitude,
              lat: updatedPosition.coords.latitude,
              heading: updatedHeading != null && updatedHeading >= 0 ? updatedHeading : current?.heading,
            }));
          },
        )
          .then((subscription) => { positionSubscriptionRef.current = subscription; })
          .catch(() => {});

        headingSubscriptionRef.current?.remove();
        void Location.watchHeadingAsync((value) => {
          const heading = value.trueHeading >= 0 ? value.trueHeading : value.magHeading;
          if (!Number.isFinite(heading) || heading < 0) return;
          setCurrentLocation((current) => current ? { ...current, heading } : current);
        })
          .then((subscription) => { headingSubscriptionRef.current = subscription; })
          .catch(() => {});
      }
    } catch (error) {
      console.warn('Failed to locate current position', error instanceof Error ? error.message : error);
      nav.showToast(t(isServicesDisabled(error) ? 'discover.locationServicesDisabled' : 'discover.locationFailed'));
    } finally {
      setLocating(false);
    }
  }, [locating, nav, t]);



  // ── companion live location (旅程伙伴位置) ──
  // The viewer side only; publishing lives app-wide behind the toggle (see
  // src/lib/companionPresence.ts). The map stops taking re-renders while it is
  // covered or inactive, and presence follows the same rule — an updating pin
  // nobody can see is still churn on the marker arrays.
  const openJourneyId = nav.pointInfo?.kind === 'journey' && !nav.journeyVersionPreview
    ? nav.pointInfo.id
    : null;
  const sharingJourneyId = useSharingJourneyId();
  const sharingThisJourney = !!openJourneyId && sharingJourneyId === openJourneyId;
  // Location sharing is scoped to the journey detail that started it. The
  // publisher lives above this screen so it can survive ordinary renders, but
  // it must stop as soon as the detail is dismissed or this tab is left.
  useEffect(() => {
    if (!sharingJourneyId) return;
    if (!active || sharingJourneyId !== openJourneyId) setSharingJourneyId(null);
  }, [active, openJourneyId, sharingJourneyId]);
  const { peers, presenceClock } = useCompanionLocations(openJourneyId, active && !covered);
  const selfPresence = useLastSelfPresence();
  const companionPins = useMemo<NativeMapMarker[]>(() => {
    // While sharing, the publisher's own fix rides along as a pin too — the
    // blue location dot exists regardless, but the avatar is what tells the
    // user their share is live, and peers see the identical pin for them.
    const entries: Array<{ peer: (typeof peers)[number]; self: boolean }> = [
      ...peers.filter((peer) => peer.userId !== userId).map((peer) => ({ peer, self: false })),
      ...(sharingThisJourney && selfPresence ? [{ peer: selfPresence, self: true }] : []),
    ];
    if (!entries.length) return NO_COMPANION_PINS;
    const now = Date.now();
    const companionList = nav.pointInfo?.kind === 'journey' ? nav.pointInfo.companionList : undefined;
    return entries.flatMap(({ peer, self }) => {
      const companion = companionList?.find((c) => c.userId === peer.userId);
      if (!companion && !self) return [];
      // Measured from when *this* device last saw the entry change, never from
      // the sender's stamp: phones do not agree on the time of day, and a
      // companion two minutes fast used to compute a negative age here and be
      // invisible to everyone forever, with nothing on screen to explain it.
      const age = now - peer.seenAt;
      if (age > PRESENCE_DROP_MS) return [];
      // Your own pin goes grey on this rule too: a publisher that has stopped
      // getting through is exactly what the grey ring means, and it is the only
      // feedback this screen gives (no toast in either direction of the switch).
      const stale = age > PRESENCE_STALE_MS;
      const pinContent: DropPinContent = {
        kind: 'avatar',
        avatarUrl: companion?.avatarUrl || (self ? data.profile.avatarUrl : undefined),
        stale,
        ageLabel: t('discover.shareLocationAgo', { minutes: Math.max(1, Math.round(age / 60_000)) }),
      };
      return [{
        // Android snapshots marker content by id, so everything the pixel
        // depends on — position and the staleness step — has to live in it.
        // Include the local arrival stamp in the id. After a rapid share
        // off/on cycle native maps can retain a removed annotation's recycled
        // view when it is re-added with the exact same id, leaving the data in
        // the array but no avatar on screen. A new presence arrival must be a
        // new native annotation identity, even when the coordinates are
        // unchanged.
        id: `companion-${peer.userId}-${Math.round(peer.longitude * 10000)}-${Math.round(peer.latitude * 10000)}-${peer.seenAt}-${stale ? `old-${Math.floor(age / 60_000)}` : 'live'}`,
        coordinate: [peer.longitude, peer.latitude],
        // The ground dot — not the pin tip — is the position: anchor there,
        // so the pin hovers over the place like Apple's does.
        ...dropPinPlacement(pinContent),
        // A live person outranks the static itinerary furniture they overlap:
        // the numbered start/end pins sit at z 0, so the avatar floats above
        // them wherever a companion is standing on the route.
        zIndex: 100,
        content: <DropPin theme={theme} clipId={`companion-drop-${peer.userId}`} content={pinContent} />,
      }];
    });
  }, [data.profile.avatarUrl, nav.pointInfo, presenceClock, peers, selfPresence, sharingThisJourney, t, theme, userId]);
  // Waypoints ride along beside the companion pins: `MapGlobe` appends
  // `extraMarkers` last, so both land over the track furniture.
  // The open route's 起/终 trailheads. Tapping the finish offers 「从这里出发」,
  // the map's way of reversing the route; the layer sheet keeps a switch too.
  const reverseRouteFromMap = () => {
    const point = nav.pointInfo;
    if (point?.kind !== 'route') return;
    const next = !routeReversed;
    setRouteDirection(next);
    const climb = directedClimb(nav.merged(point), next);
    const fmt = (meters: number) => `${Math.round(meters).toLocaleString('en-US')} m`;
    nav.showToast(climb.ascent != null && climb.descent != null
      ? t('route.direction.reversed', { ascent: fmt(climb.ascent), descent: fmt(climb.descent) })
      : t('route.direction.reversedPlain'));
  };
  const reverseRouteFromMapRef = React.useRef(reverseRouteFromMap);
  reverseRouteFromMapRef.current = reverseRouteFromMap;
  const routeEndpointMarkers = useMemo<NativeMapMarker[]>(() => {
    if (nav.pointInfo?.kind !== 'route' || !focusCoords || focusCoords.length < 2) return NO_ROUTE_WAYPOINT_MARKERS;
    const loop = isLoopTrack(focusCoords);
    return buildRouteEndpointMarkers({
      theme,
      drawnCoords: routeReversed ? [...focusCoords].reverse() : focusCoords,
      loop,
      labels: {
        start: t('route.direction.start'),
        finish: t('route.direction.finish'),
        action: t(loop ? 'route.direction.walkOpposite' : 'route.direction.startHere'),
      },
      actionOpen: routeEndpointActionOpen,
      onEndpointPress: () => {
        mapMarkerPressAtRef.current = Date.now();
        setRouteEndpointActionOpen((open) => !open);
      },
      onActionPress: () => {
        mapMarkerPressAtRef.current = Date.now();
        reverseRouteFromMapRef.current();
      },
    });
  }, [focusCoords, nav.pointInfo?.kind, routeEndpointActionOpen, routeReversed, t, theme]);
  const mapExtraMarkers = useMemo(() => {
    const route = [...routeEndpointMarkers, ...routeWaypointMarkers, ...routeWaypointPin, ...journeyStopPin];
    return route.length ? [...companionPins, ...route] : companionPins;
  }, [companionPins, journeyStopPin, routeEndpointMarkers, routeWaypointMarkers, routeWaypointPin]);
  const toggleLocationShare = useCallback(async () => {
    if (!openJourneyId) return;
    if (locationShareToggleInFlightRef.current) return;
    if (sharingJourneyId === openJourneyId) {
      // No toast on stop either — the switch sliding back and the avatars
      // vanishing is the whole answer (user: "点击位置后不需要触发通知条").
      setSharingJourneyId(null);
      return;
    }
    locationShareToggleInFlightRef.current = true;
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        nav.showToast(t('discover.locationPermissionDenied'));
        locationShareToggleInFlightRef.current = false;
        return;
      }
      // Android grants permission without the device-wide provider being on, and
      // the watch would then deliver nothing at all: the switch reads on and no
      // avatar ever appears. Same escape the locate button uses, same reason.
      if (!await withTimeout(Location.hasServicesEnabledAsync(), 3_000, 'Checking location services timed out')) {
        nav.showToast(t('discover.locationFailed'));
        locationShareToggleInFlightRef.current = false;
        return;
      }
    } catch {
      // Permission dialogs and provider checks can reject when iOS services
      // are toggled while the dialog is visible. Keep the switch off instead
      // of allowing an unhandled promise to become a React Native fatal error.
      nav.showToast(t('discover.locationFailed'));
      locationShareToggleInFlightRef.current = false;
      return;
    }
    // The detail card may have changed while the permission dialog was open.
    // Do not publish for a journey that is no longer displayed.
    const stillOpenJourneyId = nav.pointInfo?.kind === 'journey' && !nav.journeyVersionPreview
      ? nav.pointInfo.id
      : null;
    if (stillOpenJourneyId === openJourneyId) setSharingJourneyId(openJourneyId);
    locationShareToggleInFlightRef.current = false;
  }, [nav, openJourneyId, sharingJourneyId, t]);

  // sheet stats
  const totalKm = useMemo(() => displayPois.reduce((s, p) => s + num(p.dist), 0), [displayPois]);
  // ── which pins are on screen, decided without a render ──
  // The switch used to cost whatever the marker list costs, because changing what is
  // on screen meant rebuilding it: 62ms for a handful of journey pins, 284ms for the
  // whole route catalog, and still ~190ms both ways after every trick that keeps the
  // pin *objects* stable - walking 148 markers is itself the price. So the price is
  // taken out of React: both layers are mounted, and the visible set is pushed to the
  // map, which moves per-pin Animated values the way zooming moves `pinScale`.
  //
  // iOS only. AMap snapshots a marker's children into a bitmap (its own docs: 当使用
  // children 时，会将 React Native 组件渲染为图片显示在地图上), so an alpha set on the
  // content afterwards is baked in and cannot be animated back - Android keeps the
  // old path, unchanged from before.
  const pinVisibilityApi = React.useRef<PinVisibilityApi | null>(null);
  const railAvailable = Platform.OS === 'ios' && NATIVE_MAP_ENABLED;
  // The rail stays up under a detail card too. It used to come down for one — the
  // map got the visible layer alone, on the reasoning that hiding 74 pins behind a
  // card only costs annotations. But taking the rail down *is* the swap the rail
  // exists to avoid, and it lands in the same commit as the camera fit and the
  // card: every pin of the layer that just went away is unmounted on the way in
  // and remounted (each one an offscreen snapshot of a photo pin) on the way out.
  // Idle annotations are the cheaper side of that trade by a wide margin — and now
  // measured both ways on device: keeping the rail costs 255ms of blocked frames
  // across an open and 113ms across a close, taking it down for the card costs 441ms
  // and 284ms.
  const useRail = railAvailable;
  // Every region's pins stay mounted; the province only changes which are
  // visible (placeGroups is region-scoped). Building the rail from the region
  // unmounted nearly every pin when the launch fix switched 全国 to the user's
  // province, in the same commit as that province's camera fit.
  const exploreLayerPins = useMemo(
    () => pinsFromGroups(groupByPlace(exploreBasePois), 'explore', null),
    [exploreBasePois],
  );
  const railPins = exploreLayerPins;
  const liveLayerPins = useMemo(
    () => pinsFromGroups(
      placeGroups,
      'explore',
      nav.pointInfo?.kind === 'route' ? { id: nav.pointInfo.id } : null,
    ),
    [nav.pointInfo?.id, nav.pointInfo?.kind, placeGroups],
  );
  const mapPois = useRail ? railPins : liveLayerPins;
  const visiblePinKeys = useMemo(() => {
    if (!useRail) {
      const keys = new Set<string>();
      mapPois.forEach((pin) => keys.add(pinKey(pin)));
      return keys;
    }
    // The chip and the route-detail rules live here now: the same places the old code
    // built pins from, said as who may be seen rather than who exists.
    return railVisibleKeys(
      placeGroups,
      'explore',
      nav.pointInfo?.kind === 'route' ? { id: nav.pointInfo.id } : null,
    );
  }, [mapPois, nav.pointInfo?.id, nav.pointInfo?.kind, placeGroups, useRail]);
  const pinsEnteredRef = React.useRef(false);
  /** The region whose pins the last apply carried. `dataRegion` trails
      `adminRegion` by two frames (the camera fit goes first), so the pending
      cascade is consumed by the apply that really holds the new region's keys. */
  const staggeredRegionRef = React.useRef(dataRegion);
  const pinVisibilityStateRef = React.useRef({ visiblePinKeys, dataRegion });
  pinVisibilityStateRef.current = { visiblePinKeys, dataRegion };
  const syncPinVisibility = React.useCallback(() => {
    const api = pinVisibilityApi.current;
    if (!api) return;
    const { visiblePinKeys, dataRegion } = pinVisibilityStateRef.current;
    // The cascade plays when the pins arrive: on the first paint, and again as a
    // region's places swap in behind the camera fit that started a frame earlier.
    // Everything else — a chip filter, a card opening, a refetch — is an edit to
    // what is already on screen and lands at once.
    const regionChanged = staggeredRegionRef.current !== dataRegion;
    staggeredRegionRef.current = dataRegion;
    const stagger = regionChanged || !pinsEnteredRef.current;
    // An empty catalog has not played an entrance yet. Keep it pending until
    // the first visible places arrive from the route request.
    if (visiblePinKeys.size > 0) pinsEnteredRef.current = true;
    api.apply(visiblePinKeys, { stagger });
  }, []);
  React.useEffect(() => {
    syncPinVisibility();
  }, [visiblePinKeys, active, syncPinVisibility]);

  const listState = 'normal'; // could be wired to a tweak later

  // List-mode header (kicker + title + filter/add + chips). When a POI is
  // selected the sheet switches to compact mode and this header is not shown —
  // the card's hero fills the top and the floating grab handle dismisses it.
  const header = (
    <DiscoverCollectionHeader
      theme={theme}
      eyebrow={placeSel ? t('discover.titleMyJourneys') : ''}
      title={placeSel ? t('discover.titlePlace') : t('discover.titleFeatured')}
      summary={placeSel
        ? t('discover.countJourneys', { count: displayPois.length, km: Math.round(totalKm) })
        : ''}
      filters={[]}
      activeFilter={0}
      onFilterChange={() => {}}
      onFilter={() => nav.showToast(t('discover.toastFilter'))}
      onAdd={() => placeSel ? nav.openNewJourney(placePreset) : nav.openAddRoute()}
      onBack={placeSel ? () => setPlaceSel(null) : undefined}
      showActions={!!placeSel}
    />
  );

  // Explore's list header: no title, just how many routes the map holds, with
  // every filter behind one button.
  // The searched area is the map left between the top chrome and the list at
  // its current detent; the part under the sheet isn't on screen to the user.
  const searchArea = () => {
    const camera = mapCameraRef.current;
    if (!camera) return;
    const sheetHeight = [listPeek, collapsed, full][listSheetIndex] ?? collapsed;
    const ids = poisInViewport(exploreBasePois, camera, mapHeadingRef.current, { width, height }, {
      top: insets.top + MAP_TOP_CHROME_HEIGHT,
      bottom: height - sheetHeight,
    });
    setAreaRouteIds(ids);
    setAreaSearchOffered(false);
    setPlaceSel(null);
    if (ids.size && listSheetIndex === LIST_SHEET_PEEK) {
      setListSheetIndex(LIST_SHEET_INITIAL);
      sheetRef.current?.snapTo(LIST_SHEET_INITIAL);
    }
  };
  const zoomOutArea = () => {
    const camera = mapCameraRef.current;
    if (!camera) return;
    setMapCameraAction((current) => ({
      type: 'restore',
      coordinate: camera.center,
      zoom: Math.max(3, camera.zoom - 1.5),
      revision: (current?.revision ?? 0) + 1,
    }));
    offerAreaSearch();
  };
  // Each time the list sheet scrolls near its end, DiscoverRouteList mounts its
  // next batch of cards.
  const [listPageRequest, setListPageRequest] = useState(0);
  const requestListPage = useCallback(() => setListPageRequest((current) => current + 1), []);
  const routeFilterCount = activeRouteFilterCount(routeFilters);
  const exploreHeader = (
    <View style={{ minHeight: layout.iconButton, paddingHorizontal: space.md, paddingBottom: space.sm, alignItems: 'center', justifyContent: 'center' }}>
      <Text numberOfLines={1} style={[type.chip, { color: theme.text2, maxWidth: width - 2 * (space.md + 96) }]}>
        {areaRouteIds
          ? t('discover.areaCount', { count: displayPois.length })
          : t('discover.routeCount', { region: dataRegion, count: displayPois.length })}
      </Text>
      <AppFilterButton
        theme={theme}
        label={routeFilterCount ? t('common.filterCount', { count: routeFilterCount }) : t('common.all')}
        active={routeFilterCount > 0}
        expanded={routeFilterOpen}
        onPress={() => setRouteFilterOpen(true)}
        accessibilityLabel={t('discover.filter.title')}
        style={{ position: 'absolute', right: space.md, top: 0 }}
      />
    </View>
  );

  // ── what the map has to catch up with ──
  // The map freezes while Discover is not the active tab, so the pass that thaws
  // it also carries every change made while it was invisible. Only some of those
  // changes are the user's: `setMainTab` clears the selection, the focus arrays
  // move to the whole list, and the map's auto-framing reads that as "frame this
  // route" - pulling the camera across the country on a plain tab switch. The
  // signature says which case a thaw is.
  const mapFocusTarget = nav.pointInfo?.kind === 'route' ? focusCoords : rawFocusCoords;
  const mapFrameSignature = React.useMemo(() => {
    const coords = mapFocusTarget;
    if (!coords?.length) return '';
    const first = coords[0];
    const last = coords[coords.length - 1];
    return `${coords.length}|${first[0]},${first[1]}|${last[0]},${last[1]}`;
  }, [mapFocusTarget]);
  const lastActiveFrameSignatureRef = React.useRef(mapFrameSignature);
  React.useEffect(() => {
    if (active) lastActiveFrameSignatureRef.current = mapFrameSignature;
  }, [active, mapFrameSignature]);
  // Android tears the map down with the tab, and so does the journey cover, so a
  // thaw from either starts at the map's own default camera and needs framing.
  const mapReloadedWhileAwayRef = React.useRef(false);
  const globeMounted = !journeyShowsCover && (active || keepMapWarm);
  React.useEffect(() => {
    if (!globeMounted) mapReloadedWhileAwayRef.current = true;
  }, [globeMounted]);

  // The map builds one native annotation per marker and memoizes them by prop
  // identity, so a fresh closure on any parent render rebuilds the whole
  // annotation subtree: measured 100ms when the map is on screen, and it ran on
  // every bottom-tab switch while the map sat off screen behind another tab.
  // The handlers therefore cross to the map as fixed identities that read the
  // current render's closures through a ref.
  const mapHandlers: MapHandlerSet = {
    onCameraGestureStart: () => {
      // Native map SDKs may report a marker tap as a short camera
      // gesture. It must not make the detail route look unfocused.
      if (Date.now() - mapMarkerPressAtRef.current < 500) return;
      if (nav.pointInfo) {
        mapPointGestureRef.current = true;
        setMapAtRouteFrame(false);
      } else {
        setMapAtCurrentLocation(false);
        offerAreaSearch();
      }
    },
    onCameraPositionChange: (camera) => {
      onMapScaleLatitude(camera.center[1]);
      const prev = mapCameraRef.current;
      mapCameraRef.current = camera;
      const moved = !prev
        || Math.abs(prev.center[0] - camera.center[0]) > 1e-6
        || Math.abs(prev.center[1] - camera.center[1]) > 1e-6
        || Math.abs(prev.zoom - camera.zoom) > 0.01;
      if (!moved) return;
      // A long pan outlasts the offer's timer; keep it up until the map settles.
      if (areaSearchOffered && !nav.pointInfo) offerAreaSearch();
      // The move the card asked for is over: the kilometre labels can have these
      // frames to themselves instead of competing with the animation.
      setDistanceMarkersReady(true);
      // The waypoint groups cluster by on-screen pixels, so they want the same
      // deal MapGlobe gives its distance step: half-zoom buckets, rebuilt only
      // once the camera has been quiet — re-snapshotting markers mid-pinch is
      // the stutter those comments were written about.
      if (waypointZoomTimerRef.current) clearTimeout(waypointZoomTimerRef.current);
      waypointZoomTimerRef.current = setTimeout(() => {
        waypointZoomTimerRef.current = null;
        setWaypointClusterZoom(Math.floor(camera.zoom * 2) / 2);
      }, 180);
      const hidden = !wasMapActiveRef.current;
      if (hidden) mapCameraEventRef.current = { at: Date.now() };
    },
    // The heading turns the needle through an Animated.Value; re-rendering this
    // screen for every degree of a twist would rebuild the annotations mid-gesture.
    onCameraOrientationChange: (heading) => {
      mapHeadingRef.current = heading;
      onMapOrientation(heading);
    },
    onCameraZoomChange: (zoom) => onMapScaleZoom(zoom),
    onJourneyDayLabelPress: (day) => selectJourneyDayFromMap(selectedJourneyDay === day ? undefined : day),
    onJourneyStopPress: (rowId) => {
      const stop = itineraryStops.find((item) => item.rowId === rowId);
      if (!stop) return;
      // The overview's plain dots still open their day first; the sheet then
      // reads the place, numbered as that day's pins are.
      if (selectedJourneyDay !== (stop.day ?? '')) selectJourneyDayFromMap(stop.day ?? '');
      else mapMarkerPressAtRef.current = Date.now();
      setOpenJourneyStopId(rowId);
    },
    onUserLocationChange: ([lng, lat], accuracy) => {
      setCurrentLocation((current) => {
        // The native location layer reports far more often than the dot visibly
        // moves, and every new object re-renders this whole screen. Keep the
        // current state for sub-metre jitter so React bails out.
        if (current && metresBetween(current, { lng, lat }) < LOCATION_UPDATE_MIN_METRES
          && Math.abs((accuracy ?? current.accuracy ?? 0) - (current.accuracy ?? 0)) < LOCATION_UPDATE_MIN_METRES) {
          return current;
        }
        return { lng, lat, heading: current?.heading, accuracy: accuracy ?? current?.accuracy };
      });
    },
    onPoiPress: (id) => {
      // Marker presses can also bubble to NativeMap.onPress on iOS and
      // Android. Keep that background event from dismissing the sheet.
      mapMarkerPressAtRef.current = Date.now();
      const group = repIdToGroup.get(id);
      if (!group) return;
      if (nav.pointInfo?.kind === 'route') {
        // A sibling sharing the trailhead replaces the open card instead of being
        // laid over it: the sheet stays where the reader left it, only its
        // content moves. A place with nothing but the open route does nothing.
        const openRoute = nav.pointInfo;
        const nextRoute = group.find((item) => item.id !== openRoute.id && item.kind === 'route');
        if (nextRoute) openPointFromCurrentMap(nextRoute, 'pin');
        return;
      }
      // One route/journey here → open its map detail. Several → scope the journey-list
      // sheet to this trailhead so the user can pick the past memory vs. the
      // 再次出发 plan (same list, just a 这个地点的旅程 header).
      if (group.length === 1) {
        setPlaceSel(null);
        setFocusReturnToList(false);
        openPointFromCurrentMap(group[0], 'pin');
        return;
      }
      setPlaceSel(placeKey(group[0]));
      nav.closePoint();
      setListSheetIndex(LIST_SHEET_INITIAL);
      sheetRef.current?.snapTo(LIST_SHEET_INITIAL);
    },
    // Under a point detail the map *is* the content, and the card's own back
    // button closes it, so a tap on the map must stay a tap. Collapsing the list
    // sheet this way is only for list mode. In fullscreen the card is off screen
    // and there is no other control, so the tap becomes the way out.
    onBackgroundPress: () => {
      // Every marker path stamps this guard first, because a marker press also
      // bubbles here on both platforms.
      if (Date.now() - mapMarkerPressAtRef.current < 500) {
        return;
      }
      if (mapImmersive) {
        exitMapImmersive();
        return;
      }
      if (nav.pointInfo) {
        // On a route card, a tap that is not a marker closes the 「从这里出发」
        // bubble if one is up; otherwise the card stays put. The waypoint
        // detail is a sheet over the map, so it dismisses itself.
        if (nav.pointInfo.kind === 'route') setRouteEndpointActionOpen(false);
        return;
      }
      // The list never leaves; a map tap lowers it back to peek.
      setPlaceSel(null);
      setListSheetIndex(LIST_SHEET_PEEK);
      sheetRef.current?.snapTo(LIST_SHEET_PEEK);
    },
  };
  const mapHandlersRef = React.useRef(mapHandlers);
  React.useEffect(() => {
    mapHandlersRef.current = mapHandlers;
  });
  const globeHandlers = React.useMemo<MapHandlerSet>(() => ({
    onCameraGestureStart: () => mapHandlersRef.current.onCameraGestureStart(),
    onCameraPositionChange: (camera) => mapHandlersRef.current.onCameraPositionChange(camera),
    onCameraOrientationChange: (heading, pitch) => mapHandlersRef.current.onCameraOrientationChange(heading, pitch),
    onCameraZoomChange: (zoom) => mapHandlersRef.current.onCameraZoomChange(zoom),
    onJourneyDayLabelPress: (day) => mapHandlersRef.current.onJourneyDayLabelPress(day),
    onJourneyStopPress: (rowId) => mapHandlersRef.current.onJourneyStopPress(rowId),
    onUserLocationChange: (coordinate, accuracy) => mapHandlersRef.current.onUserLocationChange(coordinate, accuracy),
    onPoiPress: (id) => mapHandlersRef.current.onPoiPress(id),
    onBackgroundPress: () => mapHandlersRef.current.onBackgroundPress(),
  }), []);
  // Same reason: an inline object literal is a new `center` prop every render.
  const mapCenter = React.useMemo(() => (nav.pointInfo
    ? (() => {
        const [lon, lat] = focusCoords?.[0] ?? poiMapCoordinate(nav.pointInfo!);
        return { lon, lat };
      })()
    : currentLocation ? { lon: currentLocation.lng, lat: currentLocation.lat } : undefined),
  [nav.pointInfo, focusCoords, currentLocation]);

  return (
    /* Under our own full-screen search page the whole page slides off-screen
       rather than being display:none'd or unmounted (under another bottom tab,
       TabPage slides it). The map keeps its instance, camera and every
       annotation view: a MapView that re-enters the window comes back with empty
       reused annotation views, and a remount reloads the tiles, which reads as a
       flash. Off-screen still lets the system cull it, so whatever covers the
       map keeps its frames. */
    <View
      style={[
        { flex: 1, backgroundColor: theme.bg },
        covered && keepMapWarm ? { transform: [{ translateX: width * 2 }] } : null,
      ]}
    >
      {/* full-screen interactive map (Apple-Maps style) — subtabs, top-right
          chrome, locate button and the bottom sheet all float on top of it */}
      <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
        {journeyShowsCover ? (
          <>
            <Image source={{ uri: journeyCoverUri }} contentFit="cover" style={StyleSheet.absoluteFill} />
            <LinearGradient
              colors={['rgba(0,0,0,0.38)', 'rgba(0,0,0,0.04)', 'rgba(0,0,0,0.18)']}
              locations={[0, 0.42, 1]}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
          </>
        ) : active || keepMapWarm ? (
        <Globe
          active={active}
          theme={theme}
          size={globeSize}
          pois={mapPois}
          pinVisibilityApi={railAvailable ? pinVisibilityApi : undefined}
          onPinVisibilityReady={railAvailable ? syncPinVisibility : undefined}
          // Keep nearby route pins interactive while a route detail card is
          // open, so users can compare close tracks without first dismissing
          // the current card. Journey detail keeps its existing map-focused UI.
          showPoiMarkers={!nav.pointInfo || nav.pointInfo.kind === 'route'}
          activePoiId={nav.pointInfo?.kind === 'route' ? null : activeRepId}
          mapStyle={mapStyle}
          showMapLabels={mapLabelsVisible}
          // Temporarily hidden during layout testing; retain the map footer for later.
          showWalkingAttribution={false}
          mapBottomInset={mapImmersive ? insets.bottom : Math.max(0, journeyMapBottomPadding - (journeySheetIndex < 2 ? space.xl : space.md))}
          showDistanceMarkers={mapDistanceMarkersVisible && !!nav.pointInfo && distanceMarkersReady && !routeNavigation && (nav.pointInfo?.kind !== 'route' || routeKmLabelsVisible)}
          cameraAction={mapCameraAction}
          focusBottomPadding={mapImmersive ? immersiveFitBottom : nav.pointInfo?.kind === 'journey' ? journeyMapBottomPadding : routeMapFull ? journeyMinimum + space.xl : undefined}
          autoFrameRoute={!nav.pointInfo || mapAtRouteFrame}
          staggerPins={!entrancePlayed}
          // Android's copy of the same decision: the region the pins on screen
          // belong to, so a swap lets that region's arrivals play the native
          // marker entrance and nothing else does. See `pinEntranceKey`.
          pinEntranceKey={dataRegion}
          onCameraGestureStart={globeHandlers.onCameraGestureStart}
          onCameraPositionChange={globeHandlers.onCameraPositionChange}
          onCameraOrientationChange={globeHandlers.onCameraOrientationChange}
          onCameraZoomChange={globeHandlers.onCameraZoomChange}
          // Framing must not wait for the transition gate: the journey track is
          // already in memory, and a camera that only moves once
          // InteractionManager drains reads as the map freezing for seconds.
          // The gate stays on the work that actually costs frames — the
          // per-route measuring and the distance labels.
          focusCoords={nav.pointInfo?.kind === 'route' ? routeNavigation?.coordinates ?? focusCoords : rawFocusCoords}
          frameCoords={journeyOverviewFrame}
          // The journey overview map must show every route leg as soon as the
          // journey detail opens, not only after entering the expanded map view.
          focusSegments={nav.pointInfo?.kind === 'journey'
            ? focusSegments
            : nav.pointInfo?.kind === 'route' ? [...routeDetailSegments, ...(routeNavigation?.coordinates ? [{ id: 'route-navigation', label: t('discover.routeNavigate'), coordinates: routeNavigation.coordinates, color: '#26B7E8', active: true }] : [])] : NO_FOCUS_SEGMENTS}
          journeyLegs={journeyLegs}
          journeyStops={journeyStops}
          journeyDayLabels={journeyDayLabels}
          extraMarkers={mapExtraMarkers}
          onJourneyDayLabelPress={globeHandlers.onJourneyDayLabelPress}
          onJourneyStopPress={globeHandlers.onJourneyStopPress}
          hiddenJourneyStopId={openJourneyStop ? openJourneyStopId : null}
          center={mapCenter}
          pin={active ? currentLocation : null}
          followUserLocation={active && !nav.pointInfo && mapAtCurrentLocation}
          onUserLocationChange={globeHandlers.onUserLocationChange}
          onPoiPress={globeHandlers.onPoiPress}
          onBackgroundPress={globeHandlers.onBackgroundPress}
        />
        ) : null}
        {!nav.pointInfo && !mapImmersive && routesLoading && exploreBasePois.length === 0 ? (
          <View
            pointerEvents="none"
            accessibilityLiveRegion="polite"
            style={[
              StyleSheet.absoluteFill,
              {
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: chromeTheme.dark ? 'rgba(0,0,0,0.24)' : 'rgba(255,255,255,0.28)',
              },
            ]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <ActivityIndicator size="small" color={chromeTheme.text} />
              <Text style={{ color: chromeTheme.text, fontSize: 14 }}>{t('discover.loadingRoutes')}</Text>
            </View>
          </View>
        ) : null}
      </View>

      {/* The 探索 / 旅程 switch is temporarily hidden. The selected mode is
          still controlled by navigation when entering 发现 from other pages. */}

      {/* top-right chrome */}
      {!nav.pointInfo && !mapImmersive ? (
      <>
      <Press
        accessibilityRole="button"
        accessibilityLabel="选择行政区"
        onPress={() => {
          // Back to the province: picking the same one again wouldn't change it.
          setAreaRouteIds(null);
          setAreaSearchOffered(false);
          nav.openSearch();
        }}
        style={{
          position: 'absolute', top: insets.top + 4, left: 19,
          height: 44, alignItems: 'flex-start', justifyContent: 'center',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, opacity: 0.88 }}>
          <Text style={{
            color: chromeTheme.text,
            fontSize: 20,
            lineHeight: 25,
            fontWeight: '600',
            textShadowColor: chromeTheme.dark ? 'rgba(0,0,0,0.22)' : 'rgba(255,255,255,0.58)',
            textShadowOffset: { width: 0, height: 1 },
            textShadowRadius: 2,
          }}>{areaRouteIds ? t('discover.areaTitle') : adminRegion}</Text>
          <Animated.View style={{ transform: [{ rotate: adminRegionChevronProgress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) }] }}>
            <Icon name="chevronDown" color={chromeTheme.text} size={15} strokeWidth={2.3} />
          </Animated.View>
        </View>
      </Press>
      <View style={{ position: 'absolute', top: insets.top + 4, right: 16, gap: 10 }}>
        <Press
          accessibilityRole="button"
          accessibilityLabel={t('search.placeholder')}
          onPress={() => nav.openSearch()}
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
        >
          <Search color={chromeTheme.text} size={25} strokeWidth={2.2} />
        </Press>
      </View>
      </>
      ) : !mapImmersive && nav.pointInfo?.kind === 'journey' ? (
        <>
          <View style={{ position: 'absolute', top: insets.top + 5, left: 13 }}>
            <Press
              accessibilityRole="button"
              accessibilityLabel={t('common.back')}
              hitSlop={6}
              onPress={() => {
                if (nav.journeyVersionPreview) nav.closeJourneyVersionPreview();
                else dismissPointSheet();
              }}
              style={{ width: 52, height: 52, alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name="chevronL" color={journeyChromeColor} size={27} />
            </Press>
            </View>
          {!nav.journeyVersionPreview ? <View style={{ position: 'absolute', top: insets.top + 5, right: 13, flexDirection: 'row' }}>
            <Press
              accessibilityRole="button"
              accessibilityLabel={t('common.share')}
              hitSlop={6}
              onPress={() => {
                const poi = nav.pointInfo;
                if (poi) nav.openSharePanel(poi);
              }}
              style={{ width: 52, height: 52, alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name="share" color={journeyChromeColor} size={25} />
            </Press>
            {nav.pointInfo?.mine ? <Press
              accessibilityRole="button"
              accessibilityLabel={t('journey.more.settings')}
              hitSlop={6}
              onPress={() => nav.pointInfo?.mine && nav.openJourneySettings(nav.pointInfo)}
              style={{ width: 52, height: 52, alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name="gearSettings" color={journeyChromeColor} size={25} />
            </Press> : null}
          </View> : null}
        </>
      ) : !mapImmersive && nav.pointInfo?.kind === 'route' && !nav.routeGuide && !nav.newJourneyOpen ? (
        // A route card's top chrome, as on a track: bare icons with a halo.
        // The sheet's full detent stops just under it, so it never hides.
        <View pointerEvents="box-none" style={{ position: 'absolute', top: insets.top + space.xs, left: space.sm, right: space.sm, flexDirection: 'row', justifyContent: 'space-between' }}>
          {/* A route opened from a journey's 来自路线 goes back to that journey. */}
          <HaloIconButton theme={theme} icon="chevronL" onPress={nav.pointSource ? () => nav.openPoint(nav.pointSource as Poi) : dismissPointSheet} accessibilityLabel={t('common.back')} />
          <View style={{ flexDirection: 'row' }}>
            <HaloIconButton theme={theme} icon="share" onPress={() => shareOpenRoute('text')} accessibilityLabel={t('discover.routeShare')} />
            <HaloIconButton theme={theme} icon="more" onPress={() => setRouteMoreOpen(true)} accessibilityLabel={t('journey.section.more')} />
          </View>
        </View>
      ) : null}

      {/* Keep this in the existing screen tree instead of opening a native
          full-screen Modal. A native Modal creates another window and its
          platform fade can stall while the map is rendering. */}
      {adminRegionPickerMounted ? <Animated.View
        pointerEvents={adminRegionPickerOpen ? 'auto' : 'none'}
        accessibilityViewIsModal={adminRegionPickerOpen}
        style={[StyleSheet.absoluteFill, {
          zIndex: 100,
          elevation: 100,
          opacity: adminRegionPickerProgress,
        }]}
      >
        <View style={{ flex: 1, backgroundColor: theme.groupedBg }}>
          <View style={{ paddingTop: insets.top + space.sm, paddingHorizontal: space.md, paddingBottom: space.sm, flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
            <Press onPress={() => setAdminRegionPickerOpen(false)} accessibilityRole="button" accessibilityLabel={t('common.back')} hitSlop={8} style={{ width: layout.iconButton, height: layout.iconButton, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="chevronL" color={theme.text} size={28} strokeWidth={1.9} />
            </Press>
            <View style={{ flex: 1, height: layout.fieldHeight, borderRadius: layout.fieldHeight / 2, backgroundColor: theme.featureSurface, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.fieldBorder, flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingHorizontal: space.md }}>
              <Icon name="search" color={theme.text3} size={17} />
              <TextInput
                value={adminRegionQuery}
                onChangeText={setAdminRegionQuery}
                placeholder="输入省份、自治区或直辖市"
                placeholderTextColor={theme.text3}
                returnKeyType="search"
                autoCorrect={false}
                style={{ flex: 1, height: layout.fieldHeight, fontSize: 15, lineHeight: 21, color: theme.text, paddingVertical: 0, paddingHorizontal: 0, minWidth: 0, textAlignVertical: 'center' }}
              />
            </View>
          </View>
          <View style={{ flexDirection: 'row', paddingHorizontal: space.lg, gap: 28, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.fieldBorder }}>
            <Press onPress={() => { setAdminRegionScope('china'); setAdminRegionQuery(''); }} accessibilityRole="tab" accessibilityState={{ selected: adminRegionScope === 'china' }}>
              <Text style={{ paddingBottom: 12, color: theme.text, fontSize: 16, fontWeight: '700', borderBottomWidth: 3, borderBottomColor: adminRegionScope === 'china' ? theme.accent : 'transparent' }}>中国</Text>
            </Press>
            <Press onPress={() => { setAdminRegionScope('international'); setAdminRegionQuery(''); }} accessibilityRole="tab" accessibilityState={{ selected: adminRegionScope === 'international' }}>
              <Text style={{ paddingBottom: 12, color: theme.text, fontSize: 16, fontWeight: '700', borderBottomWidth: 3, borderBottomColor: adminRegionScope === 'international' ? theme.accent : 'transparent' }}>国际</Text>
            </Press>
          </View>
          <View style={{ flex: 1, marginTop: 8, backgroundColor: theme.groupedBg, borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden' }}>
            <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: insets.bottom + space.xl }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                {visibleAdminRegions.map((region) => (
                  <Press
                    key={region}
                    onPress={() => chooseAdminRegion(region)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: adminRegion === region }}
                    style={{ minWidth: 88, paddingHorizontal: 16, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: adminRegion === region ? theme.accent : theme.featureSurface }}
                  >
                    <Text numberOfLines={1} style={{ color: adminRegion === region ? '#FFFFFF' : theme.text, fontSize: 16, fontWeight: adminRegion === region ? '700' : '500' }}>{region}</Text>
                  </Press>
                ))}
              </View>
              {visibleAdminRegions.length === 0 ? <Text style={{ color: theme.text3, textAlign: 'center', marginTop: space.xl }}>没有匹配的行政区</Text> : null}
            </ScrollView>
          </View>
        </View>
      </Animated.View> : null}

      {/* Fullscreen renders no chrome at all — the map is the whole screen and
          a tap on it is the only way out (see mapHandlers.onBackgroundPress). */}
      {pointMapControlsVisible && !mapImmersive ? (
        <>
          {/* Companion live-location share — the pill that used to sit at the
              top-left, now in the slot the 路线 pill vacated (the route picker
              itself moved into the map style sheet). Follows the sheet, and
              keeps the route pill's visibility: gone when the card is fully
              expanded or this is a version preview. */}
          {/* The compass rides above it in the same bottom-left column. */}
          <Animated.View pointerEvents="box-none" style={[{
            position: 'absolute',
            left: space.md,
            bottom: pointFull + space.md,
            zIndex: 8,
            alignItems: 'flex-start',
          }, { transform: [{ translateY: mapStylePickerVisible ? pointControlsDetentShift : pointSheetTranslateY }] }]}>
            <MapCompassReveal visible={mapNorthOff}>
              <MapRoundButton
                theme={theme}
                heading={mapHeading}
                onPress={resetMapNorth}
                accessibilityLabel={t('journey.map.north')}
              />
            </MapCompassReveal>
            {nav.pointInfo?.kind === 'journey' && !nav.journeyVersionPreview ? (
              <CompanionShareSwitchPill
                theme={theme}
                label={t('discover.shareLocation')}
                on={sharingThisJourney}
                onToggle={toggleLocationShare}
              />
            ) : null}
          </Animated.View>
          {/* One column, bottom-anchored: the two view-state controls share a
              plate (复位 is the locate equivalent, 图层 the style toggle) and the
              one-shot action (全屏) stays a round button above it. Order
              and gap come from the column itself, so a round button can never
              be dropped onto the plate by a mis-counted offset. */}
          <Animated.View style={[{
            position: 'absolute',
            right: space.md,
            bottom: pointFull + space.md,
            alignItems: 'flex-end',
          }, { transform: [{ translateY: mapStylePickerVisible ? pointControlsDetentShift : pointSheetTranslateY }] }]}>
            <MapRoundButton
              theme={theme}
              element={<Maximize2 color={theme.text} size={18} strokeWidth={2} />}
              onPress={enterMapImmersive}
              accessibilityLabel={t('journey.map.enterFullscreen')}
            />
            <MapControlGroup theme={theme}>
              <MapControlButton
                theme={theme}
                active={mapAtRouteFrame}
                onPress={() => { void cycleMapFrame(); }}
                accessibilityLabel={t(mapAtRouteFrame && !mapFramesMe ? 'journey.map.fitRouteWithMe' : 'journey.map.fitRoute')}
              >
                {/* Tinted while the camera still frames the route, like Apple's
                    locate arrow; a pan or pinch drops it back to neutral. */}
                {framingMe
                  ? <ActivityIndicator size="small" color={theme.accent} />
                  : <Focus color={mapAtRouteFrame ? theme.accent : theme.text} size={18} strokeWidth={2} />}
              </MapControlButton>
              <MapControlButton
                theme={theme}
                icon="layers"
                active={mapStylePickerOpen}
                onPress={() => setMapStylePickerOpen((value) => !value)}
                accessibilityLabel={t('journey.map.layerTitle')}
              />
            </MapControlGroup>
          </Animated.View>

        </>
      ) : null}

      {/* The scale takes the top-right corner, just under the top chrome
          (搜索 in the list, 分享/设置 on a journey card, 分享/⋯ on a route),
          while the map zooms. */}
      {mapImmersive || !nav.pointInfo || pointMapControlsVisible ? (
        <View
          pointerEvents="none"
          style={{ position: 'absolute', right: space.md, top: insets.top + (mapImmersive ? space.md : MAP_TOP_CHROME_HEIGHT + space.sm), zIndex: 8, alignItems: 'flex-end' }}
        >
          <MapScaleBar scale={mapScale} theme={nav.pointInfo || mapImmersive ? theme : chromeTheme} />
        </View>
      ) : null}

      {/* The compass sits in the map's bottom-left corner, as Apple Maps has
          it, only while the map is turned. In the list it rides the sheet on
          the map tools' row; a journey card puts it in its own left column. */}
      {mapImmersive || !nav.pointInfo ? (
        <Animated.View
          pointerEvents="box-none"
          style={mapImmersive
            ? { position: 'absolute', left: space.md, bottom: Math.max(insets.bottom, space.md) + space.md, zIndex: 8 }
            : { position: 'absolute', left: space.md, bottom: listMapToolsBottom, zIndex: 8, transform: [{ translateY: listMapToolsShift }] }}
        >
          <MapCompassReveal visible={mapNorthOff}>
            <MapRoundButton
              theme={mapImmersive ? theme : chromeTheme}
              heading={mapHeading}
              onPress={resetMapNorth}
              accessibilityLabel={t('journey.map.north')}
            />
          </MapCompassReveal>
        </Animated.View>
      ) : null}

      {!nav.pointInfo && !mapImmersive ? (
        <Animated.View style={{ position: 'absolute', right: space.md, bottom: listMapToolsBottom, alignItems: 'flex-end', transform: [{ translateY: listMapToolsShift }] }}>
          <MapControlGroup theme={chromeTheme}>
            <MapControlButton
              theme={chromeTheme}
              icon="layers"
              active={mapStylePickerOpen}
              onPress={() => setMapStylePickerOpen((value) => !value)}
              accessibilityLabel={t('journey.map.layerTitle')}
            />
            <MapControlButton
              theme={chromeTheme}
              active={mapAtCurrentLocation}
              onPress={locateCurrentPosition}
              accessibilityLabel={t('discover.toastLocate')}
            >
              {locating
                ? <ActivityIndicator size="small" color={chromeTheme.accent} />
                : <Icon name={mapAtCurrentLocation ? 'locate' : 'locateOutline'} color={mapAtCurrentLocation ? chromeTheme.accent : chromeTheme.text} size={18} />}
            </MapControlButton>
          </MapControlGroup>
        </Animated.View>
      ) : null}

      {/* 搜索此区域 sits on the list's top edge, centred on the map tools' row and
          riding the sheet with them: the list it rescopes is right below it. */}
      {areaPillMounted && !nav.pointInfo && !mapImmersive ? (
        <Animated.View pointerEvents={areaPillShown ? 'box-none' : 'none'} style={{ position: 'absolute', left: 0, right: 0, bottom: listMapToolsBottom, alignItems: 'center', opacity: areaPillOpacity, transform: [{ translateY: listMapToolsShift }, { translateY: areaPillOpacity.interpolate({ inputRange: [0, 1], outputRange: [space.xs, 0] }) }] }}>
          <Press
            accessibilityRole="button"
            onPress={searchArea}
            style={{ height: MAP_CONTROL_SIZE, paddingHorizontal: space.md, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: space.xs, backgroundColor: chromeTheme.controlSurface, borderWidth: StyleSheet.hairlineWidth, borderColor: chromeTheme.fieldBorder, boxShadow: chromeTheme.dark ? '0px 4px 12px rgba(0,0,0,0.45)' : '0px 4px 12px rgba(0,0,0,0.10)' }}
          >
            <Search color={theme.accent} size={17} strokeWidth={2.3} />
            <Text style={[type.chip, { color: chromeTheme.text }]}>{t('discover.searchArea')}</Text>
          </Press>
        </Animated.View>
      ) : null}

      {/* Stays mounted through fullscreen: see enterMapImmersive. */}
      {sheetVisible && (
      <TrailSheet
        ref={sheetRef}
        key={nav.pointInfo ? 'card' : 'list'}
        theme={theme}
        snapHeights={nav.pointInfo ? [journeyMinimum, focusPanel, pointFull] : [listPeek, collapsed, full]}
        initialIndex={nav.pointInfo ? 1 : listSheetIndex}
        dismissOnDrag={false}
        onIndexChange={nav.pointInfo ? (index) => {
          if (nav.pointInfo?.kind === 'journey') setJourneySheetIndex(index);
          else setRouteSheetIndex(index);
          if (index !== 0) setMapStylePickerOpen(false);
        } : setListSheetIndex}
        header={nav.pointInfo ? <View /> : !placeSel ? exploreHeader : header}
        compact={false}
        backgroundColor={nav.newJourneyOpen ? 'transparent' : theme.featureSurface}
        containerStyle={{ opacity: nav.newJourneyOpen ? 0 : 1 }}
        borderless={nav.pointInfo?.kind === 'route'}
        bodyOverlay={
          nav.pointInfo?.kind === 'route' && !nav.routeGuide ? (
            routeSheetIndex === 2 ? (
              <RoutePreviewStickyHeader
                theme={theme}
                route={nav.merged(nav.pointInfo)}
                sections={routeSections.map((section) => section.key)}
                activeKey={routeActiveSection}
                onSelectSection={selectRouteSection}
                onHeightChange={setRouteStickyHeight}
              />
            ) : (
              <RoutePreviewIdentity theme={theme} route={nav.merged(nav.pointInfo)} />
            )
          ) : undefined
        }
        bodyScrollY={nav.pointInfo?.kind === 'route' ? routeDetailScrollY : nav.pointInfo?.kind === 'journey' ? journeyDetailScrollY : undefined}
        animatedTranslateY={nav.pointInfo ? pointSheetTranslateY : listSheetTranslateY}
        bottomOffset={0}
        onBodyHeightChange={setDetailBodyHeight}
        onHeaderHeightChange={setDetailHeaderHeight}
        onBodyNearEnd={nav.pointInfo ? undefined : requestListPage}
        onDismiss={() => {
          setPlaceSel(null);
          if (nav.pointInfo && focusReturnToList) {
            nav.closePoint();
          } else {
            nav.closeSheet();
          }
          restoreMapAfterPoint();
          setFocusReturnToList(false);
        }}
      >
        {nav.newJourneyOpen ? null : nav.pointInfo ? (
          <View style={{ paddingHorizontal: space.md, paddingBottom: detailBottomInset }}>
            {nav.pointInfo.kind === 'route' ? (
              <RoutePreviewPanel theme={theme} poi={nav.pointInfo}
                reversed={routeReversed}
                hideIdentity={routeSheetIndex === 2}
                stickyInset={routeStickyHeight}
                onSectionsChange={handleRouteSections}
                onOpenWaypoint={(index) => {
                  // The detail card swipes over the layer's own list, so a row
                  // opens the spot the map dot for that mileage would have. The
                  // sheet stays where the reader was: the card floats over it.
                  if (index < 0 || index >= routeWaypointListLayer.details.length) return;
                  setRouteWaypointPresentation('card');
                  setOpenRouteWaypoint(index);
                }}
                userLocation={currentLocation}
                onOpenElevation={() => setRouteElevationOpen(true)}
                onNavigate={() => { if (nav.pointInfo?.kind === 'route') void navigateToRoute(nav.merged(nav.pointInfo)); }}
                navigation={routeNavigationRouteId === nav.pointInfo.id ? { loading: !routeNavigation, distanceMeters: routeNavigation?.distanceMeters, durationSeconds: routeNavigation?.durationSeconds } : null}
              />
            ) : !detailReady ? (
              <View style={{ minHeight: focusPanel, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator color={theme.accent} />
              </View>
            ) : (
              <SelectedPoiCard
                theme={theme}
                poi={nav.pointInfo}
                embedded
                externalPlanEditorControls
                readOnly={Boolean(nav.journeyVersionPreview)}
                versionSnapshot={nav.journeyVersionPreview?.version.snapshot}
                planEditorOpen={planEditorOpen}
                onPlanEditorOpenChange={(open) => {
                  setPlanEditorOpen(open);
                  if (!open) setSelectedPlanDays(new Set());
                }}
                selectedPlanDays={selectedPlanDays}
                onSelectedPlanDaysChange={setSelectedPlanDays}
                onSelectedJourneyDayChange={handleSelectedJourneyDayChange}
                journeyDaySelectionRequest={journeyDaySelectionRequest}
                onSelectedTabChange={handleSelectedJourneyTabChange}
                momentAddActionRef={momentAddActionRef}
                momentDeleteActionRef={momentDeleteActionRef}
                momentFilterMenuRef={momentFilterMenuRef}
                onMomentFilterMenuOpenChange={setMomentFilterMenuVisible}
                checklistAddActionRef={checklistAddActionRef}
                checklistDeleteActionRef={checklistDeleteActionRef}
                checklistFilterActionRef={checklistFilterActionRef}
                checklistFilterMenuRef={checklistFilterMenuRef}
                checklistFilterMenuOpen={checklistFilterMenuOpen}
                checklistPickerProgress={checklistPickerProgress}
                onChecklistFilterMenuOpenChange={setChecklistFilterMenuVisible}
                checklistSelectionMode={checklistSelectionMode}
                selectedChecklistItemIds={selectedChecklistItemIds}
                onSelectedChecklistItemIdsChange={setSelectedChecklistItemIds}
                onChecklistCanEditChange={handleChecklistCanEditChange}
                momentSelectionMode={momentSelectionMode}
                selectedMomentIds={selectedMomentIds}
                onSelectedMomentIdsChange={setSelectedMomentIds}
                onJourneyDaysChange={setAvailableJourneyDays}
                timelineSelectionMode={timelineSelectionMode}
                selectedTimelineItemIds={selectedTimelineItemIds}
                onSelectedTimelineItemIdsChange={setSelectedTimelineItemIds}
                detailScrollY={journeyDetailScrollY}
                onIdentityHeightChange={setJourneyIdentityHeight}
                pagerBodyHeight={detailPagerBodyHeight}
                onRequestDetailScroll={(y) => sheetRef.current?.scrollTo(y)}
              />
            )}
          </View>
        ) : (
        <View style={{ paddingHorizontal: space.md }}>
          {listState === 'normal' ? (
            displayPois.length === 0 ? (
              <KPState
                theme={theme}
                icon="search"
                title={areaRouteIds?.size === 0 ? t('discover.emptyAreaTitle') : t('discover.emptyRoutesTitle')}
                body={areaRouteIds?.size === 0 ? t('discover.emptyAreaBody') : t('discover.emptyRoutesBody')}
                action={areaRouteIds?.size === 0 ? { label: t('discover.zoomOut'), onPress: zoomOutArea } : undefined}
              />
            ) : (
              <DiscoverRouteList theme={theme} routes={displayPois} staggered={!entrancePlayed} pageRequest={listPageRequest} onOpen={(p) => {
                setFocusReturnToList(true);
                openPointFromCurrentMap(p);
              }} />
            )
          ) : (
            <View style={{ gap: space.xl, paddingTop: space.xxs }}>
              {[0, 1].map((i) => (
                <View key={i} style={{ gap: space.xs }}>
                  <View style={{ aspectRatio: 1 / 0.62, borderRadius: radius.feature, backgroundColor: theme.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }} />
                  <KPSkeletonLine theme={theme} width="62%" />
                  <KPSkeletonLine theme={theme} width="40%" height={10} />
                </View>
              ))}
            </View>
          )}
        </View>
        )}
      </TrailSheet>
      )}
      {/* Full list hides the map; this is the visible way back besides dragging. */}
      {listShown && listSheetIndex === LIST_SHEET_FULL && !nav.newJourneyOpen && !mapImmersive ? (
        <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + space.md, alignItems: 'center' }}>
          <Press
            accessibilityRole="button"
            accessibilityLabel={t('discover.showMap')}
            onPress={() => {
              setListSheetIndex(LIST_SHEET_PEEK);
              sheetRef.current?.snapTo(LIST_SHEET_PEEK);
            }}
            style={{
              height: 48,
              paddingHorizontal: space.lg,
              borderRadius: radius.pill,
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.xs,
              backgroundColor: theme.accent,
              boxShadow: theme.dark ? '0px 6px 16px rgba(0,0,0,0.38)' : '0px 6px 16px rgba(0,0,0,0.14)',
            }}
          >
            <Icon name="map" color="#FFFFFF" size={20} strokeWidth={2} />
            <Text style={{ color: '#FFFFFF', fontSize: 15, lineHeight: 20, fontWeight: '700' }}>{t('discover.showMap')}</Text>
          </Press>
        </View>
      ) : null}
      {routeFilterOpen ? (
        <RouteFilterSheet
          theme={theme}
          value={routeFilters}
          countFor={(draft) => applyRouteFilters(areaBasePois, draft).length}
          // The sheet closes in its own commit and the filter lands two frames
          // later, so the filtered list and pins are not built in the same commit
          // that unmounts the sheet (that made the apply button look dead).
          onApply={(next) => {
            setRouteFilterOpen(false);
            requestAnimationFrame(() => requestAnimationFrame(() => setRouteFilters(next)));
          }}
          onClose={() => setRouteFilterOpen(false)}
        />
      ) : null}
      {mapStylePickerVisible ? (
        <MapStylePickerSheet
          theme={theme}
          title={t('journey.map.layerTitle')}
          closeLabel={t('common.close')}
          styleOptions={([
            { id: 'standard', label: t('journey.map.layerStandard') },
            { id: 'satellite', label: t('journey.map.layerSatellite') },
          ] satisfies { id: MapPresentationStyle; label: string }[])}
          value={mapStyle}
          tracks={nav.pointInfo?.kind === 'journey' && journeyRouteOptions.length >= 2 ? {
            title: t('journey.map.tracksTitle'),
            options: journeyRouteOptions.map((segment, index) => ({
              id: segment.id,
              label: segment.label || `路线 ${index + 1}`,
              color: segment.color,
              visible: segment.visible,
              distance: segment.distance,
              onChange: (visible: boolean) => toggleJourneyRouteVisible(segment.id, visible),
            })),
          } : undefined}
          sections={nav.pointInfo ? [
            ...(nav.pointInfo.kind === 'journey' ? [{
              id: 'journey-display',
              title: t('journey.map.displayTitle'),
              options: [
                {
                  id: 'journey-stops',
                  label: t('journey.map.journeyStops'),
                  value: journeyStopsVisible,
                  onChange: setJourneyStopsVisible,
                },
                {
                  id: 'journey-distance',
                  label: t('journey.map.journeyDayDistance'),
                  value: journeyDistanceVisible,
                  onChange: setJourneyDistanceVisible,
                },
                {
                  id: 'journey-km',
                  label: t('journey.map.trackDistanceMarkers'),
                  value: mapDistanceMarkersVisible,
                  onChange: setMapDistanceMarkersVisible,
                },
              ],
            }] : [{
              id: 'route-display',
              title: t('journey.map.displayTitle'),
              options: [{
                id: 'distance-markers',
                label: t('journey.map.trackDistanceMarkers'),
                value: mapDistanceMarkersVisible,
                onChange: setMapDistanceMarkersVisible,
              },
              ...(nav.pointInfo.kind === 'route' && nav.pointInfo.trackWaypoints?.length ? [{
                id: 'route-waypoints',
                label: t('journey.map.trackWaypointMarkers'),
                value: routeWaypointsVisible,
                onChange: (visible: boolean) => {
                  // Drop an open detail sheet with its markers, so back doesn't
                  // spend a press dismissing something no longer drawn.
                  if (!visible) setOpenRouteWaypoint(null);
                  setRouteWaypointsVisible(visible);
                },
              }] : []),
              ...(nav.pointInfo.kind === 'route' && (focusCoords?.length ?? 0) >= 2 ? [{
                id: 'route-reverse',
                label: t('journey.map.reverseRoute'),
                value: routeReversed,
                onChange: (reversed: boolean) => setRouteDirection(reversed),
              }] : []),
              ],
            }]),
          ] : []}
          bottomInset={insets.bottom}
          onChange={setMapStyle}
          onClose={() => setMapStylePickerOpen(false)}
        />
      ) : null}
      {selectedJourneyTab === 'moments' && momentFilterMenuRef.current ? (
        <Modal
          visible={momentFilterMenuOpen}
          transparent
          statusBarTranslucent
          animationType="none"
          onRequestClose={() => setMomentFilterMenuVisible(false)}
        >
          <View style={{ flex: 1 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
              onPress={() => setMomentFilterMenuVisible(false)}
              style={StyleSheet.absoluteFill}
            />
            <Animated.View
              style={{
                position: 'absolute',
                ...anchoredFilterMenuStyle(momentFilterAnchor, width, height, insets.top, insets.bottom, 240, 380),
                width: 240,
                borderRadius: radius.feature,
                shadowColor: '#000000',
                shadowOpacity: theme.dark ? 0.42 : 0.16,
                shadowRadius: 24,
                shadowOffset: { width: 0, height: 12 },
                elevation: 12,
                opacity: momentFilterMenuProgress,
                transform: [
                  { translateY: momentFilterMenuProgress.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) },
                  { scale: momentFilterMenuProgress.interpolate({ inputRange: [0, 1], outputRange: [0.975, 1] }) },
                ],
              }}
            >
            <Glass solidOnAndroid theme={theme} radius={radius.feature} intensity={78}>
              <View
                style={{
                  maxHeight: '100%',
                  paddingVertical: space.sm,
                  backgroundColor: Platform.OS === 'android'
                    ? (theme.dark ? '#202024' : '#FFFFFF')
                    : theme.dark ? 'rgba(32,32,35,0.64)' : 'rgba(255,255,255,0.74)',
                }}
              >
                <ScrollView showsVerticalScrollIndicator={false} nestedScrollEnabled>
                  <Text style={[type.caption, { paddingHorizontal: space.md, paddingTop: space.xxs, paddingBottom: space.xs, color: theme.text2, fontWeight: '600' }]}>
                    {momentFilterMenuRef.current.participantTitle}
                  </Text>
                  <Press
                    scaleTo={1}
                    onPress={() => momentFilterMenuRef.current?.selectAuthor(null)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: momentFilterMenuRef.current.selectedAuthor == null }}
                    style={{ minHeight: 48, paddingHorizontal: space.md, flexDirection: 'row', alignItems: 'center', gap: space.sm }}
                  >
                    <View style={{ width: 30, height: 30, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.fieldSurface }}>
                      <Icon name="people" color={theme.text2} size={15} />
                    </View>
                    <Text numberOfLines={1} style={[type.body, { flex: 1, color: theme.text, fontWeight: momentFilterMenuRef.current.selectedAuthor == null ? '700' : '500' }]}>
                      {momentFilterMenuRef.current.allParticipantsLabel}
                    </Text>
                    {momentFilterMenuRef.current.selectedAuthor == null ? <Icon name="check" color={theme.accent} size={16} strokeWidth={2.4} /> : null}
                  </Press>
                  {momentFilterMenuRef.current.authors.map((author, authorIndex) => {
                    const selected = author.key === momentFilterMenuRef.current?.selectedAuthor;
                    return (
                      <Press
                        key={`${author.key}-${authorIndex}`}
                        scaleTo={1}
                        onPress={author.count > 0 ? () => momentFilterMenuRef.current?.selectAuthor(author.key) : undefined}
                        disabled={author.count === 0}
                        accessibilityRole="radio"
                        accessibilityState={{ selected, disabled: author.count === 0 }}
                        style={{ minHeight: 58, paddingHorizontal: space.md, flexDirection: 'row', alignItems: 'center', gap: space.sm, opacity: author.count > 0 ? 1 : 0.5 }}
                      >
                        <Avatar uri={author.avatarUrl} size={32} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xxs }}>
                            <Text numberOfLines={1} style={[type.body, { flexShrink: 1, color: theme.text, fontWeight: selected ? '700' : '500' }]}>{author.name}</Text>
                            {author.host ? (
                              <View style={{ paddingHorizontal: 5, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: theme.accentSofter }}>
                                <Text style={{ fontSize: 9, fontWeight: '700', color: theme.accent }}>{momentFilterMenuRef.current?.hostLabel}</Text>
                              </View>
                            ) : null}
                            {author.self ? (
                              <View style={{ paddingHorizontal: 5, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: theme.fieldSurface }}>
                                <Text style={{ fontSize: 9, fontWeight: '700', color: theme.text2 }}>{momentFilterMenuRef.current?.selfLabel}</Text>
                              </View>
                            ) : null}
                          </View>
                          {author.countLabel ? <Text style={[type.caption, { color: theme.text3, marginTop: 2 }]}>{author.countLabel}</Text> : null}
                        </View>
                        {selected ? <Icon name="check" color={theme.accent} size={16} strokeWidth={2.4} /> : null}
                      </Press>
                    );
                  })}
                </ScrollView>
              </View>
            </Glass>
            </Animated.View>
          </View>
        </Modal>
      ) : null}
      {selectedJourneyTab === 'checklist' && checklistFilterMenuRef.current ? (
        <JourneyChecklistPickerSheet
          theme={theme}
          controller={checklistFilterMenuRef.current}
          visible={checklistFilterMenuOpen}
          onDismissStart={() => animateChecklistPicker(false)}
          onClose={() => setChecklistFilterMenuVisible(false)}
        />
      ) : null}
      {nav.pointInfo?.kind === 'journey' && !mapImmersive && !nav.journeyVersionPreview && journeySheetIndex > 0 && !mapStylePickerVisible && !nav.blockingOverlayOpen && !externalOverlayOpen ? (
        <View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            left: space.md,
            right: space.md,
            bottom: Math.max(insets.bottom, space.md),
            zIndex: 180,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: space.sm,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, ...(selectedJourneyTab === 'overview' && journeyTrailEntry?.primary ? { flex: 1 } : null) }}>
          {selectedJourneyTab === 'plan' ? (
            <>
              {!timelineSelectionMode ? (
                <Press
                  hitSlop={3}
                  onPress={() => nav.pointInfo?.kind === 'journey' && nav.openTimelineAdd(nav.pointInfo, selectedJourneyDay, availableJourneyDays)}
                  accessibilityRole="button"
                  style={journeyFooterAccentPill(theme)}
                >
                  <JourneyFooterActionLabel theme={theme} icon="plus" label={t('common.add')} onAccent />
                </Press>
              ) : null}
              <Press
                hitSlop={3}
                onPress={() => {
                  setTimelineSelectionMode((open) => !open);
                  if (timelineSelectionMode) setSelectedTimelineItemIds(new Set());
                }}
                accessibilityRole="button"
                style={journeyFooterPill(theme)}
              >
                <JourneyFooterActionLabel theme={theme} icon={timelineSelectionMode ? 'check' : 'checkAll'} label={timelineSelectionMode ? t('common.done') : t('journey.timeline.selectMode')} />
              </Press>
            </>
          ) : selectedJourneyTab === 'moments' ? (
            <>
              {!momentSelectionMode ? (
                <Press
                  hitSlop={3}
                  onPress={() => momentAddActionRef.current?.()}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.add')}
                  style={journeyFooterAccentPill(theme)}
                >
                  <JourneyFooterActionLabel theme={theme} icon="plus" label={t('common.add')} onAccent />
                </Press>
              ) : null}
              <Press
                hitSlop={3}
                onPress={() => {
                  setMomentSelectionMode((open) => !open);
                  setSelectedMomentIds(new Set());
                }}
                accessibilityRole="button"
                style={journeyFooterPill(theme)}
              >
                <JourneyFooterActionLabel theme={theme} icon={momentSelectionMode ? 'check' : 'checkAll'} label={momentSelectionMode ? t('common.done') : t('journey.timeline.selectMode')} />
              </Press>
            </>
          ) : selectedJourneyTab === 'checklist' ? (
            <>
              {checklistCanEdit && !checklistSelectionMode ? (
                <Press
                  hitSlop={3}
                  onPress={() => checklistAddActionRef.current?.()}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.add')}
                  style={journeyFooterAccentPill(theme)}
                >
                  <JourneyFooterActionLabel theme={theme} icon="plus" label={t('common.add')} onAccent />
                </Press>
              ) : null}
              {checklistCanEdit ? (
                <Press
                  hitSlop={3}
                  onPress={() => {
                    setChecklistSelectionMode((open) => !open);
                    setSelectedChecklistItemIds(new Set());
                  }}
                  accessibilityRole="button"
                  style={journeyFooterPill(theme)}
                >
                  <JourneyFooterActionLabel theme={theme} icon={checklistSelectionMode ? 'check' : 'checkAll'} label={checklistSelectionMode ? t('common.done') : t('journey.timeline.selectMode')} />
                </Press>
              ) : null}
            </>
          ) : (
            journeyTrailEntry ? (
              <JourneyTrailFooterPill theme={theme} route={journeyTrailEntry.route} primary={journeyTrailEntry.primary} />
            ) : null
          )}
          </View>
          {/* Selection mode: 删除 takes the right slot that 问AI vacates, so the
              dock stays two pills — 完成 left, 删除 right. The branch order
              mirrors the left group so a stale mode from another tab can never
              claim the slot twice. */}
          {selectedJourneyTab === 'plan' ? (
            timelineSelectionMode ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                <Press
                  hitSlop={3}
                  disabled={selectedTimelineItemIds.size === 0}
                  onPress={moveSelectedTimelineItems}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: selectedTimelineItemIds.size === 0 }}
                  style={journeyFooterPill(theme, selectedTimelineItemIds.size === 0)}
                >
                  <JourneyFooterActionLabel
                    theme={theme}
                    icon="arrowDown"
                    label={t('journey.timeline.moveTo')}
                    disabled={selectedTimelineItemIds.size === 0}
                  />
                </Press>
                <Press
                  hitSlop={3}
                  disabled={selectedTimelineItemIds.size === 0}
                  onPress={deleteSelectedTimelineItems}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: selectedTimelineItemIds.size === 0 }}
                  style={journeyFooterPill(theme, selectedTimelineItemIds.size === 0)}
                >
                  <JourneyFooterActionLabel
                    theme={theme}
                    icon="trash"
                    label={t('common.delete')}
                    danger={selectedTimelineItemIds.size > 0}
                    disabled={selectedTimelineItemIds.size === 0}
                  />
                </Press>
              </View>
            ) : null
          ) : selectedJourneyTab === 'moments' ? (
            momentSelectionMode ? (
              <Press
                hitSlop={3}
                disabled={selectedMomentIds.size === 0}
                onPress={() => {
                  if (selectedMomentIds.size === 0) return;
                  Alert.alert(
                    t('journey.savePicker.deleteTitle', { count: selectedMomentIds.size }),
                    t('journey.savePicker.deleteMessage'),
                    [
                      { text: t('common.cancel'), style: 'cancel' },
                      {
                        text: t('common.delete'),
                        style: 'destructive',
                        onPress: () => {
                          void momentDeleteActionRef.current?.().then(() => setSelectedMomentIds(new Set()));
                        },
                      },
                    ],
                  );
                }}
                accessibilityRole="button"
                accessibilityState={{ disabled: selectedMomentIds.size === 0 }}
                style={journeyFooterPill(theme, selectedMomentIds.size === 0)}
              >
                <JourneyFooterActionLabel
                  theme={theme}
                  icon="trash"
                  label={t('common.delete')}
                  danger={selectedMomentIds.size > 0}
                  disabled={selectedMomentIds.size === 0}
                />
              </Press>
            ) : null
          ) : selectedJourneyTab === 'checklist' ? (
            checklistSelectionMode ? (
              <Press
                hitSlop={3}
                disabled={selectedChecklistItemIds.size === 0}
                onPress={() => {
                  if (selectedChecklistItemIds.size === 0) return;
                  Alert.alert(
                    t('common.delete'),
                    undefined,
                    [
                      { text: t('common.cancel'), style: 'cancel' },
                      { text: t('common.delete'), style: 'destructive', onPress: () => void checklistDeleteActionRef.current?.() },
                    ],
                  );
                }}
                accessibilityRole="button"
                accessibilityState={{ disabled: selectedChecklistItemIds.size === 0 }}
                style={journeyFooterPill(theme, selectedChecklistItemIds.size === 0)}
              >
                <JourneyFooterActionLabel
                  theme={theme}
                  icon="trash"
                  label={t('common.delete')}
                  danger={selectedChecklistItemIds.size > 0}
                  disabled={selectedChecklistItemIds.size === 0}
                />
              </Press>
            ) : null
          ) : null}
          {!timelineSelectionMode && !momentSelectionMode && !checklistSelectionMode && !planEditorOpen ? (
            <Press
              hitSlop={3}
              onPress={() => {
                if (!nav.pointInfo || nav.pointInfo.kind !== 'journey') return;
                nav.openAssistant(
                  t('agent.journeyPrompt'),
                  nav.pointInfo.id,
                );
              }}
              accessibilityRole="button"
              accessibilityLabel={t('agent.journeyEntry')}
              style={{
                height: 46,
                maxWidth: 190,
                paddingHorizontal: space.sm,
                borderRadius: radius.pill,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: space.xs,
                backgroundColor: theme.accent,
                boxShadow: theme.dark ? '0px 8px 24px rgba(0,0,0,0.55)' : '0px 8px 24px rgba(0,0,0,0.22)',
              }}
            >
              <AssistantMark color="#FFFFFF" size={21} />
              <Text numberOfLines={1} style={{ flexShrink: 1, color: '#FFFFFF', fontSize: 15, fontWeight: '700' }}>
                {t('agent.journeyEntry')}
              </Text>
            </Press>
          ) : null}
        </View>
      ) : null}
      {nav.pointInfo?.kind === 'journey' && !mapImmersive && nav.journeyVersionPreview && journeySheetIndex > 0 && !mapStylePickerVisible && !externalOverlayOpen ? (
        <View
          style={{
            position: 'absolute',
            left: space.md,
            right: space.md,
            bottom: Math.max(insets.bottom, space.md),
            zIndex: 180,
            alignItems: 'flex-end',
          }}
        >
          <Press
            onPress={() => setVersionRestoreDialogOpen(true)}
            accessibilityRole="button"
            style={{
              minHeight: 44,
              paddingHorizontal: space.lg,
              borderRadius: radius.pill,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: space.xs,
              backgroundColor: theme.accent,
              boxShadow: theme.dark ? '0px 5px 14px rgba(0,0,0,0.42)' : '0px 5px 14px rgba(0,0,0,0.12)',
            }}
          >
            <RotateCcw color="#FFFFFF" size={18} strokeWidth={2} />
            <Text style={[type.body, { color: '#FFFFFF', fontWeight: '700' }]}>{t('journey.version.restorePreview')}</Text>
          </Press>
        </View>
      ) : null}
      {nav.pointInfo?.kind === 'route' && !nav.routeGuide && !nav.newJourneyOpen && !mapImmersive && routeSheetIndex > 0 && !mapStylePickerVisible ? (
        <View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 180,
          }}
        >
          <RoutePreviewBottomBar theme={theme} poi={nav.pointInfo} onPlanRoute={planRouteJourney} onFollow={followRoute} />
        </View>
      ) : null}
      {/* The route card's 海拔 row opens the page a library track gets. Kept in
          this tree like the region picker, so no second window races the map. */}
      {routeElevationOpen && nav.pointInfo?.kind === 'route' ? (
        <View accessibilityViewIsModal style={[StyleSheet.absoluteFill, { zIndex: 220, elevation: 220 }]}>
          <TrackDetailPage
            theme={theme}
            route={nav.pointInfo}
            reversed={routeReversed}
            onBack={() => setRouteElevationOpen(false)}
          />
        </View>
      ) : null}
      <MarkDetail
        theme={theme}
        items={routeWaypointItems}
        index={openWaypointPage >= 0 ? openWaypointPage : null}
        presentation={routeWaypointPresentation}
        onPageChange={swipeWaypointTo}
        tone={nav.pointInfo?.kind === 'route' ? nav.pointInfo.tone : undefined}
        // Only the card needs a way back to the map; the sheet is already over it.
        onShowOnMap={routeWaypointPresentation === 'card' ? showWaypointOnMap : undefined}
        onClose={() => setOpenRouteWaypoint(null)}
      />
      <MarkDetail
        theme={theme}
        items={journeyStopItems}
        index={openJourneyStopPage >= 0 ? openJourneyStopPage : null}
        onPageChange={swipeJourneyStopTo}
        onClose={() => setOpenJourneyStopId(null)}
      />
      <JourneyGroupMoveSheet
        theme={theme}
        visible={timelineMovePicker != null}
        count={timelineMovePicker?.rows.length ?? 0}
        data={timelineMoveChoices}
        busyValue={movingGroup}
        errorMessage={timelineMoveError}
        onSelect={(group) => { void moveTimelineItemsToGroup(group); }}
        onClose={closeTimelineMovePicker}
      />
      <Modal
        visible={routeFeedbackOpen}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setRouteFeedbackOpen(false)}
      >
        <FeedbackPage
          theme={theme}
          initialCategory={2}
          onBack={() => setRouteFeedbackOpen(false)}
          onSubmit={() => {
            setRouteFeedbackOpen(false);
            nav.showToast(t('me.feedbackThanks'));
          }}
        />
      </Modal>
      <AppActionDialog
        theme={theme}
        visible={versionRestoreDialogOpen && Boolean(nav.journeyVersionPreview)}
        title={t('journey.version.restoreTitle')}
        message={t('journey.version.restoreMessage', { name: nav.journeyVersionPreview?.poi.name || '' })}
        confirmLabel={t('journey.version.restore')}
        cancelLabel={t('common.cancel')}
        confirming={versionRestoring}
        onCancel={() => setVersionRestoreDialogOpen(false)}
        onConfirm={() => void restorePreviewVersion()}
      />
      {/* ⋯ opens as a card over the corner they were tapped in, as on
          komoot: the card covers its buttons rather than hanging below them. */}
      <FloatingMenu theme={theme} visible={routeMoreOpen && nav.pointInfo?.kind === 'route'} top={insets.top + space.xs} width={Math.min(232, width - space.sm * 2)} onClose={() => { routeMenuAction.cancel(); setRouteMoreOpen(false); }} onClosed={routeMenuAction.onClosed}>
        <MenuRow theme={theme} icon="alert" label={t('discover.routeFeedback')} onPress={() => closeRouteMoreThen(() => setRouteFeedbackOpen(true))} />
        {/* 反向查看 lives in the layers panel, and 「从这里出发」 on the finish
            badge is the map's way in. Nothing else belongs in this menu. */}
        {nav.pointInfo?.kind === 'route' ? routeShareActions(nav.merged(nav.pointInfo)).filter((action) => action !== 'text').map((action) => (
          <MenuRow
            key={action}
            theme={theme}
            icon={action === 'gpx' ? 'download' : 'file'}
            label={t(action === 'gpx' ? 'discover.routeExportGpx' : 'discover.routeExportOriginal')}
            onPress={() => closeRouteMoreThen(() => shareOpenRoute(action))}
          />
        )) : null}
      </FloatingMenu>
    </View>
  );
}

// Kept mounted under AppShell for every tab; skip re-renders the shell makes
// for its own state. Context changes (useNav/useData) still reach it.
export const DiscoverScreen = React.memo(DiscoverScreenView);
