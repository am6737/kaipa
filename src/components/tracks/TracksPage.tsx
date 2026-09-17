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
import { AppActionDialog, AppCard, AppHeaderSearch, AppIconButton, AppMetricStrip, AppProgressBar, DetailPage, radius } from '../../design-system';
import { Icon } from '../Icon';
import type { IconName } from '../Icon';
import { Press } from '../Press';
import { KPState } from '../State';
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

export type TrackFilter = 'all' | 'unused' | 'applied';
export type TrackSort = 'created' | 'distance' | 'name';

function HeaderButton({ theme, icon, label, onPress, active }: { theme: Theme; icon: IconName; label: string; onPress: () => void; active?: boolean }) {
  return <AppIconButton theme={theme} name={icon} onPress={onPress} noShadow active={active} accessibilityLabel={label} />;
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
  const facts = [
    track.distM != null ? formatTrackDistance(track.distM) : null,
    track.ascM != null && track.ascM > 0 ? formatTrackAscent(track.ascM) : null,
    track.pointCount ? t('tracks.meta.points', { count: track.pointCount }) : null,
  ].filter(Boolean) as string[];

  return (
    <Press onPress={onPress} onLongPress={onLongPress} accessibilityRole="button" accessibilityLabel={track.name} scaleTo={1} style={{ marginBottom: 12 }}>
      <AppCard theme={theme} radius={radius.card} style={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 13,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
          }}
        >
          <Icon name="route" color={theme.accent} size={22} strokeWidth={2} />
        </View>

        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 15.5, fontWeight: '700', color: theme.text }}>
              {track.name || t('tracks.untitled')}
            </Text>
            {track.fileFormat ? (
              <View style={{ paddingHorizontal: 5, paddingVertical: 1, borderRadius: 5, backgroundColor: theme.accentSoft }}>
                <Text style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: '800', color: theme.accent, letterSpacing: 0.4 }}>
                  {track.fileFormat.toUpperCase()}
                </Text>
              </View>
            ) : null}
          </View>
          <Text numberOfLines={1} style={{ fontFamily: MONO, fontSize: 11.5, color: theme.text3, marginTop: 3 }}>
            {facts.length ? facts.join(' · ') : t('tracks.meta.noGeometry')}
          </Text>
          <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '600', color: usage.length ? theme.accent : theme.text3, marginTop: 3 }}>
            {usage.length ? t('tracks.usage.applied', { count: usage.length }) : t('tracks.usage.unused')}
          </Text>
        </View>

        {selectMode ? (
          <View
            style={{
              width: 25,
              height: 25,
              borderRadius: 13,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1.5,
              borderColor: selected ? theme.accent : theme.fieldBorder,
              backgroundColor: selected ? theme.accent : 'transparent',
            }}
          >
            {selected ? <Icon name="check" color="#FFFFFF" size={14} strokeWidth={3} /> : null}
          </View>
        ) : (
          <Icon name="chevronR" color={theme.text3} size={17} strokeWidth={2.2} />
        )}
      </AppCard>
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
      { label: t('tracks.stat.count'), value: String(data.tracks.length) },
      { label: t('tracks.stat.distance'), value: totalM >= 1000 ? `${(totalM / 1000).toFixed(1)} km` : `${Math.round(totalM)} m` },
      { label: t('tracks.stat.ascent'), value: `+${Math.round(totalAsc)} m` },
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
                style={{
                  flex: 1,
                  height: 52,
                  borderRadius: 26,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: theme.dark ? '#2C2C2E' : '#FFFFFF',
                  opacity: exporting ? 0.5 : 1,
                }}
              >
                <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: '800', color: theme.text }}>
                  {t('tracks.action.exportZip')}
                </Text>
              </Press>
            ) : null}
            <Press
              onPress={selectedIds.size ? () => setDeleteOpen(true) : undefined}
              style={{
                flex: 1,
                height: 52,
                borderRadius: 26,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: selectedIds.size ? theme.danger : (theme.dark ? '#2C2C2E' : '#FFFFFF'),
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
            <View style={{ marginTop: 15 }}>
              <AppMetricStrip theme={theme} stats={stats} />
            </View>
          ) : null}
        </View>

        {progress || summary ? (
          <AppCard theme={theme} radius={radius.card} style={{ padding: 14, marginBottom: 14 }}>
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
                <Text numberOfLines={1} style={{ fontFamily: MONO, fontSize: 11.5, color: theme.text3, marginTop: 8 }}>
                  {[`${progress.done}/${progress.total}`, progress.fileName].filter(Boolean).join(' · ')}
                </Text>
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
          </AppCard>
        ) : null}

        {rows.length ? rows.map((track) => (
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
        )) : (
          <KPState
            theme={theme}
            icon="route"
            title={data.tracks.length ? t('tracks.empty.filteredTitle') : t('tracks.empty.title')}
            body={data.tracks.length ? t('tracks.empty.filteredBody') : t('tracks.empty.body')}
            // An empty library makes import the only useful thing to do, and it
            // would otherwise be two taps away behind the header menu.
            action={!data.tracks.length && Platform.OS !== 'web' ? { label: t('tracks.action.import'), onPress: () => void runImport() } : undefined}
            style={{ marginTop: 40 }}
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
