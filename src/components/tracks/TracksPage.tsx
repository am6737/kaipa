// TracksPage.tsx — the track library.
//
// A track exists whether or not a journey uses it, so the page's job is to show
// both halves: the ones bound to a journey and the ones still waiting. Because a
// journey points at a library row rather than copying it, deleting here unlinks
// every journey that referenced it, which is why the count is shown before the
// confirm and not after.
import React, { useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppActionDialog, AppHeaderSearch, AppProgressBar, DetailPage, radius } from '../../design-system';
import { Icon } from '../Icon';
import type { IconName } from '../Icon';
import { Press } from '../Press';
import { KPSkeletonLine } from '../State';
import { Glass } from '../Glass';
import { GearMenuTransition } from '../gear/GearMenuTransition';
import { useData } from '../../data/DataContext';
import { useNav } from '../../nav/NavContext';
import { useI18n } from '../../i18n';
import { MONO } from '../../theme/fonts';
import { Theme } from '../../theme/theme';
import type { Poi } from '../../data/pois';
import { Track } from '../../data/tracks';
import { formatTrackAscent, formatTrackDistance } from '../../lib/trackParser';
import { importTrackFiles, pickTrackFiles } from '../../lib/trackImport';
import { exportTracks } from '../../lib/trackExport';
import { TrackThumbnail } from './TrackThumbnail';

export type TrackFilter = 'all' | 'unused' | 'applied';
export type TrackSort = 'created' | 'distance' | 'name';

// The gear pages keep the header to bare 44x44 icons and give the primary
// actions the bottom bar instead, so this mirrors GearHeaderButton.
function HeaderButton({ theme, icon, label, onPress, active = false }: { theme: Theme; icon: IconName; label: string; onPress: () => void; active?: boolean }) {
  return (
    <Press accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: active }} onPress={onPress} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} color={active ? theme.accent : theme.text} size={25} strokeWidth={2.2} />
    </Press>
  );
}

function TracksEmptyCard({ theme, icon, title, body, action }: {
  theme: Theme;
  icon: IconName;
  title: string;
  body?: string;
  action?: { label: string; icon?: IconName; onPress: () => void };
}) {
  return (
    <View style={{ minHeight: 260, paddingHorizontal: 24, paddingVertical: 40, borderRadius: radius.feature, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.fieldBorder, backgroundColor: theme.surfaceTop, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 64, height: 64, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.accentSofter }}>
        <Icon name={icon} color={theme.accent} size={28} strokeWidth={1.7} />
      </View>
      <Text style={{ marginTop: 16, fontSize: 15, fontWeight: '700', color: theme.text, textAlign: 'center' }}>{title}</Text>
      {body ? <Text style={{ marginTop: 8, fontSize: 13, lineHeight: 20, color: theme.text2, textAlign: 'center', maxWidth: 250 }}>{body}</Text> : null}
      {action ? (
        <Press
          onPress={action.onPress}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          style={{ minHeight: 44, marginTop: 20, paddingHorizontal: 20, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: theme.accent }}
        >
          {action.icon ? <Icon name={action.icon} color="#FFFFFF" size={17} strokeWidth={2.2} /> : null}
          <Text style={{ fontSize: 14, fontWeight: '800', color: '#FFFFFF' }}>{action.label}</Text>
        </Press>
      ) : null}
    </View>
  );
}

// Rows only arrive after the first fetch, so the page holds their shape instead
// of flashing the empty state at someone who has tracks.
function TracksSkeleton({ theme, layout, gridCardWidth }: { theme: Theme; layout: 'grid' | 'list'; gridCardWidth: number }) {
  if (layout === 'grid') {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14 }}>
        {[0, 1].map((column) => (
          <View key={column} style={{ flex: 1, gap: 14 }}>
            {[0, 1].map((row) => (
              <View key={row} style={{ borderRadius: 24, padding: 14, backgroundColor: theme.dark ? '#000000' : '#FFFFFF' }}>
                <KPSkeletonLine theme={theme} width="100%" height={Math.max(0, gridCardWidth - 28)} radius={18} />
                <KPSkeletonLine theme={theme} width="72%" height={15} style={{ marginTop: 12 }} />
                <KPSkeletonLine theme={theme} width="46%" height={12} style={{ marginTop: 10 }} />
              </View>
            ))}
          </View>
        ))}
      </View>
    );
  }
  return (
    <View style={{ gap: 12 }}>
      {[0, 1, 2].map((index) => (
        <View key={index} style={{ minHeight: 112, borderRadius: 24, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: theme.dark ? '#000000' : '#FFFFFF' }}>
          <KPSkeletonLine theme={theme} width={84} height={84} radius={16} />
          <View style={{ flex: 1, gap: 10 }}>
            <KPSkeletonLine theme={theme} width="72%" height={15} />
            <KPSkeletonLine theme={theme} width="46%" height={12} />
          </View>
        </View>
      ))}
    </View>
  );
}

function TrackRow({
  theme,
  track,
  selectMode,
  selected,
  onPress,
  onLongPress,
}: {
  theme: Theme;
  track: Track;
  selectMode: boolean;
  selected: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const { t } = useI18n();
  // Icon-value groups rather than one dotted string: each fact keeps its own
  // glyph so the eye can find distance without reading the line.
  const facts: { icon: IconName; text: string }[] = [
    track.distM != null ? { icon: 'distance' as IconName, text: formatTrackDistance(track.distM) } : null,
    track.ascM != null && track.ascM > 0 ? { icon: 'arrowUp' as IconName, text: formatTrackAscent(track.ascM) } : null,
  ].filter(Boolean) as { icon: IconName; text: string }[];

  return (
    <Press onPress={onPress} onLongPress={onLongPress} accessibilityRole="button" accessibilityLabel={track.name}
      style={{ minHeight: 112, borderRadius: 24, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: theme.dark ? '#000000' : '#FFFFFF' }}>
      <View style={{ width: 84, height: 84, borderRadius: 16, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <TrackThumbnail theme={theme} coords={track.coords} size={84} />
      </View>

      <View style={{ flex: 1, minWidth: 0, alignSelf: 'stretch', justifyContent: 'space-between', paddingVertical: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text numberOfLines={2} style={{ flexShrink: 1, fontSize: 16, lineHeight: 21, fontWeight: '700', color: theme.text }}>
            {track.name || t('tracks.untitled')}
          </Text>
          {track.fileFormat && !selectMode ? (
            <View style={{ flexShrink: 0, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 5, backgroundColor: theme.controlSurface }}>
              <Text style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: '800', color: theme.text2, letterSpacing: 0.4 }}>
                {track.fileFormat.toUpperCase()}
              </Text>
            </View>
          ) : null}
        </View>

        <View accessible accessibilityLabel={facts.map((fact) => fact.text).join(', ')} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minWidth: 0 }}>
          {facts.length ? facts.map((fact) => (
            <View key={fact.icon} style={{ flexShrink: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Icon name={fact.icon} color={theme.text2} size={15} strokeWidth={1.8} />
              <Text numberOfLines={1} style={{ flexShrink: 1, minWidth: 0, fontFamily: MONO, fontSize: 11.5, color: theme.text2 }}>{fact.text}</Text>
            </View>
          )) : (
            <Text style={{ fontFamily: MONO, fontSize: 11.5, color: theme.text3 }}>{t('tracks.meta.noGeometry')}</Text>
          )}
        </View>
      </View>

      {selectMode ? (
        <View
          style={{
            width: 25,
            height: 25,
            borderRadius: 13,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 2,
            borderColor: selected ? theme.accent : theme.text3,
            backgroundColor: selected ? theme.accent : 'transparent',
          }}
        >
          {selected ? <Icon name="check" color="#FFFFFF" size={16} strokeWidth={2.4} /> : null}
        </View>
      ) : null}

      {selected ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: 24, borderWidth: 1.5, borderColor: theme.accent }]} />
      ) : null}
    </Press>
  );
}

// The gallery twin of TrackRow: the thumbnail becomes the hero and the pill and
// facts sit under it, the same shape as the gear item cards.
function TrackGridCard({
  theme,
  track,
  width,
  selectMode,
  selected,
  onPress,
  onLongPress,
}: {
  theme: Theme;
  track: Track;
  width: number;
  selectMode: boolean;
  selected: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const { t } = useI18n();
  const facts: { icon: IconName; text: string }[] = [
    track.distM != null ? { icon: 'distance' as IconName, text: formatTrackDistance(track.distM) } : null,
    track.ascM != null && track.ascM > 0 ? { icon: 'arrowUp' as IconName, text: formatTrackAscent(track.ascM) } : null,
  ].filter(Boolean) as { icon: IconName; text: string }[];

  return (
    <Press onPress={onPress} onLongPress={onLongPress} accessibilityRole="button" accessibilityLabel={track.name}
      style={{ width, borderRadius: 24, padding: 14, backgroundColor: theme.dark ? '#000000' : '#FFFFFF' }}>
      <View style={{ minHeight: 42, flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
        <Text numberOfLines={2} style={{ flex: 1, fontSize: 15, lineHeight: 21, fontWeight: '800', color: theme.text }}>
          {track.name || t('tracks.untitled')}
        </Text>
        {track.fileFormat && !selectMode ? (
          <View style={{ flexShrink: 0, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 5, backgroundColor: theme.controlSurface }}>
            <Text style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: '800', color: theme.text2, letterSpacing: 0.4 }}>
              {track.fileFormat.toUpperCase()}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={{ height: Math.max(116, width - 28), marginTop: 12, borderRadius: 18, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <TrackThumbnail theme={theme} coords={track.coords} size={Math.max(116, width - 28)} />
      </View>
      <View accessible accessibilityLabel={facts.map((fact) => fact.text).join(', ')} style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 10, rowGap: 7, marginTop: 10 }}>
        {facts.length ? facts.map((fact) => (
          <View key={fact.icon} style={{ flexShrink: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Icon name={fact.icon} color={theme.text2} size={13} strokeWidth={1.8} />
            <Text numberOfLines={1} style={{ flexShrink: 1, minWidth: 0, fontFamily: MONO, fontSize: 11, fontWeight: '700', color: theme.text2 }}>{fact.text}</Text>
          </View>
        )) : (
          <Text style={{ fontFamily: MONO, fontSize: 11, color: theme.text3 }}>{t('tracks.meta.noGeometry')}</Text>
        )}
      </View>
      {selectMode ? (
        <View style={{ position: 'absolute', top: 10, right: 10, width: 25, height: 25, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: selected ? theme.accent : '#FFFFFF', backgroundColor: selected ? theme.accent : 'rgba(0,0,0,0.22)' }}>
          {selected ? <Icon name="check" color="#FFFFFF" size={16} strokeWidth={2.4} /> : null}
        </View>
      ) : null}
      {selected ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: 24, borderWidth: 1.5, borderColor: theme.accent }]} /> : null}
    </Press>
  );
}

// The page's three popovers copy the gear list menus row for row: rows carry an
// icon and a selected check instead of a flat action sheet, and the shells are
// glass cards anchored to the button that opened them.
function TrackMenuCaption({ theme, text, spaced = false }: { theme: Theme; text: string; spaced?: boolean }) {
  return <Text style={{ paddingHorizontal: 24, paddingTop: spaced ? 20 : 4, paddingBottom: 7, fontSize: 12, fontWeight: '600', color: theme.text2 }}>{text}</Text>;
}

function TrackMenuRow({ theme, icon, label, onPress, selected = false }: { theme: Theme; icon: IconName; label: string; onPress: () => void; selected?: boolean }) {
  return (
    <Press onPress={onPress} scaleTo={0.985} style={{ minHeight: 56, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center' }}>
      <View style={{ width: 28, alignItems: 'center' }}><Icon name={icon} color={theme.text} size={21} strokeWidth={1.9} /></View>
      <Text numberOfLines={1} style={{ flex: 1, marginLeft: 18, fontSize: 15, color: theme.text }}>{label}</Text>
      {selected ? <Icon name="check" color={theme.accent} size={17} strokeWidth={2.2} /> : null}
    </Press>
  );
}

function TrackCompactRow({ theme, icon, label, onPress, selected = false }: { theme: Theme; icon: IconName; label: string; onPress: () => void; selected?: boolean }) {
  return (
    <Press onPress={onPress} scaleTo={0.985} style={{ height: 48, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center' }}>
      <View style={{ width: 25, alignItems: 'center' }}><Icon name={icon} color={theme.text} size={19} strokeWidth={1.8} /></View>
      <Text style={{ marginLeft: 13, fontSize: 14.5, color: theme.text }}>{label}</Text>
      {selected ? <View style={{ marginLeft: 'auto' }}><Icon name="check" color={theme.accent} size={16} strokeWidth={2.2} /></View> : null}
    </Press>
  );
}

function TrackChoiceRow({ theme, label, selected, color, onPress }: { theme: Theme; label: string; selected: boolean; color: string; onPress: () => void }) {
  return (
    <Press onPress={onPress} style={{ height: 48, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center' }}>
      <View style={{ width: 8, height: 8, borderRadius: 3, backgroundColor: color }} />
      <Text numberOfLines={1} style={{ flex: 1, marginLeft: 15, fontSize: 14.5, color: theme.text }}>{label}</Text>
      {selected ? <Icon name="check" color={theme.accent} size={16} strokeWidth={2.2} /> : null}
    </Press>
  );
}

// Anchored under the header more button, like the gear pages' FloatingMenu.
function TrackDropMenu({ theme, visible, top, width, onClose, children }: { theme: Theme; visible: boolean; top: number; width: number; onClose: () => void; children: React.ReactNode }) {
  return (
    <GearMenuTransition
      theme={theme}
      visible={visible}
      onClose={onClose}
      positionStyle={{ position: 'absolute', top, right: 14, width, borderRadius: 26, overflow: 'hidden', boxShadow: theme.dark ? '0px 18px 46px rgba(0,0,0,0.52)' : '0px 18px 46px rgba(0,0,0,0.18)' }}
    >
      <Glass solidOnAndroid theme={theme} radius={26} intensity={76}>
        <View style={{ paddingVertical: 13, backgroundColor: theme.dark ? 'rgba(32,32,35,0.58)' : 'rgba(255,255,255,0.64)' }}>{children}</View>
      </Glass>
    </GearMenuTransition>
  );
}

// Anchored to the header filter button or the bottom sort pill, like
// CompactFilterMenu / CompactChoiceMenu.
function TrackChoiceMenu({ theme, visible, title, placement, positionStyle, onClose, children }: { theme: Theme; visible: boolean; title: string; placement: 'top' | 'bottom'; positionStyle: { right: number; width: number; top?: number; bottom?: number }; onClose: () => void; children: React.ReactNode }) {
  return (
    <GearMenuTransition
      theme={theme}
      visible={visible}
      onClose={onClose}
      placement={placement}
      backdropColor="transparent"
      positionStyle={{ position: 'absolute', right: positionStyle.right, width: positionStyle.width, top: positionStyle.top, bottom: positionStyle.bottom, borderRadius: 24, boxShadow: theme.dark ? '0px 14px 38px rgba(0,0,0,0.50)' : '0px 14px 38px rgba(0,0,0,0.16)' }}
    >
      <Glass solidOnAndroid theme={theme} radius={24} intensity={78}>
        <View style={{ paddingTop: 12, paddingBottom: 10, backgroundColor: theme.dark ? 'rgba(32,32,35,0.64)' : 'rgba(255,255,255,0.72)' }}>
          <Text style={{ paddingHorizontal: 24, paddingTop: 2, paddingBottom: 5, fontSize: 11.5, fontWeight: '600', color: theme.text2 }}>{title}</Text>
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
  const { t } = useI18n();
  const nav = useNav();
  const insets = useSafeAreaInsets();
  const data = useData();

  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [filter, setFilter] = useState<TrackFilter>('all');
  const [sort, setSort] = useState<TrackSort>('created');
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  // Import is the one operation here that runs for minutes and can partly fail, so
  // it reports inline instead of through a modal: the list it is filling stays
  // visible and scrollable while it works.
  const [progress, setProgress] = useState<{ done: number; total: number; fileName: string } | null>(null);
  const [summary, setSummary] = useState<{ ok: number; failed: string[] } | null>(null);
  // The gallery reads better for browsing and the list for long libraries, so
  // both stay one tap away instead of one winning outright.
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const { width } = useWindowDimensions();
  const [moreOpen, setMoreOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

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

  const rows = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    const matches = data.tracks.filter((track) => {
      const used = (usageByTrack.get(track.id)?.length ?? 0) > 0;
      if (filter === 'applied') return used;
      if (filter === 'unused') return !used;
      return true;
    }).filter((track) => {
      if (!needle) return true;
      return track.name.toLocaleLowerCase().includes(needle)
        || (track.fileName ?? '').toLocaleLowerCase().includes(needle);
    });
    const sorted = [...matches];
    if (sort === 'distance') sorted.sort((a, b) => (b.distM ?? 0) - (a.distM ?? 0));
    else if (sort === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name));
    else sorted.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
    return sorted;
  }, [data.tracks, usageByTrack, filter, query, sort]);

  // Two columns share the width the list rows use; the left column takes the
  // even rows so a deletion does not shuffle the whole page.
  const columns = useMemo(() => [
    rows.filter((_, index) => index % 2 === 0),
    rows.filter((_, index) => index % 2 === 1),
  ], [rows]);
  const gridCardWidth = (width - 48 - 14) / 2;
  const sortLabel = sort === 'created' ? t('tracks.sort.created') : t('tracks.sort.distance');

  const selectableIds = useMemo(() => rows.map((track) => track.id), [rows]);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id));

  // A long press also fires onPress on RN, so the next tap is swallowed.
  const ignorePress = useRef(false);
  const enterSelect = (id: string) => {
    ignorePress.current = true;
    setTimeout(() => { ignorePress.current = false; }, 700);
    setSelectMode(true);
    setSelectedIds(new Set([id]));
  };
  const openTrack = (track: Track) => {
    if (ignorePress.current) { ignorePress.current = false; return; }
    onOpenTrack(track);
  };
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
  const closeSearch = () => {
    setQuery('');
    setSearchOpen(false);
  };
  // Menus close first and act on a small delay so the pressed row is visible
  // for a beat before the page reacts, matching the gear list menus.
  const closeMoreThen = (action: () => void) => {
    setMoreOpen(false);
    setTimeout(action, 140);
  };

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
    const failed = outcomes.filter((outcome) => !outcome.ok).map((outcome) => outcome.fileName);
    if (failed.length) setSummary({ ok: outcomes.length - failed.length, failed });
    else nav.showToast(t('tracks.import.done', { count: outcomes.length }));
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

  return (
    <DetailPage
      theme={theme}
      entryVariant={entryVariant}
      onBack={selectMode ? exitSelect : onBack}
      backgroundColor={theme.groupedBg}
      flatChrome
      onContentTouchStart={searchOpen ? closeSearch : undefined}
      right={
        selectMode ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <HeaderButton
              theme={theme}
              icon="checkAll"
              onPress={() => setSelectedIds(allSelected ? new Set() : new Set(selectableIds))}
              active={allSelected}
              label={t('tracks.filter.all')}
            />
            <HeaderButton theme={theme} icon="close" onPress={exitSelect} label={t('common.close')} />
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
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <HeaderButton theme={theme} icon="filter" onPress={() => setFilterOpen(true)} label={t('tracks.filter.title')} />
                <HeaderButton theme={theme} icon="search" onPress={() => setSearchOpen(true)} label={t('common.search')} />
                <HeaderButton theme={theme} icon="more" onPress={() => setMoreOpen(true)} label={t('journey.section.more')} />
              </View>
            )}
          />
        )
      }
      overlay={(
        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 22, paddingTop: 24, paddingBottom: Math.max(insets.bottom, 14) + 4, flexDirection: 'row', gap: 12, justifyContent: selectMode ? undefined : 'space-between' }}>
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
                      height: 52,
                      borderRadius: 26,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      backgroundColor: theme.controlSurface,
                      opacity: exporting ? 0.5 : 1,
                    }}
                  >
                    <Icon name="download" color={theme.text} size={18} strokeWidth={2.1} />
                    <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: '800', color: theme.text }}>
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
                    height: 52,
                    borderRadius: 26,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: selectedIds.size ? theme.danger : theme.controlSurface,
                  }}
                >
                  <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: '800', color: selectedIds.size ? '#FFFFFF' : theme.text3 }}>
                    {selectedIds.size ? t('tracks.select.deleteConfirm', { count: selectedIds.size }) : t('tracks.select.deletePrompt')}
                  </Text>
                </Press>
              </>
            ) : (
              <>
                {Platform.OS !== 'web' ? (
                  <Press
                    onPress={() => void runImport()}
                    opacityTo={1}
                    accessibilityRole="button"
                    accessibilityLabel={t('tracks.action.import')}
                    style={{
                      height: 52,
                      minWidth: 126,
                      paddingHorizontal: 22,
                      borderRadius: 26,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 9,
                      backgroundColor: theme.dark ? '#2C2C2E' : '#FFFFFF',
                    }}
                  >
                    <Icon name="upload" color={theme.text} size={19} strokeWidth={2.1} />
                    <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: '800', color: theme.text }}>
                      {t('tracks.action.import')}
                    </Text>
                  </Press>
                ) : null}
                <Press
                  onPress={() => setSortOpen(true)}
                  opacityTo={1}
                  accessibilityRole="button"
                  accessibilityLabel={t('tracks.sort.title')}
                  style={{
                    height: 52,
                    minWidth: 150,
                    paddingHorizontal: 22,
                    borderRadius: 26,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 9,
                    backgroundColor: theme.dark ? '#2C2C2E' : '#FFFFFF',
                  }}
                >
                  <Icon name="arrowDown" color={theme.text} size={19} strokeWidth={2.1} />
                  <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: '800', color: theme.text }}>
                    {sortLabel}
                  </Text>
                </Press>
              </>
            )}
          </View>

          <TrackDropMenu theme={theme} visible={moreOpen} top={insets.top + 66} width={Math.min(216, width - 28)} onClose={() => setMoreOpen(false)}>
            {data.tracks.length ? (
              <>
                <TrackMenuCaption theme={theme} text={t('journey.section.manage')} />
                <TrackMenuRow theme={theme} icon="checkAll" label={t('tracks.action.select')} onPress={() => closeMoreThen(() => setSelectMode(true))} />
              </>
            ) : null}
            <TrackMenuCaption theme={theme} text={t('tracks.view.title')} spaced={!data.tracks.length} />
            <TrackMenuRow theme={theme} icon="grid" label={t('tracks.view.grid')} selected={layout === 'grid'} onPress={() => closeMoreThen(() => setLayout('grid'))} />
            <TrackMenuRow theme={theme} icon="list" label={t('tracks.view.list')} selected={layout === 'list'} onPress={() => closeMoreThen(() => setLayout('list'))} />
          </TrackDropMenu>

          <TrackChoiceMenu
            theme={theme}
            visible={filterOpen}
            title={t('tracks.filter.title')}
            placement="top"
            positionStyle={{ right: 68, width: 220, top: insets.top + 62 }}
            onClose={() => setFilterOpen(false)}
          >
            <TrackChoiceRow theme={theme} label={t('tracks.filter.all')} selected={filter === 'all'} color={theme.text3} onPress={() => { setFilter('all'); setFilterOpen(false); }} />
            <TrackChoiceRow theme={theme} label={t('tracks.filter.unused')} selected={filter === 'unused'} color={theme.text3} onPress={() => { setFilter('unused'); setFilterOpen(false); }} />
            <TrackChoiceRow theme={theme} label={t('tracks.filter.applied')} selected={filter === 'applied'} color={theme.accent} onPress={() => { setFilter('applied'); setFilterOpen(false); }} />
          </TrackChoiceMenu>

          <TrackChoiceMenu
            theme={theme}
            visible={sortOpen}
            title={t('tracks.sort.title')}
            placement="bottom"
            positionStyle={{ right: 22, width: 210, bottom: Math.max(insets.bottom, 14) + 70 }}
            onClose={() => setSortOpen(false)}
          >
            {([
              ['created', t('tracks.sort.created'), 'clock'],
              ['distance', t('tracks.sort.distance'), 'distance'],
            ] as [TrackSort, string, IconName][]).map(([id, label, icon]) => (
              <TrackCompactRow key={id} theme={theme} icon={icon} label={label} selected={sort === id} onPress={() => { setSort(id); setSortOpen(false); }} />
            ))}
          </TrackChoiceMenu>
        </View>
      )}
    >
      <View style={{ paddingHorizontal: 24 }}>
        <View style={{ marginTop: 10, marginBottom: 22 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 27, fontWeight: '800', letterSpacing: -0.7, color: theme.text }}>
              {selectMode ? t('tracks.select.title', { count: selectedIds.size }) : t('tracks.pageTitle')}
            </Text>
            {!selectMode ? (
              <Text style={{ fontFamily: MONO, fontSize: 12, fontWeight: '700', color: theme.text3 }}>
                {data.tracks.length} {t('tracks.unitTracks')}
              </Text>
            ) : null}
          </View>
        </View>

        {progress || summary ? (
          <View style={{ borderRadius: 24, padding: 14, marginBottom: 14, backgroundColor: theme.dark ? '#000000' : '#FFFFFF' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text numberOfLines={1} style={{ flex: 1, fontSize: 14.5, fontWeight: '700', color: summary ? theme.danger : theme.text }}>
                {progress
                  ? t('tracks.import.progress', { count: progress.total })
                  : t('tracks.import.partial', { ok: summary?.ok ?? 0, failed: summary?.failed.length ?? 0 })}
              </Text>
              {summary ? (
                <Press onPress={() => setSummary(null)} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('common.close')}>
                  <Icon name="close" color={theme.text3} size={16} strokeWidth={2.4} />
                </Press>
              ) : null}
            </View>
            {progress ? (
              <>
                <View style={{ marginTop: 10 }}>
                  <AppProgressBar theme={theme} value={(progress.done / Math.max(1, progress.total)) * 100} />
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
                  <Text style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: '700', color: theme.text2 }}>
                    {`${progress.done}/${progress.total}`}
                  </Text>
                  <Text numberOfLines={1} style={{ flex: 1, fontFamily: MONO, fontSize: 11.5, color: theme.text3 }}>
                    {progress.fileName}
                  </Text>
                </View>
              </>
            ) : null}
            {/* Naming the files that failed is the point of not aborting the batch —
                the ones that landed are visible in the list below, the others are not.
                The same name can appear twice (a file picked from two folders), so the
                index is what makes the key unique. */}
            {summary?.failed.map((fileName, index) => (
              <Text key={`${fileName}-${index}`} numberOfLines={1} style={{ fontFamily: MONO, fontSize: 11.5, color: theme.text3, marginTop: 6 }}>
                {fileName}
              </Text>
            ))}
          </View>
        ) : null}

        {data.tracksLoading && !data.tracks.length ? (
          <TracksSkeleton theme={theme} layout={layout} gridCardWidth={gridCardWidth} />
        ) : rows.length && layout === 'grid' ? (
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14 }}>
            {columns.map((column, columnIndex) => (
              <View key={columnIndex} style={{ flex: 1, gap: 14 }}>
                {column.map((track) => (
                  <TrackGridCard
                    key={track.id}
                    theme={theme}
                    track={track}
                    width={gridCardWidth}
                    selectMode={selectMode}
                    selected={selectedIds.has(track.id)}
                    onPress={() => (selectMode ? toggleSelected(track.id) : openTrack(track))}
                    onLongPress={() => (selectMode ? undefined : enterSelect(track.id))}
                  />
                ))}
              </View>
            ))}
          </View>
        ) : rows.length ? (
          <View style={{ gap: 12 }}>
            {rows.map((track) => (
              <TrackRow
                key={track.id}
                theme={theme}
                track={track}
                selectMode={selectMode}
                selected={selectedIds.has(track.id)}
                onPress={() => (selectMode ? toggleSelected(track.id) : openTrack(track))}
                onLongPress={() => (selectMode ? undefined : enterSelect(track.id))}
              />
            ))}
          </View>
        ) : data.tracks.length ? (
          <TracksEmptyCard theme={theme} icon="search" title={t('tracks.empty.filteredTitle')} body={t('tracks.empty.filteredBody')} />
        ) : (
          <TracksEmptyCard
            theme={theme}
            icon="route"
            title={t('tracks.empty.title')}
            body={t('tracks.empty.body')}
            // An empty library makes import the only useful thing to do, and it
            // would otherwise be two taps away behind the header menu.
            action={Platform.OS !== 'web' ? { label: t('tracks.action.import'), icon: 'upload', onPress: () => void runImport() } : undefined}
          />
        )}
      </View>

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
