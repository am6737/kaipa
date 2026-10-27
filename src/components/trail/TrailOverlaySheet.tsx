// TrailOverlaySheet.tsx — the 叠加轨迹 picker on the 徒步导航 page.
//
// A bottom sheet rather than a centred card: it is a list the user works through,
// several can be on at once, and the map stays visible above it. Each row draws
// the track's shape in the colour its line gets on the map, so the sheet doubles
// as the legend; tracks that are off draw in `text3`. A tap toggles and the
// rows keep their order, so nothing moves under the finger.
//
// Taps change a draft held here, and the choice is handed back once, on close.
// Committing each tap re-rendered the whole 徒步导航 page and re-drew the map's
// lines before the check could flip, which made the list lag behind the finger.
//
// The first row imports track files straight from the picker, so a file the
// user has on hand can go on the map without a trip to 我的轨迹 first; what it
// imports is saved there as usual and switched on here. Toasts would sit under
// this Modal, so the row itself reports progress and the outcome.
//
// A Modal because the 徒步导航 page sits above the page stack.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { layout, motion, radius, space, type } from '../../design-system';
import { useData } from '../../data/DataContext';
import type { Track } from '../../data/tracks';
import { useI18n } from '../../i18n';
import { importTrackFiles, pickTrackFiles } from '../../lib/trackImport';
import { formatTrackAscent, formatTrackDistance } from '../../lib/trackParser';
import type { Theme } from '../../theme/theme';
import { Icon, type IconName } from '../Icon';
import { Press } from '../Press';
import { TrackThumbnail } from '../tracks/TrackThumbnail';

const THUMB = 52;

type ImportState =
  | { kind: 'idle' }
  | { kind: 'running'; done: number; total: number }
  | { kind: 'result'; text: string; tone: 'accent' | 'danger' };

export function TrailOverlaySheet({
  theme,
  visible,
  tracks,
  selectedIds,
  colors,
  onClose,
}: {
  theme: Theme;
  visible: boolean;
  /** Tracks that can be overlaid, in list order. */
  tracks: Track[];
  selectedIds: string[];
  /** Map colours, handed out to overlays in the order they were switched on. */
  colors: readonly string[];
  /** Gets the ids to show, in order. */
  onClose: (ids: string[]) => void;
}) {
  const { t } = useI18n();
  const data = useData();
  const [importState, setImportState] = useState<ImportState>({ kind: 'idle' });
  const [draft, setDraft] = useState(selectedIds);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    progress.stopAnimation();
    if (visible) {
      setMounted(true);
      Animated.timing(progress, { toValue: 1, duration: motion.emphasized, easing: Easing.bezier(0.16, 1, 0.3, 1), useNativeDriver: true }).start();
      return;
    }
    Animated.timing(progress, { toValue: 0, duration: motion.quick, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(({ finished }) => {
      if (finished) setMounted(false);
    });
  }, [progress, visible]);

  // The last outcome belongs to that visit to the sheet.
  useEffect(() => {
    if (!visible) return;
    setImportState((state) => (state.kind === 'result' ? { kind: 'idle' } : state));
    setDraft(selectedIds);
    // Only on opening: while open the draft is the truth.
  }, [visible]);

  const toggle = useCallback((id: string) => {
    setDraft((ids) => (ids.includes(id) ? ids.filter((each) => each !== id) : [...ids, id]));
  }, []);
  const close = () => onClose(draftRef.current);

  const runImport = async () => {
    if (importState.kind === 'running') return;
    const files = await pickTrackFiles();
    if (!files) return;
    if (!files.length) {
      setImportState({ kind: 'result', text: t('tracks.import.unusable'), tone: 'danger' });
      return;
    }
    setImportState({ kind: 'running', done: 0, total: files.length });
    const created: string[] = [];
    const outcomes = await importTrackFiles(files, {
      userId: data.userId,
      t,
      createTrack: async (draft) => {
        const track = await data.createTrack(draft);
        if (track) created.push(track.id);
        return track;
      },
      onProgress: (done, total) => setImportState({ kind: 'running', done, total }),
    });
    // New ids aren't in the overlay list yet, so toggling switches them on.
    setDraft((ids) => [...ids, ...created.filter((id) => !ids.includes(id))]);
    const failed = outcomes.filter((outcome) => !outcome.ok).length;
    if (!created.length) setImportState({ kind: 'result', text: t('trail.overlay.importAllFailed'), tone: 'danger' });
    else if (failed) setImportState({ kind: 'result', text: t('trail.overlay.importFailed', { n: failed }), tone: 'danger' });
    else if (outcomes.some((outcome) => outcome.archiveTrimmed)) setImportState({ kind: 'result', text: t('record.track.archiveTrimmed'), tone: 'accent' });
    else setImportState({ kind: 'result', text: t('trail.overlay.imported', { n: created.length }), tone: 'accent' });
  };

  if (!visible && !mounted) return null;

  // Ids that aren't listed (deleted, or the line being followed) are kept but
  // not drawn, so they take no colour; the map skips them the same way.
  const listed = new Set(tracks.map((track) => track.id));
  const shown = draft.filter((id) => listed.has(id));
  const count = shown.length;
  const maxHeight = Math.round(height * 0.74);
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [maxHeight, 0] });

  return (
    <Modal visible transparent statusBarTranslucent animationType="none" onRequestClose={close}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: progress }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.done')}
          onPress={close}
          style={[StyleSheet.absoluteFill, { backgroundColor: theme.dark ? 'rgba(0,0,0,0.56)' : 'rgba(20,20,24,0.28)' }]}
        />
      </Animated.View>

      <Animated.View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          maxHeight,
          borderTopLeftRadius: radius.showcase,
          borderTopRightRadius: radius.showcase,
          backgroundColor: theme.featureSurface,
          transform: [{ translateY }],
          shadowColor: '#000000',
          shadowOpacity: theme.dark ? 0.4 : 0.12,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: -6 },
          elevation: 16,
        }}
      >
        <View style={{ paddingTop: space.xl, paddingHorizontal: space.xl, flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[type.pageTitle, { color: theme.text }]}>{t('trail.overlay.title')}</Text>
            <Text accessibilityLiveRegion="polite" style={[type.hint, { color: theme.text2, marginTop: space.xxs }]}>
              {count ? t('trail.overlay.count', { n: count }) : t('trail.overlay.hint')}
            </Text>
          </View>
          {count ? (
            <Press
              onPress={() => setDraft([])}
              accessibilityRole="button"
              accessibilityLabel={t('trail.overlay.clear')}
              style={{ height: layout.iconButton, justifyContent: 'center', marginRight: -space.xs, paddingHorizontal: space.xs }}
            >
              <Text style={[type.chip, { color: theme.accent }]}>{t('trail.overlay.clear')}</Text>
            </Press>
          ) : null}
        </View>

        <ScrollView style={{ flexGrow: 0, marginTop: space.sm }} contentContainerStyle={{ paddingVertical: space.xs }}>
          <ImportRow theme={theme} state={importState} onPress={() => void runImport()} />
          {tracks.map((track) => (
            <OverlayRow
              key={track.id}
              theme={theme}
              track={track}
              selected={shown.includes(track.id)}
              color={shown.includes(track.id) ? colors[shown.indexOf(track.id) % colors.length] : undefined}
              onToggle={toggle}
            />
          ))}
          {!tracks.length ? (
            <Text style={[type.hint, { color: theme.text3, textAlign: 'center', paddingHorizontal: space.xl, paddingVertical: space.xl }]}>
              {t('trail.overlay.empty')}
            </Text>
          ) : null}
        </ScrollView>

        <View style={{ paddingHorizontal: space.xl, paddingTop: space.sm, paddingBottom: insets.bottom + space.md }}>
          <Press
            onPress={close}
            accessibilityRole="button"
            accessibilityLabel={t('common.done')}
            opacityTo={1}
            style={{ height: 50, borderRadius: radius.card, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.accent }}
          >
            <Text style={{ fontSize: 15.5, fontWeight: '800', color: '#FFFFFF' }}>{t('common.done')}</Text>
          </Press>
        </View>
      </Animated.View>
    </Modal>
  );
}

/** Same geometry as a track row; the dashed tile reads as "add one". */
function ImportRow({ theme, state, onPress }: { theme: Theme; state: ImportState; onPress: () => void }) {
  const { t } = useI18n();
  const running = state.kind === 'running';
  const detail = running
    ? t('trail.overlay.importing', { done: Math.min(state.done + 1, state.total), total: state.total })
    : state.kind === 'result' ? state.text : t('trail.overlay.importHint');
  const detailColor = state.kind === 'result' ? (state.tone === 'danger' ? theme.danger : theme.accent) : theme.text2;
  return (
    <Press
      onPress={running ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={t('trail.overlay.import')}
      accessibilityState={{ busy: running, disabled: running }}
      style={{ minHeight: layout.listRowMinHeight + space.xs, paddingHorizontal: space.xl, paddingVertical: space.xs, flexDirection: 'row', alignItems: 'center', gap: space.sm }}
    >
      <View style={{ width: THUMB, height: THUMB, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderStyle: 'dashed', borderColor: theme.accent, backgroundColor: theme.accentSofter }}>
        {running ? <ActivityIndicator color={theme.accent} /> : <Icon name="upload" color={theme.accent} size={22} />}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={[type.cardTitle, { color: theme.accent }]}>{t('trail.overlay.import')}</Text>
        <Text accessibilityLiveRegion="polite" numberOfLines={2} style={[type.meta, { color: detailColor, marginTop: space.xxs, fontVariant: ['tabular-nums'] }]}>{detail}</Text>
      </View>
      {!running ? <Icon name="chevronR" color={theme.text3} size={16} /> : null}
    </Press>
  );
}

const OverlayRow = React.memo(function OverlayRow({ theme, track, selected, color, onToggle }: {
  theme: Theme;
  track: Track;
  selected: boolean;
  color?: string;
  onToggle: (id: string) => void;
}) {
  const { t } = useI18n();
  const when = track.startedAt ?? track.createdAt;
  const date = when ? new Date(when) : null;
  const facts: { icon: IconName; text: string }[] = [
    track.distM != null ? { icon: 'distance' as IconName, text: formatTrackDistance(track.distM) } : null,
    track.ascM != null && track.ascM > 0 ? { icon: 'arrowUp' as IconName, text: formatTrackAscent(track.ascM) } : null,
    date && Number.isFinite(date.getTime()) ? { icon: 'calendar' as IconName, text: t('trail.summary.dateFormat', { m: date.getMonth() + 1, d: date.getDate() }) } : null,
  ].filter(Boolean) as { icon: IconName; text: string }[];

  return (
    <Press
      onPress={() => onToggle(track.id)}
      accessibilityRole="checkbox"
      accessibilityLabel={track.name}
      accessibilityState={{ checked: selected }}
      style={{ minHeight: layout.listRowMinHeight + space.xs, paddingHorizontal: space.xl, paddingVertical: space.xs, flexDirection: 'row', alignItems: 'center', gap: space.sm }}
    >
      <View style={{ width: THUMB, height: THUMB, borderRadius: radius.control, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: theme.fieldSurface }}>
        <TrackThumbnail theme={theme} coords={track.coords} size={THUMB} color={selected && color ? color : theme.text3} />
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={[type.cardTitle, { color: theme.text }]}>{track.name}</Text>
        {facts.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: space.sm, rowGap: 2, marginTop: space.xxs }}>
            {facts.map((fact) => (
              <View key={fact.icon} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Icon name={fact.icon} color={theme.text3} size={12} />
                <Text style={[type.meta, { color: theme.text2, fontVariant: ['tabular-nums'] }]}>{fact.text}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>

      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: radius.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: selected ? theme.accent : 'transparent',
          borderWidth: selected ? 0 : 1.5,
          borderColor: theme.text3,
        }}
      >
        {selected ? <Icon name="check" color="#FFFFFF" size={14} strokeWidth={2.6} /> : null}
      </View>
    </Press>
  );
});
