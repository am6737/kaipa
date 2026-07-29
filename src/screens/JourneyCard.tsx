// JourneyCard.tsx — SelectedPoiCard: the rich detail body for a route or journey,
// shown inside the discover sheet and (full-bleed) in the JourneyCardFull overlay.
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Modal } from 'react-native';
import { Image } from 'expo-image';
import { MONO } from '../theme/fonts';
import { Theme } from '../theme/theme';
import { Poi } from '../data/pois';
import { TLRow } from '../data/timeline';
import { JourneyTimelineCard } from '../components/overlays/JourneyTimeline';
import { PhotoTile } from '../components/PhotoTile';
import { Avatar } from '../components/Avatar';
import { Icon, IconName } from '../components/Icon';
import { Press } from '../components/Press';
import { Segmented } from '../components/Segmented';
import { useNav } from '../nav/NavContext';
import { useInspo } from '../hooks/useInspo';
import { useTimeline } from '../hooks/useTimeline';
import { useData } from '../data/DataContext';
import { genPhotos } from '../components/overlays/PhotoWall';
import { useI18n, TKey } from '../i18n';
import { NJBottomSheet, NJMiniCalendar, NJWheelPicker, njFormatTime } from '../components/overlays/NewJourneyParts';
import { ElevationStrip } from '../components/overlays/ElevationStrip';
import { AppCard, AppPropertyRow, AppSectionHeader, radius, space, type } from '../design-system';

function SectionHeader({ theme, title, action, onAction }: { theme: Theme; title: string; action?: string; onAction?: () => void }) {
  const trailing = action ? (
    <Press onPress={onAction} style={{ paddingVertical: space.xxs }}>
      <Text style={[type.body, { fontWeight: '600', color: theme.accent }]}>{action}</Text>
    </Press>
  ) : undefined;
  return <AppSectionHeader theme={theme} text={title} trailing={trailing} variant="title" marginTop={0} />;
}

function FloatingIconButton({ name, onPress, color }: { name: IconName; onPress?: () => void; color?: string }) {
  return (
    <Press
      onPress={onPress}
      style={{
        width: 38,
        height: 38,
        borderRadius: 19,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.36)',
      }}
    >
      <Icon name={name} color={color || '#fff'} size={20} />
    </Press>
  );
}


// Split a display string like "6.2 km" / "+1,640 m" / "3天" into a big value and
// a small trailing unit. Non-numeric strings (e.g. a difficulty label) pass through.
function splitStat(s?: string): { value: string; unit?: string } {
  if (!s) return { value: '—' };
  const m = s.trim().match(/^([+\-]?[\d.,]+)\s*(.+)?$/);
  if (m) return { value: m[1], unit: m[2]?.trim() || undefined };
  return { value: s.trim() };
}

function parseStatNumber(s?: string): number | undefined {
  const n = Number((s || '').replace(/,/g, '').match(/[\d.]+/)?.[0]);
  return Number.isFinite(n) ? n : undefined;
}

function fmtMeters(n?: number): string {
  if (!Number.isFinite(n)) return '—';
  return `${Math.round(n as number)} m`;
}

function fmtSpeed(distance?: string, durationMs?: number): string {
  const km = parseStatNumber(distance);
  if (!km || !durationMs || durationMs <= 0) return '—';
  return `${(km / (durationMs / 3600000)).toFixed(1)} km/h`;
}

function fmtIntensity(distance?: string, ascent?: string): string {
  const km = parseStatNumber(distance);
  const m = parseStatNumber(ascent);
  if (!km || !m) return '—';
  return `${Math.round(m / km)} m/km`;
}

function StatTile({ theme, value, unit, label, accent, mono = true }: { theme: Theme; value: string; unit?: string; label: string; accent?: boolean; mono?: boolean }) {
  return (
    <View
      style={{
        flex: 1,
        paddingVertical: 6,
      }}
    >
      <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontFamily: mono ? MONO : undefined, fontSize: 23, fontWeight: '800', color: accent ? theme.accent : theme.text, letterSpacing: -0.7 }}>
        {value}
        {unit ? <Text style={{ fontSize: 11, fontWeight: '700', color: theme.text2 }}> {unit}</Text> : null}
      </Text>
      <Text style={{ fontSize: 11, color: theme.text3, fontWeight: '600', marginTop: 5, letterSpacing: 0.2 }}>{label}</Text>
    </View>
  );
}

function FactItem({ theme, label, value }: { theme: Theme; label: string; value: string }) {
  return (
    <View style={{ width: '48%', paddingTop: 10, paddingBottom: 8 }}>
      <Text numberOfLines={1} style={{ fontSize: 11.5, color: theme.text3 }}>{label}</Text>
      <Text numberOfLines={1} style={{ fontSize: 14.5, color: theme.text, fontWeight: '500', marginTop: 4, letterSpacing: -0.1 }}>{value}</Text>
    </View>
  );
}

type TabId = 'overview' | 'moments' | 'checklist' | 'plan' | `day:${string}`;


function MetaChip({ theme, icon, iconColor, text, mono, onPress }: { theme: Theme; icon?: IconName; iconColor?: string; text: string; mono?: boolean; onPress?: () => void }) {
  const style = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.xxs, height: 30, maxWidth: '100%' as const, paddingHorizontal: space.sm, borderRadius: radius.control, backgroundColor: theme.fieldSurface, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.fieldBorder };
  const content = (
    <>
      {icon ? <Icon name={icon} size={13} color={iconColor || theme.text3} /> : null}
      <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: mono ? MONO : undefined, fontSize: 11.5, color: theme.text2, fontWeight: '700' }}>{text}</Text>
    </>
  );
  return onPress ? <Press onPress={onPress} style={style}>{content}</Press> : <View style={style}>{content}</View>;
}

// Companions collapse to a compact facepile "button" (overlapping avatars + a
// chevron), not a full roster — who-came-along is secondary to the trip's numbers.
// Tap opens the roster/manage editor. Empty = a small "+ 同行" add pill.
function CompanionPile({ theme, companions, onPress }: { theme: Theme; companions: NonNullable<Poi['companionList']>; onPress: () => void }) {
  const { t } = useI18n();
  const chipBg = theme.fieldSurface;
  const ring = theme.featureSurface;
  if (companions.length === 0) {
    return (
      <Press onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: space.xxs, height: 30, paddingHorizontal: space.sm, borderRadius: radius.control, backgroundColor: chipBg, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.fieldBorder }}>
        <Icon name="plus" size={13} color={theme.text3} />
        <Text style={{ fontSize: 12.5, color: theme.text3, fontWeight: '500' }}>{t('journey.tab.companions')}</Text>
      </Press>
    );
  }
  const shown = companions.slice(0, 3);
  const extra = companions.length - shown.length;
  return (
    <Press onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs, height: 30, paddingLeft: space.xxs, paddingRight: space.xs, borderRadius: radius.control, backgroundColor: chipBg, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.fieldBorder }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {shown.map((c, i) => (
          <View key={c.name + i} style={{ marginLeft: i === 0 ? 0 : -9, borderRadius: 13, borderWidth: 1.5, borderColor: ring }}>
            <Avatar ini={c.ini} color={c.color} size={21} />
          </View>
        ))}
        {extra > 0 ? (
          <View style={{ marginLeft: -9, width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: ring, backgroundColor: theme.controlSurface, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 10, fontWeight: '700', color: theme.text2 }}>+{extra}</Text>
          </View>
        ) : null}
      </View>
      <Icon name="chevronR" size={12} color={theme.text3} />
    </Press>
  );
}

function addMinutes(d: Date, mins: number): Date {
  return new Date(d.getTime() + mins * 60000);
}

function startOfTodayAtNine(): Date {
  const d = new Date();
  d.setHours(9, 0, 0, 0);
  return d;
}

function parseJourneyStart(poi: Poi): Date {
  const now = new Date();
  const text = [poi.plannedDate, poi.date].filter(Boolean).join(' ');
  const y = text.match(/(20\d{2})/);
  const md = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日?/);
  const hm = text.match(/(\d{1,2}):(\d{2})/);
  if (md) {
    const d = new Date(y ? Number(y[1]) : now.getFullYear(), Number(md[1]) - 1, Number(md[2]));
    d.setHours(hm ? Number(hm[1]) : 9, hm ? Number(hm[2]) : 0, 0, 0);
    return d;
  }
  return startOfTodayAtNine();
}

function parseJourneyDurationMins(poi: Poi): number {
  if (poi.trackDurationMs && poi.trackDurationMs > 0) return Math.max(30, Math.round(poi.trackDurationMs / 60000));
  const text = poi.days || '';
  const n = Number((text.match(/[\d.]+/) || [])[0]);
  if (Number.isFinite(n) && n > 0) {
    if (/时|hour|hr|h\b/i.test(text)) return Math.max(30, Math.round(n * 60));
    return Math.max(30, Math.round(n * 24 * 60));
  }
  if (poi.totalDays && poi.totalDays > 0) return poi.totalDays * 24 * 60;
  return 24 * 60;
}

function detailDurationLabel(mins: number): string {
  const safe = Math.max(30, mins);
  if (safe < 24 * 60) {
    const h = Math.max(1, Math.round(safe / 60));
    return `${h}时`;
  }
  const d = Math.max(1, Math.round(safe / (24 * 60)));
  return `${d}天`;
}

function compactDate(d: Date): string {
  return `${d.getFullYear()} · ${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}

function compactPlannedDate(d: Date): string {
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 ${njFormatTime(d)}`;
}

function JourneyTimePicker({ theme, poi, onApply, onClose }: { theme: Theme; poi: Poi; onApply: (patch: Partial<Poi>) => void; onClose: () => void }) {
  const { t } = useI18n();
  const [draftStart, setDraftStart] = useState(() => parseJourneyStart(poi));
  const [draftEnd, setDraftEnd] = useState(() => addMinutes(parseJourneyStart(poi), parseJourneyDurationMins(poi)));
  const [active, setActive] = useState<'start' | 'end'>('start');
  const activeDt = active === 'start' ? draftStart : draftEnd;
  const durationMins = Math.max(30, Math.round((draftEnd.getTime() - draftStart.getTime()) / 60000));

  const setActiveDt = (next: Date) => {
    if (active === 'start') {
      const oldDur = durationMins;
      setDraftStart(next);
      setDraftEnd((end) => (end <= next ? addMinutes(next, oldDur) : end));
    } else {
      setDraftEnd(next <= draftStart ? addMinutes(draftStart, 30) : next);
    }
  };
  const selectDate = (date: Date) => {
    const next = new Date(date);
    next.setHours(activeDt.getHours(), activeDt.getMinutes(), 0, 0);
    setActiveDt(next);
  };
  const selectTime = (mins: number) => {
    const next = new Date(activeDt);
    next.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
    setActiveDt(next);
  };
  const setDuration = (mins: number) => setDraftEnd(addMinutes(draftStart, mins));
  const apply = () => {
    const dur = Math.max(30, Math.round((draftEnd.getTime() - draftStart.getTime()) / 60000));
    const totalDays = Math.max(1, Math.ceil(dur / (24 * 60)));
    onApply({
      date: compactDate(draftStart),
      plannedDate: compactPlannedDate(draftStart),
      days: detailDurationLabel(dur),
      totalDays,
      trackDurationMs: dur * 60000,
    });
    onClose();
  };
  const Tab = ({ k, label, dt }: { k: 'start' | 'end'; label: string; dt: Date }) => {
    const on = active === k;
    return (
      <Press
        onPress={() => setActive(k)}
        style={{
          flex: 1,
          paddingVertical: 8,
          paddingHorizontal: 10,
          borderRadius: 12,
          backgroundColor: on ? theme.bg : 'transparent',
          alignItems: 'center',
        }}
      >
        <Text style={{ fontSize: 10.5, fontWeight: '700', color: on ? theme.text2 : theme.text3, letterSpacing: 0.6, textTransform: 'uppercase' }}>{label}</Text>
        <Text style={{ fontSize: 15, fontWeight: '700', color: on ? theme.accent : theme.text2, marginTop: 2, letterSpacing: -0.2 }}>{`${dt.getMonth() + 1}/${dt.getDate()} · ${njFormatTime(dt)}`}</Text>
      </Press>
    );
  };
  const quick = [6 * 60, 12 * 60, 24 * 60, 2 * 24 * 60, 3 * 24 * 60, 5 * 24 * 60, 7 * 24 * 60];
  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose}>
      <NJBottomSheet theme={theme} onClose={onClose} full bodyScrolls>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, paddingHorizontal: 2 }}>
          <Press onPress={onClose} style={{ padding: 4 }}>
            <Text style={{ fontSize: 14.5, color: theme.text2, fontWeight: '500' }}>{t('common.cancel')}</Text>
          </Press>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: theme.text, letterSpacing: -0.2 }}>修改时间</Text>
            <Text style={{ fontSize: 11, color: theme.text3, marginTop: 2 }}>{detailDurationLabel(durationMins)}</Text>
          </View>
          <Press onPress={apply} style={{ padding: 4 }}>
            <Text style={{ fontSize: 14.5, color: theme.accent, fontWeight: '700' }}>{t('common.done')}</Text>
          </Press>
        </View>

        <View style={{ flexDirection: 'row', gap: 4, padding: 4, marginBottom: 14, borderRadius: 14, backgroundColor: theme.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }}>
          <Tab k="start" label="开始" dt={draftStart} />
          <Tab k="end" label="结束" dt={draftEnd} />
        </View>

        <View style={{ marginBottom: 12 }}>
          <NJMiniCalendar theme={theme} selectedDate={activeDt} onSelect={selectDate} allowPast />
        </View>
        <View style={{ alignItems: 'center', marginBottom: 6 }}>
          <Text style={{ fontSize: 10.5, fontWeight: '700', color: theme.text2, letterSpacing: 0.6, textTransform: 'uppercase' }}>{active === 'start' ? '开始时间' : '结束时间'}</Text>
        </View>
        <NJWheelPicker theme={theme} value={activeDt.getHours() * 60 + activeDt.getMinutes()} onChange={selectTime} />

        <View style={{ marginTop: 14 }}>
          <Text style={{ fontSize: 10.5, fontWeight: '700', color: theme.text2, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8 }}>快速时长</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {quick.map((mins) => {
              const on = Math.abs(durationMins - mins) < 1;
              return (
                <Press
                  key={mins}
                  onPress={() => setDuration(mins)}
                  style={{
                    height: 32,
                    paddingHorizontal: 14,
                    borderRadius: 16,
                    backgroundColor: on ? theme.accent : theme.dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: on ? theme.accent : theme.hairline,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ fontSize: 12.5, fontWeight: '600', color: on ? '#fff' : theme.text }}>{detailDurationLabel(mins)}</Text>
                </Press>
              );
            })}
          </View>
        </View>
      </ScrollView>
      </NJBottomSheet>
    </Modal>
  );
}

function JourneyPlanEditContent({
  theme,
  days,
  rows,
  selectedDays,
  onToggleDay,
  onEditDate,
  onAddGroup,
}: {
  theme: Theme;
  days: string[];
  rows: TLRow[];
  selectedDays: Set<string>;
  onToggleDay: (day: string) => void;
  onEditDate: () => void;
  onAddGroup: () => void;
}) {
  const { t } = useI18n();


  return (
    <View style={{ paddingHorizontal: space.md, paddingBottom: space.lg }}>
      <Press
        onPress={onEditDate}
        style={{ alignSelf: 'flex-start', height: 38, paddingHorizontal: space.md, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: space.xs, backgroundColor: theme.fieldSurface, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.fieldBorder }}
      >
        <Icon name="calendar" color={theme.text2} size={16} />
        <Text style={[type.body, { color: theme.text2, fontWeight: '600' }]}>{t('journey.timeline.changeDate')}</Text>
      </Press>

      <View style={{ marginTop: space.md, gap: space.sm }}>
        {days.map((day) => {
          const dayRows = rows.filter((row) => row.day === day);
          const selected = selectedDays.has(day);
          return (
            <Press
              key={day}
              onPress={() => onToggleDay(day)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected }}
              style={{ minHeight: 96, padding: space.md, borderRadius: radius.feature, backgroundColor: selected ? theme.accentSofter : theme.fieldSurface, borderWidth: selected ? 1.5 : StyleSheet.hairlineWidth, borderColor: selected ? theme.accent : theme.fieldBorder }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }}>
                <View style={{ width: 24, height: 24, marginTop: space.xxs, borderRadius: radius.pill, borderWidth: 2, borderColor: selected ? theme.accent : theme.fieldBorder, backgroundColor: selected ? theme.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                  {selected ? <Icon name="check" color="#FFFFFF" size={13} strokeWidth={3} /> : null}
                </View>

                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[type.sectionTitle, { color: theme.text }]}>{day.toUpperCase()}</Text>
                  <Text numberOfLines={3} style={[type.body, { color: dayRows[0] ? theme.text2 : theme.text3, marginTop: space.xs, lineHeight: 21 }]}>
                    {dayRows.length ? dayRows.slice(0, 3).map((row) => row.title).join(' → ') : t('journey.empty.timelineHint')}
                  </Text>
                </View>

                <View pointerEvents="none" style={{ width: 28, height: 36, alignItems: 'center', justifyContent: 'center', gap: 4, opacity: 0.55 }}>
                  <View style={{ width: 16, height: 2, borderRadius: radius.pill, backgroundColor: theme.text3 }} />
                  <View style={{ width: 16, height: 2, borderRadius: radius.pill, backgroundColor: theme.text3 }} />
                  <View style={{ width: 16, height: 2, borderRadius: radius.pill, backgroundColor: theme.text3 }} />
                </View>
              </View>
            </Press>
          );
        })}
      </View>

      <Press onPress={onAddGroup} style={{ alignSelf: 'flex-start', marginTop: space.lg, minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <View style={{ width: 34, height: 34, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.fieldSurface, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.fieldBorder }}>
          <Icon name="plus" color={theme.text2} size={17} />
        </View>
        <Text style={[type.body, { color: theme.text2, fontWeight: '700' }]}>{t('journey.timeline.newGroup')}</Text>
      </Press>
    </View>
  );
}

export function SelectedPoiCard({ theme, poi, fullBleed, embedded, onTrackSelectionChange, planEditorOpen: controlledPlanEditorOpen, onPlanEditorOpenChange, selectedPlanDays: controlledSelectedPlanDays, onSelectedPlanDaysChange }: { theme: Theme; poi: Poi; fullBleed?: boolean; embedded?: boolean; onTrackSelectionChange?: (index: number | null, coord?: [number, number]) => void; planEditorOpen?: boolean; onPlanEditorOpenChange?: (open: boolean) => void; selectedPlanDays?: Set<string>; onSelectedPlanDaysChange?: (days: Set<string>) => void }) {
  const nav = useNav();
  const { t } = useI18n();
  const { userId, profile, sets } = useData();
  const isJourney = poi.kind === 'journey';
  const isMine = isJourney;
  const embeddedSurface = embedded && !theme.dark ? theme.featureSurface : theme.fieldSurface;
  const hasTrack = (poi.trackCoords?.length ?? 0) >= 2;

  const inspo = useInspo(poi.id, userId);
  const timeline = useTimeline(isJourney ? poi.id : undefined, isJourney ? userId : undefined);
  const journeyDays = useMemo(() => {
    if (!isJourney) return [];
    const labels = new Set<string>();
    const total = Math.max(1, poi.totalDays || Number.parseInt(poi.days || '', 10) || 1);
    for (let day = 1; day <= total; day += 1) labels.add(`Day ${day}`);
    timeline.knownGroups.forEach((label) => { if (label.trim()) labels.add(label.trim()); });
    timeline.rows.forEach((row) => { if (row.day.trim()) labels.add(row.day.trim()); });
    return [...labels].sort((a, b) => {
      const ai = Number(a.match(/day\s*(\d+)/i)?.[1] || Number.POSITIVE_INFINITY);
      const bi = Number(b.match(/day\s*(\d+)/i)?.[1] || Number.POSITIVE_INFINITY);
      return ai === bi ? a.localeCompare(b) : ai - bi;
    });
  }, [isJourney, poi.totalDays, poi.days, timeline.knownGroups, timeline.rows]);

  // photo preview — genPhotos (from poi.photoUris) + inspo (user-uploaded)
  // For routes, show photos from index 1 onwards (index 0 is hero cover);
  // for journeys, genPhotos already skips the cover.
  const wallPhotos = useMemo(
    () => isJourney
      ? genPhotos(poi)
      : (poi.routeShowPhotos !== false && poi.photoUris && poi.photoUris.length > 1
          ? poi.photoUris.slice(1).map((uri, i) => ({ id: `real-${i}`, uri, tone: poi.tone || 'ridge', ratio: 1, kind: 'image' as const, caption: '', day: 1, author: { ini: '?', name: '', color: '#888' } }))
          : []),
    [isJourney, poi.name, poi.photoUris, poi.tone, poi.routeShowPhotos],
  );
  const inspoAsWall = useMemo(
    () => (isJourney || poi.routeShowPhotos !== false ? inspo.media.map(m => ({ id: m.id, uri: m.uri, kind: m.kind, thumbnail: m.thumbnail, tone: poi.tone || 'ridge', ratio: 1 })) : []),
    [inspo.media, poi.tone, isJourney, poi.routeShowPhotos],
  );
  const allPhotos = [...wallPhotos, ...inspoAsWall];
  // Peer tabs: 总览 / 瞬间 / 行程. 轨迹 is no longer a tab — the elevation lives on the
  // map above (a toggle reveals a scrubbable strip), since the map already is the
  // track. 同行 is a facepile inside 总览. Routes tab only what applies.
  const tabOptions = useMemo<{ id: TabId; label: string }[]>(() => {
    if (isJourney) {
      return [
        { id: 'overview', label: t('journey.tab.overview') },
        { id: 'moments', label: t('journey.tab.moments') },
        { id: 'checklist', label: t('journey.tab.checklist') },
        ...journeyDays.map((day) => ({ id: `day:${day}` as TabId, label: day.toUpperCase() })),
      ];
    }
    const opts: { id: TabId; label: string }[] = [
      { id: 'overview', label: t('journey.tab.overview') },
    ];
    if (poi.routeShowTimeline !== false) opts.push({ id: 'plan', label: t('journey.tab.plan') });
    if (poi.routeShowPhotos !== false && allPhotos.length > 0) opts.push({ id: 'moments', label: t('journey.moments.userPhotos') });
    return opts;
  }, [isJourney, journeyDays, poi.routeShowTimeline, poi.routeShowPhotos, allPhotos.length, t]);
  const [seg, setSeg] = useState<TabId>('overview');
  const [planOverviewOpen, setPlanOverviewOpen] = useState(false);
  const [internalPlanEditorOpen, setInternalPlanEditorOpen] = useState(false);
  const [internalSelectedPlanDays, setInternalSelectedPlanDays] = useState<Set<string>>(() => new Set());
  const planEditorOpen = controlledPlanEditorOpen ?? internalPlanEditorOpen;
  const selectedPlanDays = controlledSelectedPlanDays ?? internalSelectedPlanDays;
  const setPlanEditorOpen = (open: boolean) => onPlanEditorOpenChange ? onPlanEditorOpenChange(open) : setInternalPlanEditorOpen(open);
  const setSelectedPlanDays = (days: Set<string>) => onSelectedPlanDaysChange ? onSelectedPlanDaysChange(days) : setInternalSelectedPlanDays(days);
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const headerDuration = useMemo(() => detailDurationLabel(parseJourneyDurationMins(poi)), [poi.days, poi.totalDays, poi.trackDurationMs, poi.plannedDate, poi.date]);
  const headerDate = poi.plannedDate || (poi.dayIndex ? undefined : poi.date);
  // Author/host shown beside the title — a route's uploader, or a journey's host
  // (falls back to you, since a journey shown here is your own).
  const author = useMemo(() => {
    const host = isJourney ? (poi.companionList?.find((c) => c.host) || poi.companionList?.find((c) => c.self)) : undefined;
    if (host) return { ini: host.ini, name: host.name, color: host.color };
    return { ini: profile.nick?.charAt(0) || '?', name: profile.nick || t('me.unnamed'), color: theme.accent };
  }, [isJourney, poi.companionList, profile.nick, theme.accent, t]);
  const elevationSummary = useMemo(() => {
    const elevations = (poi.trackElevation || []).map((p) => p.ele).filter((n) => Number.isFinite(n));
    const maxEle = elevations.length ? Math.max(...elevations) : undefined;
    const minEle = elevations.length ? Math.min(...elevations) : undefined;
    return { maxEle, minEle };
  }, [poi.trackElevation]);

  // Distance + ascent stay as the headline numbers; journeys use highest elevation
  // as the third headline because it is more meaningful here than elapsed time.
  const primaryStats = useMemo<{ label: string; raw: string; mono?: boolean; accent?: boolean }[]>(() => {
    const base: { label: string; raw: string; mono?: boolean; accent?: boolean }[] = [
      { label: t('journey.stat.distance'), raw: poi.dist, mono: true },
      { label: t('journey.stat.ascent'), raw: poi.asc, mono: true },
    ];
    if (isJourney) base.push({ label: t('journey.stat.highest'), raw: fmtMeters(elevationSummary.maxEle), mono: true });
    else base.push({ label: t('journey.stat.difficulty'), raw: poi.diff ? t(`common.diff.${poi.diff}` as TKey) : '—', mono: false });
    return base;
  }, [isJourney, poi.dist, poi.asc, poi.diff, elevationSummary.maxEle, t]);
  const overviewStats = useMemo<{ label: string; value: string }[]>(() => {
    const { maxEle, minEle } = elevationSummary;
    const stats: { label: string; value: string }[] = [];
    if (isJourney) {
      stats.push(
        { label: t('journey.stat.date'), value: poi.plannedDate || poi.date || '—' },
        { label: t('journey.stat.companions'), value: t('journey.companions.companionCount', { count: poi.companionList?.length || poi.companions || 0 }) },
        { label: t('journey.stat.moments'), value: t('journey.moments.countPhotos', { count: allPhotos.length }) },
      );
    } else {
      stats.push(
        { label: t('journey.stat.rating'), value: poi.rating || '—' },
        { label: t('journey.stat.people'), value: t('journey.author.walkedCount', { count: poi.reviews ?? 0 }) },
      );
    }
    if (maxEle != null && minEle != null) {
      if (!isJourney) stats.push({ label: t('journey.stat.highest'), value: fmtMeters(maxEle) });
      stats.push({ label: t('journey.stat.elevationRange'), value: fmtMeters(maxEle - minEle) });
    }
    const speed = fmtSpeed(poi.dist, poi.trackDurationMs);
    if (speed !== '—') stats.push({ label: t('journey.stat.avgSpeed'), value: speed });
    const intensity = fmtIntensity(poi.dist, poi.asc);
    if (intensity !== '—') stats.push({ label: t('journey.stat.intensity'), value: intensity });
    return stats;
  }, [isJourney, elevationSummary, poi.plannedDate, poi.date, poi.companionList, poi.companions, poi.rating, poi.reviews, poi.dist, poi.asc, poi.trackDurationMs, allPhotos.length, t]);
  const firstJourneyDay = journeyDays[0];
  const firstDayRows = useMemo(
    () => firstJourneyDay ? timeline.rows.filter((row) => row.day === firstJourneyDay).slice(0, 3) : [],
    [firstJourneyDay, timeline.rows],
  );
  const selectedJourneyDay = seg.startsWith('day:') ? seg.slice(4) : undefined;
  const addJourneyGroup = (select = true) => {
    const used = new Set(journeyDays.map((day) => day.toLowerCase()));
    let index = 1;
    while (used.has(`day ${index}`)) index += 1;
    const label = `Day ${index}`;
    timeline.addGroup(label);
    if (select) setSeg(`day:${label}`);
  };
  const openGearLists = () => {
    nav.closeDetail();
    nav.setMainTab('gear');
  };
  const closePlanEditor = () => {
    setPlanEditorOpen(false);
    setSelectedPlanDays(new Set());
  };
  const togglePlanEditor = () => {
    if (planEditorOpen) closePlanEditor();
    else setPlanEditorOpen(true);
  };
  const toggleSelectedPlanDay = (day: string) => {
    const next = new Set(selectedPlanDays);
    if (next.has(day)) next.delete(day);
    else next.add(day);
    setSelectedPlanDays(next);
  };

  const removeLabel = t('common.delete');
  const confirmTitle = t('common.delete');
  const confirmRemove = () =>
    nav.openActionSheet({
      title: confirmTitle,
      message: t('journey.remove.confirmMessage'),
      items: [{ label: removeLabel, destructive: true, onPress: () => nav.removeJourney() }],
    });

  // text-only items — the action sheet matches the rest of the app's icon-less,
  // iOS-standard style
  const moreItems = isJourney
    ? [
        { label: t('journey.more.settings'), onPress: () => nav.openJourneySettings(poi) },
        { label: removeLabel, destructive: true, onPress: confirmRemove },
      ]
    : [
        { label: t('journey.more.report'), destructive: true, onPress: () => nav.showToast(t('journey.toast.reported')) },
      ];

  const onShare = () => nav.openSharePanel(poi);

  const quickActions = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <FloatingIconButton name={poi.fav ? 'heartFill' : 'heart'} color={poi.fav ? theme.trailMine : '#fff'} onPress={() => nav.toggleFav()} />
      <FloatingIconButton name="share" onPress={onShare} />
      <FloatingIconButton name="more" onPress={() => nav.openActionSheet({ items: moreItems as any })} />
    </View>
  );

  return (
    <View>
      {/* identity header — lives in the sheet so the map remains focused on the route */}
      {embedded ? isJourney ? (
        <View style={{ paddingTop: space.xxs, paddingBottom: space.lg }}>
          <Text numberOfLines={2} style={[type.pageTitle, { color: theme.text, fontSize: 28, lineHeight: 34 }]}>{poi.name}</Text>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: space.md }}>
            <MetaChip theme={theme} icon="distance" text={poi.dist} mono />
            <MetaChip theme={theme} icon="arrowUp" text={poi.asc.replace('+', '')} mono />
            {poi.region ? <MetaChip theme={theme} icon="pin" text={poi.region.replace(/\s*·\s*/g, ' ')} /> : null}
            <MetaChip theme={theme} icon="calendar" text={headerDate || t('journey.stat.date')} onPress={() => setTimePickerOpen(true)} />
            <MetaChip theme={theme} icon="clock" text={headerDuration} onPress={() => setTimePickerOpen(true)} />
            <CompanionPile theme={theme} companions={poi.companionList || []} onPress={() => nav.openJourneySettings(poi)} />
          </View>
        </View>
      ) : (
        <View style={{ paddingTop: space.xxs, paddingBottom: space.md }}>
          <Text style={[type.pageTitle, { color: theme.text }]}>{poi.name}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: space.xs }}>
            <Text style={[type.body, { color: theme.text2, flex: 1 }]} numberOfLines={1}>{poi.region}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginLeft: space.sm }}>
              <Avatar ini={author.ini} color={author.color} size={22} />
              <Text style={[type.caption, { fontWeight: '600', color: theme.text2 }]} numberOfLines={1}>{author.name}</Text>
            </View>
          </View>
        </View>
      ) : null}
      {/* hero — skipped when embedded (the split detail shows the map above) */}
      {!embedded && (
      <View style={{ marginHorizontal: fullBleed ? -10 : -16, marginTop: fullBleed ? 0 : -2, marginBottom: 16 }}>
        <View style={{ height: 224 }}>
          {poi.photoUris?.[0] ? (
            <Image source={{ uri: poi.photoUris[0] }} contentFit="cover" style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.dark ? '#2c2c2e' : '#e5e5ea' }]} />
          )}
          {nav.pointSource && (
            <Press
              onPress={() => nav.openPoint(nav.pointSource as Poi)}
              style={{
                position: 'absolute',
                top: 14,
                left: 14,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                paddingHorizontal: 11,
                height: 32,
                borderRadius: 16,
                backgroundColor: 'rgba(0,0,0,0.35)',
              }}
            >
              <Icon name="chevronL" color="#fff" size={15} />
              <Text style={{ color: '#fff', fontSize: 12.5, fontWeight: '600' }} numberOfLines={1}>
                {nav.pointSource.name}
              </Text>
            </Press>
          )}
          <View style={{ position: 'absolute', top: 14, right: 14 }}>
            {quickActions}
          </View>
          <View style={{ position: 'absolute', left: 16, right: 16, bottom: 16 }}>

            <Text style={{ color: '#fff', fontSize: 26, fontWeight: '800', textShadowColor: 'rgba(0,0,0,0.4)', textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } }}>
              {poi.name}
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.86)', fontSize: 13, marginTop: 3 }}>
              {poi.region}
              {isJourney && poi.date ? ' · ' + poi.date : ''}
            </Text>
          </View>
        </View>
      </View>
      )}


      {/* Journeys use one clear navigation level: 总览 + each DAY. */}
      {tabOptions.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginHorizontal: -space.md }}
          contentContainerStyle={{ paddingHorizontal: space.md, paddingTop: space.xxs, paddingBottom: space.md }}
        >
          <Segmented variant="underline" size="compact" theme={theme} value={seg} options={tabOptions} onChange={(v) => { closePlanEditor(); setSeg(v); }} stretch={false} />
          {isJourney && !planEditorOpen ? (
            <Press
              onPress={() => addJourneyGroup()}
              accessibilityLabel={t('journey.timeline.newGroup')}
              style={{ width: 42, height: 39, alignItems: 'center', justifyContent: 'center', marginLeft: space.xxs }}
            >
              <Icon name="plus" color={theme.text2} size={18} />
            </Press>
          ) : null}
        </ScrollView>
      ) : null}

      <View style={{ paddingBottom: 18 }}>
        {/* 总览 overview — stat tiles, meta chips, 同行 facepile, about */}
        {seg === 'overview' ? isJourney ? (
          <>
            <AppCard
              theme={theme}
              radius={radius.feature}
              style={{ marginHorizontal: -space.md, overflow: 'hidden', backgroundColor: theme.surfaceTop, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.fieldBorder }}
            >
              <View style={{ paddingHorizontal: space.md, paddingTop: space.lg, paddingBottom: planEditorOpen ? space.sm : space.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={[type.sectionTitle, { flex: 1, color: theme.text }]}>{t('journey.section.planOverview')}</Text>
                  <Press
                    onPress={togglePlanEditor}
                    style={{ height: 32, paddingHorizontal: space.sm, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Text style={[type.body, { color: theme.accent, fontWeight: '700' }]}>{planEditorOpen ? t('common.done') : t('common.edit')}</Text>
                  </Press>
                  {!planEditorOpen ? (
                    <Press
                      onPress={() => setPlanOverviewOpen((open) => !open)}
                      accessibilityRole="button"
                      accessibilityState={{ expanded: planOverviewOpen }}
                      style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: planOverviewOpen ? '180deg' : '0deg' }] }}
                    >
                      <Icon name="chevronDown" color={theme.text2} size={17} />
                    </Press>
                  ) : null}
                </View>

                {!planEditorOpen && !planOverviewOpen ? (
                  <Press onPress={() => setPlanOverviewOpen(true)} style={{ marginTop: space.md }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text numberOfLines={1} style={[type.cardTitle, { flex: 1, color: theme.text }]}>{firstJourneyDay?.toUpperCase() || 'DAY 1'}</Text>
                      <Text style={[type.caption, { color: theme.text3 }]}>{t('journey.timeline.itemCount', { count: firstDayRows.length })}</Text>
                    </View>
                    {firstDayRows.length ? firstDayRows.slice(0, 3).map((row, index) => (
                      <Text key={row.id} numberOfLines={1} style={[type.caption, { color: index === 0 ? theme.text2 : theme.text3, marginTop: space.xs }]}>
                        {row.title}
                      </Text>
                    )) : (
                      <Text style={[type.caption, { color: theme.text3, marginTop: space.xs }]}>{t('journey.empty.timelineHint')}</Text>
                    )}
                  </Press>
                ) : null}
              </View>

              {planEditorOpen ? (
                <JourneyPlanEditContent
                  theme={theme}
                  days={journeyDays}
                  rows={timeline.rows}
                  selectedDays={selectedPlanDays}
                  onToggleDay={toggleSelectedPlanDay}
                  onEditDate={() => setTimePickerOpen(true)}
                  onAddGroup={() => addJourneyGroup(false)}
                />
              ) : planOverviewOpen ? (
                <View style={{ paddingHorizontal: space.md, paddingBottom: space.md }}>
                  {journeyDays.map((day, index) => {
                    const rows = timeline.rows.filter((row) => row.day === day);
                    return (
                      <React.Fragment key={day}>
                        {index > 0 ? <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.hairline }} /> : null}
                        <Press
                          onPress={() => setSeg(`day:${day}`)}
                          style={{ minHeight: 66, paddingVertical: space.sm, flexDirection: 'row', alignItems: 'center' }}
                        >
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={[type.cardTitle, { color: theme.text }]}>{day.toUpperCase()}</Text>
                            <Text numberOfLines={2} style={[type.caption, { color: rows[0] ? theme.text2 : theme.text3, marginTop: space.xxs, lineHeight: 18 }]}>
                              {rows.length ? rows.slice(0, 3).map((row) => row.title).join(' → ') : t('journey.empty.timelineHint')}
                            </Text>
                          </View>
                          <Icon name="chevronR" color={theme.text3} size={15} />
                        </Press>
                      </React.Fragment>
                    );
                  })}
                </View>
              ) : null}
            </AppCard>

            {hasTrack ? (
              <>
                <AppSectionHeader theme={theme} text={t('journey.stat.elevationProfile')} variant="title" marginTop={space.xxl} />
                <AppCard theme={theme} style={{ paddingHorizontal: space.sm, paddingVertical: space.md, backgroundColor: theme.fieldSurface }}>
                  <ElevationStrip theme={theme} poi={poi} onScrub={(index, coord) => onTrackSelectionChange?.(index, coord)} />
                </AppCard>
              </>
            ) : null}

            {poi.desc ? (
              <>
                <AppSectionHeader theme={theme} text={t('journey.section.about')} variant="title" marginTop={space.xxl} />
                <Text style={[type.body, { lineHeight: 23, color: theme.text2 }]}>{poi.desc}</Text>
              </>
            ) : null}
          </>
        ) : (
          <>
            <View style={{ flexDirection: 'row', paddingBottom: space.sm }}>
              {primaryStats.map((s) => {
                const { value, unit } = splitStat(s.raw);
                return <StatTile key={s.label} theme={theme} value={value} unit={unit} label={s.label} mono={s.mono} />;
              })}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
              {overviewStats.map((s) => <FactItem key={s.label} theme={theme} label={s.label} value={s.value} />)}
            </View>
            {hasTrack ? (
              <View style={{ paddingTop: space.md }}>
                <SectionHeader theme={theme} title={t('journey.stat.elevationProfile')} />
                <ElevationStrip theme={theme} poi={poi} onScrub={(index, coord) => onTrackSelectionChange?.(index, coord)} />
              </View>
            ) : null}
            {poi.desc ? (
              <View style={{ paddingTop: space.lg }}>
                <SectionHeader theme={theme} title={t('journey.section.about')} />
                <Text style={[type.body, { lineHeight: 22, color: theme.text2 }]}>{poi.desc}</Text>
              </View>
            ) : null}
          </>
        ) : null}

        {seg === 'checklist' && isJourney ? (
          <View>
            <AppSectionHeader
              theme={theme}
              text={t('journey.tab.checklist')}
              variant="title"
              marginTop={space.xs}
              trailing={
                <Press onPress={openGearLists} style={{ paddingVertical: space.xxs }}>
                  <Text style={[type.body, { color: theme.accent, fontWeight: '600' }]}>{t('journey.checklist.manage')}</Text>
                </Press>
              }
            />
            {sets.length ? (
              <AppCard theme={theme} style={{ overflow: 'hidden' }}>
                {sets.map((set, index) => (
                  <React.Fragment key={set.id}>
                    {index > 0 ? <View style={{ height: StyleSheet.hairlineWidth, marginLeft: space.md, backgroundColor: theme.hairline }} /> : null}
                    <Press onPress={openGearLists} style={{ minHeight: 66, paddingHorizontal: space.md, paddingVertical: space.sm, flexDirection: 'row', alignItems: 'center' }}>
                      <View style={{ width: 38, height: 38, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.fieldSurface }}>
                        <Icon name="check" color={theme.text2} size={17} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0, marginLeft: space.sm }}>
                        <Text numberOfLines={1} style={[type.cardTitle, { color: theme.text }]}>{set.name}</Text>
                        <Text style={[type.caption, { color: theme.text3, marginTop: space.xxs }]}>{t('journey.checklist.itemCount', { count: set.items.length })}</Text>
                      </View>
                      <Icon name="chevronR" color={theme.text3} size={15} />
                    </Press>
                  </React.Fragment>
                ))}
              </AppCard>
            ) : (
              <AppCard theme={theme} style={{ alignItems: 'center', paddingHorizontal: space.lg, paddingVertical: space.xxl, backgroundColor: theme.fieldSurface }}>
                <Icon name="check" color={theme.text3} size={24} />
                <Text style={[type.cardTitle, { color: theme.text, marginTop: space.sm }]}>{t('journey.checklist.empty')}</Text>
                <Text style={[type.caption, { color: theme.text2, textAlign: 'center', marginTop: space.xxs }]}>{t('journey.checklist.emptyHint')}</Text>
                <Press onPress={openGearLists} style={{ marginTop: space.md, paddingHorizontal: space.md, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.accent }}>
                  <Text style={[type.body, { color: '#FFFFFF', fontWeight: '700' }]}>{t('journey.checklist.create')}</Text>
                </Press>
              </AppCard>
            )}
          </View>
        ) : null}

        {/* 行程 timeline */}
        {seg === 'plan' ? <JourneyTimelineCard theme={theme} info={poi} readOnly={!isJourney} /> : null}
        {selectedJourneyDay ? <JourneyTimelineCard theme={theme} info={poi} selectedDay={selectedJourneyDay} showDayTabs={false} /> : null}

        {/* 瞬间 moments — full inline grid (tap a tile for the immersive viewer) */}
        {seg === 'moments' ? (
          allPhotos.length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {allPhotos.map((p) => {
                const displayUri = p.kind === 'video' ? (p.thumbnail || p.uri) : p.uri;
                return (
                  <Press key={p.id} onPress={() => nav.openPhotoWall({ info: poi, mode: 'mine' })} style={{ width: '31.7%' }}>
                    <View style={{ aspectRatio: 1, borderRadius: radius.card, overflow: 'hidden', backgroundColor: embeddedSurface }}>
                      {displayUri ? (
                        <Image source={{ uri: displayUri }} contentFit="cover" style={{ width: '100%', height: '100%' }} />
                      ) : (
                        <PhotoTile tone={p.tone} seed={poi.id + p.id} radius={radius.card} style={{ width: '100%', height: '100%' }} resWidth={420} />
                      )}
                      {p.kind === 'video' ? (
                        <View style={{ position: 'absolute', right: 4, top: 4, flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 4, paddingVertical: 2, borderRadius: 4, backgroundColor: 'rgba(0,0,0,0.5)' }}>
                          <Icon name="play" color="#fff" size={7} />
                        </View>
                      ) : null}
                    </View>
                  </Press>
                );
              })}
            </View>
          ) : (
            <Press onPress={() => nav.openPhotoWall({ info: poi, mode: 'mine' })}>
              <AppCard theme={theme} style={{ alignItems: 'center', paddingVertical: space.xl, backgroundColor: embeddedSurface }}>
                <Icon name="camera" color={theme.text3} size={24} />
                <Text style={{ fontSize: 13, color: theme.text3, marginTop: 8 }}>{t('journey.empty.moments')}</Text>
                <Text style={{ fontSize: 11.5, color: theme.text3, marginTop: 2 }}>{t('journey.empty.momentsHint')}</Text>
              </AppCard>
            </Press>
          )
        ) : null}
      </View>

      {timePickerOpen ? <JourneyTimePicker theme={theme} poi={poi} onApply={(patch) => nav.patchCurrent(patch)} onClose={() => setTimePickerOpen(false)} /> : null}
    </View>
  );
}
