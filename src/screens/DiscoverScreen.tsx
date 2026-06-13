// DiscoverScreen.tsx — the 发现 tab. A Mapbox 3D globe (SVG fallback) of routes
// (探索) or the user's journeys (旅程), with a draggable bottom sheet listing them
// and a per-POI detail card.
import React, { useMemo } from 'react';
import { View, Text, ScrollView, useWindowDimensions, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme, makeTheme } from '../theme/theme';
import { useNav } from '../nav/NavContext';
import { useI18n, TKey } from '../i18n';
import { EXPLORE_POIS, MEMORY_POIS, Poi } from '../data/pois';
import { Globe, MAPBOX_ENABLED } from '../components/globe';
import { GlassIconBtn } from '../components/Glass';
import { Icon } from '../components/Icon';
import { Press } from '../components/Press';
import { FilterChip } from '../components/Chip';
import { PoiRow } from '../components/ListRow';
import { TrailSheet, TrailSheetHandle } from '../components/Sheet';
import { SelectedPoiCard } from './JourneyCard';
import { KPState, KPSkeletonLine } from '../components/State';
import { elevFloat } from '../theme/shadow';

// Chips carry a stable id (used by the filter logic + as the i18n key suffix);
// their display label is resolved per-language at render time.
const EXPLORE_CHIPS = ['all', 'easy', 'highAsc', 'near', 'mine'] as const;
const MEMORY_CHIPS = ['all', 'planning', 'ongoing', 'completed', 'fav'] as const;

function num(s: string) {
  const m = s.replace(/,/g, '').match(/[\d.]+/);
  return m ? parseFloat(m[0]) : 0;
}

// One pin per place: journeys that share a trailhead are grouped (再次出发 clones
// a route at the same coordinate, so the new plan would otherwise sit exactly on
// top of the old memory and hide it). The representative pin shows the most
// "active" status — an in-progress trip wins over an upcoming plan over a past
// memory — and a badge with the group size.
const STATUS_RANK: Record<string, number> = { ongoing: 0, planning: 1, completed: 2 };
const poiRank = (p: Poi) => (p.status ? STATUS_RANK[p.status] ?? 3 : 3);
const placeKey = (p: Poi) => `${(p.lng ?? 0).toFixed(4)},${(p.lat ?? 0).toFixed(4)}`;

function groupByPlace(list: Poi[]): { rep: Poi; group: Poi[] }[] {
  const byPlace = new Map<string, Poi[]>();
  for (const p of list) {
    const k = placeKey(p);
    const arr = byPlace.get(k);
    if (arr) arr.push(p);
    else byPlace.set(k, [p]);
  }
  return [...byPlace.values()].map((group) => ({
    rep: group.reduce((best, p) => (poiRank(p) < poiRank(best) ? p : best), group[0]),
    group,
  }));
}

export function DiscoverScreen({ theme }: { theme: Theme }) {
  const nav = useNav();
  const { t } = useI18n();
  const chipLabel = (id: string) =>
    t(`discover.chip${id.charAt(0).toUpperCase()}${id.slice(1)}` as TKey);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isMemory = nav.subTab === 'memory';
  const [chip, setChip] = React.useState(0);
  // When a clustered map pin is tapped, the same journey-list sheet is scoped to
  // that trailhead (coordinate key) — only the header copy changes to 这个地点的旅程.
  const [placeSel, setPlaceSel] = React.useState<string | null>(null);
  const sheetRef = React.useRef<TrailSheetHandle>(null);

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

  const basePois: Poi[] = useMemo(() => {
    if (isMemory) {
      return [...nav.extraJourneys, ...MEMORY_POIS]
        .filter((p) => !nav.removedIds.includes(p.id))
        .map((p) => nav.merged(p));
    }
    return [...nav.savedRoutes, ...EXPLORE_POIS];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMemory, nav.extraJourneys, nav.savedRoutes, nav.removedIds, nav.journeyPatch]);

  const pois = useMemo(() => {
    let list = [...basePois];
    if (isMemory) {
      const key = MEMORY_CHIPS[chip];
      if (key === 'planning') list = list.filter((p) => p.status === 'planning');
      else if (key === 'ongoing') list = list.filter((p) => p.status === 'ongoing');
      else if (key === 'completed') list = list.filter((p) => p.status === 'completed');
      else if (key === 'fav') list = list.filter((p) => p.fav);
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

  // In place view the header ＋ means 再次出发 on this trailhead: seed the new
  // journey flow with the place's route (most-active journey as the template).
  // Drawn from basePois so it survives chip filtering hiding every row.
  const placePreset = useMemo(() => {
    if (!placeSel) return undefined;
    return basePois
      .filter((p) => placeKey(p) === placeSel)
      .reduce<Poi | undefined>((best, p) => (!best || poiRank(p) < poiRank(best) ? p : best), undefined);
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
  const tabSpace = insets.bottom + 76; // floating tab bar clearance (when shown)
  // Apple-Maps-style detents. The tab bar hides while the sheet is open, so the
  // sheet reaches the very bottom; the largest detent stops ~12% below the top
  // so a strip of map stays visible (a full-height card felt too tall).
  const collapsed = 120; // peek
  const mid = Math.round(height * 0.52); // ~half screen (Apple "medium")
  const full = Math.round(height * 0.88); // large detent (~12% map peek at top)

  // The sheet is hidden by default; a pull-up pill peeks above the tab bar and
  // opens it. Selecting a POI on the globe also opens it (to show that card).
  const sheetVisible = nav.sheetOpen || !!nav.pointInfo;

  // sheet stats
  const totalKm = useMemo(() => displayPois.reduce((s, p) => s + num(p.dist), 0), [displayPois]);

  const listState = 'normal'; // could be wired to a tweak later

  // List-mode header (kicker + title + filter/add + chips). When a POI is
  // selected the sheet switches to compact mode and this header is not shown —
  // the card's hero fills the top and the floating grab handle dismisses it.
  const header = (
    <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        {placeSel ? (
          // place view: the title doubles as a "‹ 我的旅程" back breadcrumb; the
          // filter chips below stay live and filter within this trailhead.
          <Press onPress={() => setPlaceSel(null)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
            <Icon name="chevronL" color={theme.accent} size={16} />
            <View style={{ flexShrink: 1 }}>
              <Text style={{ fontSize: 11, fontWeight: '600', color: theme.accent, letterSpacing: 0.4 }}>{t('discover.titleMyJourneys')}</Text>
              <Text numberOfLines={1} style={{ fontSize: 18, fontWeight: '700', color: theme.text, marginTop: 2 }}>
                {t('discover.titlePlace')}
              </Text>
              <Text style={{ fontSize: 11.5, color: theme.text2, marginTop: 2 }}>
                {t('discover.countJourneys', { count: displayPois.length, km: Math.round(totalKm) })}
              </Text>
            </View>
          </Press>
        ) : (
          <View>
            <Text style={{ fontSize: 11, fontWeight: '600', color: theme.text2, letterSpacing: 0.6, textTransform: 'uppercase' }}>
              {isMemory ? t('discover.kickerMyJourneys') : t('discover.kickerFeatured')}
            </Text>
            <Text style={{ fontSize: 18, fontWeight: '700', color: theme.text, marginTop: 2 }}>
              {isMemory ? t('discover.titleMyJourneys') : t('discover.titleFeatured')}
            </Text>
            <Text style={{ fontSize: 11.5, color: theme.text2, marginTop: 2 }}>
              {isMemory
                ? t('discover.countJourneys', { count: displayPois.length, km: Math.round(totalKm) })
                : t('discover.countRoutes', { count: displayPois.length })}
            </Text>
          </View>
        )}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 2 }}>
          <Press
            onPress={() => nav.showToast(t('discover.toastFilter'))}
            style={{
              width: 30,
              height: 30,
              borderRadius: 15,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
            }}
          >
            <Icon name="filter" color={theme.text2} size={17} />
          </Press>
          <Press
            onPress={() =>
              placeSel ? nav.openNewJourney(placePreset) : isMemory ? nav.openNewJourney() : nav.openAddRoute()
            }
            style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.accent }}
          >
            <Icon name="plus" color="#fff" size={18} />
          </Press>
        </View>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 6, paddingTop: 12, paddingRight: 16 }}
      >
        {(isMemory ? MEMORY_CHIPS : EXPLORE_CHIPS).map((c, i) => (
          // chips filter the current list — within this trailhead in place view,
          // or the whole journey list otherwise.
          <FilterChip key={c} theme={theme} label={chipLabel(c)} active={chip === i} onPress={() => setChip(i)} />
        ))}
      </ScrollView>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      {/* full-screen interactive map (Apple-Maps style) — subtabs, top-right
          chrome, locate button and the bottom sheet all float on top of it */}
      <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
        <Globe
          theme={theme}
          size={globeSize}
          pois={placeGroups.map(({ rep, group }) => ({ id: rep.id, lng: rep.lng, lat: rep.lat, status: rep.status, mine: rep.mine, tone: rep.tone, count: group.length }))}
          activePoiId={activeRepId}
          onPoiPress={(id) => {
            const group = repIdToGroup.get(id);
            if (!group) return;
            // One journey here → open its card. Several → scope the journey-list
            // sheet to this trailhead so the user can pick the past memory vs. the
            // 再次出发 plan (same list, just a 这个地点的旅程 header).
            if (group.length === 1) {
              setPlaceSel(null);
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
      <View style={{ position: 'absolute', top: insets.top + 8, left: 0, right: 0, alignItems: 'center' }}>
        <View
          style={{
            flexDirection: 'row',
            padding: 3,
            borderRadius: 16,
            gap: 3,
            backgroundColor: chromeTheme.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
          }}
        >
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
      </View>

      {/* top-right chrome */}
      <View style={{ position: 'absolute', top: insets.top + 8, right: 16, gap: 10 }}>
        <GlassIconBtn theme={chromeTheme} onPress={() => nav.showToast(t('discover.toastSearch'))}>
          <Icon name="search" color={chromeTheme.text} size={19} />
        </GlassIconBtn>
        <GlassIconBtn theme={chromeTheme} onPress={() => nav.showToast(t('discover.toastNorth'))}>
          <View style={{ alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="compassN" color={chromeTheme.text} size={22} />
          </View>
        </GlassIconBtn>
      </View>

      {/* locate button — sits above the pull-up pill (closed) or the open sheet */}
      <View style={{ position: 'absolute', right: 16, bottom: sheetVisible ? mid + 16 : tabSpace + 56 }}>
        <GlassIconBtn theme={chromeTheme} size={44} strong onPress={() => nav.showToast(t('discover.toastLocate'))}>
          <Icon name="locate" color={chromeTheme.accent} size={21} />
        </GlassIconBtn>
      </View>

      {/* closed state: a pull-up pill that opens the sheet (matches prototype) */}
      {!sheetVisible && (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: tabSpace + 8, alignItems: 'center' }}>
          <Press
            onPress={() => nav.openSheet()}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingVertical: 8,
              paddingHorizontal: 18,
              borderRadius: 999,
              backgroundColor: chromeTheme.surfaceTop,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: chromeTheme.border,
              ...elevFloat(chromeTheme),
            }}
          >
            <View style={{ transform: [{ rotate: '180deg' }] }}>
              <Icon name="chevronDown" color={chromeTheme.accent} size={15} />
            </View>
            <Text style={{ fontSize: 13, fontWeight: '600', color: chromeTheme.text }}>{isMemory ? t('discover.pillMyJourneys') : t('discover.pillFeatured')}</Text>
          </Press>
        </View>
      )}

      {/* draggable sheet — only mounted when open (default is the pill above) */}
      {sheetVisible && (
      <TrailSheet
        ref={sheetRef}
        // remount when switching between the list sheet and a POI card so the
        // detent set / start position reset cleanly
        key={`${nav.subTab}-${nav.pointInfo ? 'card' : 'list'}`}
        theme={theme}
        // the POI card has no tiny peek detent — swiping down past "normal" just
        // closes it; the list sheet keeps its collapsed peek
        snapHeights={nav.pointInfo ? [mid, full] : [collapsed, mid, full]}
        initialIndex={nav.pointInfo ? 0 : 1}
        header={header}
        compact={!!nav.pointInfo}
        bottomOffset={0}
        onDismiss={() => {
          setPlaceSel(null);
          nav.closeSheet();
        }}
      >
        <View style={{ paddingHorizontal: 16 }}>
          {nav.pointInfo ? (
            <SelectedPoiCard theme={theme} poi={nav.pointInfo} />
          ) : listState === 'normal' ? (
            displayPois.length === 0 ? (
              <KPState
                theme={theme}
                icon={isMemory ? 'route' : 'search'}
                title={isMemory ? t('discover.emptyJourneysTitle') : t('discover.emptyRoutesTitle')}
                body={isMemory ? t('discover.emptyJourneysBody') : t('discover.emptyRoutesBody')}
              />
            ) : (
              displayPois.map((p) => <PoiRow key={p.id} theme={theme} poi={p} onPress={() => nav.openPoint(p)} />)
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
      </TrailSheet>
      )}
    </View>
  );
}
