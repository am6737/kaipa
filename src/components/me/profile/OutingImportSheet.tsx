// OutingImportSheet.tsx — 时间线「导入以前的轨迹」：选好的文件逐条读出来，让用户确认
// 哪些是自己走过的，再一起放进时间线。
//
// 没有时间的文件要补一个日期才能导入；时间线上已经有的同一次直接跳过；早先从
// 「我的轨迹」导入过的，只补「本人走过」的标记，不再传一份文件。
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import type { Theme } from '../../../theme/theme';
import { AppChoiceChip, layout, motion, radius, space, type } from '../../../design-system';
import { Icon } from '../../Icon';
import { Press } from '../../Press';
import { NJDateWheelPicker } from '../../overlays/NewJourneyParts';
import { useI18n, type TKey } from '../../../i18n';
import { useNav } from '../../../nav/NavContext';
import { useData } from '../../../data/DataContext';
import { createTrackFromFile, parseTrackFile, TrackFileError, type ParsedTrackFile, type TrackFile } from '../../../lib/trackImport';
import { findExistingTrack, noonOf, type ExistingMatch } from '../../../lib/outingImport';
import type { Visibility } from '../../../hooks/useSocial';

type Candidate = {
  key: string;
  file: TrackFile;
  parsed?: ParsedTrackFile;
  /** 读不出来时给用户看的原因。 */
  errorKey?: TKey;
  match?: ExistingMatch;
  checked: boolean;
  /** 文件里没有时间时用户补的日期。 */
  date?: { y: number; m: number; d: number };
};

const THUMB = 52;
const VISIBILITIES: { value: Visibility; key: TKey }[] = [
  { value: 'private', key: 'profile.visPrivate' },
  { value: 'followers', key: 'profile.visFollowers' },
  { value: 'public', key: 'profile.visPublic' },
];

const importable = (c: Candidate) => Boolean(c.parsed) && !c.match?.onTimeline;
const needsDate = (c: Candidate) => !c.parsed?.stats.startTime && !c.date;

export function OutingImportSheet({ theme, files, onClose, onImported }: {
  theme: Theme;
  files: TrackFile[];
  onClose: () => void;
  /** 至少放进去一条时调用，时间线据此重新拉取。 */
  onImported: () => void;
}) {
  const { t } = useI18n();
  const nav = useNav();
  const { userId, tracks, journeys, createTrack, updateTrack } = useData();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [reading, setReading] = useState(0);
  const [visibility, setVisibility] = useState<Visibility>('private');
  const [datePicking, setDatePicking] = useState<string | null>(null);
  const [saving, setSaving] = useState<{ done: number; total: number } | null>(null);
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(windowHeight)).current;
  const closingRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(backdropOpacity, { toValue: 1, duration: motion.standard, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, bounciness: 0, speed: 18, useNativeDriver: true }),
    ]).start();
  }, [backdropOpacity, translateY]);

  // 一个一个读，大文件不会同时占着内存；读完一条就显示一条。
  useEffect(() => {
    let cancelled = false;
    const journeyTrackIds = new Set(journeys.flatMap((journey) => (journey.trackId ? [journey.trackId] : [])));
    void (async () => {
      for (const [index, file] of files.entries()) {
        if (cancelled) return;
        setReading(index);
        const key = `${index}:${file.name}`;
        let candidate: Candidate;
        try {
          const parsed = await parseTrackFile(file, t);
          const match = findExistingTrack(parsed, tracks, journeyTrackIds);
          candidate = { key, file, parsed, match, checked: !match?.onTimeline };
        } catch (error) {
          console.warn('[OutingImportSheet] parse failed:', file.name, error);
          candidate = { key, file, checked: false, errorKey: error instanceof TrackFileError ? error.messageKey : 'record.track.errParse' };
        }
        if (cancelled) return;
        setCandidates((prev) => [...prev, candidate]);
      }
      if (!cancelled) setReading(files.length);
    })();
    return () => { cancelled = true; };
    // 只在打开时读一次；之后 tracks 变了也不重读已经确认过的列表。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  const close = (force = false) => {
    if ((!force && saving) || closingRef.current) return;
    closingRef.current = true;
    Animated.parallel([
      Animated.timing(backdropOpacity, { toValue: 0, duration: motion.quick, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      Animated.timing(translateY, { toValue: windowHeight, duration: motion.standard, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
    ]).start(() => onCloseRef.current());
  };

  const ready = candidates.filter(importable);
  const skipped = candidates.filter((c) => !importable(c));
  const chosen = ready.filter((c) => c.checked);
  const missingDates = chosen.filter(needsDate).length;
  const stillReading = reading < files.length;
  const canConfirm = !stillReading && !saving && chosen.length > 0 && missingDates === 0;

  const patch = (key: string, next: Partial<Candidate>) =>
    setCandidates((prev) => prev.map((c) => (c.key === key ? { ...c, ...next } : c)));

  const confirm = async () => {
    if (!canConfirm || !userId) return;
    let added = 0;
    setSaving({ done: 0, total: chosen.length });
    for (const [index, candidate] of chosen.entries()) {
      setSaving({ done: index, total: chosen.length });
      const parsed = candidate.parsed!;
      const startedAt = parsed.stats.startTime
        ? undefined
        : candidate.date ? noonOf(candidate.date.y, candidate.date.m, candidate.date.d) : undefined;
      try {
        if (candidate.match) {
          const ok = await updateTrack(candidate.match.track.id, {
            ownOuting: true,
            visibility,
            ...(startedAt && !candidate.match.track.startedAt ? { startedAt } : {}),
          });
          if (ok) added += 1;
        } else {
          await createTrackFromFile(
            parsed,
            { userId, sourceUri: candidate.file.uri, fileSize: candidate.file.size },
            (draft) => createTrack({ ...draft, ownOuting: true, visibility, startedAt: draft.startedAt ?? startedAt }),
          );
          added += 1;
        }
      } catch (error) {
        console.warn('[OutingImportSheet] import failed:', candidate.file.name, error);
      }
    }
    setSaving(null);
    const failed = chosen.length - added;
    if (added) onImported();
    nav.showToast(failed ? t('profile.importDonePartial', { count: added, failed }) : t('profile.importDone', { count: added }));
    close(true);
  };

  const buttonLabel = saving
    ? t('profile.importSaving', { done: saving.done + 1, total: saving.total })
    : missingDates
      ? t('profile.importConfirmNeedsDate', { count: missingDates })
      : t('profile.importConfirm', { count: chosen.length });

  return (
    <Modal transparent animationType="none" visible onRequestClose={() => close()} statusBarTranslucent>
      <View style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end' }]}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.34)', opacity: backdropOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => close()} />
        </Animated.View>
        <Animated.View
          style={{
            transform: [{ translateY }],
            maxHeight: windowHeight - insets.top - space.xxl,
            paddingTop: space.sm,
            paddingBottom: Math.max(insets.bottom, space.md) + space.sm,
            borderTopLeftRadius: 32,
            borderTopRightRadius: 32,
            backgroundColor: theme.featureSurface,
          }}
        >
          <View style={{ alignSelf: 'center', width: 38, height: 5, borderRadius: radius.pill, backgroundColor: theme.text3, opacity: 0.34 }} />

          <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.md }} showsVerticalScrollIndicator={false}>
            <Text style={[type.pageTitle, { color: theme.text, marginTop: space.lg }]}>{t('profile.importTitle')}</Text>
            <Text style={[type.lead, { color: theme.text2, marginTop: space.xs }]}>{t('profile.importLead')}</Text>

            {ready.length ? (
              <Text style={[type.eyebrow, { color: theme.text2, marginTop: space.xl }]}>{t('profile.importGroupReady', { count: ready.length })}</Text>
            ) : null}
            {ready.map((candidate) => (
              <View key={candidate.key}>
                <CandidateRow
                  theme={theme}
                  candidate={candidate}
                  disabled={Boolean(saving)}
                  onToggle={() => patch(candidate.key, { checked: !candidate.checked })}
                  onPickDate={() => setDatePicking((current) => (current === candidate.key ? null : candidate.key))}
                />
                {datePicking === candidate.key ? (
                  <DatePickerBlock
                    theme={theme}
                    value={candidate.date}
                    onChange={(date) => patch(candidate.key, { date, checked: true })}
                    onDone={() => setDatePicking(null)}
                  />
                ) : null}
              </View>
            ))}

            {stillReading ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.md }}>
                <ActivityIndicator size="small" color={theme.text2} />
                <Text style={[type.meta, { color: theme.text2 }]}>{t('profile.importReading', { done: reading + 1, total: files.length })}</Text>
              </View>
            ) : null}

            {skipped.length ? (
              <Text style={[type.eyebrow, { color: theme.text2, marginTop: space.lg }]}>{t('profile.importGroupSkipped')}</Text>
            ) : null}
            {skipped.map((candidate) => (
              <CandidateRow key={candidate.key} theme={theme} candidate={candidate} disabled />
            ))}

            {ready.length ? (
              <>
                <Text style={[type.eyebrow, { color: theme.text2, marginTop: space.xl, marginBottom: space.xs }]}>{t('profile.importVisibility')}</Text>
                <View style={{ flexDirection: 'row', gap: space.xs }}>
                  {VISIBILITIES.map((option) => (
                    <AppChoiceChip
                      key={option.value}
                      theme={theme}
                      label={t(option.key)}
                      selected={visibility === option.value}
                      onPress={() => setVisibility(option.value)}
                    />
                  ))}
                </View>
              </>
            ) : null}
          </ScrollView>

          <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm }}>
            <Press
              onPress={confirm}
              disabled={!canConfirm}
              accessibilityRole="button"
              style={{
                height: layout.fieldHeight + space.xs,
                borderRadius: radius.pill,
                backgroundColor: theme.accent,
                opacity: canConfirm || saving ? 1 : 0.4,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: space.xs,
              }}
            >
              {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : null}
              <Text style={[type.fieldLabel, { color: '#FFFFFF' }]}>{buttonLabel}</Text>
            </Press>
            <Text style={[type.hint, { color: theme.text3, textAlign: 'center', marginTop: space.xs }]}>{t('profile.importFootnote')}</Text>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

function CandidateRow({ theme, candidate, disabled, onToggle, onPickDate }: {
  theme: Theme;
  candidate: Candidate;
  disabled?: boolean;
  onToggle?: () => void;
  onPickDate?: () => void;
}) {
  const { t } = useI18n();
  const parsed = candidate.parsed;
  const blocked = !importable(candidate);
  const start = parsed?.stats.startTime;
  const dateLabel = start
    ? t('profile.dateFull', { y: start.getFullYear(), m: start.getMonth() + 1, d: start.getDate() })
    : candidate.date
      ? t('profile.dateFull', { y: candidate.date.y, m: candidate.date.m, d: candidate.date.d })
      : t('profile.importDateMissing');
  const facts = parsed
    ? [dateLabel, parsed.dist, parsed.stats.hasEle ? t('profile.importAscent', { m: Math.round(parsed.stats.ascent) }) : null].filter(Boolean).join('　')
    : null;
  const note = candidate.errorKey
    ? t(candidate.errorKey)
    : candidate.match?.onTimeline ? t('profile.importDuplicate') : null;
  const missingDate = !blocked && !start && !candidate.date;

  return (
    <Press
      onPress={onToggle}
      disabled={disabled || blocked}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: candidate.checked, disabled: disabled || blocked }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm, opacity: blocked ? 0.5 : 1 }}
    >
      <View style={{
        width: 22,
        height: 22,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: candidate.checked ? theme.accent : 'transparent',
        borderWidth: candidate.checked ? 0 : 2,
        borderColor: theme.text3,
      }}>
        {candidate.checked ? <Icon name="check" color="#FFFFFF" size={13} strokeWidth={3} /> : null}
      </View>
      <TrackThumb theme={theme} parsed={parsed} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={[type.cardTitle, { color: theme.text }]}>{parsed?.name ?? candidate.file.name}</Text>
        {facts ? <Text numberOfLines={1} style={[type.meta, { color: theme.text2, fontVariant: ['tabular-nums'] }]}>{facts}</Text> : null}
        {note ? <Text numberOfLines={2} style={[type.meta, { color: theme.text3 }]}>{note}</Text> : null}
        {!blocked && !start ? (
          <Press onPress={onPickDate} disabled={disabled} accessibilityRole="button" hitSlop={6}>
            <Text style={[type.meta, { color: theme.accent, fontWeight: missingDate ? '600' : '400' }]}>
              {missingDate ? t('profile.importNeedsDate') : t('profile.importChangeDate')}
            </Text>
          </Press>
        ) : null}
      </View>
    </Press>
  );
}

function DatePickerBlock({ theme, value, onChange, onDone }: {
  theme: Theme;
  value?: { y: number; m: number; d: number };
  onChange: (date: { y: number; m: number; d: number }) => void;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const today = useMemo(() => new Date(), []);
  const current = value ?? { y: today.getFullYear(), m: today.getMonth() + 1, d: today.getDate() };
  // 打开就算选了今天，不然用户没转轮子直接点完成会什么都没记下。
  useEffect(() => {
    if (!value) onChange(current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <View style={{ marginBottom: space.sm, paddingVertical: space.sm, borderRadius: radius.card, backgroundColor: theme.fieldSurface }}>
      <NJDateWheelPicker
        theme={theme}
        year={current.y}
        month={current.m}
        day={current.d}
        minYear={2000}
        maxYear={today.getFullYear()}
        onChange={(y, m, d) => onChange({ y, m, d })}
      />
      <Press onPress={onDone} accessibilityRole="button" style={{ alignSelf: 'center', marginTop: space.xs, paddingVertical: space.xs, paddingHorizontal: space.lg }}>
        <Text style={[type.chip, { color: theme.accent }]}>{t('profile.importDateDone')}</Text>
      </Press>
    </View>
  );
}

// 坐标是 [lon, lat]，按纬度缩放经度，和时间线卡片的缩略图一个画法。
function TrackThumb({ theme, parsed }: { theme: Theme; parsed?: ParsedTrackFile }) {
  const d = useMemo(() => {
    const points = parsed?.stats.points;
    if (!points || points.length < 2) return null;
    const step = Math.max(1, Math.floor(points.length / 80));
    const sample = points.filter((_, index) => index % step === 0 || index === points.length - 1);
    const kx = Math.cos((((parsed.stats.bbox.minLat + parsed.stats.bbox.maxLat) / 2) * Math.PI) / 180);
    const xs = sample.map((p) => p.lon * kx);
    const ys = sample.map((p) => -p.lat);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const pad = 8;
    const scale = Math.min((THUMB - pad * 2) / Math.max(maxX - minX, 1e-9), (THUMB - pad * 2) / Math.max(maxY - minY, 1e-9));
    const offX = (THUMB - (maxX - minX) * scale) / 2;
    const offY = (THUMB - (maxY - minY) * scale) / 2;
    return xs.map((x, index) => `${index ? 'L' : 'M'}${(offX + (x - minX) * scale).toFixed(1)},${(offY + (ys[index] - minY) * scale).toFixed(1)}`).join(' ');
  }, [parsed]);
  return (
    <View style={{ width: THUMB, height: THUMB, borderRadius: 10, overflow: 'hidden', backgroundColor: theme.fieldSurface }}>
      {d ? (
        <Svg width={THUMB} height={THUMB}>
          <Path d={d} stroke={theme.accent} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </Svg>
      ) : null}
    </View>
  );
}
