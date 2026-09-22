// DiscoverScreen.tsx — the 发现 tab. A platform-native map (SVG fallback) of routes
// (探索) or the user's journeys (旅程), with a draggable bottom sheet listing them
// and an in-place route/journey detail panel.
import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { ActivityIndicator, Animated, Easing, InteractionManager, Platform, Pressable, ScrollView, View, Text, useWindowDimensions, StyleSheet, Alert, Modal } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { Theme } from '../theme/theme';
import { useNav } from '../nav/NavContext';
import { useI18n, TKey } from '../i18n';
import { Poi } from '../data/pois';
import { useData } from '../data/DataContext';
import { Globe, NATIVE_MAP_ENABLED, type GlobeCameraAction, type GlobeMapStyle, type GlobeRouteConnector, type GlobeRouteSegment, type GlobeTransportSegment } from '../components/globe';
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
import { JourneyChecklistPickerSheet, type JourneyChecklistFilterMenuController } from '../components/journey/JourneyChecklistTab';
import { refetchJourneyTimeline, useTimeline } from '../hooks/useTimeline';
import { buildJourneyRouteSegments, distanceMeters, JOURNEY_SEGMENT_COLORS, measureTrack, positionAtDistance, type TrackPosition } from '../lib/routeSegments';
import { JourneyRouteBoundarySheet } from '../components/overlays/JourneyRouteBoundarySheet';
import { MapStylePickerSheet, type MapDisplayOption, type MapPresentationStyle } from '../components/MapStylePickerSheet';
import { AssistantMark } from '../components/assistant/AssistantMark';
import { journeyDayDisplayLabel } from '../lib/journeyDays';
import { Maximize2, Minimize2, RotateCcw, Search } from 'lucide-react-native';
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
  journeyMapDetailsVisible?: boolean;
  mapLabelsVisible?: boolean;
  mapDistanceMarkersVisible?: boolean;
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
      <Icon name={icon} color={color} size={15} />
      <Text style={{ color, fontSize: 13, fontWeight: '700' }}>{label}</Text>
    </View>
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

interface JourneySegmentGeometry {
  id: string;
  label: string;
  coordinates: [number, number][];
  color: string;
  /** Days that walk this segment. Null means the segment covers the whole journey. */
  days: string[] | null;
}

export function DiscoverScreen({
  theme,
  active = true,
  keepMapWarm = false,
  externalOverlayOpen = false,
  onBlockingOverlayChange,
}: {
  theme: Theme;
  active?: boolean;
  keepMapWarm?: boolean;
  externalOverlayOpen?: boolean;
  onBlockingOverlayChange?: (open: boolean) => void;
}) {
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
  const isMemory = nav.subTab === 'memory';
  const [chip, setChip] = React.useState(0);
  const [mapStyle, setMapStyle] = useState<GlobeMapStyle>('standard');
  const [mapStylePickerOpen, setMapStylePickerOpen] = useState(false);
  const [routeFeedbackOpen, setRouteFeedbackOpen] = useState(false);
  const [journeyMapDetailsVisible, setJourneyMapDetailsVisible] = useState(true);
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
    setJourneyMapDetailsVisible(true);
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
          if (typeof saved.journeyMapDetailsVisible === 'boolean') setJourneyMapDetailsVisible(saved.journeyMapDetailsVisible);
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
      journeyMapDetailsVisible,
      mapLabelsVisible,
      mapDistanceMarkersVisible,
    };
    AsyncStorage.setItem(mapDisplaySettingsKey(userId), JSON.stringify(settings)).catch(() => {});
  }, [journeyMapDetailsVisible, mapDistanceMarkersVisible, mapLabelsVisible, mapStyle, userId]);

  const openPointFromCurrentMap = (poi: Poi) => {
    mapBeforePointRef.current = mapCameraRef.current;
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

  // The map is intentionally unmounted while Discover is not the active tab.
  // Restore the user's last camera when returning instead of fitting the
  // selected route again and unexpectedly zooming into its region.
  React.useEffect(() => {
    const becameActive = active && !wasMapActiveRef.current;
    wasMapActiveRef.current = active;
    if (!becameActive || !mapCameraRef.current) return;
    const camera = mapCameraRef.current;
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [planEditorOpen, setPlanEditorOpen] = useState(false);
  const [journeySheetIndex, setJourneySheetIndex] = useState(1);
  const [routeSheetIndex, setRouteSheetIndex] = useState(1);
  const [mapImmersive, setMapImmersive] = useState(false);
  const [selectedPlanDays, setSelectedPlanDays] = useState<Set<string>>(() => new Set());
  const [selectedJourneyDay, setSelectedJourneyDay] = useState<string | undefined>();
  const [selectedJourneyRouteId, setSelectedJourneyRouteId] = useState<string | undefined>();
  const [journeyRouteMenuOpen, setJourneyRouteMenuOpen] = useState(false);
  const [routeEditorGroupKey, setRouteEditorGroupKey] = useState<string | null>(null);
  const [routeMapSelectionRequest, setRouteMapSelectionRequest] = useState<{ coordinate: [number, number]; revision: number }>();
  const [routeDraftPosition, setRouteDraftPosition] = useState<TrackPosition | null>(null);
  const [routeDraftEndpoint, setRouteDraftEndpoint] = useState<[number, number] | null>(null);
  const routeEditorPreviousSheetIndex = React.useRef(1);
  const [journeyDaySelectionRequest, setJourneyDaySelectionRequest] = useState<{ day: string; revision: number }>();
  const [selectedJourneyTab, setSelectedJourneyTab] = useState<string>('overview');
  const [momentSelectionMode, setMomentSelectionMode] = useState(false);
  const [selectedMomentIds, setSelectedMomentIds] = useState<Set<string>>(() => new Set());
  const [visibleMomentIds, setVisibleMomentIds] = useState<string[]>([]);
  const momentAddActionRef = React.useRef<(() => void) | null>(null);
  const momentDeleteActionRef = React.useRef<(() => Promise<void>) | null>(null);
  const momentFilterActionRef = React.useRef<(() => void) | null>(null);
  const momentFilterMenuRef = React.useRef<JourneyMomentFilterMenuController | null>(null);
  const checklistAddActionRef = React.useRef<(() => void) | null>(null);
  const checklistDeleteActionRef = React.useRef<(() => Promise<void>) | null>(null);
  const checklistFilterActionRef = React.useRef<(() => void) | null>(null);
  const checklistFilterMenuRef = React.useRef<JourneyChecklistFilterMenuController | null>(null);
  const checklistToggleAllActionRef = React.useRef<(() => void) | null>(null);
  const [checklistSelectionMode, setChecklistSelectionMode] = useState(false);
  const [selectedChecklistItemIds, setSelectedChecklistItemIds] = useState<Set<string>>(() => new Set());
  const [visibleChecklistItemIds, setVisibleChecklistItemIds] = useState<string[]>([]);
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
      setVisibleMomentIds([]);
    }
    if (tab !== 'checklist') {
      checklistPickerTarget.current = false;
      checklistPickerProgress.setValue(0);
      setChecklistFilterMenuOpen(false);
      setChecklistSelectionMode(false);
      setSelectedChecklistItemIds(new Set());
      setVisibleChecklistItemIds([]);
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
    setVisibleMomentIds([]);
    momentAddActionRef.current = null;
    momentDeleteActionRef.current = null;
    momentFilterActionRef.current = null;
    momentFilterMenuProgress.setValue(0);
    setMomentFilterMenuOpen(false);
    checklistAddActionRef.current = null;
    checklistDeleteActionRef.current = null;
    checklistFilterActionRef.current = null;
    checklistToggleAllActionRef.current = null;
    setChecklistSelectionMode(false);
    setSelectedChecklistItemIds(new Set());
    setVisibleChecklistItemIds([]);
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
    setSelectMode(false);
    setSelectedIds(new Set());
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
  const publicTrackPois: Poi[] = useMemo(() => {
    if (isMemory) return [];
    const all = [...nav.extraJourneys, ...journeys];
    const seen = new Set<string>();
    return all
      .filter((p) => { if (seen.has(p.id)) return false; seen.add(p.id); return true; })
      .filter((p) => !nav.removedIds.includes(p.id))
      .map((p) => nav.merged(p)) // apply journeyPatch (e.g. trackPublic toggle before DB sync)
      .filter((p) => p.trackPublic && p.trackCoords && p.trackCoords.length > 0)
      .map((p) => ({ ...p, kind: 'route' as const, mine: true, fav: false })); // show as route card in explore tab
  }, [isMemory, nav.extraJourneys, journeys, nav.removedIds, nav.journeyPatch]);

  const basePois: Poi[] = useMemo(() => {
    if (isMemory) {
      const merged = [...nav.extraJourneys, ...journeys];
      const seen = new Set<string>();
      const deduped = merged.filter((p) => { if (seen.has(p.id)) return false; seen.add(p.id); return true; });
      return deduped
        .filter((p) => !nav.removedIds.includes(p.id))
        .map((p) => nav.merged(p));
    }
    const merged = [...nav.savedRoutes, ...routes, ...publicTrackPois];
    const seen = new Set<string>();
    return merged.filter((p) => { if (seen.has(p.id)) return false; seen.add(p.id); return true; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMemory, nav.extraJourneys, nav.savedRoutes, nav.removedIds, nav.journeyPatch, routes, journeys, publicTrackPois]);

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
    setSelectedIds(allSelected ? new Set() : new Set(displayPois.map((p) => p.id)));
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
  const focusMeasure = useMemo(() => measureTrack(focusCoords ?? undefined), [focusCoords]);
  // A trip may walk several routes, so a day boundary belongs to the track of
  // its own route. Measuring every referenced route once keeps the connector
  // and the day distance correct instead of reading route B's kilometre as a
  // position on route A.
  const routeMeasures = useMemo(() => {
    const measures = new Map<string, ReturnType<typeof measureTrack>>();
    // Measuring a whole track is the expensive part of opening a journey, so it
    // waits for the same frame gate the focused track uses.
    if (!detailReady) return measures;
    for (const route of Object.values(focusedTimeline.groupRoutes)) {
      const routeId = route?.routeId;
      if (!routeId || measures.has(routeId)) continue;
      const trackCoords = routes.find((item) => item.id === routeId)?.trackCoords;
      if (trackCoords && trackCoords.length >= 2) measures.set(routeId, measureTrack(trackCoords));
    }
    return measures;
  }, [focusedTimeline.groupRoutes, routes, detailReady]);
  const measureForGroup = (route: { routeId?: string } | undefined) =>
    (route?.routeId ? routeMeasures.get(route.routeId) : undefined) ?? focusMeasure;
  const focusGroupKeys = availableJourneyDays.length ? availableJourneyDays : focusedTimeline.knownGroups;
  const displayedGroupRoutes = useMemo(() => {
    if (!routeEditorGroupKey) return focusedTimeline.groupRoutes;
    const existing = focusedTimeline.groupRoutes[routeEditorGroupKey];
    if (!existing && !routeDraftPosition) return focusedTimeline.groupRoutes;
    return {
      ...focusedTimeline.groupRoutes,
      [routeEditorGroupKey]: {
        ...existing!,
        ...(routeDraftPosition ? {
          // The draft is picked on the focused track, so it stops claiming
          // whatever route the saved boundary used to belong to.
          routeId: undefined,
          endDistanceMeters: routeDraftPosition.distanceMeters,
          longitude: routeDraftEndpoint?.[0] ?? routeDraftPosition.coordinate[0],
          latitude: routeDraftEndpoint?.[1] ?? routeDraftPosition.coordinate[1],
          trackPointIndex: routeDraftPosition.trackPointIndex,
          trackPointFraction: routeDraftPosition.trackPointFraction,
          source: 'map' as const,
        } : {}),
      },
    };
  }, [focusedTimeline.groupRoutes, routeDraftEndpoint, routeDraftPosition, routeEditorGroupKey]);
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
    return buildJourneyRouteSegments(
      focusMeasure,
      focusGroupKeys,
      displayedGroupRoutes,
    ).map((segment, index) => ({
      id: segment.id,
      label: `${journeyDayDisplayLabel(segment.groupKey, resolved)} ${(segment.endDistanceMeters - segment.startDistanceMeters < 10_000 ? ((segment.endDistanceMeters - segment.startDistanceMeters) / 1000).toFixed(1) : Math.round((segment.endDistanceMeters - segment.startDistanceMeters) / 1000))}km`,
      coordinates: segment.coordinates,
      // Route sections are equal peers. The selected day is expressed by
      // emphasis, while the day label and boundary marker carry the grouping.
      color: JOURNEY_SEGMENT_COLORS[index % JOURNEY_SEGMENT_COLORS.length],
      days: [segment.groupKey],
    }));
  }, [displayedGroupRoutes, focusGroupKeys, focusMeasure, focusedTimeline.rows, nav.pointInfo?.kind, nav.pointInfo?.name, resolved, routes]);
  const focusSegments = useMemo(() => journeySegmentGeometry.map((segment) => ({
    id: segment.id,
    label: segment.label,
    coordinates: segment.coordinates,
    color: segment.color,
    active: (!selectedJourneyDay || !segment.days || segment.days.includes(selectedJourneyDay))
      && (!selectedJourneyRouteId || segment.id === selectedJourneyRouteId),
  })), [journeySegmentGeometry, selectedJourneyDay, selectedJourneyRouteId]);
  const journeyRouteOptions = useMemo(() => {
    if (nav.pointInfo?.kind !== 'journey') return [];
    const seen = new Set<string>();
    return focusSegments.filter((segment) => {
      // Day-based fallback sections are useful on the map, but they are not
      // separate user-selectable route tracks. Only linked route geometries
      // should create the multi-route control.
      if (!segment.id.startsWith('journey-route-')) return false;
      if (seen.has(segment.id)) return false;
      seen.add(segment.id);
      return segment.coordinates.length >= 2;
    });
  }, [focusSegments, nav.pointInfo?.kind]);
  useEffect(() => {
    setSelectedJourneyRouteId(undefined);
    setJourneyRouteMenuOpen(false);
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
  const focusConnectors = useMemo<GlobeRouteConnector[]>(() => {
    if (nav.pointInfo?.kind !== 'journey' || !focusMeasure) return [];
    return focusGroupKeys.flatMap((groupKey, index) => {
      const route = displayedGroupRoutes[groupKey];
      if (!route) return [];
      const measure = measureForGroup(route);
      if (!measure) return [];
      const trackEnd = positionAtDistance(measure, route.endDistanceMeters).coordinate;
      const endpoint: [number, number] = [route.longitude, route.latitude];
      if (!Number.isFinite(endpoint[0]) || !Number.isFinite(endpoint[1]) || distanceMeters(trackEnd, endpoint) <= 2) return [];
      return [{
        id: `journey-leg-${index}`,
        coordinates: [trackEnd, endpoint] as [[number, number], [number, number]],
        color: theme.text2,
        active: !selectedJourneyDay || selectedJourneyDay === groupKey,
      }];
    });
  }, [displayedGroupRoutes, focusGroupKeys, focusMeasure, routeMeasures, nav.pointInfo?.kind, selectedJourneyDay, theme.text2]);
  const transportSegments = useMemo<GlobeTransportSegment[]>(() => {
    if (nav.pointInfo?.kind !== 'journey') return [];
    return focusedTimeline.rows.flatMap((row) => {
      if (row.kind !== 'transport' || !row.transport) return [];
      const raw = row.transport.geometry;
      const from = row.transport.from;
      const to = row.transport.to;
      const coordinates = raw && raw.length >= 2
        ? raw
        : Number.isFinite(from.longitude) && Number.isFinite(from.latitude) && Number.isFinite(to.longitude) && Number.isFinite(to.latitude)
          ? [[from.longitude!, from.latitude!], [to.longitude!, to.latitude!]] as [number, number][]
          : [];
      if (coordinates.length < 2) return [];
      return [{ id: row.id, coordinates, color: '#5B8DEF', active: !selectedJourneyDay || selectedJourneyDay === row.day, mode: row.transport.mode }];
    });
  }, [focusedTimeline.rows, nav.pointInfo?.kind, selectedJourneyDay]);
  const focusBoundaries = useMemo(() => {
    if (nav.pointInfo?.kind !== 'journey' || !focusMeasure) return [];
    return focusGroupKeys.flatMap((groupKey, index) => {
      const route = displayedGroupRoutes[groupKey];
      if (!route) return [];
      const previousRoute = index > 0 ? displayedGroupRoutes[focusGroupKeys[index - 1]] : undefined;
      const pending = index > 0 && !previousRoute;
      // Distances are cumulative along one track. The first day of a new route
      // starts at zero on that route, so subtracting the previous day's figure
      // from another track would report a length that does not exist.
      const sameTrack = !route.routeId || route.routeId === previousRoute?.routeId;
      const displayMeters = previousRoute && sameTrack ? route.endDistanceMeters - previousRoute.endDistanceMeters : route.endDistanceMeters;
      return [{
        id: `journey-boundary-${index}`,
        groupKey,
        title: journeyDayDisplayLabel(groupKey, resolved),
        distance: `${(displayMeters / 1000).toFixed(1)} km`,
        coordinate: [route.longitude, route.latitude] as [number, number],
        color: theme.accent,
        active: !selectedJourneyDay || selectedJourneyDay === groupKey,
        pending,
      }];
    });
  }, [displayedGroupRoutes, focusGroupKeys, focusMeasure, routeMeasures, nav.pointInfo?.kind, resolved, selectedJourneyDay, theme.accent]);
  const routeEditorIndex = routeEditorGroupKey ? focusGroupKeys.indexOf(routeEditorGroupKey) : -1;
  let routeEditorMinimumMeters = 0;
  let routeEditorMaximumMeters: number | undefined;
  if (routeEditorIndex >= 0) {
    for (let index = routeEditorIndex - 1; index >= 0; index -= 1) {
      const route = focusedTimeline.groupRoutes[focusGroupKeys[index]];
      if (route) { routeEditorMinimumMeters = route.endDistanceMeters; break; }
    }
    for (let index = routeEditorIndex + 1; index < focusGroupKeys.length; index += 1) {
      const route = focusedTimeline.groupRoutes[focusGroupKeys[index]];
      if (route) { routeEditorMaximumMeters = route.endDistanceMeters; break; }
    }
  }
  const displayedFocusBoundaries = useMemo(() => {
    if (!routeEditorGroupKey || !routeDraftPosition || routeEditorIndex < 0) return focusBoundaries;
    return focusBoundaries.filter((boundary) => boundary.groupKey !== routeEditorGroupKey);
  }, [focusBoundaries, routeDraftPosition, routeEditorGroupKey, routeEditorIndex, routeEditorMinimumMeters]);
  const openRouteEditor = useCallback((groupKey: string) => {
    routeEditorPreviousSheetIndex.current = journeySheetIndex;
    setRouteEditorGroupKey(groupKey);
    setRouteDraftPosition(null);
    const currentRoute = focusedTimeline.groupRoutes[groupKey];
    setRouteDraftEndpoint(
      currentRoute && Number.isFinite(currentRoute.longitude) && Number.isFinite(currentRoute.latitude)
        ? [currentRoute.longitude, currentRoute.latitude]
        : null,
    );
    setRouteMapSelectionRequest(undefined);
    setSelectedJourneyDay(groupKey);
    setJourneyDaySelectionRequest((current) => ({ day: groupKey, revision: (current?.revision ?? 0) + 1 }));
    sheetRef.current?.snapTo(0);
  }, [focusedTimeline.groupRoutes, journeySheetIndex]);
  const closeRouteEditor = useCallback(() => {
    setRouteEditorGroupKey(null);
    setRouteDraftPosition(null);
    setRouteDraftEndpoint(null);
    setRouteMapSelectionRequest(undefined);
    sheetRef.current?.snapTo(routeEditorPreviousSheetIndex.current);
  }, []);
  const journeyCoverUri = nav.pointInfo?.kind === 'journey' ? nav.pointInfo.photoUris?.[0] : undefined;
  const journeyHeroMode = nav.pointInfo?.kind === 'journey'
    // The gated `focusCoords` is intentionally null for the first frames of an
    // open, which would read as "this journey has no track" and swap the
    // already-mounted map out for the cover image, then remount it. The raw
    // geometry is in memory, so the hero decision never waits for the gate.
    ? nav.pointInfo.heroMode ?? ((rawFocusCoords?.length ?? 0) >= 2 ? 'track' : journeyCoverUri ? 'cover' : 'track')
    : 'track';
  const journeyShowsCover = !routeEditorGroupKey && journeyHeroMode === 'cover' && !!journeyCoverUri;
  const journeyChromeColor = journeyShowsCover ? '#FFFFFF' : theme.text;
  const journeyMapFull = nav.pointInfo?.kind === 'journey' && journeySheetIndex === 0 && !journeyShowsCover && !routeEditorGroupKey;
  const routeMapFull = nav.pointInfo?.kind === 'route' && routeSheetIndex === 0;
  const mapStylePickerVisible = mapStylePickerOpen;
  const journeyMapBottomPadding = journeySheetIndex === 0
    ? journeyMinimum + space.xl
    : journeySheetIndex === 1
      ? focusPanel + space.xl
      : full + space.md;
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



  // sheet stats
  const totalKm = useMemo(() => displayPois.reduce((s, p) => s + num(p.dist), 0), [displayPois]);
  const mapPois = useMemo(() => placeGroups.flatMap(({ rep, group }) => {
    // Hide only routes already participating in the comparison. At a shared
    // trailhead, keep exposing the next unselected sibling.
    const markerCandidates = nav.pointInfo?.kind === 'route'
      ? group.filter((item) => item.id !== nav.pointInfo?.id && !comparisonRouteIds.has(item.id))
      : group;
    const markerPoi = markerCandidates[0] ?? rep;
    if (nav.pointInfo?.kind === 'route' && markerCandidates.length === 0) return [];
    const [lng, lat] = poiMapCoordinate(markerPoi);
    return [{ id: rep.id, lng, lat, mine: markerPoi.mine, tone: markerPoi.tone, count: markerCandidates.length, coverUri: markerPoi.photoUris?.[0], label: markerPoi.name }];
  }), [comparisonRouteIds, nav.pointInfo?.id, nav.pointInfo?.kind, placeGroups]);

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

  return (
    /* Under another bottom tab the whole page slides off-screen rather than being
       display:none'd or unmounted. MapKit keeps its instance, camera and every
       annotation view: a MapView that re-enters the window comes back with empty
       reused annotation views, and a remount reloads the tiles, which reads as a
       flash. Off-screen still lets Core Animation cull it, so the tab on top
       keeps its frames. */
    <View
      style={[
        { flex: 1, backgroundColor: theme.bg },
        !active && keepMapWarm ? { transform: [{ translateX: width * 2 }] } : null,
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
          theme={theme}
          size={globeSize}
          pois={mapPois}
          // Keep nearby route pins interactive while a route detail card is
          // open, so users can compare close tracks without first dismissing
          // the current card. Journey detail keeps its existing map-focused UI.
          showPoiMarkers={!nav.pointInfo || nav.pointInfo.kind === 'route'}
          activePoiId={nav.pointInfo?.kind === 'route' ? null : activeRepId}
          mapStyle={mapStyle}
          showMapLabels={mapLabelsVisible}
          showDistanceMarkers={mapDistanceMarkersVisible && !!nav.pointInfo && detailReady}
          cameraAction={mapCameraAction}
          focusBottomPadding={nav.pointInfo?.kind === 'journey' ? journeyMapBottomPadding : routeMapFull ? journeyMinimum + space.xl : undefined}
          autoFrameRoute={!nav.pointInfo || mapAtRouteFrame}
          staggerPins={!entrancePlayed}
          onCameraGestureStart={() => {
            // Native map SDKs may report a marker tap as a short camera
            // gesture. It must not make the detail route look unfocused.
            if (Date.now() - mapMarkerPressAtRef.current < 500) return;
            if (nav.pointInfo) {
              mapPointGestureRef.current = true;
              setMapAtRouteFrame(false);
            }
            else setMapAtCurrentLocation(false);
          }}
          onCameraPositionChange={(camera) => {
            mapCameraRef.current = camera;
          }}
          // Framing must not wait for the transition gate: the journey track is
          // already in memory, and a camera that only moves once
          // InteractionManager drains reads as the map freezing for seconds.
          // The gate stays on the work that actually costs frames — the
          // per-route measuring and the distance labels.
          focusCoords={nav.pointInfo?.kind === 'route' ? routeMapFocusCoords : rawFocusCoords}
          // The journey overview map must show every route leg as soon as the
          // journey detail opens, not only after entering the expanded map view.
          focusSegments={nav.pointInfo?.kind === 'journey' || routeEditorGroupKey
            ? focusSegments
            : nav.pointInfo?.kind === 'route' ? routeComparisonSegments : []}
          focusBoundaries={journeyMapDetailsVisible || routeEditorGroupKey ? displayedFocusBoundaries : []}
          selectionPin={routeEditorGroupKey && routeDraftPosition && routeEditorIndex >= 0 ? {
            coordinate: routeDraftEndpoint ?? routeDraftPosition.coordinate,
            color: JOURNEY_SEGMENT_COLORS[routeEditorIndex % JOURNEY_SEGMENT_COLORS.length],
          } : undefined}
          focusConnectors={journeyMapDetailsVisible || routeEditorGroupKey ? focusConnectors : []}
          transportSegments={journeyMapDetailsVisible ? transportSegments : []}
          onRouteBoundaryPress={(groupKey) => {
            setJourneyDaySelectionRequest((current) => ({ day: groupKey, revision: (current?.revision ?? 0) + 1 }));
          }}
          onMapCoordinatePress={routeEditorGroupKey ? (coordinate) => {
            setRouteMapSelectionRequest((current) => ({ coordinate, revision: (current?.revision ?? 0) + 1 }));
          } : undefined}
          center={nav.pointInfo ? (() => {
            const [lon, lat] = focusCoords?.[0] ?? poiMapCoordinate(nav.pointInfo!);
            return { lon, lat };
          })() : currentLocation ? { lon: currentLocation.lng, lat: currentLocation.lat } : undefined}
          pin={active ? currentLocation : null}
          followUserLocation={active && !nav.pointInfo && mapAtCurrentLocation}
          onUserLocationChange={([lng, lat]) => {
            setCurrentLocation((current) => ({ lng, lat, heading: current?.heading }));
          }}
          onPoiPress={(id) => {
            // Marker presses can also bubble to NativeMap.onPress on iOS and
            // Android. Keep that background event from dismissing the sheet.
            mapMarkerPressAtRef.current = Date.now();
            const group = repIdToGroup.get(id);
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
              openPointFromCurrentMap(group[0]);
              return;
            }
            setPlaceSel(placeKey(group[0]));
            nav.closePoint();
            nav.openSheet();
          }}
          onBackgroundPress={() => {
            if (Date.now() - mapMarkerPressAtRef.current < 500) return;
            sheetRef.current?.dismiss();
          }}
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
              const active = nav.subTab === tab.id;
              return (
                <Press
                  key={tab.id}
                  onPress={() => nav.setSubTab(tab.id as 'explore' | 'memory')}
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
                if (routeEditorGroupKey) closeRouteEditor();
                else if (nav.journeyVersionPreview) nav.closeJourneyVersionPreview();
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

      {mapImmersive ? (
        <Press
          onPress={() => setMapImmersive(false)}
          accessibilityRole="button"
          accessibilityLabel={t('journey.map.exitFullscreen')}
          style={{ position: 'absolute', top: insets.top + space.sm, left: space.md, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.controlSurface, zIndex: 20, elevation: 1 }}
        >
          <Minimize2 color={theme.text} size={20} strokeWidth={2} />
        </Press>
      ) : null}





      {((pointMapControlsVisible && !mapImmersive) || mapImmersive) ? (
        <>
          {nav.pointInfo?.kind === 'journey' && journeyRouteOptions.length > 1 && (pointMapControlsVisible || mapImmersive) ? (
            <Animated.View style={[{
              position: 'absolute',
              left: space.md,
              bottom: mapImmersive ? journeyMinimum + space.md : full + space.md,
              zIndex: 8,
              alignItems: 'flex-start',
            }, !mapImmersive && { transform: [{ translateY: pointSheetTranslateY }] }] }>
              {journeyRouteMenuOpen ? (
                <View style={{
                  width: 238,
                  marginBottom: space.sm,
                  padding: space.xs,
                  borderRadius: radius.card,
                  backgroundColor: theme.surfaceTop,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: theme.fieldBorder,
                  shadowColor: '#000',
                  shadowOpacity: 0.14,
                  shadowRadius: 14,
                  shadowOffset: { width: 0, height: 5 },
                  elevation: 5,
                }}>
                  <View style={{ paddingHorizontal: space.sm, paddingVertical: space.xs }}>
                    <Text style={{ color: theme.text, fontSize: 12, fontWeight: '800' }}>路线</Text>
                    <Text style={{ color: theme.text3, fontSize: 11, marginTop: 2 }}>选择要查看的轨迹</Text>
                  </View>
                  <Press
                    accessibilityRole="button"
                    accessibilityState={{ selected: !selectedJourneyRouteId }}
                    onPress={() => { setSelectedJourneyRouteId(undefined); setJourneyRouteMenuOpen(false); }}
                    style={{ minHeight: 40, paddingHorizontal: space.sm, borderRadius: radius.control, flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: !selectedJourneyRouteId ? theme.fieldSurface : 'transparent' }}
                  >
                    <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: theme.accent }} />
                    <Text numberOfLines={1} style={{ flex: 1, color: theme.text, fontSize: 12.5, fontWeight: '700' }}>全部路线</Text>
                    {!selectedJourneyRouteId ? <Icon name="check" color={theme.accent} size={16} /> : null}
                  </Press>
                  {journeyRouteOptions.map((segment, index) => {
                    const selected = selectedJourneyRouteId === segment.id;
                    return (
                      <Press
                        key={segment.id}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        onPress={() => { setSelectedJourneyRouteId(segment.id); setJourneyRouteMenuOpen(false); }}
                        style={{ minHeight: 40, paddingHorizontal: space.sm, borderRadius: radius.control, flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: selected ? theme.fieldSurface : 'transparent' }}
                      >
                        <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: segment.color }} />
                        <Text numberOfLines={1} style={{ flex: 1, color: theme.text, fontSize: 12.5, fontWeight: selected ? '800' : '600' }}>{segment.label || `路线 ${index + 1}`}</Text>
                        {selected ? <Icon name="check" color={theme.accent} size={16} /> : null}
                      </Press>
                    );
                  })}
                </View>
              ) : null}
              <Press
                accessibilityRole="button"
                accessibilityLabel="路线"
                accessibilityState={{ expanded: journeyRouteMenuOpen }}
                onPress={() => setJourneyRouteMenuOpen((value) => !value)}
                style={{ height: 36, paddingHorizontal: 11, borderRadius: 18, flexDirection: 'row', alignItems: 'center', backgroundColor: theme.controlSurface, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.fieldBorder }}
              >
                <Text style={{ color: journeyRouteMenuOpen || selectedJourneyRouteId ? theme.accent : theme.text2, fontSize: 11.5, fontWeight: '800' }}>路线</Text>
              </Press>
            </Animated.View>
          ) : null}
          {pointMapControlsVisible && !mapImmersive ? (
            <Animated.View style={[{
              position: 'absolute',
              right: space.md,
              bottom: full + space.md + 92,
            }, !mapImmersive && { transform: [{ translateY: pointSheetTranslateY }] }]}>
              <Press
                onPress={() => {
                  setMapStylePickerOpen(false);
                  setMapImmersive(true);
                }}
                accessibilityRole="button"
                accessibilityLabel={t('journey.map.enterFullscreen')}
                style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.controlSurface }}
              >
                <Maximize2 color={theme.text2} size={18} strokeWidth={2} />
              </Press>
            </Animated.View>
          ) : null}
          {nav.pointInfo?.kind === 'route' && comparisonRoutes.length > 0 ? (
            <Animated.View style={[{
              position: 'absolute',
              right: space.md,
              bottom: mapImmersive ? journeyMinimum + space.md + 92 : full + space.md + 138,
            }, !mapImmersive && { transform: [{ translateY: pointSheetTranslateY }] }]}>
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
            bottom: mapImmersive ? journeyMinimum + space.md + 46 : full + space.md + 46,
          }, !mapImmersive && { transform: [{ translateY: pointSheetTranslateY }] }]}>
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
            bottom: mapImmersive ? journeyMinimum + space.md : full + space.md,
          }, !mapImmersive && { transform: [{ translateY: pointSheetTranslateY }] }]}>
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

      {sheetVisible && !mapImmersive && (
      <TrailSheet
        ref={sheetRef}
        key={`${nav.subTab}-${nav.pointInfo ? 'card' : 'list'}`}
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
        onDismiss={() => {
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
          <View style={{ paddingHorizontal: space.md, paddingBottom: nav.pointInfo.kind === 'journey' ? 76 : 0 }}>
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
                momentFilterActionRef={momentFilterActionRef}
                momentFilterMenuRef={momentFilterMenuRef}
                onMomentFilterMenuOpenChange={setMomentFilterMenuVisible}
                checklistAddActionRef={checklistAddActionRef}
                checklistDeleteActionRef={checklistDeleteActionRef}
                checklistFilterActionRef={checklistFilterActionRef}
                checklistFilterMenuRef={checklistFilterMenuRef}
                checklistFilterMenuOpen={checklistFilterMenuOpen}
                checklistPickerProgress={checklistPickerProgress}
                checklistToggleAllActionRef={checklistToggleAllActionRef}
                onChecklistFilterMenuOpenChange={setChecklistFilterMenuVisible}
                checklistSelectionMode={checklistSelectionMode}
                selectedChecklistItemIds={selectedChecklistItemIds}
                onSelectedChecklistItemIdsChange={setSelectedChecklistItemIds}
                onVisibleChecklistItemIdsChange={setVisibleChecklistItemIds}
                onChecklistCanEditChange={handleChecklistCanEditChange}
                momentSelectionMode={momentSelectionMode}
                selectedMomentIds={selectedMomentIds}
                onSelectedMomentIdsChange={setSelectedMomentIds}
                onVisibleMomentIdsChange={setVisibleMomentIds}
                onJourneyDaysChange={setAvailableJourneyDays}
                onRouteBoundaryRequest={openRouteEditor}
                timelineSelectionMode={timelineSelectionMode}
                selectedTimelineItemIds={selectedTimelineItemIds}
                onSelectedTimelineItemIdsChange={setSelectedTimelineItemIds}
                detailScrollY={journeyDetailScrollY}
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
          detailsTitle={nav.pointInfo ? t('journey.map.displayTitle') : undefined}
          details={nav.pointInfo ? (nav.pointInfo.kind === 'journey' ? [
            {
              id: 'journey-stops',
              label: t('journey.map.journeyStops'),
              value: journeyMapDetailsVisible,
              onChange: setJourneyMapDetailsVisible,
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
      {routeEditorGroupKey && nav.pointInfo?.kind === 'journey' && focusMeasure && routeEditorIndex >= 0 ? (
        <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { zIndex: 190 }]}>
          <JourneyRouteBoundarySheet
            theme={theme}
            info={nav.pointInfo}
            groupLabel={routeEditorGroupKey}
            minimumMeters={routeEditorMinimumMeters}
            maximumMeters={routeEditorMaximumMeters}
            current={focusedTimeline.groupRoutes[routeEditorGroupKey]}
            backgroundMap
            mapSelectionRequest={routeMapSelectionRequest}
            onSelectionChange={setRouteDraftPosition}
            onEndpointCoordinateChange={setRouteDraftEndpoint}
            onClose={closeRouteEditor}
            onSave={(route) => focusedTimeline.setGroupRoute(routeEditorGroupKey, route)}
          />
        </View>
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
                    {momentFilterMenuRef.current.typeTitle}
                  </Text>
                  {momentFilterMenuRef.current.typeOptions.map((option) => {
                    const selected = option.id === momentFilterMenuRef.current?.selectedType;
                    return (
                      <Press
                        key={option.id}
                        scaleTo={1}
                        onPress={() => momentFilterMenuRef.current?.selectType(option.id)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                        style={{ minHeight: 48, paddingHorizontal: space.md, flexDirection: 'row', alignItems: 'center', gap: space.sm }}
                      >
                        <View style={{ width: 30, height: 30, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.fieldSurface }}>
                          <Icon name={option.icon} color={theme.text2} size={15} />
                        </View>
                        <Text numberOfLines={1} style={[type.body, { flex: 1, color: theme.text, fontWeight: selected ? '700' : '500' }]}>{option.label}</Text>
                        {selected ? <Icon name="check" color={theme.accent} size={16} strokeWidth={2.4} /> : null}
                      </Press>
                    );
                  })}

                  <Text style={[type.caption, { paddingHorizontal: space.md, paddingTop: space.md, paddingBottom: space.xs, color: theme.text2, fontWeight: '600' }]}>
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
                  {momentFilterMenuRef.current.authors.map((author) => {
                    const selected = author.key === momentFilterMenuRef.current?.selectedAuthor;
                    return (
                      <Press
                        key={author.key}
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
            gap: space.xs,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
          {selectedJourneyDay && selectedJourneyTab !== 'moments' ? (
            <>
              {!timelineSelectionMode ? (
                <Press
                  hitSlop={3}
                  onPress={() => nav.pointInfo?.kind === 'journey' && nav.openTimelineAdd(nav.pointInfo, selectedJourneyDay, availableJourneyDays)}
                  accessibilityRole="button"
                  style={{ height: 38, paddingHorizontal: space.sm, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.controlSurface, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.fieldBorder, boxShadow: theme.dark ? '0px 4px 12px rgba(0,0,0,0.38)' : '0px 4px 12px rgba(0,0,0,0.08)' }}
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
                style={{ height: 38, paddingHorizontal: space.sm, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.controlSurface, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.fieldBorder, boxShadow: theme.dark ? '0px 4px 12px rgba(0,0,0,0.38)' : '0px 4px 12px rgba(0,0,0,0.08)' }}
              >
                <JourneyFooterActionLabel theme={theme} icon={timelineSelectionMode ? 'check' : 'edit'} label={timelineSelectionMode ? t('common.done') : t('common.edit')} />
              </Press>
              {timelineSelectionMode && selectedTimelineItemIds.size > 0 ? (
                <Press hitSlop={3} onPress={deleteSelectedTimelineItems} accessibilityRole="button" style={{ height: 38, paddingHorizontal: space.sm, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.controlSurface, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.fieldBorder, boxShadow: theme.dark ? '0px 4px 12px rgba(0,0,0,0.38)' : '0px 4px 12px rgba(0,0,0,0.08)' }}>
                  <JourneyFooterActionLabel theme={theme} icon="trash" label={t('common.delete')} danger />
                </Press>
              ) : null}
            </>
          ) : selectedJourneyTab === 'moments' ? (
            <>
              {!momentSelectionMode ? (
                <Press
                  hitSlop={3}
                  onPress={() => momentAddActionRef.current?.()}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.add')}
                  style={{ height: 38, paddingHorizontal: space.sm, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.controlSurface, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.fieldBorder, boxShadow: theme.dark ? '0px 4px 12px rgba(0,0,0,0.38)' : '0px 4px 12px rgba(0,0,0,0.08)' }}
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
                style={{ height: 38, paddingHorizontal: space.sm, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.controlSurface, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.fieldBorder, boxShadow: theme.dark ? '0px 4px 12px rgba(0,0,0,0.38)' : '0px 4px 12px rgba(0,0,0,0.08)' }}
              >
                <JourneyFooterActionLabel theme={theme} icon={momentSelectionMode ? 'check' : 'edit'} label={momentSelectionMode ? t('common.done') : t('common.edit')} />
              </Press>
              {momentSelectionMode && visibleMomentIds.length > 0 ? (
                <Press
                  hitSlop={3}
                  onPress={() => {
                    const allSelected = visibleMomentIds.every((id) => selectedMomentIds.has(id));
                    setSelectedMomentIds(allSelected ? new Set() : new Set(visibleMomentIds));
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={visibleMomentIds.every((id) => selectedMomentIds.has(id)) ? t('common.deselectAll') : t('common.selectAll')}
                  style={{ height: 38, paddingHorizontal: space.sm, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.controlSurface, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.fieldBorder, boxShadow: theme.dark ? '0px 4px 12px rgba(0,0,0,0.38)' : '0px 4px 12px rgba(0,0,0,0.08)' }}
                >
                  <JourneyFooterActionLabel
                    theme={theme}
                    icon="checkAll"
                    label={visibleMomentIds.every((id) => selectedMomentIds.has(id)) ? t('common.deselectAll') : t('common.selectAll')}
                  />
                </Press>
              ) : null}
              {momentSelectionMode ? (
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
                  style={{ height: 38, paddingHorizontal: space.sm, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: selectedMomentIds.size > 0 ? theme.controlSurface : theme.fieldSurface, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.fieldBorder, boxShadow: selectedMomentIds.size > 0 ? (theme.dark ? '0px 4px 12px rgba(0,0,0,0.38)' : '0px 4px 12px rgba(0,0,0,0.08)') : 'none' }}
                >
                  <JourneyFooterActionLabel
                    theme={theme}
                    icon="trash"
                    label={t('common.delete')}
                    danger={selectedMomentIds.size > 0}
                    disabled={selectedMomentIds.size === 0}
                  />
                </Press>
              ) : null}
            </>
          ) : selectedJourneyTab === 'checklist' ? (
            <>
              {checklistCanEdit && !checklistSelectionMode ? (
                <Press
                  hitSlop={3}
                  onPress={() => checklistAddActionRef.current?.()}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.add')}
                  style={{ height: 38, paddingHorizontal: space.sm, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.controlSurface, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.fieldBorder, boxShadow: theme.dark ? '0px 4px 12px rgba(0,0,0,0.38)' : '0px 4px 12px rgba(0,0,0,0.08)' }}
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
                  style={{ height: 38, paddingHorizontal: space.sm, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.controlSurface, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.fieldBorder, boxShadow: theme.dark ? '0px 4px 12px rgba(0,0,0,0.38)' : '0px 4px 12px rgba(0,0,0,0.08)' }}
                >
                  <JourneyFooterActionLabel theme={theme} icon={checklistSelectionMode ? 'check' : 'edit'} label={checklistSelectionMode ? t('common.done') : t('common.edit')} />
                </Press>
              ) : null}
              {checklistSelectionMode ? (
                <Press
                  hitSlop={3}
                  onPress={() => checklistToggleAllActionRef.current?.()}
                  accessibilityRole="button"
                  accessibilityLabel={visibleChecklistItemIds.length > 0 && visibleChecklistItemIds.every((id) => selectedChecklistItemIds.has(id)) ? t('common.deselectAll') : t('common.selectAll')}
                  style={{ height: 38, paddingHorizontal: space.sm, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.controlSurface, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.fieldBorder, boxShadow: theme.dark ? '0px 4px 12px rgba(0,0,0,0.38)' : '0px 4px 12px rgba(0,0,0,0.08)' }}
                >
                  <JourneyFooterActionLabel
                    theme={theme}
                    icon="checkAll"
                    label={visibleChecklistItemIds.length > 0 && visibleChecklistItemIds.every((id) => selectedChecklistItemIds.has(id)) ? t('common.deselectAll') : t('common.selectAll')}
                  />
                </Press>
              ) : null}
              {checklistSelectionMode ? (
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
                  style={{ height: 38, paddingHorizontal: space.sm, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: selectedChecklistItemIds.size > 0 ? theme.controlSurface : theme.fieldSurface, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.fieldBorder, boxShadow: selectedChecklistItemIds.size > 0 ? (theme.dark ? '0px 4px 12px rgba(0,0,0,0.38)' : '0px 4px 12px rgba(0,0,0,0.08)') : 'none' }}
                >
                  <JourneyFooterActionLabel
                    theme={theme}
                    icon="trash"
                    label={t('common.delete')}
                    danger={selectedChecklistItemIds.size > 0}
                    disabled={selectedChecklistItemIds.size === 0}
                  />
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
                style={{ height: 38, paddingHorizontal: space.sm, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.controlSurface, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.fieldBorder, boxShadow: theme.dark ? '0px 4px 12px rgba(0,0,0,0.38)' : '0px 4px 12px rgba(0,0,0,0.08)' }}
              >
                <JourneyFooterActionLabel theme={theme} icon={planEditorOpen ? 'check' : 'edit'} label={planEditorOpen ? t('common.done') : t('common.edit')} />
              </Press>
              {planEditorOpen && selectedPlanDays.size > 0 ? (
                <Press hitSlop={3} onPress={deleteSelectedPlanDays} accessibilityRole="button" style={{ height: 38, paddingHorizontal: space.sm, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.controlSurface, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.fieldBorder, boxShadow: theme.dark ? '0px 4px 12px rgba(0,0,0,0.38)' : '0px 4px 12px rgba(0,0,0,0.08)' }}>
                  <JourneyFooterActionLabel theme={theme} icon="trash" label={t('common.delete')} danger />
                </Press>
              ) : null}
            </>
          )}
          </View>
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
                height: 38,
                maxWidth: 176,
                paddingHorizontal: space.sm,
                borderRadius: radius.pill,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: space.xs,
                backgroundColor: theme.accent,
                boxShadow: theme.dark ? '0px 5px 14px rgba(0,0,0,0.42)' : '0px 5px 14px rgba(0,0,0,0.12)',
              }}
            >
              <AssistantMark color="#FFFFFF" size={21} />
              <Text numberOfLines={1} style={{ flexShrink: 1, color: '#FFFFFF', fontSize: 13, fontWeight: '700' }}>
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
