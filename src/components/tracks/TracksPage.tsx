// TracksPage.tsx — the track library.
//
// A track exists whether or not a journey uses it, so the page's job is to show
// both halves: the ones bound to a journey and the ones still waiting. Because a
// journey points at a library row rather than copying it, deleting here unlinks
// every journey that referenced it, which is why the count is shown before the
// confirm and not after.
import React, { useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppActionDialog, AppHeaderSearch, AppIconButton, AppProgressBar, DetailPage, radius } from '../../design-system';
import { Icon } from '../Icon';
import type { IconName } from '../Icon';
import { Press } from '../Press';
import { KPSkeletonLine } from '../State';
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

function HeaderButton({ theme, icon, label, onPress, active }: { theme: Theme; icon: IconName; label: string; onPress: () => void; active?: boolean }) {
  return <AppIconButton theme={theme} name={icon} onPress={onPress} noShadow active={active} accessibilityLabel={label} />;
}

// The library's three totals read as one row of tiles rather than a bare strip,
// so they carry the same weight as the gear and checklist summaries.
function StatPill({ theme, icon, label, value }: { theme: Theme; icon: IconName; label: string; value: string }) {
  return (
    <View style={{ flex: 1, minWidth: 0, height: 82, paddingHorizontal: 17, paddingVertical: 13, borderRadius: 22, justifyContent: 'space-between', backgroundColor: theme.dark ? '#000000' : '#FFFFFF' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Icon name={icon} color={theme.text3} size={15} strokeWidth={1.8} />
        <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '600', color: theme.text2 }}>{label}</Text>
      </View>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ fontFamily: MONO, fontSize: 20, fontWeight: '800', letterSpacing: -0.45, color: theme.text }}>{value}</Text>
    </View>
  );
}

// Used vs unused is the one distinction worth a permanent control: it is the
// difference between the routes already spoken for and the ones still free.
function FilterChip({ theme, label, selected, dot, onPress }: { theme: Theme; label: string; selected: boolean; dot: string; onPress: () => void }) {
  return (
    <Press
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={{
        height: 36,
        paddingHorizontal: 15,
        borderRadius: 18,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        backgroundColor: selected ? theme.accent : theme.controlSurface,
      }}
    >
      <View style={{ width: 8, height: 8, borderRadius: 3, backgroundColor: selected ? '#FFFFFF' : dot }} />
      <Text style={{ fontSize: 13.5, fontWeight: selected ? '700' : '600', color: selected ? '#FFFFFF' : theme.text2 }}>{label}</Text>
      {selected ? <Icon name="check" color="#FFFFFF" size={13} strokeWidth={2.4} /> : null}
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
function TracksSkeleton({ theme }: { theme: Theme }) {
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
  usage,
  selectMode,
  selected,
  onPress,
  onLongPress,
}: {
  theme: Theme;
  track: Track;
  usage: Poi[];
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
    track.pointCount ? { icon: 'pin' as IconName, text: t('tracks.meta.points', { count: track.pointCount }) } : null,
  ].filter(Boolean) as { icon: IconName; text: string }[];

  return (
    <Press onPress={onPress} onLongPress={onLongPress} accessibilityRole="button" accessibilityLabel={track.name}
      style={{ minHeight: 112, borderRadius: 24, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: theme.dark ? '#000000' : '#FFFFFF' }}>
      <View style={{ width: 84, height: 84, borderRadius: 16, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: theme.dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.045)' }}>
        <TrackThumbnail theme={theme} coords={track.coords} size={84} />
      </View>

      <View style={{ flex: 1, minWidth: 0, alignSelf: 'stretch', justifyContent: 'space-between', paddingVertical: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text numberOfLines={2} style={{ flexShrink: 1, fontSize: 16, lineHeight: 21, fontWeight: '700', color: theme.text }}>
            {track.name || t('tracks.untitled')}
          </Text>
          {track.fileFormat ? (
            <View style={{ flexShrink: 0, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 5, backgroundColor: theme.accentSoft }}>
              <Text style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: '800', color: theme.accent, letterSpacing: 0.4 }}>
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

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Icon name="link" color={usage.length ? theme.accent : theme.text3} size={15} strokeWidth={1.8} />
          <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 12, fontWeight: '600', color: usage.length ? theme.accent : theme.text3 }}>
            {usage.length ? t('tracks.usage.applied', { count: usage.length }) : t('tracks.usage.unused')}
          </Text>
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
      ) : (
        <Icon name="chevronR" color={theme.text3} size={17} strokeWidth={2.2} />
      )}

      {selected ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: 24, borderWidth: 1.5, borderColor: theme.accent }]} />
      ) : null}
    </Press>
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

  const selectableIds = useMemo(() => rows.map((track) => track.id), [rows]);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id));

  const stats = useMemo(() => {
    const totalM = data.tracks.reduce((sum, track) => sum + (track.distM ?? 0), 0);
    const totalAsc = data.tracks.reduce((sum, track) => sum + (track.ascM ?? 0), 0);
    return [
      { icon: 'route' as IconName, label: t('tracks.stat.count'), value: String(data.tracks.length) },
      { icon: 'distance' as IconName, label: t('tracks.stat.distance'), value: totalM >= 1000 ? `${(totalM / 1000).toFixed(1)} km` : `${Math.round(totalM)} m` },
      { icon: 'arrowUp' as IconName, label: t('tracks.stat.ascent'), value: `+${Math.round(totalAsc)} m` },
    ];
  }, [data.tracks, t]);

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
  const openFilter = () => nav.openActionSheet({
    title: t('tracks.filter.title'),
    items: ([
      ['all', t('tracks.filter.all')],
      ['unused', t('tracks.filter.unused')],
      ['applied', t('tracks.filter.applied')],
    ] as [TrackFilter, string][]).map(([id, label]) => ({ label, onPress: () => setFilter(id) })),
  });
  const openSort = () => nav.openActionSheet({
    title: t('tracks.sort.title'),
    items: ([
      ['created', t('tracks.sort.created')],
      ['distance', t('tracks.sort.distance')],
      ['name', t('tracks.sort.name')],
    ] as [TrackSort, string][]).map(([id, label]) => ({ label, onPress: () => setSort(id) })),
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

  const openMore = () => nav.openActionSheet({
    // The page title above it already says 我的轨迹, so the sheet names what it is
    // for rather than repeating where it came from.
    title: t('journey.section.manage'),
    // The web picker is a stub, so the entry is dropped there and the sheet says
    // why rather than leaving a button that would do nothing.
    message: Platform.OS === 'web' ? t('tracks.import.webHint') : undefined,
    items: [
      ...(Platform.OS === 'web' ? [] : [{
        label: t('tracks.action.import'),
        icon: 'upload',
        onPress: () => void runImport(),
      }]),
      ...(data.tracks.length ? [{
        label: t('tracks.action.select'),
        icon: 'checkAll',
        onPress: () => setSelectMode(true),
      }] : []),
    ],
  });

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
            <AppIconButton
              theme={theme}
              name="checkAll"
              onPress={() => setSelectedIds(allSelected ? new Set() : new Set(selectableIds))}
              active={allSelected}
              noShadow
              accessibilityLabel={t('tracks.filter.all')}
            />
            <AppIconButton theme={theme} name="close" onPress={exitSelect} noShadow accessibilityLabel={t('common.close')} />
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
                <HeaderButton theme={theme} icon="filter" onPress={openFilter} label={t('tracks.filter.title')} active={filter !== 'all'} />
                <HeaderButton theme={theme} icon="arrowDown" onPress={openSort} label={t('tracks.sort.title')} active={sort !== 'created'} />
                <HeaderButton theme={theme} icon="search" onPress={() => setSearchOpen(true)} label={t('common.search')} />
                <HeaderButton theme={theme} icon="more" onPress={openMore} label={t('journey.section.more')} />
              </View>
            )}
          />
        )
      }
      overlay={selectMode ? (
        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 22, paddingTop: 24, paddingBottom: Math.max(insets.bottom, 14) + 4, flexDirection: 'row', gap: 12 }}>
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
          </View>
        </View>
      ) : null}
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
          {!selectMode && data.tracks.length ? (
            <View style={{ flexDirection: 'row', gap: 9, marginTop: 15 }}>
              <FilterChip theme={theme} label={t('tracks.filter.all')} selected={filter === 'all'} dot={theme.text3} onPress={() => setFilter('all')} />
              <FilterChip theme={theme} label={t('tracks.filter.unused')} selected={filter === 'unused'} dot={theme.text3} onPress={() => setFilter('unused')} />
              <FilterChip theme={theme} label={t('tracks.filter.applied')} selected={filter === 'applied'} dot={theme.accent} onPress={() => setFilter('applied')} />
            </View>
          ) : null}
          {!selectMode && data.tracks.length ? (
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 15 }}>
              {stats.map((stat) => (
                <StatPill key={stat.label} theme={theme} icon={stat.icon} label={stat.label} value={stat.value} />
              ))}
            </View>
          ) : null}
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
          <TracksSkeleton theme={theme} />
        ) : rows.length ? (
          <View style={{ gap: 12 }}>
            {rows.map((track) => (
              <TrackRow
                key={track.id}
                theme={theme}
                track={track}
                usage={usageByTrack.get(track.id) ?? []}
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
