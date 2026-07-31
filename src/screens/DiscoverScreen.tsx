// DiscoverScreen.tsx — the 发现 tab. A Mapbox 3D globe (SVG fallback) of routes
// (探索) or the user's journeys (旅程), with a draggable bottom sheet listing them
// and an in-place route/journey detail panel.
import React, { useMemo, useState, useCallback } from 'react';
import { Animated, View, Text, useWindowDimensions, StyleSheet, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme, makeTheme } from '../theme/theme';
import { useNav } from '../nav/NavContext';
import { useI18n, TKey } from '../i18n';
import { Poi } from '../data/pois';
import { useData } from '../data/DataContext';
import { Globe, MAPBOX_ENABLED } from '../components/globe';
import { Glass, GlassIconBtn } from '../components/Glass';
import { Icon } from '../components/Icon';
import { Press } from '../components/Press';
import { TrailSheet, TrailSheetHandle } from '../components/Sheet';
import { KPState, KPSkeletonLine } from '../components/State';
import { DiscoverCollectionHeader, DiscoverJourneyCard, DiscoverRouteCard } from '../components/discover/DiscoverCollection';
import { RoutePreviewActions, RoutePreviewPanel } from '../components/discover/RoutePreviewPanel';
import { radius, space, type } from '../design-system';
import { nextJourneyDayLabel, SelectedPoiCard } from './JourneyCard';
import { useTimeline } from '../hooks/useTimeline';

// Chips carry a stable id (used by the filter logic + as the i18n key suffix);
// their display label is resolved per-language at render time.
const EXPLORE_CHIPS = ['all', 'easy', 'highAsc', 'near', 'mine'] as const;
const MEMORY_CHIPS = ['all', 'fav'] as const;

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

export function DiscoverScreen({ theme }: { theme: Theme }) {
  const nav = useNav();
  const { t, resolved } = useI18n();
  const { routes, journeys, userId } = useData();
  const chipLabel = (id: string) =>
    t(`discover.chip${id.charAt(0).toUpperCase()}${id.slice(1)}` as TKey);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isMemory = nav.subTab === 'memory';
  const [chip, setChip] = React.useState(0);
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

  React.useEffect(() => {
    setPlanEditorOpen(false);
    setJourneySheetIndex(1);
    setSelectedPlanDays(new Set());
    setSelectedJourneyDay(undefined);
    setAvailableJourneyDays([]);
    setTimelineSelectionMode(false);
    setSelectedTimelineItemIds(new Set());
    journeyDetailScrollY.setValue(0);
  }, [focusedJourneyId, journeyDetailScrollY]);

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

  const addPlanGroup = () => {
    const labels = [...new Set([...focusedTimeline.knownGroups, ...focusedTimeline.rows.map((row) => row.day)])];
    focusedTimeline.addGroup(nextJourneyDayLabel(labels, resolved, t));
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

  // The real Mapbox globe sits on black starry space in BOTH appearance modes,
  // so chrome floating over the map always uses the dark treatment to stay
  // legible. The bottom sheet (a separate surface) keeps the real theme,
  // Apple-Maps style. The no-token SVG fallback renders on the app background,
  // so there we leave the chrome on the real theme.
  const chromeTheme = MAPBOX_ENABLED && !theme.dark ? makeTheme('dark', theme.accent) : theme;

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
  const full = Math.round(height * 0.95);
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
        <Globe
          theme={theme}
          size={globeSize}
          pois={nav.pointInfo ? [] : placeGroups.map(({ rep, group }) => {
            const [lng, lat] = poiMapCoordinate(rep);
            return { id: rep.id, lng, lat, mine: rep.mine, tone: rep.tone, count: group.length, coverUri: rep.photoUris?.[0] };
          })}
          activePoiId={activeRepId}
          focusCoords={focusCoords}
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
              onPress={() => sheetRef.current?.dismiss()}
              style={{ width: 52, height: 52, alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name="chevronL" color={theme.text} size={27} />
            </Press>
          </View>
          <View style={{ position: 'absolute', top: insets.top + 5, right: 13, flexDirection: 'row' }}>
            <Press
              accessibilityRole="button"
              accessibilityLabel={t('common.share')}
              hitSlop={6}
              onPress={() => nav.pointInfo && nav.openSharePanel(nav.pointInfo)}
              style={{ width: 52, height: 52, alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name="share" color={theme.text} size={25} />
            </Press>
            <Press
              accessibilityRole="button"
              accessibilityLabel={t('journey.more.settings')}
              hitSlop={6}
              onPress={() => nav.pointInfo && nav.openJourneySettings(nav.pointInfo)}
              style={{ width: 52, height: 52, alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name="gearSettings" color={theme.text} size={25} />
            </Press>
          </View>
        </>
      ) : null}

      {!nav.pointInfo ? <View style={{ position: 'absolute', right: 16, bottom: sheetVisible ? collapsed + 16 : tabSpace + 56 }}>
        <GlassIconBtn theme={chromeTheme} size={44} strong onPress={() => nav.showToast(t('discover.toastLocate'))}>
          <Icon name="locate" color={chromeTheme.accent} size={21} />
        </GlassIconBtn>
      </View> : null}

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
        onIndexChange={nav.pointInfo?.kind === 'journey' ? setJourneySheetIndex : undefined}
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
                onJourneyDaysChange={setAvailableJourneyDays}
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
      {nav.pointInfo?.kind === 'journey' && journeySheetIndex > 0 && !nav.timelineAdd ? (
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
          {selectedJourneyDay ? (
            <>
              {timelineSelectionMode && selectedTimelineItemIds.size > 0 ? (
                <Press
                  onPress={deleteSelectedTimelineItems}
                  accessibilityRole="button"
                  style={{ height: 44, paddingHorizontal: space.lg, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.controlSurface, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.fieldBorder, boxShadow: theme.dark ? '0px 4px 12px rgba(0,0,0,0.38)' : '0px 4px 12px rgba(0,0,0,0.08)' }}
                >
                  <Text style={{ color: theme.danger, fontSize: 13, fontWeight: '700' }}>{t('common.delete')}</Text>
                </Press>
              ) : null}
              {!timelineSelectionMode ? (
                <Press
                  onPress={() => nav.pointInfo?.kind === 'journey' && nav.openTimelineAdd(nav.pointInfo, selectedJourneyDay, availableJourneyDays)}
                  accessibilityRole="button"
                  style={{ height: 44, paddingHorizontal: space.lg, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.controlSurface, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.fieldBorder, boxShadow: theme.dark ? '0px 4px 12px rgba(0,0,0,0.38)' : '0px 4px 12px rgba(0,0,0,0.08)' }}
                >
                  <Text style={{ color: theme.text, fontSize: 13, fontWeight: '700' }}>{t('common.add')}</Text>
                </Press>
              ) : null}
              <Press
                onPress={() => {
                  setTimelineSelectionMode((open) => !open);
                  if (timelineSelectionMode) setSelectedTimelineItemIds(new Set());
                }}
                accessibilityRole="button"
                style={{ height: 44, paddingHorizontal: space.lg, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.controlSurface, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.fieldBorder, boxShadow: theme.dark ? '0px 4px 12px rgba(0,0,0,0.38)' : '0px 4px 12px rgba(0,0,0,0.08)' }}
              >
                <Text style={{ color: theme.text, fontSize: 13, fontWeight: '700' }}>{timelineSelectionMode ? t('common.done') : t('common.edit')}</Text>
              </Press>
            </>
          ) : (
            <>
              {planEditorOpen && selectedPlanDays.size > 0 ? (
                <Press
                  onPress={deleteSelectedPlanDays}
                  accessibilityRole="button"
                  style={{ height: 44, paddingHorizontal: space.lg, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.controlSurface, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.fieldBorder, boxShadow: theme.dark ? '0px 4px 12px rgba(0,0,0,0.38)' : '0px 4px 12px rgba(0,0,0,0.08)' }}
                >
                  <Text style={{ color: theme.danger, fontSize: 13, fontWeight: '700' }}>{t('common.delete')}</Text>
                </Press>
              ) : null}
              {planEditorOpen ? (
                <Press
                  onPress={addPlanGroup}
                  accessibilityRole="button"
                  style={{ height: 44, paddingHorizontal: space.lg, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.controlSurface, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.fieldBorder, boxShadow: theme.dark ? '0px 4px 12px rgba(0,0,0,0.38)' : '0px 4px 12px rgba(0,0,0,0.08)' }}
                >
                  <Text style={{ color: theme.text, fontSize: 13, fontWeight: '700' }}>{t('common.add')}</Text>
                </Press>
              ) : null}
              <Press
                onPress={() => {
                  setPlanEditorOpen((open) => !open);
                  if (planEditorOpen) setSelectedPlanDays(new Set());
                }}
                accessibilityRole="button"
                style={{ height: 44, paddingHorizontal: space.lg, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.controlSurface, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.fieldBorder, boxShadow: theme.dark ? '0px 4px 12px rgba(0,0,0,0.38)' : '0px 4px 12px rgba(0,0,0,0.08)' }}
              >
                <Text style={{ color: theme.text, fontSize: 13, fontWeight: '700' }}>{planEditorOpen ? t('common.done') : t('common.edit')}</Text>
              </Press>
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
