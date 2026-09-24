// DiscoverScreen.tsx — the 发现 tab. A platform-native map (SVG fallback) of routes
// (探索) or the user's journeys (旅程), with a draggable bottom sheet listing them
// and an in-place route/journey detail panel.
import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { ActivityIndicator, Animated, BackHandler, Easing, InteractionManager, Platform, Pressable, ScrollView, View, Text, useWindowDimensions, StyleSheet, Alert, Modal } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { Theme } from '../theme/theme';
import { useNav, useNavSubTab } from '../nav/NavContext';
import { countRender, markTabTap } from '../lib/tabSwitchProbe';
import { visiblePinKeys as railVisibleKeys } from '../lib/pinVisibility';
import { pressProbe } from '../lib/pinPressProbe';
// TEMPORARY: what one card open/close costs in frames, and which thread owes it.
import { beginFrameSample, endFrameSample, markFrameStage } from '../lib/pointFrameProbe';
import { useI18n, TKey } from '../i18n';
import { Poi } from '../data/pois';
import { useData } from '../data/DataContext';
import { Globe, NATIVE_MAP_ENABLED, pinKey, type GlobeCameraAction, type PinVisibilityApi, type GlobeJourneyDayLabel, type GlobeJourneyLeg, type GlobeJourneyStop, type GlobeMapStyle, type GlobeProps, type GlobeRouteSegment } from '../components/globe';
import { Glass } from '../components/Glass';
import { Icon, type IconName } from '../components/Icon';
import { Press } from '../components/Press';
import { TrailSheet, TrailSheetHandle } from '../components/Sheet';
import { KPState, KPSkeletonLine } from '../components/State';
import { StaggerIn } from '../components/StaggerIn';
import { DiscoverCollectionHeader, DiscoverJourneyCard, DiscoverRouteCard } from '../components/discover/DiscoverCollection';
import { RoutePreviewActions, RoutePreviewPanel } from '../components/discover/RoutePreviewPanel';
import { AppActionDialog, motion, radius, space, type } from '../design-system';
import { SelectedPoiCard, type JourneyMomentFilterMenuController } from './JourneyCard';
import { Avatar } from '../components/Avatar';
import Svg, { Circle, ClipPath, Defs, FeDropShadow, Filter, G, Image as SvgImage, Path } from 'react-native-svg';
import { useCompanionLocations } from '../hooks/useCompanionPresence';
import {
  PRESENCE_DROP_MS,
  PRESENCE_STALE_MS,
  setSharingJourneyId,
  useLastSelfPresence,
  useSharingJourneyId,
} from '../lib/companionPresence';
import type { NativeMapMarker } from '../components/maps/types';
import { JourneyChecklistPickerSheet, type JourneyChecklistFilterMenuController } from '../components/journey/JourneyChecklistTab';
import { refetchJourneyTimeline, useTimeline } from '../hooks/useTimeline';
import { useJourneyLegGeometry } from '../hooks/useJourneyLegGeometry';
import { buildJourneyLegs, buildJourneyStops, journeyDayOrder, measureJourneyDays, type JourneyLeg } from '../lib/journeyStops';
import { journeyTracks } from '../lib/journeyTracks';
import { journeyDayDisplayLabel } from '../lib/journeyDays';
import { JOURNEY_SEGMENT_COLORS } from '../lib/routeSegments';
import { MapStylePickerSheet, type MapDisplayOption, type MapPresentationStyle } from '../components/MapStylePickerSheet';
import { AssistantMark } from '../components/assistant/AssistantMark';
import { Maximize2, RotateCcw, Search } from 'lucide-react-native';
import { restoreJourneyVersion } from '../hooks/useJourneyVersions';
import { refetchJourneyInspo } from '../hooks/useInspo';
import { refetchJourneyPacking } from '../hooks/useJourneyPacking';
import { FeedbackPage } from '../components/me/FeedbackPage';

// Chips carry a stable id (used by the filter logic + as the i18n key suffix);
// their display label is resolved per-language at render time.
const EXPLORE_CHIPS = ['all', 'easy', 'highAsc', 'near', 'mine'] as const;
const MEMORY_CHIPS = ['all', 'fav'] as const;
const ROUTE_COMPARISON_COLORS = ['#F08A5D', '#26B7E8', '#6C63F5', '#35B779', '#E35D9A', '#D9A21B'] as const;

type FilterMenuAnchor = { x: number; y: number; width: number; height: number };

const MAP_DISPLAY_SETTINGS_KEY = 'kaipa:discover-map-display:v1';

type PersistedMapDisplaySettings = {
  mapStyle?: GlobeMapStyle;
  journeyStopsVisible?: boolean;
  journeyTrackVisible?: boolean;
  journeyDistanceVisible?: boolean;
  mapLabelsVisible?: boolean;
  mapDistanceMarkersVisible?: boolean;
  /** Written before the itinerary had three separate switches: one flag covered
   *  stops, track and distance capsules alike. Read on hydrate to seed them,
   *  never written again. */
  journeyMapDetailsVisible?: boolean;
};

function mapDisplaySettingsKey(userId: string | null) {
  return `${MAP_DISPLAY_SETTINGS_KEY}:${userId || 'anonymous'}`;
}

function MapToolButton({
  theme,
  onPress,
  accessibilityLabel,
  children,
  size = 36,
}: {
  theme: Theme;
  onPress: () => void;
  accessibilityLabel: string;
  children: React.ReactNode;
  size?: number;
}) {
  return (
    <Press
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.controlSurface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.fieldBorder,
      }}
    >
      {children}
    </Press>
  );
}

// A companion's live position as an avatar badge — no droplet silhouette at
// all (2026-09-24 用户拍板). The body is a *pure circle*: the photo clipped
// to a full disc with a white ring straddling its edge. The "pin" effect is
// a needle drawn as one silhouette with the disc: its sides are *concave
// Bézier curves that meet the circle tangentially* (±35° from the bottom,
// 25° tip angle — variant A of preview-companion-pin.html; straight-sided
// triangles read as a stuck-on dart, tangent continuity is the 丝滑). The
// needle points at the small grey ground dot, which is the real anchor, so
// the badge hovers over the place. Soft drop shadow behind the whole badge.
// Fixed-size box keeps the dot at the same y whether or not the age pill row
// is used. No onPress — the pin is something you read, not tap.
const DROP_DISC_CX = 26;
const DROP_DISC_CY = 24;
// Photo disc grown + ring slimmed (2026-09-24 用户两轮"环再细一点"):
// outer edge stays at 22.5 so the needle tangents still land on it; the
// ring is now a 2px band and the visible avatar radius is 20.5. Going below
// 2px risks a broken hairline in the Android marker snapshot.
const DROP_PHOTO_R = 21.5;
const DROP_RING_W = 2; // centred on the photo edge: 1px out, 1px in
// Disc outer edge (r22.5) + concave needle to the tip at (26,53). The 1.5px
// white stroke with round joins softens the needle point.
const DROP_SIL_PATH = 'M26 53 C23.65 47.96 17.65 45.62 13.09 42.43 A22.5 22.5 0 1 1 38.91 42.43 C34.35 45.62 28.35 47.96 26 53 Z';
const DROP_DOT_CY = 58; // the small ground dot — this is the position
const DROP_BOX_W = 52;
const DROP_SVG_H = 62;
const DROP_BOX_H = DROP_SVG_H + 2 + 16; // + gap + reserved pill row

function CompanionLocationPin({
  theme,
  avatarUrl,
  stale,
  ageLabel,
  clipId,
}: {
  theme: Theme;
  avatarUrl?: string;
  stale: boolean;
  ageLabel: string;
  clipId: string;
}) {
  return (
    <View pointerEvents="none" style={{ width: DROP_BOX_W, height: DROP_BOX_H, alignItems: 'center', opacity: stale ? 0.7 : 1 }}>
      <Svg width={DROP_BOX_W} height={DROP_SVG_H}>
        <Defs>
          <ClipPath id={`${clipId}-disc`}>
            <Circle cx={DROP_DISC_CX} cy={DROP_DISC_CY} r={DROP_PHOTO_R} />
          </ClipPath>
          <Filter id={`${clipId}-shadow`} x="-50%" y="-50%" width="200%" height="200%">
            <FeDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#000000" floodOpacity="0.25" />
          </Filter>
        </Defs>
        <G filter={`url(#${clipId}-shadow)`}>
          <Path d={DROP_SIL_PATH} fill="#FFFFFF" stroke="#FFFFFF" strokeWidth={1.5} strokeLinejoin="round" />
          <G clipPath={`url(#${clipId}-disc)`}>
            {avatarUrl ? (
              <SvgImage
                href={{ uri: avatarUrl }}
                x={DROP_DISC_CX - DROP_PHOTO_R}
                y={DROP_DISC_CY - DROP_PHOTO_R}
                width={DROP_PHOTO_R * 2}
                height={DROP_PHOTO_R * 2}
                preserveAspectRatio="xMidYMid slice"
              />
            ) : (
              <Circle cx={DROP_DISC_CX} cy={DROP_DISC_CY} r={DROP_PHOTO_R} fill={theme.fieldSurface} />
            )}
          </G>
          <Circle cx={DROP_DISC_CX} cy={DROP_DISC_CY} r={DROP_PHOTO_R} fill="none" stroke="#FFFFFF" strokeWidth={DROP_RING_W} />
        </G>
        <Circle cx={DROP_DISC_CX} cy={DROP_DOT_CY} r={2.4} fill="#48484A" stroke="#FFFFFF" strokeWidth={1} />
      </Svg>
      {!avatarUrl ? (
        <View pointerEvents="none" style={{ position: 'absolute', top: 16 }}>
          <Icon name="user" color={theme.text3} size={16} strokeWidth={1.8} />
        </View>
      ) : null}
      {stale ? (
        <View style={{ marginTop: 2, paddingHorizontal: 5, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.55)' }}>
          <Text style={{ color: '#FFFFFF', fontSize: 9.5, lineHeight: 12, fontWeight: '700' }}>{ageLabel}</Text>
        </View>
      ) : null}
    </View>
  );
}

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
}: {
  theme: Theme;
  icon: IconName;
  label: string;
  danger?: boolean;
  disabled?: boolean;
}) {
  const color = disabled ? theme.text3 : danger ? theme.danger : theme.text;
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
  useEffect(() => {
    Animated.timing(progress, {
      toValue: on ? 1 : 0,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
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
          transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, MINI_TRACK_W - MINI_THUMB - 4] }) }],
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
 * open route's own pin is off the map (the card is showing it) and any sibling
 * already laid over it for comparison is skipped, so a shared trailhead keeps
 * exposing the next candidate.
 */
function pinsFromGroups(
  groups: { rep: Poi; group: Poi[] }[],
  layer: 'explore' | 'memory',
  openRoute: { id: string; comparisonIds: Set<string> } | null,
) {
  return groups.flatMap(({ rep, group }) => {
    const markerCandidates = openRoute
      ? group.filter((item) => item.id !== openRoute.id && !openRoute.comparisonIds.has(item.id))
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

// Shared empty selection: `selectedIds` is only read or replaced wholesale, so one
// instance lets `exitSelect()` bail instead of handing React a new Set identity and
// forcing a render pass that draws the same pixels (measured: every sub-tab tap's
// second `Discover` render).
const NO_SELECTION: Set<string> = new Set();

export function DiscoverScreen({
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
  const chipLabel = (id: string) =>
    t(`discover.chip${id.charAt(0).toUpperCase()}${id.slice(1)}` as TKey);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const subTab = useNavSubTab();
  const isMemory = subTab === 'memory';
  const [chip, setChip] = React.useState(0);
  const [mapStyle, setMapStyle] = useState<GlobeMapStyle>('standard');
  const [mapStylePickerOpen, setMapStylePickerOpen] = useState(false);
  const [routeFeedbackOpen, setRouteFeedbackOpen] = useState(false);
  const [journeyStopsVisible, setJourneyStopsVisible] = useState(true);
  const [journeyTrackVisible, setJourneyTrackVisible] = useState(true);
  const [journeyDistanceVisible, setJourneyDistanceVisible] = useState(true);
  const [mapAtRouteFrame, setMapAtRouteFrame] = useState(true);
  const [mapLabelsVisible, setMapLabelsVisible] = useState(true);
  const [mapDistanceMarkersVisible, setMapDistanceMarkersVisible] = useState(true);
  // Keep a route-detail selection separate from the route whose card is open,
  // so a nearby route can be overlaid for visual comparison.
  const [comparisonRoutes, setComparisonRoutes] = useState<Poi[]>([]);
  const comparisonRouteIds = useMemo(() => new Set(comparisonRoutes.map((route) => route.id)), [comparisonRoutes]);
  const [routeReversed, setRouteReversed] = useState(false);
  const [mapCameraAction, setMapCameraAction] = useState<GlobeCameraAction>();
  const mapDisplaySettingsHydratedRef = React.useRef(false);
  const mapCameraRef = React.useRef<{ center: [number, number]; zoom: number } | null>(null);
  const mapBeforePointRef = React.useRef<{ center: [number, number]; zoom: number } | null>(null);
  const mapPointGestureRef = React.useRef(false);
  const mapMarkerPressAtRef = React.useRef(0);
  const wasMapActiveRef = React.useRef(active);
  const mapCameraEventRef = React.useRef<{ at: number } | null>(null);
  const [currentLocation, setCurrentLocation] = useState<{ lng: number; lat: number; heading?: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [mapAtCurrentLocation, setMapAtCurrentLocation] = useState(false);
  const headingSubscriptionRef = React.useRef<Location.LocationSubscription | null>(null);
  const positionSubscriptionRef = React.useRef<Location.LocationSubscription | null>(null);
  // When a clustered map pin is tapped, the same journey-list sheet is scoped to
  // that trailhead (coordinate key) — only the header copy changes to 这个地点的旅程.
  const [placeSel, setPlaceSel] = React.useState<string | null>(null);
  const [focusReturnToList, setFocusReturnToList] = React.useState(false);
  const sheetRef = React.useRef<TrailSheetHandle>(null);
  const routeJourneyTransitionRef = React.useRef(false);
  const journeyDetailScrollY = React.useRef(new Animated.Value(0)).current;
  const pointSheetTranslateY = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;
    mapDisplaySettingsHydratedRef.current = false;
    setMapStyle('standard');
    setJourneyStopsVisible(true);
    setJourneyTrackVisible(true);
    setJourneyDistanceVisible(true);
    setMapLabelsVisible(true);
    setMapDistanceMarkersVisible(true);
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
          setJourneyTrackVisible(
            typeof saved.journeyTrackVisible === 'boolean'
              ? saved.journeyTrackVisible
              : legacy ?? true,
          );
          setJourneyDistanceVisible(
            typeof saved.journeyDistanceVisible === 'boolean'
              ? saved.journeyDistanceVisible
              : legacy ?? true,
          );
          if (typeof saved.mapLabelsVisible === 'boolean') setMapLabelsVisible(saved.mapLabelsVisible);
          if (typeof saved.mapDistanceMarkersVisible === 'boolean') setMapDistanceMarkersVisible(saved.mapDistanceMarkersVisible);
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
    };
    AsyncStorage.setItem(mapDisplaySettingsKey(userId), JSON.stringify(settings)).catch(() => {});
  }, [journeyDistanceVisible, journeyStopsVisible, journeyTrackVisible, mapDistanceMarkersVisible, mapLabelsVisible, mapStyle, userId]);

  // TEMPORARY probe snapshot: every `[pinpress]` line prints this, so one paste
  // of two taps shows what each press gate believed at that moment.
  React.useEffect(() => {
    pressProbe.context({
      pointInfo: nav.pointInfo ? `${nav.pointInfo.kind}:${nav.pointInfo.id}` : '',
      sheetOpen: nav.sheetOpen,
      immersive: mapImmersive,
      layer: subTab,
      rail: useRail,
      pins: mapPois.length,
      poiMarkers: !nav.pointInfo || nav.pointInfo.kind === 'route',
      visibleSet: visiblePinKeys.size,
      cameraRevision: mapCameraAction?.revision ?? 0,
      markerPressAgo: mapMarkerPressAtRef.current ? Date.now() - mapMarkerPressAtRef.current : 0,
      // The geometry of what is actually allowed to be seen, so a blocked press
      // can be read as "the pin you tapped is not one of these" or "it is, and
      // something invisible is stacked on top of it".
      where: mapPois.filter((p) => visiblePinKeys.has(`${p.layer}:${p.id}`)).slice(0, 6)
        .map((p) => `${p.layer}:${p.id}@${p.lng.toFixed(2)},${p.lat.toFixed(2)}`).join(' ') || '-',
    });
  });

  const openPointFromCurrentMap = (poi: Poi, from: 'pin' | 'list' = 'list') => {
    pressProbe.open(`from-${from} ${poi.kind}:${poi.id}`);
    beginFrameSample(`open-from-${from} ${poi.kind}:${poi.id}`, `pins=${mapPois.length} track=${poi.trackCoords?.length ?? 0}`);
    mapBeforePointRef.current = mapCameraRef.current;
    mapPointGestureRef.current = false;
    nav.openPoint(poi);
  };

  const restoreMapAfterPoint = () => {
    // The list sheet also calls this when it is dragged away; only a card's close
    // is the transition worth sampling.
    if (nav.pointInfo) {
      beginFrameSample('close', `pins=${mapPois.length} track=${nav.pointInfo.trackCoords?.length ?? 0}`);
    }
    const camera = mapBeforePointRef.current;
    if (camera) {
      pressProbe.cameraRestore(`${camera.center[0].toFixed(4)},${camera.center[1].toFixed(4)} z${camera.zoom.toFixed(2)}`);
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
    pressProbe.dismissStart('back-button');
    restoreMapAfterPoint();
    sheetRef.current?.dismiss();
  };

  const planRouteJourney = React.useCallback((route: Poi) => {
    routeJourneyTransitionRef.current = true;
    // hide is an imperative animation and does not emit the sheet's index
    // callback. Keep floating route actions in sync while it leaves the screen.
    setRouteSheetIndex(0);
    // Fully move the route card off-screen before mounting the planner. Going
    // to the lowest detent first leaves a visible pause at the minimized card.
    sheetRef.current?.hide(() => nav.openNewJourney(route));
  }, [nav]);

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

  // ── multi-select (long-press to enter, batch delete) ──
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => NO_SELECTION);
  const [planEditorOpen, setPlanEditorOpen] = useState(false);
  const [journeySheetIndex, setJourneySheetIndex] = useState(1);
  const [detailBodyHeight, setDetailBodyHeight] = useState(0);
  const [routeSheetIndex, setRouteSheetIndex] = useState(1);
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
  const [journeyDaySelectionRequest, setJourneyDaySelectionRequest] = useState<{ day?: string; revision: number }>();
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
  const versionTimelinePreview = useMemo(
    () => nav.journeyVersionPreview
      ? { rows: nav.journeyVersionPreview.version.snapshot.timelineRows, groups: nav.journeyVersionPreview.version.snapshot.timelineGroups }
      : undefined,
    [nav.journeyVersionPreview],
  );
  const focusedTimeline = useTimeline(focusedJourneyId, userId, versionTimelinePreview);
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
    if (!day) {
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

  React.useEffect(() => {
    setRouteSheetIndex(1);
    setMapStylePickerOpen(false);
    setMapAtRouteFrame(true);
    setRouteReversed(false);
    setComparisonRoutes([]);
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
            void Promise.all([...selectedTimelineItemIds].map((id) => focusedTimeline.remove(id)));
            setSelectedTimelineItemIds(new Set());
          },
        },
      ],
    );
  };

  const enterSelect = useCallback((id: string) => {
    setSelectMode(true);
    setSelectedIds(new Set([id]));
  }, []);
  const exitSelect = useCallback(() => {
    setSelectMode((on) => (on ? false : on));
    setSelectedIds((ids) => (ids.size ? NO_SELECTION : ids));
  }, []);
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);

  const chromeTheme = theme;

  React.useEffect(() => {
    setChip(0);
    setPlaceSel(null);
  }, [isMemory]);

  // Public-track journeys to inject into explore tab: shared journeys from
  // the user (and eventually from other users) that are trackPublic + have track data.
  // Not gated on the visible mode: while 旅程 is on screen this is still the layer
  // the map has to keep mounted and hidden, so it needs the same list.
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

  // Both modes' lists, built independently and *without* the chip or the
  // route-detail rules, because those say which pins are visible and not what a pin
  // is: keeping the two layers' content free of the mode means a switch changes no
  // object identity at all, which is the whole point of the rail below.
  const memoryBasePois: Poi[] = useMemo(() => {
    const merged = [...nav.extraJourneys, ...journeys];
    const seen = new Set<string>();
    return merged
      .filter((p) => { if (seen.has(p.id)) return false; seen.add(p.id); return true; })
      .filter((p) => !nav.removedIds.includes(p.id))
      .map((p) => nav.merged(p));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav.extraJourneys, journeys, nav.removedIds, nav.journeyPatch]);

  const exploreBasePois: Poi[] = useMemo(() => {
    const merged = [...nav.savedRoutes, ...routes, ...publicTrackPois];
    const seen = new Set<string>();
    return merged.filter((p) => { if (seen.has(p.id)) return false; seen.add(p.id); return true; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav.savedRoutes, routes, publicTrackPois]);

  const basePois: Poi[] = isMemory ? memoryBasePois : exploreBasePois;

  const pois = useMemo(() => {
    let list = [...basePois];
    if (isMemory) {
      const key = MEMORY_CHIPS[chip];
      if (key === 'fav') list = list.filter((p) => p.fav);
    } else {
      const key = EXPLORE_CHIPS[chip];
      if (key === 'easy') list = list.filter((p) => p.diff === '易' || p.diff === '中');
      else if (key === 'highAsc') list = [...list].sort((a, b) => num(b.asc) - num(a.asc));
      else if (key === 'near') list = [...list].sort((a, b) => num(a.dist) - num(b.dist));
      else if (key === 'mine') list = list.filter((p) => p.mine);
    }
    return list;
  }, [basePois, chip, isMemory]);

  // The sheet's list: scoped to one trailhead when a clustered pin is tapped,
  // otherwise the full (chip-filtered) list. The map still shows every place.
  const displayPois = useMemo(
    () => (placeSel ? pois.filter((p) => placeKey(p) === placeSel) : pois),
    [pois, placeSel]
  );

  const allSelected = displayPois.length > 0 && selectedIds.size === displayPois.length;
  const toggleAll = useCallback(() => {
    setSelectedIds(allSelected ? NO_SELECTION : new Set(displayPois.map((p) => p.id)));
  }, [allSelected, displayPois]);
  const deleteSelected = useCallback(() => {
    nav.openActionSheet({
      title: t('discover.selectDeleteTitle'),
      message: t('discover.selectDeleteMessage', { count: selectedIds.size }),
      items: [{
        label: t('discover.selectDeleteConfirm', { count: selectedIds.size }),
        destructive: true,
        onPress: () => {
          nav.removeJourneys([...selectedIds]);
          nav.closeActionSheet();
          exitSelect();
        },
      }],
    });
  }, [nav, selectedIds, t, exitSelect]);

  React.useEffect(() => { exitSelect(); }, [isMemory, chip, exitSelect]);

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
  const journeyMinimum = Math.round(height * 0.15);
  const full = Math.round(height * 0.88);
  const focusPanel = Math.round(height * 0.56);
  // Fullscreen leaves nothing over the map, so the fit may use the whole screen.
  // The snap-based paddings below would keep a dead band exactly as tall as the
  // card that is currently off screen.
  const immersiveFitBottom = Math.round(insets.bottom + 28);

  const sheetVisible = nav.sheetOpen || !!nav.pointInfo;
  const rawFocusCoords = useMemo<[number, number][] | null>(() => {
    const point = nav.pointInfo;
    if (!point) return null;
    const timelineRouteIds = focusedTimeline.rows.map((row) => row.routeId).filter(Boolean);
    // Older journeys only persisted the first timeline route id, while the
    // journey title still contains every selected route name. Recover those
    // route geometries for the overview map as well.
    const titleRouteIds = point.kind === 'journey'
      ? routes.filter((route) => route.name.length >= 3 && point.name.includes(route.name)).map((route) => route.id)
      : [];
    const routeTracks = [...new Set([...timelineRouteIds, ...titleRouteIds])]
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
  }, [nav.pointInfo, routes]);
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
  // TEMPORARY: the two commits that make up one transition, timed apart. `card`
  // is where the sheet's children swap; `track` is the frame the camera starts
  // moving in, and the one that used to cost 510ms of JS thread.
  React.useEffect(() => {
    markFrameStage(nav.pointInfo ? 'card' : 'list', `pins=${mapPois.length}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav.pointInfo?.id]);
  React.useEffect(() => {
    markFrameStage('track', `count=${focusCoords?.length ?? 0}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusCoords?.length]);
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
    const timelineRouteIds = focusedTimeline.rows.map((row) => row.routeId).filter(Boolean) as string[];
    const titleRouteIds = routes
      .filter((route) => route.name.length >= 3 && nav.pointInfo?.name.includes(route.name))
      .map((route) => route.id);
    const routeIds = [...new Set([...timelineRouteIds, ...titleRouteIds])];
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
      active: !selectedJourneyDay || !segment.days || segment.days.includes(selectedJourneyDay),
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
    }));
  }, [hiddenJourneyRouteIds, journeySegmentGeometry, nav.pointInfo?.kind]);
  useEffect(() => {
    setHiddenJourneyRouteIds(NO_HIDDEN_JOURNEY_ROUTES);
  }, [nav.pointInfo?.id]);
  const routeComparisonSegments = useMemo(() => {
    if (nav.pointInfo?.kind !== 'route') return [];
    const primary = focusCoords ?? [];
    const primaryCoordinates = routeReversed ? [...primary].reverse() : primary;
    const result: GlobeRouteSegment[] = [];
    if (primaryCoordinates.length >= 2) {
      result.push({ id: 'route-detail-primary', label: nav.pointInfo.name, coordinates: primaryCoordinates, color: theme.accent, active: true });
    }
    comparisonRoutes.forEach((route, index) => {
      const coordinates = route.trackCoords;
      if (!coordinates || coordinates.length < 2 || route.id === nav.pointInfo?.id) return;
      let color = ROUTE_COMPARISON_COLORS[index % ROUTE_COMPARISON_COLORS.length];
      if (color.toLowerCase() === theme.accent.toLowerCase()) {
        color = ROUTE_COMPARISON_COLORS[(index + 1) % ROUTE_COMPARISON_COLORS.length];
      }
      result.push({
        id: `route-detail-comparison-${route.id}`,
        label: route.name,
        coordinates,
        color,
        active: true,
      });
    });
    return result;
  }, [comparisonRoutes, focusCoords, nav.pointInfo, routeReversed, theme.accent]);
  const routeMapFocusCoords = useMemo(() => {
    if (nav.pointInfo?.kind !== 'route' || !comparisonRoutes.length) return focusCoords;
    return [
      ...(focusCoords ?? []),
      ...comparisonRoutes.flatMap((route) => route.trackCoords ?? []),
    ];
  }, [comparisonRoutes, focusCoords, nav.pointInfo?.kind]);
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
      ? buildJourneyLegs(itineraryStops, new Map(focusedTimeline.rows.map((row) => [row.id, row])),
        (trackId) => itineraryTrackCoords.get(trackId))
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
        .filter((stop) => !selectedJourneyDay || selectedJourneyDay === stop.day)
        .map((stop) => ({
          id: stop.rowId,
          // Numbers belong to the open day alone: they match that day's card
          // positions. The overview shows plain dots, otherwise a previous day's
          // "2" sits in front of this day's "1" and reads as a reversed route.
          order: selectedJourneyDay ? stop.order : undefined,
          name: stop.name,
          coordinate: stop.coordinate,
          color: itineraryColor(stop.day),
        }))
      : []
  ), [itineraryColor, itineraryStops, journeyStopsVisible, selectedJourneyDay]);
  const journeyLegs = useMemo<GlobeJourneyLeg[]>(() => (
    journeyTrackVisible
      ? itineraryLegs.map((leg) => {
        const planned = legGeometry[leg.id];
        return {
          id: leg.id,
          coordinates: planned ?? [leg.from, leg.to],
          color: itineraryColor(leg.day),
          active: !selectedJourneyDay || selectedJourneyDay === leg.day,
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
        .filter((measured) => !selectedJourneyDay || selectedJourneyDay === measured.day)
        .map((measured) => ({
          day: measured.day,
          title: journeyDayDisplayLabel(measured.day, resolved),
          distance: `${measured.meters < 10_000 ? (measured.meters / 1000).toFixed(1) : Math.round(measured.meters / 1000)}km`,
          coordinate: measured.coordinate,
          color: itineraryColor(measured.day),
        }))
      : []
  ), [itineraryColor, itineraryLegs, journeyDistanceVisible, legGeometry, resolved, selectedJourneyDay]);
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
  const dayLegs = journeyItineraryActive && selectedJourneyDay
    ? itineraryLegs.filter((leg) => leg.day === selectedJourneyDay)
    : [];
  const dayTrackCoords = journeyItineraryActive && selectedJourneyDay
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
    : !selectedJourneyDay
      ? journeyOverviewFrame
      // A day is its legs plus its own pins. Chains never cross into the next
      // day, so a day holding a single place has no leg at all and its pin has
      // to carry the frame on its own — MapGlobe then moves the camera to that
      // one coordinate, kept clear of the card the same way a fit is.
      : [
        ...dayLegs.flatMap(legCoords),
        ...itineraryStops.filter((stop) => stop.day === selectedJourneyDay).map((stop) => stop.coordinate),
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
    if (!selectedJourneyDay && !previousDay) return;
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
  const mapStylePickerVisible = mapStylePickerOpen;
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

  const toggleRouteDirection = () => {
    if (nav.pointInfo?.kind !== 'route') return;
    setRouteReversed((value) => !value);
    setMapAtRouteFrame(true);
    setMapCameraAction((current) => ({ type: 'fitRoute', revision: (current?.revision ?? 0) + 1 }));
  };

  React.useEffect(() => {
    onBlockingOverlayChange?.(mapStylePickerVisible);
  }, [mapStylePickerVisible, onBlockingOverlayChange]);

  const locateCurrentPosition = useCallback(async () => {
    if (locating) return;
    setLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        nav.showToast(t('discover.locationPermissionDenied'));
        return;
      }
      // Android can grant permission while the device-wide location provider
      // is disabled. Avoid waiting indefinitely for a native callback.
      const servicesEnabled = await withTimeout(
        Location.hasServicesEnabledAsync(),
        3_000,
        'Checking location services timed out',
      );
      if (!servicesEnabled) {
        nav.showToast(t('discover.locationFailed'));
        return;
      }
      const approximateLocation = permission.ios?.accuracy === 'reduced'
        || permission.android?.accuracy === 'coarse';

      // A cached fix gives Android an immediate result when the GPS provider
      // is slow to acquire a satellite fix. Fall back to a bounded balanced-
      // accuracy request instead of waiting indefinitely for Highest accuracy.
      const cachedPosition = await withTimeout(
        Location.getLastKnownPositionAsync({ maxAge: 120_000, requiredAccuracy: 5_000 }),
        2_000,
        'Reading cached location timed out',
      );
      const position = cachedPosition ?? await withTimeout(
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
          mayShowUserSettingsDialog: true,
        }),
        15_000,
        'Location request timed out',
      );
      const coordinate: [number, number] = [position.coords.longitude, position.coords.latitude];
      const positionHeading = position.coords.heading;
      setCurrentLocation({
        lng: coordinate[0],
        lat: coordinate[1],
        heading: positionHeading != null && positionHeading >= 0 ? positionHeading : undefined,
      });
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
      nav.showToast(t('discover.locationFailed'));
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
      return [{
        // Android snapshots marker content by id, so everything the pixel
        // depends on — position and the staleness step — has to live in it.
        id: `companion-${peer.userId}-${Math.round(peer.longitude * 10000)}-${Math.round(peer.latitude * 10000)}-${stale ? `old-${Math.floor(age / 60_000)}` : 'live'}`,
        coordinate: [peer.longitude, peer.latitude],
        // The ground dot — not the pin tip — is the position: anchor there,
        // so the pin hovers over the place like Apple's does.
        anchor: { x: 0.5, y: DROP_DOT_CY / DROP_BOX_H },
        centerOffset: { x: 0, y: DROP_BOX_H / 2 - DROP_DOT_CY },
        // A live person outranks the static itinerary furniture they overlap:
        // the numbered start/end pins sit at z 0, so the avatar floats above
        // them wherever a companion is standing on the route.
        zIndex: 100,
        content: (
          <CompanionLocationPin
            theme={theme}
            avatarUrl={companion?.avatarUrl || (self ? data.profile.avatarUrl : undefined)}
            stale={stale}
            ageLabel={t('discover.shareLocationAgo', { minutes: Math.max(1, Math.round(age / 60_000)) })}
            clipId={`companion-drop-${peer.userId}`}
          />
        ),
      }];
    });
  }, [data.profile.avatarUrl, nav.pointInfo, presenceClock, peers, selfPresence, sharingThisJourney, t, theme, userId]);
  const toggleLocationShare = useCallback(async () => {
    if (!openJourneyId) return;
    if (sharingJourneyId === openJourneyId) {
      // No toast on stop either — the switch sliding back and the avatars
      // vanishing is the whole answer (user: "点击位置后不需要触发通知条").
      setSharingJourneyId(null);
      return;
    }
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) {
      nav.showToast(t('discover.locationPermissionDenied'));
      return;
    }
    // Android grants permission without the device-wide provider being on, and
    // the watch would then deliver nothing at all: the switch reads on and no
    // avatar ever appears. Same escape the locate button uses, same reason.
    try {
      if (!await withTimeout(Location.hasServicesEnabledAsync(), 3_000, 'Checking location services timed out')) {
        nav.showToast(t('discover.locationFailed'));
        return;
      }
    } catch {
      // A hung provider check must not block the share; the grey ring on the
      // user's own pin is the fallback signal.
    }
    setSharingJourneyId(openJourneyId);
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
  const exploreLayerPins = useMemo(
    () => pinsFromGroups(groupByPlace(exploreBasePois), 'explore', null),
    [exploreBasePois],
  );
  const memoryLayerPins = useMemo(
    () => pinsFromGroups(groupByPlace(memoryBasePois), 'memory', null),
    [memoryBasePois],
  );
  // Ordered by layer, never by role, so this array is the same object on both sides
  // of a switch - which is the point: the map is never asked to re-render for one.
  const railPins = useMemo(() => [...exploreLayerPins, ...memoryLayerPins], [exploreLayerPins, memoryLayerPins]);
  const liveLayerPins = useMemo(
    () => pinsFromGroups(
      placeGroups,
      subTab,
      nav.pointInfo?.kind === 'route'
        ? { id: nav.pointInfo.id, comparisonIds: comparisonRouteIds }
        : null,
    ),
    [comparisonRouteIds, nav.pointInfo?.id, nav.pointInfo?.kind, placeGroups, subTab],
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
      subTab,
      nav.pointInfo?.kind === 'route'
        ? { id: nav.pointInfo.id, comparisonIds: comparisonRouteIds }
        : null,
    );
  }, [comparisonRouteIds, mapPois, nav.pointInfo?.id, nav.pointInfo?.kind, placeGroups, subTab, useRail]);
  const pushedModeRef = React.useRef<typeof subTab | null>(null);
  React.useEffect(() => {
    const api = pinVisibilityApi.current;
    if (!api) return;
    // A new mode (or the first paint of one) arrives one pin at a time, like the
    // catalog did on the first screen; everything else is immediate.
    const stagger = pushedModeRef.current !== subTab;
    pushedModeRef.current = subTab;
    api.apply(visiblePinKeys, { stagger });
  }, [visiblePinKeys, subTab]);

  const listState = 'normal'; // could be wired to a tweak later

  // List-mode header (kicker + title + filter/add + chips). When a POI is
  // selected the sheet switches to compact mode and this header is not shown —
  // the card's hero fills the top and the floating grab handle dismisses it.
  const header = (
    <DiscoverCollectionHeader
      theme={theme}
      eyebrow={placeSel ? t('discover.titleMyJourneys') : ''}
      title={placeSel ? t('discover.titlePlace') : isMemory ? t('discover.titleMyJourneys') : t('discover.titleFeatured')}
      summary={isMemory || placeSel
        ? t('discover.countJourneys', { count: displayPois.length, km: Math.round(totalKm) })
        : ''}
      filters={(isMemory ? MEMORY_CHIPS : []).map((id) => ({ id, label: chipLabel(id) }))}
      activeFilter={chip}
      onFilterChange={setChip}
      onFilter={() => nav.showToast(t('discover.toastFilter'))}
      onSecondary={isMemory ? () => nav.openNearbyJoin() : undefined}
      secondaryIcon={isMemory ? 'download' : undefined}
      onAdd={() => placeSel ? nav.openNewJourney(placePreset) : isMemory ? nav.openNewJourney() : nav.openAddRoute()}
      onBack={placeSel ? () => setPlaceSel(null) : undefined}
      showActions={isMemory || !!placeSel}
    />
  );

  // ── what the map has to catch up with ──
  // The map freezes while Discover is not the active tab, so the pass that thaws
  // it also carries every change made while it was invisible. Only some of those
  // changes are the user's: `setMainTab` clears the selection, the focus arrays
  // move to the whole list, and the map's auto-framing reads that as "frame this
  // route" - pulling the camera across the country on a plain tab switch. The
  // signature says which case a thaw is.
  const mapFocusTarget = nav.pointInfo?.kind === 'route' ? routeMapFocusCoords : rawFocusCoords;
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
      } else setMapAtCurrentLocation(false);
    },
    onCameraPositionChange: (camera) => {
      const prev = mapCameraRef.current;
      mapCameraRef.current = camera;
      const moved = !prev
        || Math.abs(prev.center[0] - camera.center[0]) > 1e-6
        || Math.abs(prev.center[1] - camera.center[1]) > 1e-6
        || Math.abs(prev.zoom - camera.zoom) > 0.01;
      if (!moved) return;
      endFrameSample();
      // The move the card asked for is over: the kilometre labels can have these
      // frames to themselves instead of competing with the animation.
      setDistanceMarkersReady(true);
      const hidden = !wasMapActiveRef.current;
      if (hidden) mapCameraEventRef.current = { at: Date.now() };
    },
    onJourneyDayLabelPress: (day) => selectJourneyDayFromMap(selectedJourneyDay === day ? undefined : day),
    onJourneyStopPress: (rowId) => {
      const stop = itineraryStops.find((item) => item.rowId === rowId);
      if (stop?.day) selectJourneyDayFromMap(stop.day);
    },
    onUserLocationChange: ([lng, lat]) => {
      setCurrentLocation((current) => ({ lng, lat, heading: current?.heading }));
    },
    onPoiPress: (id) => {
      // Marker presses can also bubble to NativeMap.onPress on iOS and
      // Android. Keep that background event from dismissing the sheet.
      mapMarkerPressAtRef.current = Date.now();
      const group = repIdToGroup.get(id);
      pressProbe.marker(id, visiblePinKeys.has(`${subTab}:${id}`), group ? 'hit' : 'MISS', group
        ? nav.pointInfo?.kind === 'route' ? 'route-compare' : group.length === 1 ? 'OPEN CARD' : 'place-list'
        : 'dropped');
      if (!group) return;
      if (nav.pointInfo?.kind === 'route') {
        const nextRoute = group.find((item) => item.id !== nav.pointInfo?.id
          && item.kind === 'route'
          && !comparisonRouteIds.has(item.id));
        if (nextRoute) {
          setComparisonRoutes((current) => current.some((route) => route.id === nextRoute.id) ? current : [...current, nextRoute]);
          setMapAtRouteFrame(true);
        }
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
      nav.openSheet();
    },
    // Under a point detail the map *is* the content, and the card's own back
    // button closes it, so a tap on the map must stay a tap. Collapsing the list
    // sheet this way is only for list mode. In fullscreen the card is off screen
    // and there is no other control, so the tap becomes the way out.
    onBackgroundPress: () => {
      pressProbe.background();
      // Every marker path stamps this guard first, because a marker press also
      // bubbles here on both platforms.
      if (Date.now() - mapMarkerPressAtRef.current < 500) {
        pressProbe.backgroundSkipped('swallowed: a marker press bubbled here');
        return;
      }
      if (mapImmersive) {
        pressProbe.backgroundSkipped('-> exit fullscreen');
        exitMapImmersive();
        return;
      }
      if (nav.pointInfo) {
        pressProbe.backgroundSkipped('ignored: a card is open');
        return;
      }
      pressProbe.backgroundSkipped('-> dismiss the list sheet');
      sheetRef.current?.dismiss();
    },
  };
  const mapHandlersRef = React.useRef(mapHandlers);
  React.useEffect(() => {
    mapHandlersRef.current = mapHandlers;
  });
  const globeHandlers = React.useMemo<MapHandlerSet>(() => ({
    onCameraGestureStart: () => mapHandlersRef.current.onCameraGestureStart(),
    onCameraPositionChange: (camera) => mapHandlersRef.current.onCameraPositionChange(camera),
    onJourneyDayLabelPress: (day) => mapHandlersRef.current.onJourneyDayLabelPress(day),
    onJourneyStopPress: (rowId) => mapHandlersRef.current.onJourneyStopPress(rowId),
    onUserLocationChange: (coordinate) => mapHandlersRef.current.onUserLocationChange(coordinate),
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
    /* Under another bottom tab - or under our own full-screen search page - the
       whole page slides off-screen rather than being display:none'd or unmounted.
       MapKit keeps its instance, camera and every annotation view: a MapView that
       re-enters the window comes back with empty reused annotation views, and a
       remount reloads the tiles, which reads as a flash. Off-screen still lets
       Core Animation cull it, so whatever covers the map keeps its frames. */
    <View
      style={[
        { flex: 1, backgroundColor: theme.bg },
        (covered || !active) && keepMapWarm ? { transform: [{ translateX: width * 2 }] } : null,
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
          // Keep nearby route pins interactive while a route detail card is
          // open, so users can compare close tracks without first dismissing
          // the current card. Journey detail keeps its existing map-focused UI.
          showPoiMarkers={!nav.pointInfo || nav.pointInfo.kind === 'route'}
          activePoiId={nav.pointInfo?.kind === 'route' ? null : activeRepId}
          mapStyle={mapStyle}
          showMapLabels={mapLabelsVisible}
          showDistanceMarkers={mapDistanceMarkersVisible && !!nav.pointInfo && distanceMarkersReady}
          cameraAction={mapCameraAction}
          focusBottomPadding={mapImmersive ? immersiveFitBottom : nav.pointInfo?.kind === 'journey' ? journeyMapBottomPadding : routeMapFull ? journeyMinimum + space.xl : undefined}
          autoFrameRoute={!nav.pointInfo || mapAtRouteFrame}
          staggerPins={!entrancePlayed}
          onCameraGestureStart={globeHandlers.onCameraGestureStart}
          onCameraPositionChange={globeHandlers.onCameraPositionChange}
          // Framing must not wait for the transition gate: the journey track is
          // already in memory, and a camera that only moves once
          // InteractionManager drains reads as the map freezing for seconds.
          // The gate stays on the work that actually costs frames — the
          // per-route measuring and the distance labels.
          focusCoords={nav.pointInfo?.kind === 'route' ? routeMapFocusCoords : rawFocusCoords}
          frameCoords={journeyOverviewFrame}
          // The journey overview map must show every route leg as soon as the
          // journey detail opens, not only after entering the expanded map view.
          focusSegments={nav.pointInfo?.kind === 'journey'
            ? focusSegments
            : nav.pointInfo?.kind === 'route' ? routeComparisonSegments : NO_FOCUS_SEGMENTS}
          journeyLegs={journeyLegs}
          journeyStops={journeyStops}
          journeyDayLabels={journeyDayLabels}
          extraMarkers={companionPins}
          onJourneyDayLabelPress={globeHandlers.onJourneyDayLabelPress}
          onJourneyStopPress={globeHandlers.onJourneyStopPress}
          center={mapCenter}
          pin={active ? currentLocation : null}
          followUserLocation={active && !nav.pointInfo && mapAtCurrentLocation}
          onUserLocationChange={globeHandlers.onUserLocationChange}
          onPoiPress={globeHandlers.onPoiPress}
          onBackgroundPress={globeHandlers.onBackgroundPress}
        />
        ) : null}
      </View>

      {/* Discover keeps its original route / journey map modes. */}
      {!nav.pointInfo && !mapImmersive ? (
      <View style={{ position: 'absolute', top: insets.top + 8, left: 0, right: 0, alignItems: 'center' }}>
        <Glass theme={chromeTheme} radius={16} intensity={30}>
          <View style={{ flexDirection: 'row', padding: 3, gap: 3 }}>
            {[
              { id: 'explore', label: t('discover.tabExplore') },
              { id: 'memory', label: t('discover.tabMemory') },
            ].map((tab) => {
              const active = subTab === tab.id;
              return (
                <Press
                  key={tab.id}
                  onPress={() => {
                    if (active) {
                      // Re-tapping the shown mode only means "put the sheet away".
                      if (nav.sheetOpen) nav.setSubTab(tab.id as 'explore' | 'memory');
                      return;
                    }
                    markTabTap(`sub:${subTab} ${nav.sheetOpen ? 'sheet' : 'clean'}`, tab.id);
                    // Same batch as the mode change: leaving these to the post-commit
                    // `[isMemory]` effect cost every tap a second full pass.
                    setChip(0);
                    setPlaceSel(null);
                    nav.setSubTab(tab.id as 'explore' | 'memory');
                  }}
                  style={{
                    paddingHorizontal: 20,
                    height: 30,
                    borderRadius: 13,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: active ? (chromeTheme.dark ? 'rgba(120,120,128,0.5)' : '#fff') : 'transparent',
                  }}
                >
                  <Text style={{ fontSize: 14, fontWeight: active ? '700' : '500', color: active ? chromeTheme.text : chromeTheme.text2 }}>
                    {tab.label}
                  </Text>
                </Press>
              );
            })}
          </View>
        </Glass>
      </View>
      ) : null}

      {/* top-right chrome */}
      {!nav.pointInfo && !mapImmersive ? (
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
      ) : null}

      {/* Fullscreen renders no chrome at all — the map is the whole screen and
          a tap on it is the only way out (see mapHandlers.onBackgroundPress). */}
      {pointMapControlsVisible && !mapImmersive ? (
        <>
          {/* Companion live-location share — the pill that used to sit at the
              top-left, now in the slot the 路线 pill vacated (the route picker
              itself moved into the map style sheet). Follows the sheet, and
              keeps the route pill's visibility: gone when the card is fully
              expanded or this is a version preview. */}
          {nav.pointInfo?.kind === 'journey' && !nav.journeyVersionPreview ? (
            <Animated.View style={[{
              position: 'absolute',
              left: space.md,
              bottom: full + space.md,
              zIndex: 8,
            }, { transform: [{ translateY: pointSheetTranslateY }] }]}>
              <CompanionShareSwitchPill
                theme={theme}
                label={t('discover.shareLocation')}
                on={sharingThisJourney}
                onToggle={toggleLocationShare}
              />
            </Animated.View>
          ) : null}
          <Animated.View style={[{
            position: 'absolute',
            right: space.md,
            bottom: full + space.md + 92,
          }, { transform: [{ translateY: pointSheetTranslateY }] }]}>
            <Press
              onPress={enterMapImmersive}
              accessibilityRole="button"
              accessibilityLabel={t('journey.map.enterFullscreen')}
              style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.controlSurface }}
            >
              <Maximize2 color={theme.text2} size={18} strokeWidth={2} />
            </Press>
          </Animated.View>
          {nav.pointInfo?.kind === 'route' && comparisonRoutes.length > 0 ? (
            <Animated.View style={[{
              position: 'absolute',
              right: space.md,
              bottom: full + space.md + 138,
            }, { transform: [{ translateY: pointSheetTranslateY }] }]}>
              <Press
                onPress={() => setComparisonRoutes([])}
                accessibilityRole="button"
                accessibilityLabel={t('common.clearComparison')}
                style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.controlSurface }}
              >
                <Icon name="close" color={theme.text2} size={18} />
              </Press>
            </Animated.View>
          ) : null}
          <Animated.View style={[{
            position: 'absolute',
            right: space.md,
            bottom: full + space.md + 46,
          }, { transform: [{ translateY: pointSheetTranslateY }] }]}>
            <Press
              onPress={() => setMapStylePickerOpen((value) => !value)}
              accessibilityRole="button"
              accessibilityState={{ expanded: mapStylePickerOpen }}
              accessibilityLabel={t('journey.map.layerTitle')}
              style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.controlSurface }}
            >
              <Icon name="layers" color={mapStylePickerOpen ? theme.accent : theme.text2} size={18} />
            </Press>
          </Animated.View>

          <Animated.View style={[{
            position: 'absolute',
            right: space.md,
            bottom: full + space.md,
          }, { transform: [{ translateY: pointSheetTranslateY }] }]}>
            <Press
              onPress={fitMapRoute}
              accessibilityRole="button"
              accessibilityLabel={t('journey.map.fitRoute')}
              accessibilityState={{ selected: mapAtRouteFrame }}
              style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.controlSurface }}
            >
              <Icon name="locate" color={mapAtRouteFrame ? theme.accent : theme.text2} size={18} />
            </Press>
          </Animated.View>
        </>
      ) : null}

      {!nav.pointInfo && !mapImmersive ? (
        <View style={{ position: 'absolute', right: 16, bottom: sheetVisible ? collapsed + 16 : tabSpace + 56, gap: 10 }}>
          <MapToolButton
            theme={chromeTheme}
            size={36}
            onPress={() => setMapStylePickerOpen((value) => !value)}
            accessibilityLabel={t('journey.map.layerTitle')}
          >
            <Icon name="layers" color={mapStylePickerOpen ? chromeTheme.accent : chromeTheme.text} size={18} />
          </MapToolButton>
          <MapToolButton
            theme={chromeTheme}
            size={36}
            onPress={locateCurrentPosition}
            accessibilityLabel={t('discover.toastLocate')}
          >
            {locating
              ? <ActivityIndicator size="small" color={chromeTheme.accent} />
              : <Icon name="locate" color={mapAtCurrentLocation ? chromeTheme.accent : chromeTheme.text} size={18} />}
          </MapToolButton>
        </View>
      ) : null}

      {/* Stays mounted through fullscreen: see enterMapImmersive. */}
      {sheetVisible && (
      <TrailSheet
        ref={sheetRef}
        key={`${subTab}-${nav.pointInfo ? 'card' : 'list'}`}
        theme={theme}
        snapHeights={nav.pointInfo ? [journeyMinimum, focusPanel, full] : [collapsed, full]}
        initialIndex={nav.pointInfo ? 1 : 0}
        dismissOnDrag={!nav.pointInfo}
        onIndexChange={nav.pointInfo ? (index) => {
          if (nav.pointInfo?.kind === 'journey') setJourneySheetIndex(index);
          else setRouteSheetIndex(index);
          if (index !== 0) setMapStylePickerOpen(false);
        } : undefined}
        header={nav.pointInfo ? <View /> : header}
        compact={false}
        backgroundColor={nav.newJourneyOpen ? 'transparent' : nav.pointInfo ? theme.featureSurface : isMemory ? theme.groupedBg : theme.featureSurface}
        containerStyle={{ opacity: nav.newJourneyOpen ? 0 : 1 }}
        borderless={nav.pointInfo?.kind === 'route'}
        bodyScrollY={nav.pointInfo?.kind === 'journey' ? journeyDetailScrollY : undefined}
        animatedTranslateY={nav.pointInfo ? pointSheetTranslateY : undefined}
        bottomOffset={0}
        onBodyHeightChange={setDetailBodyHeight}
        onDismiss={() => {
          pressProbe.dismissDone(`focusReturnToList=${focusReturnToList}`);
          setPlaceSel(null);
          if (nav.pointInfo && focusReturnToList) {
            nav.closePoint();
            nav.openSheet();
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
              <RoutePreviewPanel theme={theme} poi={nav.pointInfo} onClose={dismissPointSheet} showActions={false} onFeedback={() => setRouteFeedbackOpen(true)} />
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
                icon={isMemory ? 'route' : 'search'}
                title={isMemory ? t('discover.emptyJourneysTitle') : t('discover.emptyRoutesTitle')}
                body={isMemory ? t('discover.emptyJourneysBody') : t('discover.emptyRoutesBody')}
              />
            ) : (
              <View style={{ gap: isMemory ? space.sm : space.md, paddingTop: space.xxs }}>
                {displayPois.map((p, index) => (
                  <StaggerIn key={p.id} index={index} staggered={!entrancePlayed}>
                    {isMemory && p.kind === 'journey' ? (
                      <DiscoverJourneyCard
                        theme={theme}
                        poi={p}
                        selectMode={selectMode}
                        selected={selectedIds.has(p.id)}
                        onPress={() => {
                          if (selectMode) toggleSelect(p.id);
                          else {
                            setFocusReturnToList(true);
                            openPointFromCurrentMap(p);
                          }
                        }}
                        onInvite={() => nav.openManageCompanions(p, 'invite')}
                        inviteAccessibilityLabel={t('journey.manage.inviteParticipant')}
                        onLongPress={() => (selectMode ? toggleSelect(p.id) : enterSelect(p.id))}
                      />
                    ) : (
                      <DiscoverRouteCard theme={theme} poi={p} feedbackLabel={t('discover.routeFeedback')} onFeedback={() => setRouteFeedbackOpen(true)} onPress={() => {
                        setFocusReturnToList(true);
                        openPointFromCurrentMap(p);
                      }} />
                    )}
                  </StaggerIn>
                ))}
              </View>
            )
          ) : (
            <View style={{ gap: 14, paddingTop: 8 }}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                  <View style={{ width: 60, height: 60, borderRadius: 14, backgroundColor: theme.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }} />
                  <View style={{ flex: 1, gap: 8 }}>
                    <KPSkeletonLine theme={theme} width="62%" />
                    <KPSkeletonLine theme={theme} width="40%" height={10} />
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
        )}
      </TrailSheet>
      )}
      {mapStylePickerVisible ? (
        <MapStylePickerSheet
          theme={theme}
          title={t('journey.map.layerTitle')}
          closeLabel={t('common.close')}
          options={([
            { id: 'standard', label: t('journey.map.layerStandard') },
            { id: 'satellite', label: t('journey.map.layerSatellite') },
          ] satisfies { id: MapPresentationStyle; label: string }[])}
          value={mapStyle}
          routesTitle="路线"
          routes={journeyRouteOptions.map((segment, index) => ({
            id: segment.id,
            label: segment.label || `路线 ${index + 1}`,
            color: segment.color,
            visible: segment.visible,
          }))}
          onRouteToggle={toggleJourneyRouteVisible}
          fixedHeight={Math.round(height * 0.88)}
          detailsTitle={nav.pointInfo ? t('journey.map.displayTitle') : undefined}
          details={nav.pointInfo ? (nav.pointInfo.kind === 'journey' ? [
            {
              id: 'journey-stops',
              label: t('journey.map.journeyStops'),
              value: journeyStopsVisible,
              onChange: setJourneyStopsVisible,
            },
            {
              id: 'journey-track',
              label: t('journey.map.journeyTrack'),
              value: journeyTrackVisible,
              onChange: setJourneyTrackVisible,
            },
            {
              id: 'journey-distance',
              label: t('journey.map.journeyDayDistance'),
              value: journeyDistanceVisible,
              onChange: setJourneyDistanceVisible,
            },
            {
              id: 'map-labels',
              label: t('journey.map.showLabels'),
              value: mapLabelsVisible,
              onChange: setMapLabelsVisible,
            },
            {
              id: 'distance-markers',
              label: t('journey.map.distanceMarkers'),
              value: mapDistanceMarkersVisible,
              onChange: setMapDistanceMarkersVisible,
            },
          ] : [
            {
              id: 'map-labels',
              label: t('journey.map.showLabels'),
              value: mapLabelsVisible,
              onChange: setMapLabelsVisible,
            },
            {
              id: 'distance-markers',
              label: t('journey.map.distanceMarkers'),
              value: mapDistanceMarkersVisible,
              onChange: setMapDistanceMarkersVisible,
            },
            {
              id: 'swap-start-end',
              label: t('journey.map.swapStartEnd'),
              value: routeReversed,
              onChange: () => toggleRouteDirection(),
            },
          ]) satisfies MapDisplayOption[] : undefined}
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
      {nav.pointInfo?.kind === 'journey' && !mapImmersive && !nav.journeyVersionPreview && journeySheetIndex > 0 && !nav.blockingOverlayOpen && !externalOverlayOpen ? (
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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          {selectedJourneyDay && selectedJourneyTab !== 'moments' ? (
            <>
              {!timelineSelectionMode ? (
                <Press
                  hitSlop={3}
                  onPress={() => nav.pointInfo?.kind === 'journey' && nav.openTimelineAdd(nav.pointInfo, selectedJourneyDay, availableJourneyDays)}
                  accessibilityRole="button"
                  style={journeyFooterPill(theme)}
                >
                  <JourneyFooterActionLabel theme={theme} icon="plus" label={t('common.add')} />
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
                <JourneyFooterActionLabel theme={theme} icon={timelineSelectionMode ? 'check' : 'sliders'} label={timelineSelectionMode ? t('common.done') : t('common.edit')} />
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
                  style={journeyFooterPill(theme)}
                >
                  <JourneyFooterActionLabel theme={theme} icon="plus" label={t('common.add')} />
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
                <JourneyFooterActionLabel theme={theme} icon={momentSelectionMode ? 'check' : 'sliders'} label={momentSelectionMode ? t('common.done') : t('common.edit')} />
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
                  style={journeyFooterPill(theme)}
                >
                  <JourneyFooterActionLabel theme={theme} icon="plus" label={t('common.add')} />
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
                  <JourneyFooterActionLabel theme={theme} icon={checklistSelectionMode ? 'check' : 'sliders'} label={checklistSelectionMode ? t('common.done') : t('common.edit')} />
                </Press>
              ) : null}
            </>
          ) : (
            <>
              <Press
                hitSlop={3}
                onPress={() => {
                  setPlanEditorOpen((open) => !open);
                  if (planEditorOpen) setSelectedPlanDays(new Set());
                }}
                accessibilityRole="button"
                style={journeyFooterPill(theme)}
              >
                <JourneyFooterActionLabel theme={theme} icon={planEditorOpen ? 'check' : 'sliders'} label={planEditorOpen ? t('common.done') : t('common.edit')} />
              </Press>
            </>
          )}
          </View>
          {/* Selection mode: 删除 takes the right slot that 问AI vacates, so the
              dock stays two pills — 完成 left, 删除 right. The branch order
              mirrors the left group so a stale mode from another tab can never
              claim the slot twice. */}
          {selectedJourneyDay && selectedJourneyTab !== 'moments' ? (
            timelineSelectionMode && selectedTimelineItemIds.size > 0 ? (
              <Press hitSlop={3} onPress={deleteSelectedTimelineItems} accessibilityRole="button" style={journeyFooterPill(theme)}>
                <JourneyFooterActionLabel theme={theme} icon="trash" label={t('common.delete')} danger />
              </Press>
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
          ) : planEditorOpen && selectedPlanDays.size > 0 ? (
            <Press hitSlop={3} onPress={deleteSelectedPlanDays} accessibilityRole="button" style={journeyFooterPill(theme)}>
              <JourneyFooterActionLabel theme={theme} icon="trash" label={t('common.delete')} danger />
            </Press>
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
      {nav.pointInfo?.kind === 'journey' && !mapImmersive && nav.journeyVersionPreview && journeySheetIndex > 0 && !externalOverlayOpen ? (
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
      {nav.pointInfo?.kind === 'route' && !nav.newJourneyOpen && !mapImmersive && routeSheetIndex > 0 ? (
        <View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            left: space.md,
            right: space.md,
            bottom: Math.max(insets.bottom, space.md),
            zIndex: 180,
          }}
        >
          <RoutePreviewActions theme={theme} poi={nav.pointInfo} onPlanRoute={planRouteJourney} />
        </View>
      ) : null}
      {selectMode ? (
        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 160, paddingHorizontal: space.md, paddingTop: space.sm, paddingBottom: Math.max(insets.bottom, space.md) + 6, backgroundColor: theme.surfaceTop, borderTopWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Press onPress={exitSelect} style={{ height: 44, paddingHorizontal: space.md, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.fieldSurface }}>
              <Text style={[type.body, { fontWeight: '600', color: theme.text }]}>{t('common.cancel')}</Text>
            </Press>
            <Press onPress={toggleAll} style={{ minWidth: 80, height: 44, paddingHorizontal: space.md, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.fieldSurface }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: theme.accent }}>
                {allSelected ? t('discover.selectDeselectAll') : t('discover.selectAll')}
              </Text>
            </Press>
            <Press
              onPress={selectedIds.size ? deleteSelected : undefined}
              style={{ flex: 1, height: 50, borderRadius: radius.card, alignItems: 'center', justifyContent: 'center', backgroundColor: selectedIds.size ? theme.danger : theme.fieldSurface }}
            >
              <Text style={{ fontSize: 15, fontWeight: '700', color: selectedIds.size ? '#fff' : theme.text3 }}>
                {selectedIds.size ? t('discover.selectDelete', { count: selectedIds.size }) : t('discover.selectDeletePrompt')}
              </Text>
            </Press>
          </View>
        </View>
      ) : null}
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
    </View>
  );
}
