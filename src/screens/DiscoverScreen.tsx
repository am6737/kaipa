// DiscoverScreen.tsx — the 发现 tab. A platform-native map (SVG fallback) of routes
// (探索) or the user's journeys (旅程), with a draggable bottom sheet listing them
// and an in-place route/journey detail panel.
import React, { useMemo, useState, useCallback } from 'react';
import { Animated, Easing, Platform, Pressable, ScrollView, View, Text, useWindowDimensions, StyleSheet, Alert, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Theme } from '../theme/theme';
import { useNav } from '../nav/NavContext';
import { useI18n, TKey } from '../i18n';
import { Poi } from '../data/pois';
import { useData } from '../data/DataContext';
import { Globe, type GlobeCameraAction, type GlobeMapStyle } from '../components/globe';
import { Glass, GlassIconBtn } from '../components/Glass';
import { Icon, type IconName } from '../components/Icon';
import { Press } from '../components/Press';
import { TrailSheet, TrailSheetHandle } from '../components/Sheet';
import { KPState, KPSkeletonLine } from '../components/State';
import { DiscoverCollectionHeader, DiscoverJourneyCard, DiscoverRouteCard } from '../components/discover/DiscoverCollection';
import { RoutePreviewActions, RoutePreviewPanel } from '../components/discover/RoutePreviewPanel';
import { AppProgressBar, radius, space, type } from '../design-system';
import { SelectedPoiCard, type JourneyMomentFilterMenuController } from './JourneyCard';
import { ParticipantAvatar } from '../components/overlays/ParticipantAvatar';
import { Avatar } from '../components/Avatar';
import type { JourneyChecklistFilterMenuController, JourneyChecklistFilterMenuOption } from '../components/journey/JourneyChecklistTab';
import { useTimeline } from '../hooks/useTimeline';
import { buildJourneyRouteSegments, distanceMeters, JOURNEY_SEGMENT_COLORS, measureTrack, positionAtDistance, type TrackPosition } from '../lib/routeSegments';
import { JourneyRouteBoundarySheet } from '../components/overlays/JourneyRouteBoundarySheet';
import { MapStylePickerSheet, type MapDisplayOption, type MapPresentationStyle } from '../components/MapStylePickerSheet';
import { AssistantMark } from '../components/assistant/AssistantMark';
import { journeyDayDisplayLabel } from '../lib/journeyDays';

// Chips carry a stable id (used by the filter logic + as the i18n key suffix);
// their display label is resolved per-language at render time.
const EXPLORE_CHIPS = ['all', 'easy', 'highAsc', 'near', 'mine'] as const;
const MEMORY_CHIPS = ['all', 'fav'] as const;

type FilterMenuAnchor = { x: number; y: number; width: number; height: number };

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

function JourneyChecklistFilterOptionRow({
  theme,
  option,
  selected,
  onPress,
}: {
  theme: Theme;
  option: JourneyChecklistFilterMenuOption;
  selected: boolean;
  onPress: () => void;
}) {
  const { t } = useI18n();
  return (
    <Press
      scaleTo={1}
      opacityTo={0.68}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={{ minHeight: 66, marginBottom: space.xxs, paddingHorizontal: space.sm, flexDirection: 'row', alignItems: 'center', gap: space.sm }}
    >
      {option.kind === 'companion' ? (
        <ParticipantAvatar theme={theme} uri={option.avatarUrl} size={32} />
      ) : (
        <View style={{ width: 32, height: 32, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.fieldSurface }}>
          <Icon name={option.kind === 'shared' ? 'people' : 'user'} color={theme.text2} size={16} />
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={[type.body, { color: theme.text, fontWeight: selected ? '700' : '500' }]}>{option.label}</Text>
        <Text style={[type.caption, { color: selected ? theme.text2 : theme.text3, marginTop: 2 }]}>
          {t('journey.packing.progress', { ready: option.ready, total: option.total })}
        </Text>
        <View style={{ marginTop: space.xs }}>
          <AppProgressBar theme={theme} value={option.total ? (option.ready / option.total) * 100 : 0} height={3} color={selected ? theme.accent : theme.text3} />
        </View>
      </View>
      <View style={{ width: 16, alignItems: 'center', justifyContent: 'center' }}>
        {selected ? <Icon name="check" color={theme.accent} size={16} strokeWidth={2.4} /> : null}
      </View>
    </Press>
  );
}

function num(s: string) {
  const m = s.replace(/,/g, '').match(/[\d.]+/);
  return m ? parseFloat(m[0]) : 0;
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

export function DiscoverScreen({ theme, externalOverlayOpen = false }: { theme: Theme; externalOverlayOpen?: boolean }) {
  const nav = useNav();
  const { t, resolved } = useI18n();
  const { routes, journeys, userId } = useData();
  const chipLabel = (id: string) =>
    t(`discover.chip${id.charAt(0).toUpperCase()}${id.slice(1)}` as TKey);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isMemory = nav.subTab === 'memory';
  const [chip, setChip] = React.useState(0);
  const [mapStyle, setMapStyle] = useState<GlobeMapStyle>('standard');
  const [mapStylePickerOpen, setMapStylePickerOpen] = useState(false);
  const [journeyMapDetailsVisible, setJourneyMapDetailsVisible] = useState(true);
  const [journeyMapAtRouteFrame, setJourneyMapAtRouteFrame] = useState(true);
  const [mapLabelsVisible, setMapLabelsVisible] = useState(true);
  const [journeyMapCameraAction, setJourneyMapCameraAction] = useState<GlobeCameraAction>();
  // When a clustered map pin is tapped, the same journey-list sheet is scoped to
  // that trailhead (coordinate key) — only the header copy changes to 这个地点的旅程.
  const [placeSel, setPlaceSel] = React.useState<string | null>(null);
  const [focusReturnToList, setFocusReturnToList] = React.useState(false);
  const sheetRef = React.useRef<TrailSheetHandle>(null);
  const journeyDetailScrollY = React.useRef(new Animated.Value(0)).current;

  // ── multi-select (long-press to enter, batch delete) ──
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [planEditorOpen, setPlanEditorOpen] = useState(false);
  const [journeySheetIndex, setJourneySheetIndex] = useState(1);
  const [selectedPlanDays, setSelectedPlanDays] = useState<Set<string>>(() => new Set());
  const [selectedJourneyDay, setSelectedJourneyDay] = useState<string | undefined>();
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
  const [checklistFilterAnchor, setChecklistFilterAnchor] = useState<FilterMenuAnchor>();
  const [checklistFilterMenuOpen, setChecklistFilterMenuOpen] = useState(false);
  const checklistFilterArrowProgress = React.useRef(new Animated.Value(0)).current;
  const setChecklistFilterMenuVisible = useCallback((open: boolean, anchor?: FilterMenuAnchor) => {
    if (anchor) setChecklistFilterAnchor(anchor);
    // Start the native animation before updating React state. The journey detail
    // tree is relatively large, so waiting for its render made the menu feel late.
    checklistFilterArrowProgress.stopAnimation();
    Animated.timing(checklistFilterArrowProgress, {
      toValue: open ? 1 : 0,
      duration: open ? 140 : 90,
      easing: open
        ? Easing.bezier(0.16, 1, 0.3, 1)
        : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start();
    setChecklistFilterMenuOpen(open);
  }, [checklistFilterArrowProgress]);
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
  const focusedTimeline = useTimeline(focusedJourneyId, userId);
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
      checklistFilterArrowProgress.setValue(0);
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
    setJourneyMapDetailsVisible(true);
    setJourneyMapAtRouteFrame(true);
    setMapLabelsVisible(true);
    setJourneyMapCameraAction(undefined);
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
    checklistFilterArrowProgress.setValue(0);
    setChecklistFilterMenuOpen(false);
    setAvailableJourneyDays([]);
    setTimelineSelectionMode(false);
    setSelectedTimelineItemIds(new Set());
    journeyDetailScrollY.setValue(0);
  }, [checklistFilterArrowProgress, focusedJourneyId, journeyDetailScrollY, momentFilterMenuProgress, t]);

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
  const focusCoords = useMemo<[number, number][] | null>(() => {
    const point = nav.pointInfo;
    if (!point) return null;
    if ((point.trackCoords?.length ?? 0) >= 2) return point.trackCoords!;

    // Older journeys may only keep the source route id. Their detail map should
    // still frame that route instead of falling back to the journey avatar pin.
    const linkedRouteTrack = point.routeId ? routes.find((route) => route.id === point.routeId)?.trackCoords : undefined;
    if ((linkedRouteTrack?.length ?? 0) >= 2) return linkedRouteTrack!;

    return Number.isFinite(point.lng) && Number.isFinite(point.lat) ? [[point.lng, point.lat]] : null;
  }, [nav.pointInfo, routes]);
  const focusMeasure = useMemo(() => measureTrack(focusCoords ?? undefined), [focusCoords]);
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
  const focusSegments = useMemo(() => {
    if (nav.pointInfo?.kind !== 'journey') return [];
    return buildJourneyRouteSegments(
      focusMeasure,
      focusGroupKeys,
      displayedGroupRoutes,
      selectedJourneyDay,
    ).map((segment) => ({
      id: segment.id,
      label: `${journeyDayDisplayLabel(segment.groupKey, resolved)} ${(segment.endDistanceMeters - segment.startDistanceMeters < 10_000 ? ((segment.endDistanceMeters - segment.startDistanceMeters) / 1000).toFixed(1) : Math.round((segment.endDistanceMeters - segment.startDistanceMeters) / 1000))}km`,
      coordinates: segment.coordinates,
      color: segment.color,
      active: segment.active,
    }));
  }, [displayedGroupRoutes, focusGroupKeys, focusMeasure, nav.pointInfo?.kind, resolved, selectedJourneyDay]);
  const focusBoundaries = useMemo(() => {
    if (nav.pointInfo?.kind !== 'journey' || !focusMeasure) return [];
    return focusGroupKeys.flatMap((groupKey, index) => {
      const route = displayedGroupRoutes[groupKey];
      if (!route) return [];
      const previousRoute = index > 0 ? displayedGroupRoutes[focusGroupKeys[index - 1]] : undefined;
      const pending = index > 0 && !previousRoute;
      const displayMeters = previousRoute ? route.endDistanceMeters - previousRoute.endDistanceMeters : route.endDistanceMeters;
      return [{
        id: `journey-boundary-${index}`,
        groupKey,
        title: journeyDayDisplayLabel(groupKey, resolved),
        distance: `${(displayMeters / 1000).toFixed(1)} km`,
        coordinate: [route.longitude, route.latitude] as [number, number],
        color: JOURNEY_SEGMENT_COLORS[index % JOURNEY_SEGMENT_COLORS.length],
        active: !selectedJourneyDay || selectedJourneyDay === groupKey,
        pending,
      }];
    });
  }, [displayedGroupRoutes, focusGroupKeys, focusMeasure, nav.pointInfo?.kind, resolved, selectedJourneyDay]);
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
  const endpointGroupKey = routeEditorGroupKey ?? selectedJourneyDay;
  const endpointGroupIndex = endpointGroupKey ? focusGroupKeys.indexOf(endpointGroupKey) : -1;
  const endpointRoute = endpointGroupKey ? displayedGroupRoutes[endpointGroupKey] : undefined;
  const displayedEndpointCoordinate: [number, number] | undefined = routeEditorGroupKey
    ? routeDraftEndpoint ?? undefined
    : endpointRoute && Number.isFinite(endpointRoute.longitude) && Number.isFinite(endpointRoute.latitude)
      ? [endpointRoute.longitude, endpointRoute.latitude]
      : undefined;
  const displayedTrackBoundary = routeEditorGroupKey && routeDraftPosition
    ? routeDraftPosition.coordinate
    : endpointRoute && focusMeasure
      ? positionAtDistance(focusMeasure, endpointRoute.endDistanceMeters).coordinate
      : undefined;
  const displayedEndpointColor = endpointGroupIndex >= 0
    ? JOURNEY_SEGMENT_COLORS[endpointGroupIndex % JOURNEY_SEGMENT_COLORS.length]
    : theme.accent;
  const displayedEndpointConnector = displayedTrackBoundary && displayedEndpointCoordinate
    && distanceMeters(displayedTrackBoundary, displayedEndpointCoordinate) > 2
    ? [displayedTrackBoundary, displayedEndpointCoordinate] as [[number, number], [number, number]]
    : undefined;
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
    ? nav.pointInfo.heroMode ?? ((focusCoords?.length ?? 0) >= 2 ? 'track' : journeyCoverUri ? 'cover' : 'track')
    : 'track';
  const journeyShowsCover = !routeEditorGroupKey && journeyHeroMode === 'cover' && !!journeyCoverUri;
  const journeyChromeColor = journeyShowsCover ? '#FFFFFF' : theme.text;
  const journeyMapFull = nav.pointInfo?.kind === 'journey' && journeySheetIndex === 0 && !journeyShowsCover && !routeEditorGroupKey;
  const journeyMapBottomPadding = journeySheetIndex === 0
    ? journeyMinimum + space.xl
    : journeySheetIndex === 1
      ? focusPanel + space.xl
      : full + space.md;

  const fitJourneyMapRoute = () => {
    setMapStylePickerOpen(false);
    setJourneyMapAtRouteFrame(true);
    setJourneyMapCameraAction((current) => ({ type: 'fitRoute', revision: (current?.revision ?? 0) + 1 }));
  };



  // sheet stats
  const totalKm = useMemo(() => displayPois.reduce((s, p) => s + num(p.dist), 0), [displayPois]);

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
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
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
        ) : (
        <Globe
          theme={theme}
          size={globeSize}
          pois={nav.pointInfo ? [] : placeGroups.map(({ rep, group }) => {
            const [lng, lat] = poiMapCoordinate(rep);
            return { id: rep.id, lng, lat, mine: rep.mine, tone: rep.tone, count: group.length, coverUri: rep.photoUris?.[0], label: rep.name };
          })}
          activePoiId={activeRepId}
          mapStyle={mapStyle}
          mapLocale={resolved}
          showMapLabels={mapLabelsVisible}
          cameraAction={journeyMapCameraAction}
          focusBottomPadding={nav.pointInfo?.kind === 'journey' ? journeyMapBottomPadding : undefined}
          onCameraGestureStart={nav.pointInfo?.kind === 'journey' ? () => setJourneyMapAtRouteFrame(false) : undefined}
          focusCoords={focusCoords}
          focusSegments={journeyMapDetailsVisible || routeEditorGroupKey ? focusSegments : []}
          focusBoundaries={journeyMapDetailsVisible || routeEditorGroupKey ? displayedFocusBoundaries : []}
          selectionPin={routeEditorGroupKey && routeDraftPosition && routeEditorIndex >= 0 ? {
            coordinate: routeDraftEndpoint ?? routeDraftPosition.coordinate,
            color: JOURNEY_SEGMENT_COLORS[routeEditorIndex % JOURNEY_SEGMENT_COLORS.length],
          } : undefined}
          focusConnector={displayedEndpointConnector ? {
            coordinates: displayedEndpointConnector,
            color: displayedEndpointColor,
          } : undefined}
          onRouteBoundaryPress={(groupKey) => {
            setJourneyDaySelectionRequest((current) => ({ day: groupKey, revision: (current?.revision ?? 0) + 1 }));
          }}
          onMapCoordinatePress={routeEditorGroupKey ? (coordinate) => {
            setRouteMapSelectionRequest((current) => ({ coordinate, revision: (current?.revision ?? 0) + 1 }));
          } : undefined}
          center={nav.pointInfo ? (() => {
            const [lon, lat] = focusCoords?.[0] ?? poiMapCoordinate(nav.pointInfo!);
            return { lon, lat };
          })() : undefined}
          onPoiPress={(id) => {
            const group = repIdToGroup.get(id);
            if (!group) return;
            // One route/journey here → open its map detail. Several → scope the journey-list
            // sheet to this trailhead so the user can pick the past memory vs. the
            // 再次出发 plan (same list, just a 这个地点的旅程 header).
            if (group.length === 1) {
              setPlaceSel(null);
              setFocusReturnToList(false);
              nav.openPoint(group[0]);
              return;
            }
            setPlaceSel(placeKey(group[0]));
            nav.closePoint();
            nav.openSheet();
          }}
          onBackgroundPress={() => sheetRef.current?.dismiss()}
        />
        )}
      </View>

      {/* subtabs */}
      {!nav.pointInfo ? (
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
                  onPress={() => nav.setSubTab(tab.id as any)}
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
      {!nav.pointInfo ? (
      <View style={{ position: 'absolute', top: insets.top + 8, right: 16, gap: 10 }}>
        <GlassIconBtn theme={chromeTheme} onPress={() => nav.openSearch()}>
          <Icon name="search" color={chromeTheme.text} size={19} />
        </GlassIconBtn>
        <GlassIconBtn theme={chromeTheme} onPress={() => nav.showToast(t('discover.toastNorth'))}>
          <View style={{ alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="compassN" color={chromeTheme.text} size={22} />
          </View>
        </GlassIconBtn>
      </View>
      ) : nav.pointInfo.kind === 'journey' ? (
        <>
          <View style={{ position: 'absolute', top: insets.top + 5, left: 13 }}>
            <Press
              accessibilityRole="button"
              accessibilityLabel={t('common.back')}
              hitSlop={6}
              onPress={() => {
                if (routeEditorGroupKey) closeRouteEditor();
                else sheetRef.current?.dismiss();
              }}
              style={{ width: 52, height: 52, alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name="chevronL" color={journeyChromeColor} size={27} />
            </Press>
          </View>
          <View style={{ position: 'absolute', top: insets.top + 5, right: 13, flexDirection: 'row' }}>
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
            <Press
              accessibilityRole="button"
              accessibilityLabel={t('journey.more.settings')}
              hitSlop={6}
              onPress={() => nav.pointInfo && nav.openJourneySettings(nav.pointInfo)}
              style={{ width: 52, height: 52, alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name="gearSettings" color={journeyChromeColor} size={25} />
            </Press>
          </View>
        </>
      ) : null}





      {journeyMapFull ? (
        <>
          <Press
            onPress={() => setMapStylePickerOpen((value) => !value)}
            accessibilityRole="button"
            accessibilityState={{ expanded: mapStylePickerOpen }}
            accessibilityLabel={t('journey.map.layerTitle')}
            style={{
              position: 'absolute',
              right: space.md,
              bottom: journeyMinimum + space.md + 46,
              width: 38,
              height: 38,
              borderRadius: 19,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.controlSurface,
              shadowColor: '#000000',
              shadowOpacity: theme.dark ? 0.20 : 0.08,
              shadowRadius: 5,
              shadowOffset: { width: 0, height: 2 },
              elevation: 3,
            }}
          >
            <Icon name="layers" color={mapStylePickerOpen ? theme.accent : theme.text2} size={18} />
          </Press>

          <Press
            onPress={fitJourneyMapRoute}
            accessibilityRole="button"
            accessibilityLabel={t('journey.map.fitRoute')}
            accessibilityState={{ selected: journeyMapAtRouteFrame }}
            style={{
              position: 'absolute',
              right: space.md,
              bottom: journeyMinimum + space.md,
              width: 38,
              height: 38,
              borderRadius: 19,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.controlSurface,
              shadowColor: '#000000',
              shadowOpacity: theme.dark ? 0.20 : 0.08,
              shadowRadius: 5,
              shadowOffset: { width: 0, height: 2 },
              elevation: 3,
            }}
          >
            <Icon name="locate" color={journeyMapAtRouteFrame ? theme.accent : theme.text2} size={18} />
          </Press>
        </>
      ) : null}

      {!nav.pointInfo ? (
        <View style={{ position: 'absolute', right: 16, bottom: sheetVisible ? collapsed + 16 : tabSpace + 56, gap: 10 }}>
          <GlassIconBtn
            theme={chromeTheme}
            size={44}
            strong
            onPress={() => setMapStylePickerOpen((value) => !value)}
            accessibilityLabel={t('journey.map.layerTitle')}
          >
            <Icon name="layers" color={mapStylePickerOpen ? chromeTheme.accent : chromeTheme.text} size={20} />
          </GlassIconBtn>
          <GlassIconBtn theme={chromeTheme} size={44} strong onPress={() => nav.showToast(t('discover.toastLocate'))}>
            <Icon name="locate" color={chromeTheme.accent} size={21} />
          </GlassIconBtn>
        </View>
      ) : null}

      {sheetVisible && (
      <TrailSheet
        ref={sheetRef}
        key={`${nav.subTab}-${nav.pointInfo ? 'card' : 'list'}`}
        theme={theme}
        snapHeights={nav.pointInfo?.kind === 'journey'
          ? [journeyMinimum, focusPanel, full]
          : nav.pointInfo
            ? [focusPanel, full]
            : [collapsed, full]}
        initialIndex={nav.pointInfo?.kind === 'journey' ? 1 : 0}
        dismissOnDrag={nav.pointInfo?.kind !== 'journey'}
        onIndexChange={nav.pointInfo?.kind === 'journey' ? (index) => {
          setJourneySheetIndex(index);
          if (index !== 0) setMapStylePickerOpen(false);
        } : undefined}
        header={nav.pointInfo ? <View /> : header}
        compact={false}
        backgroundColor={nav.pointInfo ? theme.featureSurface : isMemory ? theme.groupedBg : theme.featureSurface}
        borderless={nav.pointInfo?.kind === 'route'}
        bodyScrollY={nav.pointInfo?.kind === 'journey' ? journeyDetailScrollY : undefined}
        bottomOffset={0}
        onDismiss={() => {
          setPlaceSel(null);
          if (nav.pointInfo && focusReturnToList) {
            nav.closePoint();
            nav.openSheet();
          } else {
            nav.closeSheet();
          }
          setFocusReturnToList(false);
        }}
      >
        {nav.pointInfo ? (
          <View style={{ paddingHorizontal: space.md, paddingBottom: nav.pointInfo.kind === 'journey' ? 76 : 0 }}>
            {nav.pointInfo.kind === 'route' ? (
              <RoutePreviewPanel theme={theme} poi={nav.pointInfo} onClose={() => sheetRef.current?.dismiss()} showActions={false} />
            ) : (
              <SelectedPoiCard
                theme={theme}
                poi={nav.pointInfo}
                embedded
                externalPlanEditorControls
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
                {displayPois.map((p) => isMemory && p.kind === 'journey' ? (
                  <DiscoverJourneyCard
                    key={p.id}
                    theme={theme}
                    poi={p}
                    selectMode={selectMode}
                    selected={selectedIds.has(p.id)}
                    onPress={() => {
                      if (selectMode) toggleSelect(p.id);
                      else {
                        setFocusReturnToList(true);
                        nav.openPoint(p);
                      }
                    }}
                    onLongPress={() => (selectMode ? toggleSelect(p.id) : enterSelect(p.id))}
                  />
                ) : (
                  <DiscoverRouteCard key={p.id} theme={theme} poi={p} onPress={() => {
                    setFocusReturnToList(true);
                    nav.openPoint(p);
                  }} />
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
      {mapStylePickerOpen && (journeyMapFull || !nav.pointInfo) ? (
        <MapStylePickerSheet
          theme={theme}
          title={t('journey.map.layerTitle')}
          closeLabel={t('common.close')}
          options={([
            { id: 'standard', label: t('journey.map.layerStandard') },
            { id: 'satellite', label: t('journey.map.layerSatellite') },
          ] satisfies { id: MapPresentationStyle; label: string }[])}
          value={mapStyle === 'light' ? 'standard' : mapStyle}
          detailsTitle={t('journey.map.displayTitle')}
          details={(journeyMapFull ? [
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
          ] : [
            {
              id: 'map-labels',
              label: t('journey.map.showLabels'),
              value: mapLabelsVisible,
              onChange: setMapLabelsVisible,
            },
          ]) satisfies MapDisplayOption[]}
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
        <Modal
          visible={checklistFilterMenuOpen}
          transparent
          statusBarTranslucent
          animationType="none"
          onRequestClose={() => setChecklistFilterMenuVisible(false)}
        >
          <View style={{ flex: 1 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
              onPress={() => setChecklistFilterMenuVisible(false)}
              style={StyleSheet.absoluteFill}
            />
            <Animated.View
              renderToHardwareTextureAndroid
              shouldRasterizeIOS
              style={{
                position: 'absolute',
                ...anchoredFilterMenuStyle(checklistFilterAnchor, width, height, insets.top, insets.bottom, 264, 420),
                width: 264,
                padding: space.sm,
                borderRadius: radius.feature,
                backgroundColor: Platform.OS === 'android' ? (theme.dark ? '#202024' : '#FFFFFF') : theme.surfaceTop,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: theme.fieldBorder,
                boxShadow: theme.dark ? '0px 10px 28px rgba(0,0,0,0.34)' : '0px 10px 28px rgba(0,0,0,0.12)',
                opacity: checklistFilterArrowProgress,
                transform: [
                  {
                    translateY: checklistFilterArrowProgress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [6, 0],
                    }),
                  },
                  {
                    scale: checklistFilterArrowProgress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.975, 1],
                    }),
                  },
                ],
              }}
            >
            <ScrollView showsVerticalScrollIndicator={false} nestedScrollEnabled contentContainerStyle={{ paddingTop: space.xs, paddingBottom: space.xxs }}>
              {checklistFilterMenuRef.current.options.some((option) => option.kind === 'shared') ? (
                <>
                  <Text style={[type.caption, { paddingHorizontal: space.sm, paddingTop: space.xxs, paddingBottom: space.xs, color: theme.text2, fontWeight: '600' }]}>
                    {t('journey.packing.sharedSection')}
                  </Text>
                  {checklistFilterMenuRef.current.options
                    .filter((option) => option.kind === 'shared')
                    .map((option) => (
                      <JourneyChecklistFilterOptionRow
                        key={option.key}
                        theme={theme}
                        option={option}
                        selected={option.key === checklistFilterMenuRef.current?.activeKey}
                        onPress={() => {
                          checklistFilterMenuRef.current?.select(option.key);
                          setChecklistFilterMenuVisible(false);
                        }}
                      />
                    ))}
                </>
              ) : null}

              <Text style={[type.caption, { paddingHorizontal: space.sm, paddingTop: space.md, paddingBottom: space.xs, color: theme.text2, fontWeight: '600' }]}>
                {t('journey.packing.participantsSection')}
              </Text>
              {checklistFilterMenuRef.current.options
                .filter((option) => option.kind !== 'shared')
                .map((option) => (
                  <JourneyChecklistFilterOptionRow
                    key={option.key}
                    theme={theme}
                    option={option}
                    selected={option.key === checklistFilterMenuRef.current?.activeKey}
                    onPress={() => {
                      checklistFilterMenuRef.current?.select(option.key);
                      setChecklistFilterMenuVisible(false);
                    }}
                  />
                ))}
            </ScrollView>
            </Animated.View>
          </View>
        </Modal>
      ) : null}
      {nav.pointInfo?.kind === 'journey' && journeySheetIndex > 0 && !nav.blockingOverlayOpen && !externalOverlayOpen ? (
        <View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            left: space.md,
            right: space.md,
            bottom: Math.max(insets.bottom, space.md),
            zIndex: 180,
            flexDirection: 'row',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: space.xs,
          }}
        >
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
                marginRight: 'auto',
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
                style={{ height: 38, marginRight: timelineSelectionMode ? 'auto' : undefined, paddingHorizontal: space.sm, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.controlSurface, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.fieldBorder, boxShadow: theme.dark ? '0px 4px 12px rgba(0,0,0,0.38)' : '0px 4px 12px rgba(0,0,0,0.08)' }}
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
                style={{ height: 38, marginRight: momentSelectionMode ? 'auto' : undefined, paddingHorizontal: space.sm, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.controlSurface, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.fieldBorder, boxShadow: theme.dark ? '0px 4px 12px rgba(0,0,0,0.38)' : '0px 4px 12px rgba(0,0,0,0.08)' }}
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
                  style={{ height: 38, marginRight: checklistSelectionMode ? 'auto' : undefined, paddingHorizontal: space.sm, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.controlSurface, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.fieldBorder, boxShadow: theme.dark ? '0px 4px 12px rgba(0,0,0,0.38)' : '0px 4px 12px rgba(0,0,0,0.08)' }}
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
                style={{ height: 38, marginRight: planEditorOpen ? 'auto' : undefined, paddingHorizontal: space.sm, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.controlSurface, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.fieldBorder, boxShadow: theme.dark ? '0px 4px 12px rgba(0,0,0,0.38)' : '0px 4px 12px rgba(0,0,0,0.08)' }}
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
      ) : null}
      {nav.pointInfo?.kind === 'route' ? (
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
          <RoutePreviewActions theme={theme} poi={nav.pointInfo} />
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
    </View>
  );
}
