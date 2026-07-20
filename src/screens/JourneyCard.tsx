// JourneyCard.tsx — SelectedPoiCard: the rich detail body for a route or journey,
// shown inside the discover sheet and (full-bleed) in the JourneyCardFull overlay.
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Modal } from 'react-native';
import { Image } from 'expo-image';
import { MONO } from '../theme/fonts';
import { Theme } from '../theme/theme';
import { Poi, STATUS_COLOR, JourneyStatus } from '../data/pois';
import { JourneyTimelineCard } from '../components/overlays/JourneyTimeline';
import { PhotoTile } from '../components/PhotoTile';
import { Avatar } from '../components/Avatar';
import { Icon, IconName } from '../components/Icon';
import { Press } from '../components/Press';
import { Segmented } from '../components/Segmented';
import { useNav } from '../nav/NavContext';
import { useInspo } from '../hooks/useInspo';
import { useData } from '../data/DataContext';
import { genPhotos } from '../components/overlays/PhotoWall';
import { useI18n, TKey } from '../i18n';
import { NJBottomSheet, NJMiniCalendar, NJWheelPicker, njFormatTime } from '../components/overlays/NewJourneyParts';
import { ElevationStrip } from '../components/overlays/ElevationStrip';

function SectionHeader({ theme, title, action, onAction }: { theme: Theme; title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
      <Text style={{ fontSize: 16.5, fontWeight: '700', color: theme.text }}>{title}</Text>
      {action ? (
        <Press onPress={onAction}>
          <Text style={{ fontSize: 13.5, fontWeight: '600', color: theme.accent }}>{action}</Text>
        </Press>
      ) : null}
    </View>
  );
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

function MetaChip({ theme, icon, iconColor, text }: { theme: Theme; icon?: IconName; iconColor?: string; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 30, paddingHorizontal: 12, borderRadius: 15, backgroundColor: theme.dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)', borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
      {icon ? <Icon name={icon} size={13} color={iconColor || theme.text3} /> : null}
      <Text style={{ fontSize: 12.5, color: theme.text2, fontWeight: '500' }}>{text}</Text>
    </View>
  );
}

// Companions collapse to a compact facepile "button" (overlapping avatars + a
// chevron), not a full roster — who-came-along is secondary to the trip's numbers.
// Tap opens the roster/manage editor. Empty = a small "+ 同行" add pill.
function CompanionPile({ theme, companions, onPress }: { theme: Theme; companions: NonNullable<Poi['companionList']>; onPress: () => void }) {
  const { t } = useI18n();
  const chipBg = theme.dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)';
  const ring = theme.bg;
  if (companions.length === 0) {
    return (
      <Press onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 30, paddingHorizontal: 12, borderRadius: 15, backgroundColor: chipBg, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
        <Icon name="plus" size={13} color={theme.text3} />
        <Text style={{ fontSize: 12.5, color: theme.text3, fontWeight: '500' }}>{t('journey.tab.companions')}</Text>
      </Press>
    );
  }
  const shown = companions.slice(0, 3);
  const extra = companions.length - shown.length;
  return (
    <Press onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 7, height: 30, paddingLeft: 5, paddingRight: 9, borderRadius: 15, backgroundColor: chipBg, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {shown.map((c, i) => (
          <View key={c.name + i} style={{ marginLeft: i === 0 ? 0 : -9, borderRadius: 13, borderWidth: 1.5, borderColor: ring }}>
            <Avatar ini={c.ini} color={c.color} size={21} />
          </View>
        ))}
        {extra > 0 ? (
          <View style={{ marginLeft: -9, width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: ring, backgroundColor: theme.dark ? '#3a3a3e' : '#d6d6db', alignItems: 'center', justifyContent: 'center' }}>
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

type TabId = 'overview' | 'moments' | 'plan';

export function SelectedPoiCard({ theme, poi, fullBleed, embedded, onTrackSelectionChange }: { theme: Theme; poi: Poi; fullBleed?: boolean; embedded?: boolean; onTrackSelectionChange?: (index: number | null, coord?: [number, number]) => void }) {
  const nav = useNav();
  const { t } = useI18n();
  const { userId, profile } = useData();
  const isJourney = poi.kind === 'journey';
  const status = (poi.status || 'completed') as JourneyStatus;
  const isMine = isJourney;
  const hasTrack = (poi.trackCoords?.length ?? 0) >= 2;

  const inspo = useInspo(poi.id, userId);

  // photo preview — genPhotos (from poi.photoUris) + inspo (user-uploaded)
  // For routes, show photos from index 1 onwards (index 0 is hero cover);
  // for journeys, genPhotos already skips the cover.
  const wallPhotos = useMemo(
    () => isJourney
      ? genPhotos(poi, status)
      : (poi.routeShowPhotos !== false && poi.photoUris && poi.photoUris.length > 1
          ? poi.photoUris.slice(1).map((uri, i) => ({ id: `real-${i}`, uri, tone: poi.tone || 'ridge', ratio: 1, kind: 'image' as const, caption: '', day: 1, author: { ini: '?', name: '', color: '#888' } }))
          : []),
    [isJourney, poi.name, poi.photoUris, poi.tone, status, poi.routeShowPhotos],
  );
  const inspoAsWall = useMemo(
    () => (isJourney || poi.routeShowPhotos !== false ? inspo.media.map(m => ({ id: m.id, uri: m.uri, kind: m.kind, thumbnail: m.thumbnail, tone: poi.tone || 'ridge', ratio: 1 })) : []),
    [inspo.media, poi.tone, isJourney, poi.routeShowPhotos],
  );
  const allPhotos = status === 'planning' ? inspoAsWall : [...wallPhotos, ...inspoAsWall];
  // Peer tabs: 总览 / 瞬间 / 行程. 轨迹 is no longer a tab — the elevation lives on the
  // map above (a toggle reveals a scrubbable strip), since the map already is the
  // track. 同行 is a facepile inside 总览. Routes tab only what applies.
  const tabOptions = useMemo<{ id: TabId; label: string }[]>(() => {
    if (isJourney) {
      return [
        { id: 'overview', label: t('journey.tab.overview') },
        { id: 'moments', label: t('journey.tab.moments') },
        { id: 'plan', label: t('journey.tab.plan') },
      ];
    }
    const opts: { id: TabId; label: string }[] = [
      { id: 'overview', label: t('journey.tab.overview') },
    ];
    if (poi.routeShowTimeline !== false) opts.push({ id: 'plan', label: t('journey.tab.plan') });
    if (poi.routeShowPhotos !== false && allPhotos.length > 0) opts.push({ id: 'moments', label: t('journey.moments.userPhotos') });
    return opts;
  }, [isJourney, poi.routeShowTimeline, poi.routeShowPhotos, allPhotos.length, t]);
  // Status only picks where you land — planning opens on the itinerary,
  // everything else lands on 总览.
  const [seg, setSeg] = useState<TabId>(isJourney && status === 'planning' ? 'plan' : 'overview');
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const headerDuration = useMemo(() => detailDurationLabel(parseJourneyDurationMins(poi)), [poi.days, poi.totalDays, poi.trackDurationMs, poi.plannedDate, poi.date]);
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
  }, [isJourney, elevationSummary, poi.plannedDate, poi.date, poi.companionList, poi.companions, poi.rating, poi.reviews, poi.dist, poi.asc, poi.trackDurationMs, allPhotos.length, status, t]);
  // Destructive label + confirm copy adapt to the journey's status (a plan is
  // "cancelled", an in-progress trip is "abandoned", a finished one "deleted").
  const removeLabel = status === 'planning' ? t('journey.remove.labelPlanning') : status === 'ongoing' ? t('journey.remove.labelOngoing') : t('journey.remove.labelCompleted');
  const confirmTitle = status === 'planning' ? t('journey.remove.confirmPlanning') : status === 'ongoing' ? t('journey.remove.confirmOngoing') : t('journey.remove.confirmCompleted');
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
      {/* identity header — lives in the card when embedded, so the split map stays clean */}
      {embedded ? (
        <View style={{ paddingTop: 4, paddingBottom: 14 }}>
          <Text style={{ fontSize: 24, fontWeight: '800', color: theme.text }}>{poi.name}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 5 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              {isJourney ? (
                <Press
                  onPress={() => setTimePickerOpen(true)}
                  style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '600', color: theme.text2, letterSpacing: -0.05 }}>{headerDuration}</Text>
                  <Icon name="chevronR" color={theme.text3} size={12} />
                </Press>
              ) : (
                <Text style={{ fontSize: 13, color: theme.text2 }} numberOfLines={1}>{poi.region}</Text>
              )}
            </View>
            {/* author/host beside the title — route uploader or journey host (falls back to you) */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginLeft: 10, flexShrink: 0 }}>
              <Avatar ini={author.ini} color={author.color} size={22} />
              <Text style={{ fontSize: 13, fontWeight: '600', color: theme.text2 }} numberOfLines={1}>{author.name}</Text>
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
            {isJourney && (
              <View
                style={{
                  alignSelf: 'flex-start',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                  paddingHorizontal: 8,
                  height: 22,
                  borderRadius: 7,
                  backgroundColor: 'rgba(0,0,0,0.4)',
                  marginBottom: 8,
                }}
              >
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: STATUS_COLOR(status, theme.accent, true) }} />
                <Text style={{ color: '#fff', fontSize: 11.5, fontWeight: '600' }}>
                  {t(`common.status.${status}` as TKey)}
                  {status === 'ongoing' && poi.dayIndex ? ` · Day ${poi.dayIndex}/${poi.totalDays}` : ''}
                </Text>
              </View>
            )}
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


      {/* content tabs — 总览 / 瞬间 / 行程 (轨迹 lives on the map above) */}
      {tabOptions.length > 1 ? (
        <View style={{ paddingTop: 2, paddingBottom: 14 }}>
          <Segmented variant="underline" size="compact" theme={theme} value={seg} options={tabOptions} onChange={(v) => setSeg(v)} stretch={false} />
        </View>
      ) : null}

      <View style={{ paddingBottom: 18 }}>
        {/* 总览 overview — stat tiles, meta chips, 同行 facepile, about */}
        {seg === 'overview' ? (
          <>
            <View style={{ flexDirection: 'row', paddingBottom: 12 }}>
              {primaryStats.map((s) => {
                const { value, unit } = splitStat(s.raw);
                return <StatTile key={s.label} theme={theme} value={value} unit={unit} label={s.label} mono={s.mono} />;
              })}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 0, marginTop: 4 }}>
              {overviewStats.map((s) => (
                <FactItem key={s.label} theme={theme} label={s.label} value={s.value} />
              ))}
            </View>
            {/* 海拔 — the ascent number's visual companion, right under the tiles;
                scrubbing it syncs the map marker above. The full track view lives
                on the interactive map itself now, so no 更多 button here. */}
            {hasTrack ? (
              <View style={{ paddingTop: 16 }}>
                <SectionHeader theme={theme} title={t('journey.stat.elevationProfile')} />
                <ElevationStrip theme={theme} poi={poi} onScrub={(index, coord) => onTrackSelectionChange?.(index, coord)} />
              </View>
            ) : null}
            {poi.desc ? (
              <View style={{ paddingTop: 18 }}>
                <SectionHeader theme={theme} title={t('journey.section.about')} />
                <Text style={{ fontSize: 14.5, lineHeight: 22, color: theme.text2 }}>{poi.desc}</Text>
              </View>
            ) : null}
            {/* 轨迹 moved to the map above; when there's no track yet, offer to add one */}
            {isMine && !hasTrack ? (
              <Press onPress={() => nav.openAddRoute()} style={{ marginTop: 18 }}>
                <View style={{ alignItems: 'center', paddingVertical: 22, borderRadius: 16, backgroundColor: theme.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)', borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
                  <Icon name="route" color={theme.text3} size={22} />
                  <Text style={{ fontSize: 13, color: theme.text3, marginTop: 8 }}>{t('journey.empty.route')}</Text>
                  <Text style={{ fontSize: 11.5, color: theme.text3, marginTop: 2 }}>{t('journey.empty.routeHint')}</Text>
                </View>
              </Press>
            ) : null}
          </>
        ) : null}

        {/* 行程 timeline */}
        {seg === 'plan' ? <JourneyTimelineCard theme={theme} info={poi} readOnly={!isJourney} /> : null}

        {/* 瞬间 moments — full inline grid (tap a tile for the immersive viewer) */}
        {seg === 'moments' ? (
          allPhotos.length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {allPhotos.map((p) => {
                const displayUri = p.kind === 'video' ? (p.thumbnail || p.uri) : p.uri;
                return (
                  <Press key={p.id} onPress={() => nav.openPhotoWall({ info: poi, mode: 'mine', status })} style={{ width: '31.7%' }}>
                    <View style={{ aspectRatio: 1, borderRadius: 11, overflow: 'hidden', backgroundColor: theme.dark ? '#1a1a1a' : '#e8e8e8' }}>
                      {displayUri ? (
                        <Image source={{ uri: displayUri }} contentFit="cover" style={{ width: '100%', height: '100%' }} />
                      ) : (
                        <PhotoTile tone={p.tone} seed={poi.id + p.id} radius={11} style={{ width: '100%', height: '100%' }} resWidth={420} />
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
            <Press onPress={() => nav.openPhotoWall({ info: poi, mode: 'mine', status })}>
              <View style={{ alignItems: 'center', paddingVertical: 24, borderRadius: 16, backgroundColor: theme.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)', borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
                <Icon name="camera" color={theme.text3} size={24} />
                <Text style={{ fontSize: 13, color: theme.text3, marginTop: 8 }}>{t('journey.empty.moments')}</Text>
                <Text style={{ fontSize: 11.5, color: theme.text3, marginTop: 2 }}>{t('journey.empty.momentsHint')}</Text>
              </View>
            </Press>
          )
        ) : null}
      </View>

      {timePickerOpen ? <JourneyTimePicker theme={theme} poi={poi} onApply={(patch) => nav.patchCurrent(patch)} onClose={() => setTimePickerOpen(false)} /> : null}
    </View>
  );
}
