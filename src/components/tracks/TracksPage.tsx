// TracksPage.tsx — the track library.
//
// A track exists whether or not a journey uses it, so the page's job is to show
// both halves: the ones bound to a journey and the ones still waiting. Because a
// journey points at a library row rather than copying it, deleting here unlinks
// every journey that referenced it, which is why the count is shown before the
// confirm and not after.
//
// The layout follows the gear pages: a white `featureSurface` canvas, open rows
// with no card or thumbnail, two summary totals that follow the visible rows,
// and sticky 全部 / 已应用 / 未使用 tabs in place of the old filter popover.
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  InteractionManager,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type GestureResponderEvent,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ReAnimated, { runOnJS, useAnimatedRef, useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRecordTrail } from '../../trail/trailRoutes';
import { offlineMapsAvailable, openOfflineMapManager } from '../../lib/offlineMaps';
import {
  AppActionDialog,
  AppHeaderSearch,
  AppProgressBar,
  DetailPage,
  layout,
  radius,
  space,
  type,
} from '../../design-system';
import { Icon } from '../Icon';
import type { IconName } from '../Icon';
import { Press } from '../Press';
import { Glass } from '../Glass';
import { GearMenuTransition } from '../gear/GearMenuTransition';
import {
  BottomControl,
  CompactMenuRow,
  FloatingMenu,
  MenuCaption,
  MenuRow,
  SelectMark,
  SkeletonBar,
  SummaryStat,
} from '../gear/GearItemsList';
import { measureAnchor, type MenuAnchor } from '../gear/AddGearMenu';
import { GearEmptyState } from '../gear/GearEmptyState';
import { useData } from '../../data/DataContext';
import { useNav } from '../../nav/NavContext';
import { useI18n } from '../../i18n';
import type { TKey } from '../../i18n';
import { MONO } from '../../theme/fonts';
import { Theme } from '../../theme/theme';
import type { Poi } from '../../data/pois';
import { Track } from '../../data/tracks';
import { formatTrackAscent, formatTrackDistance } from '../../lib/trackParser';
import { importTrackFiles, pickTrackFiles, type TrackImportOutcome } from '../../lib/trackImport';
import { exportTracks } from '../../lib/trackExport';

export type TrackFilter = 'all' | 'unused' | 'applied';
export type TrackSort = 'created' | 'distance' | 'ascent' | 'name';

const SORT_STORAGE_KEY = '@kaipa/tracks/sort-v1';
const SORT_MODES: TrackSort[] = ['created', 'distance', 'ascent', 'name'];
const INITIAL_RENDER_COUNT = 12;
const TAB_BAR_HEIGHT = layout.fieldHeight;
const ROW_MIN_HEIGHT = layout.listRowMinHeight;
// The plus square in the first empty placeholder; the gear rows' thumb is the same size.
const PLACEHOLDER_SQUARE = layout.fieldHeight + space.xs;

// Sort choices survive navigation, the way the gear lists persist theirs.
function usePersistedTrackSort() {
  const [sort, setSortState] = useState<TrackSort>('created');
  const changedRef = useRef(false);
  React.useEffect(() => {
    let active = true;
    AsyncStorage.getItem(SORT_STORAGE_KEY).then((saved) => {
      if (active && !changedRef.current && (SORT_MODES as string[]).includes(saved ?? '')) {
        setSortState(saved as TrackSort);
      }
    }).catch(() => {});
    return () => { active = false; };
  }, []);
  const setSort = useCallback((next: TrackSort) => {
    changedRef.current = true;
    setSortState(next);
    AsyncStorage.setItem(SORT_STORAGE_KEY, next).catch(() => {});
  }, []);
  return [sort, setSort] as const;
}

// "26.40 km" → { value, unit }, so the unit can be set smaller than the number.
const splitUnit = (text: string) => {
  const at = text.lastIndexOf(' ');
  return at < 0 ? { value: text, unit: undefined as string | undefined } : { value: text.slice(0, at), unit: text.slice(at + 1) };
};

const formatKm = (meters: number, resolved: 'zh' | 'en') => {
  const km = meters / 1000;
  return km.toLocaleString(resolved === 'zh' ? 'zh-CN' : 'en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
};

const formatMeters = (meters: number, resolved: 'zh' | 'en') => {
  return Math.round(meters).toLocaleString(resolved === 'zh' ? 'zh-CN' : 'en-US');
};

// Short record dates like 10月18日; en falls back to "Oct 18".
function formatTrackDate(iso: string | undefined, resolved: 'zh' | 'en') {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  if (resolved === 'zh') return `${date.getMonth() + 1}月${date.getDate()}日`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// The list row follows GearSetsList's SetRow: open on the page, distance alone
// in the right column so it scans as one, ascent, date and tags in one caption.
function TrackRow({
  theme,
  track,
  appliedCount,
  selectMode,
  selected,
  dateText,
  onPress,
  onLongPress,
}: {
  theme: Theme;
  track: Track;
  appliedCount: number;
  selectMode: boolean;
  selected: boolean;
  dateText: string;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const { t } = useI18n();
  const ignorePressAfterLongPress = useRef(false);
  const handleLongPress = () => {
    ignorePressAfterLongPress.current = true;
    onLongPress();
    setTimeout(() => { ignorePressAfterLongPress.current = false; }, 700);
  };
  const handlePress = () => {
    if (ignorePressAfterLongPress.current) {
      ignorePressAfterLongPress.current = false;
      return;
    }
    onPress();
  };

  const hasGeometry = track.distM != null || (track.ascM != null && track.ascM > 0);
  const distParts = splitUnit(track.distM != null ? formatTrackDistance(track.distM) : '—');
  const facts = [
    track.ascM != null && track.ascM > 0 ? (
      <View key="asc" style={{ flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: space.xxs }}>
        <Icon name="arrowUp" color={theme.text2} size={12} strokeWidth={2} />
        <Text style={[type.caption, { fontFamily: MONO, fontVariant: ['tabular-nums'], color: theme.text2 }]}>{formatTrackAscent(track.ascM)}</Text>
      </View>
    ) : null,
    dateText ? (
      <Text key="date" numberOfLines={1} style={[type.caption, { flexShrink: 1, color: theme.text2 }]}>{dateText}</Text>
    ) : null,
    appliedCount > 0 ? (
      <View key="applied" style={{ flexShrink: 0, paddingHorizontal: space.xxs + 2, paddingVertical: 1, borderRadius: radius.control / 2, backgroundColor: theme.accentSoft }}>
        <Text style={[type.micro, { fontWeight: '600', color: theme.accent }]}>{t('tracks.usage.pillApplied', { count: appliedCount })}</Text>
      </View>
    ) : null,
    track.fileFormat && !selectMode ? (
      <View key="fmt" style={{ flexShrink: 0, paddingHorizontal: space.xxs + 1, paddingVertical: 1, borderRadius: radius.control / 2, backgroundColor: theme.fieldSurface }}>
        <Text style={[type.tiny, { fontFamily: MONO, fontWeight: '800', letterSpacing: 0.4, color: theme.text2 }]}>{track.fileFormat.toUpperCase()}</Text>
      </View>
    ) : null,
  ].filter(Boolean);

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={handleLongPress}
      accessibilityRole="button"
      accessibilityState={selectMode ? { selected } : undefined}
      accessibilityLabel={[
        track.name || t('tracks.untitled'),
        track.distM != null ? formatTrackDistance(track.distM) : null,
        track.ascM != null && track.ascM > 0 ? formatTrackAscent(track.ascM) : null,
        appliedCount > 0 ? t('tracks.usage.applied', { count: appliedCount }) : null,
      ].filter(Boolean).join(', ')}
      style={({ pressed }) => [{
        minHeight: ROW_MIN_HEIGHT,
        marginHorizontal: -space.sm,
        paddingHorizontal: space.sm,
        paddingVertical: space.sm + 2,
        borderRadius: radius.card,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
        backgroundColor: selected ? theme.accentSofter : pressed ? theme.fieldSurface : 'transparent',
      }]}
    >
      <View style={{ flex: 1, minWidth: 0, gap: space.xs }}>
        <Text numberOfLines={2} style={[type.cardTitle, { lineHeight: 20, color: theme.text }]}>
          {track.name || t('tracks.untitled')}
        </Text>
        {facts.length ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, minWidth: 0 }}>{facts}</View>
        ) : null}
      </View>
      <View style={{ flexShrink: 0, alignItems: 'flex-end' }}>
        <Text numberOfLines={1} style={[type.metric, { fontVariant: ['tabular-nums'], color: track.distM != null ? theme.text : theme.text3 }]}>
          {distParts.value}
          {distParts.unit ? <Text style={[type.liveUnit, { color: theme.text2 }]}>{` ${distParts.unit}`}</Text> : null}
        </Text>
        {!hasGeometry ? (
          <Text style={[type.caption, { marginTop: space.xxs, color: theme.text3 }]}>{t('tracks.meta.noGeometry')}</Text>
        ) : null}
      </View>
      {selectMode ? <SelectMark theme={theme} selected={selected} /> : null}
    </Pressable>
  );
}

function TrackSkeletonRow({ theme }: { theme: Theme }) {
  return (
    <View style={{ minHeight: ROW_MIN_HEIGHT, marginHorizontal: -space.sm, paddingHorizontal: space.sm, paddingVertical: space.sm + 2, flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
      <View style={{ flex: 1, gap: space.xs }}>
        <SkeletonBar theme={theme} width="64%" height={15} />
        <SkeletonBar theme={theme} width="42%" height={11} />
      </View>
      <SkeletonBar theme={theme} width="16%" height={15} />
    </View>
  );
}

// Same shape as the row, no thumbnail square: the first card is the add action
// and the two behind it hint at the list that will fill in.
function TrackEmptyPlaceholders({ theme, onPress }: { theme: Theme; onPress: (event: GestureResponderEvent) => void }) {
  const { t } = useI18n();
  const dashed = {
    minHeight: ROW_MIN_HEIGHT,
    borderRadius: radius.feature,
    padding: space.sm,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    borderWidth: 1.5,
    borderStyle: 'dashed' as const,
    borderColor: theme.border,
    marginBottom: space.sm,
  };
  return (
    <View>
      <Press accessibilityRole="button" accessibilityLabel={t('tracks.empty.addFirst')} onPress={onPress} style={dashed}>
        <View style={{ width: PLACEHOLDER_SQUARE, height: PLACEHOLDER_SQUARE, borderRadius: radius.card, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.fieldSurface }}>
          <Icon name="plus" color={theme.text2} size={24} strokeWidth={2} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: space.xxs }}>
          <Text numberOfLines={1} style={[type.cardTitle, { lineHeight: 21, color: theme.text }]}>{t('tracks.empty.addFirst')}</Text>
          <Text numberOfLines={2} style={[type.hint, { color: theme.text2 }]}>{t('tracks.empty.addFirstSub')}</Text>
        </View>
      </Press>
      {[0.55, 0.28].map((opacity) => (
        <View key={opacity} pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={[dashed, { opacity }]}>
          <View style={{ flex: 1, gap: space.sm }}>
            <SkeletonBar theme={theme} width="64%" height={15} />
            <SkeletonBar theme={theme} width="42%" height={11} />
          </View>
        </View>
      ))}
    </View>
  );
}

function TrackTabBar({ theme, tabs, activeKey, onSelect }: {
  theme: Theme;
  tabs: { key: TrackFilter; label: string; count: number }[];
  activeKey: TrackFilter;
  onSelect: (key: TrackFilter) => void;
}) {
  return (
    <View style={{ height: TAB_BAR_HEIGHT, backgroundColor: theme.featureSurface, paddingHorizontal: layout.pagePadding, flexDirection: 'row', alignItems: 'center', gap: space.lg + 2 }}>
      {tabs.map((tab) => {
        const active = tab.key === activeKey;
        return (
          <Press
            key={tab.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onSelect(tab.key)}
            style={{ height: TAB_BAR_HEIGHT, justifyContent: 'center' }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.xxs }}>
              <Text style={[type.cardTitle, { fontWeight: active ? '800' : '600', color: active ? theme.text : theme.text2 }]}>{tab.label}</Text>
              <Text style={[type.micro, { fontFamily: MONO, fontVariant: ['tabular-nums'], color: theme.text3 }]}>{tab.count}</Text>
            </View>
            {active ? (
              <View pointerEvents="none" style={{ position: 'absolute', left: 0, bottom: space.xxs, height: 3, minWidth: space.md, alignSelf: 'flex-start', borderRadius: radius.pill, backgroundColor: theme.accent }} />
            ) : null}
          </Press>
        );
      })}
    </View>
  );
}

// The add pill's menu: two rows that go straight into their step, anchored next
// to the control that opened it, like AddGearMenu.
function TrackAnchoredMenu({ theme, visible, anchor, title, rows, onClose }: {
  theme: Theme;
  visible: boolean;
  anchor: MenuAnchor | null;
  title: string;
  rows: { key: string; icon: IconName; label: string; subtitle: string; onPress: () => void }[];
  onClose: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const MENU_WIDTH = 250;
  const EDGE = space.sm - 2;
  const GAP = space.xs;
  const rect = anchor ?? { x: EDGE, y: height, width: 0, height: 0 };
  const above = rect.y + rect.height / 2 > height / 2;
  const alignLeft = rect.x + rect.width / 2 < width / 2;
  const vertical = above ? { bottom: height - rect.y + GAP } : { top: rect.y + rect.height + GAP };
  const horizontal = alignLeft
    ? { left: Math.min(Math.max(EDGE, rect.x), width - MENU_WIDTH - EDGE) }
    : { right: Math.min(Math.max(EDGE, width - rect.x - rect.width), width - MENU_WIDTH - EDGE) };
  return (
    <GearMenuTransition
      theme={theme}
      visible={visible}
      onClose={onClose}
      placement={above ? 'bottom' : 'top'}
      backdropColor="transparent"
      positionStyle={{
        position: 'absolute',
        ...vertical,
        ...horizontal,
        width: MENU_WIDTH,
        borderRadius: radius.feature,
        boxShadow: theme.dark ? '0px 14px 38px rgba(0,0,0,0.50)' : '0px 14px 38px rgba(0,0,0,0.16)',
      }}
    >
      <Glass solidOnAndroid theme={theme} radius={radius.feature} intensity={78}>
        <View style={{ paddingTop: space.sm, paddingBottom: space.xs, backgroundColor: theme.dark ? 'rgba(32,32,35,0.64)' : 'rgba(255,255,255,0.72)' }}>
          <Text style={[type.eyebrow, { paddingHorizontal: space.xl, paddingBottom: space.xxs, color: theme.text2 }]}>{title}</Text>
          {rows.map((row) => (
            <Press key={row.key} accessibilityRole="button" onPress={row.onPress} style={{ minHeight: layout.fieldHeight + space.sm, paddingHorizontal: space.lg, flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ width: space.xl, alignItems: 'center' }}><Icon name={row.icon} color={theme.text} size={20} strokeWidth={1.9} /></View>
              <View style={{ flex: 1, marginLeft: space.sm, minWidth: 0 }}>
                <Text numberOfLines={1} style={[type.body, { color: theme.text }]}>{row.label}</Text>
                <Text numberOfLines={1} style={[type.caption, { marginTop: space.xxs, color: theme.text2 }]}>{row.subtitle}</Text>
              </View>
            </Press>
          ))}
        </View>
      </Glass>
    </GearMenuTransition>
  );
}

function TrackSortMenu({ theme, visible, title, onClose, children }: { theme: Theme; visible: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <GearMenuTransition
      theme={theme}
      visible={visible}
      onClose={onClose}
      placement="bottom"
      backdropColor="transparent"
      positionStyle={{
        position: 'absolute',
        right: layout.pagePadding,
        bottom: Math.max(insets.bottom, space.md) + space.xxs + (layout.iconButton + space.xs) + space.sm,
        width: 210,
        borderRadius: radius.feature,
        boxShadow: theme.dark ? '0px 14px 38px rgba(0,0,0,0.50)' : '0px 14px 38px rgba(0,0,0,0.16)',
      }}
    >
      <Glass solidOnAndroid theme={theme} radius={radius.feature} intensity={78}>
        <View style={{ paddingTop: space.sm, paddingBottom: space.xs, backgroundColor: theme.dark ? 'rgba(32,32,35,0.64)' : 'rgba(255,255,255,0.72)' }}>
          <Text style={[type.eyebrow, { paddingHorizontal: space.xl, paddingBottom: space.xxs, color: theme.text2 }]}>{title}</Text>
          {children}
        </View>
      </Glass>
    </GearMenuTransition>
  );
}

export function TracksPage({
  theme,
  onBack,
  onOpenTrack,
  entryVariant,
}: {
  theme: Theme;
  onBack: () => void;
  onOpenTrack: (track: Track) => void;
  entryVariant?: 'push' | 'continuationX' | 'continuationY';
}) {
  const { t, resolved } = useI18n();
  const nav = useNav();
  const recordTrail = useRecordTrail();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const data = useData();

  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [filter, setFilter] = useState<TrackFilter>('all');
  const [sort, setSort] = usePersistedTrackSort();
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  // Import is the one operation here that runs for minutes and can partly fail;
  // it reports inline under the summary, rendered below.
  const [progress, setProgress] = useState<{ done: number; total: number; fileName: string } | null>(null);
  const [summary, setSummary] = useState<{ ok: number; failed: TrackImportOutcome[] } | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addAnchor, setAddAnchor] = useState<MenuAnchor | null>(null);

  // Which journeys feed off each track. Built once per journey change rather than
  // per row so a long library stays linear.
  const usageByTrack = useMemo(() => {
    const map = new Map<string, Poi[]>();
    for (const journey of data.journeys) {
      if (!journey.trackId) continue;
      const list = map.get(journey.trackId);
      if (list) list.push(journey);
      else map.set(journey.trackId, [journey]);
    }
    return map;
  }, [data.journeys]);

  const usedIds = useMemo(() => {
    const set = new Set<string>();
    usageByTrack.forEach((_, trackId) => set.add(trackId));
    return set;
  }, [usageByTrack]);

  const needle = query.trim().toLocaleLowerCase();
  const searchMatches = useMemo(() => data.tracks.filter((track) => {
    if (!needle) return true;
    return track.name.toLocaleLowerCase().includes(needle)
      || (track.fileName ?? '').toLocaleLowerCase().includes(needle);
  }), [data.tracks, needle]);
  const tabCounts = useMemo(() => {
    let applied = 0;
    for (const track of searchMatches) if (usedIds.has(track.id)) applied += 1;
    return { all: searchMatches.length, applied, unused: searchMatches.length - applied };
  }, [searchMatches, usedIds]);
  const rows = useMemo(() => {
    const matches = searchMatches.filter((track) => {
      const used = usedIds.has(track.id);
      if (filter === 'applied') return used;
      if (filter === 'unused') return !used;
      return true;
    });
    const sorted = [...matches];
    if (sort === 'distance') sorted.sort((a, b) => (b.distM ?? 0) - (a.distM ?? 0));
    else if (sort === 'ascent') sorted.sort((a, b) => (b.ascM ?? 0) - (a.ascM ?? 0));
    else if (sort === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
    else sorted.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
    return sorted;
  }, [searchMatches, usedIds, filter, sort]);

  // Rows mount in batches: the library arrives after the push animation and
  // mounting all of it in one frame can stall Android's first paint.
  const [visibleRowCount, setVisibleRowCount] = useState(INITIAL_RENDER_COUNT);
  React.useEffect(() => {
    setVisibleRowCount(Math.min(INITIAL_RENDER_COUNT, rows.length));
  }, [rows]);
  React.useEffect(() => {
    if (visibleRowCount >= rows.length) return;
    const task = InteractionManager.runAfterInteractions(() => {
      setVisibleRowCount((count) => Math.min(count + INITIAL_RENDER_COUNT, rows.length));
    });
    return () => task.cancel();
  }, [rows.length, visibleRowCount]);

  const renderedRows = rows.slice(0, visibleRowCount);
  const selectableIds = useMemo(() => rows.map((track) => track.id), [rows]);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id));

  const toggleSelected = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const exitSelect = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };
  const enterSelect = (id: string) => {
    setSelectMode(true);
    setSelectedIds(new Set([id]));
  };
  const toggleAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(selectableIds));
  };
  const closeSearch = () => {
    setQuery('');
    setSearchOpen(false);
  };
  const clearFilters = () => {
    setQuery('');
    setSearchOpen(false);
    setFilter('all');
  };
  // Menus close first and act on a small delay so the pressed row is visible
  // for a beat before the page reacts, matching the gear list menus.
  const closeMoreThen = (action: () => void) => {
    setMoreOpen(false);
    setTimeout(action, 140);
  };
  const openAddMenu = (event: GestureResponderEvent) => {
    measureAnchor(event).then((anchor) => {
      setAddAnchor(anchor);
      setAddOpen(true);
    });
  };

  // Totals follow what is on screen: the current tab and search, or, in
  // selection mode, just the selected rows.
  const loadingSkeleton = data.tracksLoading && !data.tracks.length;
  const libraryEmpty = data.tracks.length === 0;
  const selectedTracks = selectMode && selectedIds.size ? data.tracks.filter((track) => selectedIds.has(track.id)) : null;
  const statTracks = selectedTracks || rows;
  const statEmpty = libraryEmpty || (!selectedTracks && !rows.length);
  const totalDistM = statTracks.reduce((sum, track) => sum + (track.distM ?? 0), 0);
  const totalAscM = statTracks.reduce((sum, track) => sum + (track.ascM ?? 0), 0);
  const statLabel = (totalKey: TKey, selectedKey: TKey, plainKey: TKey) => {
    if (selectedTracks) return t(selectedKey);
    if (filter !== 'all' || needle) return t(plainKey);
    return t(totalKey);
  };
  const countText = (filter !== 'all' || needle)
    ? t('tracks.filteredCount', { count: rows.length, total: data.tracks.length })
    : `${data.tracks.length} ${t('tracks.unitTracks')}`;
  const sortLabel = sort === 'created'
    ? t('tracks.sort.created')
    : sort === 'distance'
      ? t('tracks.sort.distance')
      : sort === 'ascent'
        ? t('tracks.sort.ascent')
        : t('tracks.sort.name');

  const scrollRef = useAnimatedRef<ReAnimated.ScrollView>();
  const headerHeight = useSharedValue(0);
  const collapsedValue = useSharedValue(false);
  const [collapsed, setCollapsed] = useState(false);
  const onPageScroll = useAnimatedScrollHandler((event) => {
    const next = headerHeight.value > 0 && event.contentOffset.y > headerHeight.value - space.xs;
    if (next !== collapsedValue.value) {
      collapsedValue.value = next;
      runOnJS(setCollapsed)(next);
    }
  });

  const confirmDelete = async () => {
    const ids = [...selectedIds];
    setBusy(true);
    await data.deleteTracks(ids);
    setBusy(false);
    setDeleteOpen(false);
    exitSelect();
    nav.showToast(t('tracks.toast.deleted', { count: ids.length }));
  };

  const runImport = async () => {
    if (progress) return;
    const files = await pickTrackFiles();
    // null is a cancelled picker, and the empty array is the picker handing back
    // only files no importer recognises — worth saying, since nothing else moves.
    if (!files) return;
    if (!files.length) {
      nav.showToast(t('tracks.import.unusable'));
      return;
    }
    setSummary(null);
    setProgress({ done: 0, total: files.length, fileName: files[0].name });
    const outcomes = await importTrackFiles(files, {
      userId: data.userId,
      t,
      createTrack: data.createTrack,
      onProgress: (done, total, fileName) => setProgress({ done, total, fileName }),
    });
    setProgress(null);
    // `done` counts the files already imported, so the total lands as the last
    // one finishes and a full success needs no card at all.
    const failed = outcomes.filter((outcome) => !outcome.ok);
    if (failed.length) setSummary({ ok: outcomes.length - failed.length, failed });
    if (outcomes.some((outcome) => outcome.archiveTrimmed)) nav.showToast(t('record.track.archiveTrimmed'));
    else if (!failed.length) nav.showToast(t('tracks.import.done', { count: outcomes.length }));
  };

  const exportZip = async () => {
    const chosen = data.tracks.filter((track) => selectedIds.has(track.id));
    if (!chosen.length || exporting) return;
    setExporting(true);
    try {
      await exportTracks(chosen);
      nav.showToast(t('tracks.export.done', { count: chosen.length }));
    } catch (error) {
      // Backing out of the share sheet is a decision, not a failure.
      if ((error as Error)?.message !== 'User did not share') {
        console.warn('[TracksPage] export failed:', error);
        nav.showToast(t('tracks.export.failed'));
      }
    } finally {
      setExporting(false);
    }
  };

  const canAdd = Platform.OS !== 'web';

  return (
    <DetailPage
      theme={theme}
      entryVariant={entryVariant}
      onBack={selectMode ? exitSelect : onBack}
      backgroundColor={theme.featureSurface}
      flatChrome
      scrollable={false}
      title={collapsed && !searchOpen ? t('tracks.pageTitle') : undefined}
      right={
        selectMode ? (
          <View style={{ flexDirection: 'row', gap: space.xs }}>
            <HeaderIconButton theme={theme} icon="checkAll" onPress={toggleAll} active={allSelected} label={t('common.selectAll')} />
            <HeaderIconButton theme={theme} icon="close" onPress={exitSelect} label={t('common.close')} />
          </View>
        ) : (
          <AppHeaderSearch
            theme={theme}
            open={searchOpen}
            value={query}
            placeholder={t('tracks.searchPlaceholder')}
            onChangeText={setQuery}
            onClose={closeSearch}
            actions={(
              <View style={{ flexDirection: 'row', gap: space.xs }}>
                <HeaderIconButton theme={theme} icon="search" onPress={() => setSearchOpen(true)} label={t('common.search')} />
                <HeaderIconButton theme={theme} icon="more" onPress={() => setMoreOpen(true)} label={t('tracks.action.manage')} />
              </View>
            )}
          />
        )
      }
      overlay={(
        <>
          <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
            <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: layout.pagePadding, paddingTop: space.xl, paddingBottom: Math.max(insets.bottom, space.md) + space.xxs, flexDirection: 'row', gap: space.sm, justifyContent: selectMode ? undefined : 'space-between' }}>
              {selectMode ? (
                <>
                  {selectedIds.size ? (
                    <Press
                      onPress={() => void exportZip()}
                      opacityTo={1}
                      accessibilityRole="button"
                      accessibilityLabel={t('tracks.action.exportZip')}
                      style={{
                        flex: 1,
                        height: layout.iconButton + space.xs,
                        borderRadius: radius.pill,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: space.xs,
                        backgroundColor: theme.controlSurface,
                        opacity: exporting ? 0.5 : 1,
                        boxShadow: theme.controlShadow,
                      }}
                    >
                      <Icon name="download" color={theme.text} size={18} strokeWidth={2.1} />
                      <Text numberOfLines={1} style={[type.cardTitle, { color: theme.text }]}>
                        {t('tracks.action.exportZip')}
                      </Text>
                    </Press>
                  ) : null}
                  <Press
                    onPress={selectedIds.size ? () => setDeleteOpen(true) : undefined}
                    accessibilityRole="button"
                    accessibilityLabel={selectedIds.size ? t('tracks.select.deleteConfirm', { count: selectedIds.size }) : t('tracks.select.deletePrompt')}
                    style={{
                      flex: 1,
                      height: layout.iconButton + space.xs,
                      borderRadius: radius.pill,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: selectedIds.size ? theme.danger : theme.controlSurface,
                      boxShadow: theme.controlShadow,
                    }}
                  >
                    <Text numberOfLines={1} style={[type.cardTitle, { color: selectedIds.size ? '#FFFFFF' : theme.text3 }]}>
                      {selectedIds.size ? t('tracks.select.deleteConfirm', { count: selectedIds.size }) : t('tracks.select.deletePrompt')}
                    </Text>
                  </Press>
                </>
              ) : libraryEmpty ? null : (
                <>
                  {canAdd ? (
                    <BottomControl theme={theme} icon="plus" label={t('tracks.action.add')} onPress={openAddMenu} primary />
                  ) : null}
                  <BottomControl theme={theme} icon="arrowDown" label={sortLabel} onPress={() => setSortOpen(true)} />
                </>
              )}
            </View>
          </View>

          <FloatingMenu theme={theme} visible={moreOpen} top={insets.top + layout.topBarHeight + space.md} width={Math.min(232, width - space.sm * 2)} onClose={() => setMoreOpen(false)}>
            <MenuCaption theme={theme} text={t('journey.section.manage')} />
            <MenuRow theme={theme} icon="checkAll" label={t('tracks.action.select')} onPress={() => closeMoreThen(() => { setSelectedIds(new Set()); setSelectMode(true); })} />
            {offlineMapsAvailable() ? (
              <>
                <MenuCaption theme={theme} text={t('trail.offline.title')} spaced />
                <MenuRow theme={theme} icon="download" label={t('trail.offline.manage')} onPress={() => closeMoreThen(openOfflineMapManager)} />
              </>
            ) : null}
          </FloatingMenu>

          <TrackSortMenu theme={theme} visible={sortOpen} title={t('tracks.sort.title')} onClose={() => setSortOpen(false)}>
            {([
              ['created', t('tracks.sort.created'), 'clock'],
              ['distance', t('tracks.sort.distance'), 'arrowDown'],
              ['ascent', t('tracks.sort.ascent'), 'arrowUp'],
              ['name', t('tracks.sort.name'), 'list'],
            ] as [TrackSort, string, IconName][]).map(([id, label, icon]) => (
              <CompactMenuRow key={id} theme={theme} icon={icon} label={label} selected={sort === id} onPress={() => { setSort(id); setSortOpen(false); }} />
            ))}
          </TrackSortMenu>

          {canAdd ? (
            <TrackAnchoredMenu
              theme={theme}
              visible={addOpen}
              anchor={addAnchor}
              title={t('tracks.action.add')}
              rows={[
                { key: 'import', icon: 'upload', label: t('tracks.add.import'), subtitle: t('tracks.add.importSub'), onPress: () => { setAddOpen(false); void runImport(); } },
                { key: 'record', icon: 'record', label: t('tracks.add.record'), subtitle: t('tracks.add.recordSub'), onPress: () => { setAddOpen(false); recordTrail(); } },
              ]}
              onClose={() => setAddOpen(false)}
            />
          ) : null}
        </>
      )}
    >
      <ReAnimated.ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        onScroll={onPageScroll}
        scrollEventThrottle={16}
        stickyHeaderIndices={libraryEmpty ? undefined : [1]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onTouchStart={searchOpen ? closeSearch : undefined}
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
      >
        <View onLayout={(event) => { headerHeight.value = event.nativeEvent.layout.height; }} style={{ paddingHorizontal: layout.pagePadding, paddingTop: space.xs, paddingBottom: space.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.sm }}>
            <Text numberOfLines={1} style={[type.pageTitle, { flexShrink: 1, color: theme.text }]}>
              {selectMode ? t('tracks.select.title', { count: selectedIds.size }) : t('tracks.pageTitle')}
            </Text>
            {!selectMode ? (
              <Text numberOfLines={1} style={[type.caption, { flexShrink: 1, fontFamily: MONO, fontVariant: ['tabular-nums'], color: theme.text3 }]}>{countText}</Text>
            ) : null}
          </View>

          <View style={{ flexDirection: 'row', gap: space.md, marginTop: space.lg }}>
            <SummaryStat
              theme={theme}
              label={statLabel('tracks.stat.distance', 'tracks.stat.selectedDistance', 'tracks.stat.shownDistance')}
              value={statEmpty ? '--' : formatKm(totalDistM, resolved)}
              suffix={statEmpty ? undefined : 'km'}
              empty={statEmpty}
            />
            <SummaryStat
              theme={theme}
              label={statLabel('tracks.stat.ascent', 'tracks.stat.selectedAscent', 'tracks.stat.shownAscent')}
              value={statEmpty ? '--' : formatMeters(totalAscM, resolved)}
              suffix={statEmpty ? undefined : 'm'}
              empty={statEmpty}
            />
          </View>

          {/* Import runs for minutes and can partly fail, so it reports inline
              under the summary instead of through a card or a modal; the list it
              is filling stays visible while it works. */}
          {progress || summary ? (
            <View style={{ marginTop: space.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.sm }}>
                <Text numberOfLines={1} style={[type.small, { flexShrink: 1, fontWeight: '700', color: summary ? theme.danger : theme.text }]}>
                  {progress
                    ? t('tracks.import.progress', { count: progress.total })
                    : t('tracks.import.partial', { ok: summary?.ok ?? 0, failed: summary?.failed.length ?? 0 })}
                </Text>
                {progress ? (
                  <Text style={[type.caption, { fontFamily: MONO, fontVariant: ['tabular-nums'], fontWeight: '700', color: theme.text2 }]}>
                    {`${progress.done}/${progress.total}`}
                  </Text>
                ) : summary ? (
                  <Press onPress={() => setSummary(null)} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('common.close')}>
                    <Icon name="close" color={theme.text3} size={16} strokeWidth={2.4} />
                  </Press>
                ) : null}
              </View>
              {progress ? (
                <>
                  <View style={{ marginTop: space.xs }}>
                    <AppProgressBar theme={theme} value={(progress.done / Math.max(1, progress.total)) * 100} />
                  </View>
                  <Text numberOfLines={1} style={{ marginTop: space.xs, fontFamily: MONO, fontSize: 11.5, color: theme.text3 }}>
                    {progress.fileName}
                  </Text>
                </>
              ) : null}
              {/* Naming the files that failed is the point of not aborting the batch —
                  the ones that landed are visible in the list below, the others are not.
                  The same name can appear twice (a file picked from two folders), so the
                  index is what makes the key unique. */}
              {summary?.failed.map(({ fileName, messageKey }, index) => (
                <Text key={`${fileName}-${index}`} numberOfLines={1} style={{ fontFamily: MONO, fontSize: 11.5, color: theme.text3, marginTop: space.xxs }}>
                  {messageKey ? `${fileName}  ${t(messageKey)}` : fileName}
                </Text>
              ))}
            </View>
          ) : null}
        </View>

        {!libraryEmpty ? (
          <TrackTabBar
            theme={theme}
            activeKey={filter}
            onSelect={setFilter}
            tabs={[
              { key: 'all', label: t('tracks.filter.all'), count: tabCounts.all },
              { key: 'applied', label: t('tracks.filter.applied'), count: tabCounts.applied },
              { key: 'unused', label: t('tracks.filter.unused'), count: tabCounts.unused },
            ]}
          />
        ) : <View />}

        {loadingSkeleton ? (
          <View style={{ paddingHorizontal: layout.pagePadding, paddingTop: space.xs }}>
            {[0, 1, 2].map((index) => <TrackSkeletonRow key={index} theme={theme} />)}
          </View>
        ) : libraryEmpty ? (
          <View style={{ paddingHorizontal: layout.pagePadding, paddingTop: space.sm }}>
            {canAdd ? (
              <TrackEmptyPlaceholders theme={theme} onPress={openAddMenu} />
            ) : (
              <GearEmptyState theme={theme} icon="route" title={t('tracks.empty.title')} />
            )}
          </View>
        ) : (
          <View style={{ paddingHorizontal: layout.pagePadding, paddingTop: space.xs }}>
            {renderedRows.length ? renderedRows.map((track) => (
              <TrackRow
                key={track.id}
                theme={theme}
                track={track}
                appliedCount={usageByTrack.get(track.id)?.length ?? 0}
                selectMode={selectMode}
                selected={selectedIds.has(track.id)}
                dateText={formatTrackDate(track.startedAt ?? track.createdAt, resolved)}
                onPress={() => (selectMode ? toggleSelected(track.id) : onOpenTrack(track))}
                onLongPress={() => enterSelect(track.id)}
              />
            )) : (
              <GearEmptyState
                theme={theme}
                icon="search"
                title={t('tracks.empty.filteredTitle')}
                actionLabel={t('tracks.empty.clearFilters')}
                actionIcon="close"
                onAction={clearFilters}
              />
            )}
          </View>
        )}      </ReAnimated.ScrollView>

      <AppActionDialog
        theme={theme}
        visible={deleteOpen}
        title={t('tracks.select.deleteTitle')}
        message={t('tracks.select.deleteMessage')}
        confirmLabel={t('tracks.select.deleteConfirm', { count: selectedIds.size })}
        cancelLabel={t('common.cancel')}
        destructive
        confirming={busy}
        confirmIcon="trash"
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => void confirmDelete()}
      />
    </DetailPage>
  );
}

function HeaderIconButton({ theme, icon, onPress, label, active = false }: { theme: Theme; icon: IconName; onPress: () => void; label: string; active?: boolean }) {
  return (
    <Press accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: active }} onPress={onPress} style={{ width: layout.iconButton, height: layout.iconButton, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} color={active ? theme.accent : theme.text} size={25} strokeWidth={2.2} />
    </Press>
  );
}
