// NewJourneySheet.tsx — 新增旅程 flow (full-screen overlay). Faithful RN port of
// the prototype's new-journey creation flow:
//   mode picker (记录走过的 / 计划未来的) → 选路线/自定义 → 完善行程信息
//   (含 日历 + 时间滚轮 + 时长 选择器、邀请同行二维码) → 成功页 → 加入「我的旅程」。
// The "记录走过的" (record-past) sub-flow is intentionally deferred — its card is
// shown with a 即将上线 tag. Opened from the "+" in the 旅程 bottom-sheet header.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  Animated,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Circle } from 'react-native-svg';
import { Theme } from '../../theme/theme';
import { shadow } from '../../theme/shadow';
import { MONO } from '../../theme/fonts';
import { Poi, Companion } from '../../data/pois';
import { useData } from '../../data/DataContext';
import { PhotoTile } from '../PhotoTile';
import { Press } from '../Press';
import { Icon } from '../Icon';
import { Avatar } from '../Avatar';
import { RecordJourneySheet } from './RecordJourneySheet';
import { NJSection, NJRoundBtn, NJMiniCalendar, NJBottomSheet, NJSharePanel, SELF, NJWheelPicker, NJ_TIME_OPTIONS, njFormatTime } from './NewJourneyParts';
import { useI18n, TKey, TVars } from '../../i18n';

export { NJSection, NJRoundBtn, NJMiniCalendar, NJBottomSheet, NJSharePanel, SELF };

type TFn = (key: TKey, vars?: TVars) => string;

// ──────────────────────────────────────────────────────────────
// Route shape used by the picker (real explore routes + synthetic custom)
// ──────────────────────────────────────────────────────────────
interface NJRoute {
  id: string;
  name: string;
  region: string;
  dist: string;
  asc: string;
  diff?: string;
  tone?: string;
  lng?: number;
  lat?: number;
  coord?: string;
  trackCoords?: Poi['trackCoords'];
  trackElevation?: Poi['trackElevation'];
  trackDurationMs?: Poi['trackDurationMs'];
  trackWaypoints?: Poi['trackWaypoints'];
  custom?: boolean;
}

function useRouteSuggestions(): NJRoute[] {
  const { routes } = useData();
  return useMemo(() => routes.map((p) => ({
    id: p.id,
    name: p.name,
    region: p.region,
    dist: p.dist,
    asc: p.asc,
    diff: p.diff,
    tone: p.tone,
    lng: p.lng,
    lat: p.lat,
    coord: p.coord,
    trackCoords: p.trackCoords,
    trackElevation: p.trackElevation,
    trackDurationMs: p.trackDurationMs,
    trackWaypoints: p.trackWaypoints,
  })), [routes]);
}

// ──────────────────────────────────────────────────────────────
// Time helpers (ported 1:1 from the prototype)
// ──────────────────────────────────────────────────────────────
function njRoundedNow(): Date {
  const d = new Date();
  const m = d.getMinutes();
  if (m < 15) d.setMinutes(0);
  else if (m < 45) d.setMinutes(30);
  else {
    d.setHours(d.getHours() + 1);
    d.setMinutes(0);
  }
  d.setSeconds(0);
  d.setMilliseconds(0);
  return d;
}
function njAddMinutes(d: Date, mins: number): Date {
  const out = new Date(d.getTime());
  out.setMinutes(out.getMinutes() + mins);
  return out;
}
function njDayDiff(target: Date, ref: Date): number {
  const a = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const b = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}
function njDayLabel(target: Date, ref: Date, t: TFn): string {
  const diff = njDayDiff(target, ref);
  if (diff === 0) return t('journeyEdit.day.today');
  if (diff === 1) return t('journeyEdit.day.tomorrow');
  if (diff === 2) return t('journeyEdit.day.dayAfter');
  if (diff === -1) return t('journeyEdit.day.yesterday');
  if (diff < 7 && diff > 0) return t('journeyEdit.day.inDays', { count: diff });
  const m = String(target.getMonth() + 1).padStart(2, '0');
  const d = String(target.getDate()).padStart(2, '0');
  return `${m}/${d}`;
}
function njFormatDateTime(d: Date, ref: Date, t: TFn): string {
  return `${njDayLabel(d, ref, t)} · ${njFormatTime(d)}`;
}
function njDurationLabel(mins: number, t: TFn): string {
  if (mins < 60) return t('journeyEdit.duration.minutes', { count: mins });
  if (mins < 60 * 24) {
    const h = mins / 60;
    return t('journeyEdit.duration.hours', { count: Number.isInteger(h) ? h : h.toFixed(1) });
  }
  const days = mins / (60 * 24);
  return t('journeyEdit.duration.days', { count: Number.isInteger(days) ? days : days.toFixed(1) });
}

const NJ_DEFAULT_DURATION = 60 * 24; // 24h

// Quick-duration chips. Labels are i18n keys resolved at render (rules of hooks).
const NJ_DURATION_OPTIONS: { value: number; labelKey: TKey }[] = [
  { value: 60 * 6, labelKey: 'journeyEdit.durationChip.h6' },
  { value: 60 * 12, labelKey: 'journeyEdit.durationChip.h12' },
  { value: 60 * 24, labelKey: 'journeyEdit.durationChip.d1' },
  { value: 60 * 48, labelKey: 'journeyEdit.durationChip.d2' },
  { value: 60 * 72, labelKey: 'journeyEdit.durationChip.d3' },
  { value: 60 * 120, labelKey: 'journeyEdit.durationChip.d5' },
  { value: 60 * 168, labelKey: 'journeyEdit.durationChip.d7' },
];

function NJStepDots({ count, current, theme }: { count: number; current: number; theme: Theme }) {
  return (
    <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center' }}>
      {Array.from({ length: count }).map((_, i) => (
        <View
          key={i}
          style={{ width: i === current ? 22 : 6, height: 6, borderRadius: 3, backgroundColor: i <= current ? theme.accent : theme.hairline }}
        />
      ))}
    </View>
  );
}

// ──────────────────────────────────────────────────────────────
// Route card — used in step 1 list AND step 2 summary
// ──────────────────────────────────────────────────────────────
function NJRouteCard({ theme, route, selected, onPress, compact }: { theme: Theme; route: NJRoute | null; selected?: boolean; onPress?: () => void; compact?: boolean }) {
  if (!route) return null;
  const body = (
    <View
      style={{
        flexDirection: 'row',
        gap: 12,
        alignItems: 'center',
        padding: 10,
        borderRadius: 16,
        backgroundColor: selected ? theme.accentSoft : theme.dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.035)',
        borderWidth: 1,
        borderColor: selected ? theme.accent : theme.hairline,
      }}
    >
      {route.custom ? (
        <View style={{ width: compact ? 48 : 60, height: compact ? 48 : 60, borderRadius: 11, backgroundColor: theme.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
            <Path d="M4 17.5 12 4l8 13.5" stroke={theme.accent} strokeWidth={1.8} strokeLinejoin="round" />
            <Path d="m9 14 2-3 1.5 2 2-3.5" stroke={theme.accent} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </View>
      ) : (
        <PhotoTile tone={route.tone} seed={route.name} radius={11} style={{ width: compact ? 48 : 60, height: compact ? 48 : 60 }} resWidth={240} />
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontSize: compact ? 13 : 14.5, fontWeight: '700', color: theme.text, letterSpacing: -0.1 }}>
          {route.name}
        </Text>
        <Text numberOfLines={1} style={{ fontSize: 11.5, color: theme.text2, marginTop: 2 }}>
          {route.region}
        </Text>
        {!compact && (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
            <Text style={{ fontFamily: MONO, fontSize: 10.5, color: theme.text, letterSpacing: 0.2 }}>{route.dist}</Text>
            <Text style={{ fontFamily: MONO, fontSize: 10.5, color: theme.text2, letterSpacing: 0.2 }}>↑{(route.asc || '').replace('+', '')}</Text>
            {route.diff ? <Text style={{ fontFamily: MONO, fontSize: 10.5, color: theme.text2, letterSpacing: 0.2 }}>· {route.diff}</Text> : null}
          </View>
        )}
      </View>
      {selected && (
        <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center', marginRight: 4 }}>
          <Icon name="check" color="#fff" size={13} strokeWidth={3} />
        </View>
      )}
    </View>
  );
  return onPress ? <Press onPress={onPress}>{body}</Press> : body;
}

// ──────────────────────────────────────────────────────────────
// Time picker modal — calendar + time wheel + duration chips
// ──────────────────────────────────────────────────────────────
function NJTimePickerModal({ theme, startDt, durationMins, onApply, onClose }: { theme: Theme; startDt: Date; durationMins: number; onApply: (dt: Date, dur: number) => void; onClose: () => void }) {
  const { t } = useI18n();
  const [draftStart, setDraftStart] = useState(startDt);
  const [draftEnd, setDraftEnd] = useState(() => njAddMinutes(startDt, durationMins));
  const [active, setActive] = useState<'start' | 'end'>('start');
  const now = useMemo(() => njRoundedNow(), []);

  const draftDur = Math.max(30, Math.round((draftEnd.getTime() - draftStart.getTime()) / 60000));
  const activeDt = active === 'start' ? draftStart : draftEnd;

  const setActiveDt = (newDt: Date) => {
    if (active === 'start') {
      setDraftStart(newDt);
      if (draftEnd <= newDt) setDraftEnd(njAddMinutes(newDt, 60));
    } else {
      if (newDt <= draftStart) setDraftEnd(njAddMinutes(draftStart, 30));
      else setDraftEnd(newDt);
    }
  };

  const onCalendarSelect = (date: Date) => {
    const newDt = new Date(date);
    newDt.setHours(activeDt.getHours());
    newDt.setMinutes(activeDt.getMinutes());
    newDt.setSeconds(0);
    newDt.setMilliseconds(0);
    setActiveDt(newDt);
  };
  const onTimeChange = (value: number) => {
    const newDt = new Date(activeDt.getTime());
    newDt.setHours(Math.floor(value / 60));
    newDt.setMinutes(value % 60);
    newDt.setSeconds(0);
    newDt.setMilliseconds(0);
    setActiveDt(newDt);
  };

  const timeMins = activeDt.getHours() * 60 + activeDt.getMinutes();
  const apply = () => {
    onApply(draftStart, draftDur);
    onClose();
  };
  const setDuration = (mins: number) => setDraftEnd(njAddMinutes(draftStart, mins));
  const matchesDuration = (mins: number) => Math.abs(draftDur - mins) < 1;

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
          ...(on
            ? { boxShadow: '0px 1px 4px rgba(0,0,0,0.1)' }
            : {}),
        }}
      >
        <Text style={{ fontSize: 10.5, fontWeight: '700', color: on ? theme.text2 : theme.text3, letterSpacing: 0.6, textTransform: 'uppercase' }}>{label}</Text>
        <Text style={{ fontSize: 15, fontWeight: '700', color: on ? theme.accent : theme.text2, marginTop: 2, letterSpacing: -0.2 }}>{njFormatDateTime(dt, now, t)}</Text>
      </Press>
    );
  };

  return (
    <NJBottomSheet theme={theme} onClose={onClose} full bodyScrolls>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, paddingHorizontal: 2 }}>
          <Press onPress={onClose} style={{ padding: 4 }}>
            <Text style={{ fontSize: 14.5, color: theme.text2, fontWeight: '500' }}>{t('common.cancel')}</Text>
          </Press>
          <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: theme.text, letterSpacing: -0.2 }}>{t('journeyEdit.time.pickTitle')}</Text>
            <Text style={{ fontFamily: MONO, fontSize: 11, color: theme.text3, letterSpacing: 0.3 }}>· {njDurationLabel(draftDur, t)}</Text>
          </View>
          <Press onPress={apply} style={{ padding: 4 }}>
            <Text style={{ fontSize: 14.5, color: theme.accent, fontWeight: '700' }}>{t('common.done')}</Text>
          </Press>
        </View>

        {/* Segmented 出发 / 结束 */}
        <View style={{ flexDirection: 'row', gap: 4, padding: 4, marginBottom: 14, borderRadius: 14, backgroundColor: theme.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }}>
          <Tab k="start" label={t('journeyEdit.time.start')} dt={draftStart} />
          <Tab k="end" label={t('journeyEdit.time.end')} dt={draftEnd} />
        </View>

        {/* Calendar */}
        <View style={{ marginBottom: 12 }}>
          <NJMiniCalendar theme={theme} selectedDate={activeDt} onSelect={onCalendarSelect} />
        </View>

        {/* Time wheel */}
        <View style={{ alignItems: 'center', marginBottom: 6 }}>
          <Text style={{ fontSize: 10.5, fontWeight: '700', color: theme.text2, letterSpacing: 0.6, textTransform: 'uppercase' }}>{active === 'start' ? t('journeyEdit.time.startMoment') : t('journeyEdit.time.endMoment')}</Text>
        </View>
        <NJWheelPicker theme={theme} value={timeMins} onChange={onTimeChange} />

        {/* Quick durations */}
        <View style={{ marginTop: 14 }}>
          <Text style={{ fontSize: 10.5, fontWeight: '700', color: theme.text2, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8 }}>{t('journeyEdit.time.quickDuration')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {NJ_DURATION_OPTIONS.map((d) => {
              const on = matchesDuration(d.value);
              return (
                <Press
                  key={d.value}
                  onPress={() => setDuration(d.value)}
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
                  <Text style={{ fontSize: 12.5, fontWeight: '600', color: on ? '#fff' : theme.text }}>{t(d.labelKey)}</Text>
                </Press>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </NJBottomSheet>
  );
}

// ──────────────────────────────────────────────────────────────
// Mode picker — record-past (deferred) vs plan-future
// ──────────────────────────────────────────────────────────────
function NJModePicker({ theme, insetsTop, onClose, onPick }: { theme: Theme; insetsTop: number; onClose: () => void; onPick: (m: 'plan' | 'record') => void }) {
  const { t } = useI18n();
  const cards = [
    {
      key: 'record' as const,
      title: t('journeyEdit.mode.recordTitle'),
      sub: t('journeyEdit.mode.recordSub'),
      icon: (c: string) => (
        <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
          <Path d="M4 19s3.5-1.5 6.5-6.5S17 5 20 4" stroke={c} strokeWidth={1.8} strokeLinecap="round" strokeDasharray="0.1 3.4" />
          <Circle cx={4} cy={19} r={2} fill={c} />
          <Path d="M16.5 4.8 20 4l-.8 3.5" stroke={c} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="m14.5 14.5 2 2 4-4.5" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      ),
    },
    {
      key: 'plan' as const,
      title: t('journeyEdit.mode.planTitle'),
      sub: t('journeyEdit.mode.planSub'),
      icon: (c: string) => (
        <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
          <Path d="M6 3v18" stroke={c} strokeWidth={1.8} strokeLinecap="round" />
          <Path d="M6 4.5c3-1.6 6 1.4 9-.2v7c-3 1.6-6-1.4-9 .2v-7Z" stroke={c} strokeWidth={1.7} strokeLinejoin="round" />
        </Svg>
      ),
    },
  ];
  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <View style={{ paddingTop: insetsTop + 12, paddingHorizontal: 16, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <NJRoundBtn theme={theme} onPress={onClose}>
          <Icon name="close" color={theme.text} size={16} />
        </NJRoundBtn>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={{ fontSize: 17, fontWeight: '700', color: theme.text }}>{t('journeyEdit.newTitle')}</Text>
        </View>
        <View style={{ width: 38 }} />
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}>
        <View style={{ gap: 12 }}>
          {cards.map((c) => (
            <Press
              key={c.key}
              onPress={() => onPick(c.key)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, paddingVertical: 18, borderRadius: 20, backgroundColor: theme.dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.035)', borderWidth: 1, borderColor: theme.hairline }}
            >
              <View style={{ width: 52, height: 52, borderRadius: 15, backgroundColor: theme.accentSoft, alignItems: 'center', justifyContent: 'center' }}>{c.icon(theme.accent)}</View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 17, fontWeight: '700', color: theme.text, letterSpacing: -0.2 }}>{c.title}</Text>
                <Text style={{ fontSize: 12.5, color: theme.text2, marginTop: 3, lineHeight: 18 }}>{c.sub}</Text>
              </View>
              <Icon name="chevronR" color={theme.text3} size={18} />
            </Press>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

// ──────────────────────────────────────────────────────────────
// Step 0 — choose route
// ──────────────────────────────────────────────────────────────
function NJStepRoute({ theme, route, setRoute }: { theme: Theme; route: NJRoute | null; setRoute: (r: NJRoute) => void }) {
  const { t } = useI18n();
  const suggestions = useRouteSuggestions();
  const [q, setQ] = useState('');
  const filtered = suggestions.filter((r) => !q || r.name.includes(q) || r.region.includes(q));
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 32 }}>
      <Text style={{ fontSize: 28, fontWeight: '700', color: theme.text, letterSpacing: -0.6, lineHeight: 32, marginTop: 4 }}>{t('journeyEdit.route.heading')}</Text>
      <Text style={{ fontSize: 14, color: theme.text2, marginTop: 6, marginBottom: 22 }}>{t('journeyEdit.route.subheading')}</Text>

      <NJSection theme={theme} label={t('journeyEdit.route.sectionScratch')}>
        <Press
          onPress={() => setRoute({ id: 'custom', custom: true, name: t('journeyEdit.route.customName'), region: t('journeyEdit.route.customRegion'), tone: 'rock', dist: '—', asc: '—', diff: '—' })}
          style={{
            flexDirection: 'row',
            gap: 12,
            alignItems: 'center',
            padding: 12,
            borderRadius: 16,
            backgroundColor: route && route.custom ? theme.accentSoft : 'transparent',
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: route && route.custom ? theme.accent : theme.dark ? 'rgba(255,255,255,0.20)' : 'rgba(0,0,0,0.18)',
          }}
        >
          <View style={{ width: 44, height: 44, borderRadius: 11, backgroundColor: theme.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
              <Path d="M4 17.5 12 4l8 13.5" stroke={theme.accent} strokeWidth={1.8} strokeLinejoin="round" />
              <Path d="m9 14 2-3 1.5 2 2-3.5" stroke={theme.accent} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: theme.text }}>{t('journeyEdit.route.customName')}</Text>
            <Text style={{ fontSize: 11.5, color: theme.text2, marginTop: 2 }}>{t('journeyEdit.route.customHint')}</Text>
          </View>
        </Press>
      </NJSection>

      <NJSection theme={theme} label={t('journeyEdit.route.sectionSuggested')}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 38, paddingHorizontal: 12, borderRadius: 12, marginBottom: 10, backgroundColor: theme.dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)', borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
          <Icon name="search" color={theme.text2} size={16} />
          <TextInput value={q} onChangeText={setQ} placeholder={t('journeyEdit.route.searchPlaceholder')} placeholderTextColor={theme.text3} style={{ flex: 1, fontSize: 13.5, color: theme.text, padding: 0 }} />
        </View>
        <View style={{ gap: 8 }}>
          {filtered.map((r) => (
            <NJRouteCard key={r.id} theme={theme} route={r} selected={!!route && route.id === r.id} onPress={() => setRoute(r)} />
          ))}
          {filtered.length === 0 ? <Text style={{ paddingVertical: 20, textAlign: 'center', fontSize: 12, color: theme.text3 }}>{t('journeyEdit.route.empty')}</Text> : null}
        </View>
      </NJSection>
    </View>
  );
}

// ──────────────────────────────────────────────────────────────
// Step 1 — details
// ──────────────────────────────────────────────────────────────
function NJStepDetails({
  theme,
  route,
  tripName,
  setTripName,
  startDt,
  durationMins,
  isStartingNow,
  onInvite,
  onOpenTimePicker,
}: {
  theme: Theme;
  route: NJRoute;
  tripName: string;
  setTripName: (v: string) => void;
  startDt: Date;
  durationMins: number;
  isStartingNow: boolean;
  onInvite: () => void;
  onOpenTimePicker: () => void;
}) {
  const { t } = useI18n();
  const now = useMemo(() => njRoundedNow(), []);
  const endDt = njAddMinutes(startDt, durationMins);
  const nameMissing = !tripName.trim();

  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 32 }}>
      {!isStartingNow && (
        <>
          <Text style={{ fontSize: 28, fontWeight: '700', color: theme.text, letterSpacing: -0.6, lineHeight: 32, marginTop: 4 }}>{t('journeyEdit.details.heading')}</Text>
          <Text style={{ fontSize: 14, color: theme.text2, marginTop: 6, marginBottom: 22, lineHeight: 21 }}>{t('journeyEdit.details.subheading')}</Text>
        </>
      )}

      {/* Trip name */}
      <NJSection theme={theme} label={t('journeyEdit.details.nameLabel')} hint={nameMissing ? <Text style={{ fontSize: 11, color: theme.danger }}>{t('journeyEdit.details.required')}</Text> : null}>
        <TextInput
          value={tripName}
          onChangeText={setTripName}
          placeholder={t('journeyEdit.details.namePlaceholder')}
          placeholderTextColor={theme.text3}
          maxLength={32}
          style={{
            paddingHorizontal: 16,
            paddingVertical: 14,
            borderRadius: 14,
            backgroundColor: theme.dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.035)',
            borderWidth: 1,
            borderColor: nameMissing ? (theme.dark ? 'rgba(255,69,58,0.45)' : 'rgba(255,69,58,0.32)') : theme.hairline,
            fontSize: 16,
            fontWeight: '500',
            color: theme.text,
          }}
        />
      </NJSection>

      {/* Route summary */}
      <NJSection theme={theme} label={t('journeyEdit.details.routeLabel')}>
        <NJRouteCard theme={theme} route={route} compact />
      </NJSection>

      {/* Time + duration */}
      <NJSection theme={theme} label={t('journeyEdit.details.timeLabel')} hint={njDurationLabel(durationMins, t)}>
        <Press
          onPress={onOpenTimePicker}
          style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderRadius: 14, backgroundColor: theme.dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.035)', borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 10.5, color: theme.text2, letterSpacing: 0.6, textTransform: 'uppercase' }}>{t('journeyEdit.time.start')}</Text>
            <Text style={{ fontSize: 16, fontWeight: '700', color: theme.text, marginTop: 2, letterSpacing: -0.2 }}>{njFormatDateTime(startDt, now, t)}</Text>
          </View>
          <Svg width={22} height={8} viewBox="0 0 22 8" fill="none">
            <Path d="M1 4h18m0 0-3-3m3 3-3 3" stroke={theme.text3} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 10.5, color: theme.text2, letterSpacing: 0.6, textTransform: 'uppercase' }}>{t('journeyEdit.time.end')}</Text>
            <Text style={{ fontSize: 16, fontWeight: '700', color: theme.text, marginTop: 2, letterSpacing: -0.2 }}>{njFormatDateTime(endDt, now, t)}</Text>
          </View>
        </Press>
      </NJSection>

      {/* Companions */}
      {!isStartingNow && (
        <NJSection theme={theme} label={t('journeyEdit.details.companionsLabel')} hint={t('journeyEdit.details.companionsHint')}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 4, paddingRight: 14, height: 40, borderRadius: 20, backgroundColor: theme.dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)', borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
              <Avatar size={32} />
              <Text style={{ fontSize: 13.5, fontWeight: '600', color: theme.text }}>
                {SELF.name} <Text style={{ color: theme.text3, fontWeight: '500' }}>· {t('journeyEdit.details.self')}</Text>
              </Text>
            </View>
            <Press onPress={onInvite} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 12, paddingRight: 14, height: 40, borderRadius: 20, backgroundColor: theme.accent }}>
              <Icon name="plus" color="#fff" size={14} strokeWidth={2.2} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>{t('journeyEdit.details.invite')}</Text>
            </Press>
          </View>
        </NJSection>
      )}

      {/* "创建后" signpost */}
      {!isStartingNow && (
        <NJSection theme={theme} label={t('journeyEdit.details.afterCreateLabel')}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 14, backgroundColor: theme.dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.035)', borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
            <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: theme.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="list" color={theme.text2} size={18} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: theme.text }}>{t('journeyEdit.details.afterCreateTitle')}</Text>
              <Text style={{ fontSize: 11.5, color: theme.text2, marginTop: 2, lineHeight: 17 }}>{t('journeyEdit.details.afterCreateSub')}</Text>
            </View>
          </View>
        </NJSection>
      )}
    </View>
  );
}

// ──────────────────────────────────────────────────────────────
// Step 2 — success
// ──────────────────────────────────────────────────────────────
function NJStepSuccess({ theme, route, tripName, isStartingNow, durationMins }: { theme: Theme; route: NJRoute; tripName: string; isStartingNow: boolean; durationMins: number }) {
  const { t } = useI18n();
  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, bounciness: 12, speed: 6 }).start();
  }, [pop]);
  const scale = pop.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 }}>
      <Animated.View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center', transform: [{ scale }], ...shadow(0.4, 20, 8, theme.accent) }}>
        {isStartingNow ? (
          <Svg width={40} height={40} viewBox="0 0 24 24" fill="none">
            <Path d="M5 4v16L18 12 5 4Z" fill="#fff" />
          </Svg>
        ) : (
          <Icon name="check" color="#fff" size={48} strokeWidth={3.2} />
        )}
      </Animated.View>
      <Text style={{ fontSize: 26, fontWeight: '700', color: theme.text, marginTop: 26, letterSpacing: -0.5 }}>{isStartingNow ? t('journeyEdit.success.startedTitle') : t('journeyEdit.success.joinedTitle')}</Text>
      <Text style={{ fontSize: 14.5, color: theme.text2, marginTop: 8, lineHeight: 21, textAlign: 'center', maxWidth: 280 }}>
        <Text style={{ color: theme.text, fontWeight: '600' }}>《{tripName || route.name}》</Text>
        {'\n'}
        {njDurationLabel(durationMins, t)}
        {isStartingNow ? t('journeyEdit.success.startedNote') : t('journeyEdit.success.joinedNote')}
      </Text>
      <View style={{ marginTop: 28, width: '100%', maxWidth: 320 }}>
        <NJRouteCard theme={theme} route={route} compact />
      </View>
      <Text style={{ fontFamily: MONO, fontSize: 10.5, color: theme.text3, marginTop: 20, letterSpacing: 0.4 }}>{isStartingNow ? t('journeyEdit.success.redirectDetail') : t('journeyEdit.success.redirectMine')}</Text>
    </View>
  );
}

// ──────────────────────────────────────────────────────────────
// Build the journey Poi created by the flow
// ──────────────────────────────────────────────────────────────
function buildJourney(route: NJRoute, tripName: string, startDt: Date, durationMins: number, t: TFn): Poi {
  const totalDays = Math.max(1, Math.ceil(durationMins / (60 * 24)));
  const m = startDt.getMonth() + 1;
  const d = startDt.getDate();
  const lng = route.lng ?? 104.0;
  const lat = route.lat ?? 35.0;
  const base: Poi = {
    id: `j-${Date.now()}`,
    kind: 'journey',
    name: tripName.trim() || route.name,
    region: route.region,
    coord: route.coord || `${lat.toFixed(2)} N · ${lng.toFixed(2)} E`,
    lng,
    lat,
    dist: route.dist,
    asc: route.asc,
    diff: route.diff as Poi['diff'],
    tone: (route.tone as Poi['tone']) || 'rock',
    days: t('journeyEdit.meta.days', { count: totalDays }),
    totalDays,
    companions: 0,
    companionList: [SELF],
    mine: true,
    fav: false,
    desc: '',
    routeId: route.custom ? undefined : route.id,
    trackCoords: route.trackCoords,
    trackElevation: route.trackElevation,
    trackDurationMs: route.trackDurationMs,
    trackWaypoints: route.trackWaypoints,
  };
  base.plannedDate = t('journeyEdit.meta.plannedDate', { month: m, day: d });
  base.date = t('journeyEdit.meta.yearMonth', { year: startDt.getFullYear(), month: m });
  base.countdown = Math.max(0, njDayDiff(startDt, njRoundedNow()));
  return base;
}

// Seed the route picker from an existing journey/route (再次出发 / 开始旅程).
// We clone the route facts onto a fresh planned journey, so reuse the journey's
// original routeId when it has one, otherwise its own id.
function presetToRoute(p: Poi): NJRoute {
  return {
    id: p.routeId || p.id,
    name: p.name,
    region: p.region,
    dist: p.dist,
    asc: p.asc,
    diff: p.diff,
    tone: p.tone,
    lng: p.lng,
    lat: p.lat,
    coord: p.coord,
    trackCoords: p.trackCoords,
    trackElevation: p.trackElevation,
    trackDurationMs: p.trackDurationMs,
    trackWaypoints: p.trackWaypoints,
  };
}

// ──────────────────────────────────────────────────────────────
// Main flow
// ──────────────────────────────────────────────────────────────
export function NewJourneySheet({ theme, onClose, onCreate, onToast, preset }: { theme: Theme; onClose: () => void; onCreate: (poi: Poi) => void; onToast: (m: string) => void; preset?: Poi | null }) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  // A preset (再次出发 / 开始旅程 on an existing route) seeds the route and jumps
  // straight to the details step — the route picker is skipped and locked.
  const presetRoute = useMemo(() => (preset ? presetToRoute(preset) : null), [preset]);
  const presetLocked = !!preset;
  const [mode, setMode] = useState<'plan' | 'record' | null>(preset ? 'plan' : null);
  const [step, setStep] = useState(preset ? 1 : 0); // 0 route · 1 details · 2 success
  const [direction, setDirection] = useState(1);
  const [route, setRoute] = useState<NJRoute | null>(presetRoute);
  const [tripName, setTripName] = useState('');
  const [startDt, setStartDt] = useState<Date>(() => njRoundedNow());
  const [durationMins, setDurationMins] = useState(NJ_DEFAULT_DURATION);
  const [shareOpen, setShareOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);

  // Auto-fill trip name from route once
  const nameInit = useRef(false);
  useEffect(() => {
    if (route && !nameInit.current && !tripName) {
      const today = new Date();
      const datePart = t('journeyEdit.meta.monthDay', { month: today.getMonth() + 1, day: today.getDate() });
      const namePart = route.custom ? t('journeyEdit.newJourneyName') : route.name;
      setTripName(`${datePart} · ${namePart}`);
      nameInit.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route]);

  // 「现在出发」 if start within 1h of now
  const isStartingNow = useMemo(() => Math.abs(startDt.getTime() - Date.now()) < 60 * 60 * 1000, [startDt]);
  const nameValid = tripName.trim().length > 0;
  const canAdvance = step === 0 ? !!route : step === 1 ? nameValid : true;

  // step transition animation
  const anim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    anim.setValue(0);
    Animated.timing(anim, { toValue: 1, duration: 280, useNativeDriver: true }).start();
  }, [step, anim]);
  const stepTranslate = anim.interpolate({ inputRange: [0, 1], outputRange: [direction > 0 ? 24 : -24, 0] });

  const next = () => {
    if (step === 0 && route) {
      setDirection(1);
      setStep(1);
    } else if (step === 1 && nameValid && route) {
      setDirection(1);
      setStep(2);
      const poi = buildJourney(route, tripName, startDt, durationMins, t);
      setTimeout(() => {
        onCreate(poi);
      }, 1500);
    }
  };
  const back = () => {
    // With a locked preset route there's no route-picker to step back to — the
    // details step is the only step, so back closes the whole flow.
    if (presetLocked) {
      onClose();
      return;
    }
    if (step === 0) {
      setDirection(-1);
      setMode(null);
    } else {
      setDirection(-1);
      setStep(step - 1);
    }
  };

  const cta =
    step === 0
      ? route
        ? t('journeyEdit.cta.continue')
        : t('journeyEdit.cta.pickRoute')
      : nameValid
      ? isStartingNow
        ? t('journeyEdit.cta.startNow')
        : t('journeyEdit.cta.joinPlan')
      : t('journeyEdit.cta.fillName');

  // Mode picker first — wrapped in an absolute overlay so it covers the app shell
  if (mode === null) {
    return (
      <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.bg, zIndex: 200 }]}>
        <NJModePicker theme={theme} insetsTop={insets.top} onClose={onClose} onPick={(m) => { setDirection(1); setStep(0); setMode(m); }} />
      </View>
    );
  }

  // Record-past sub-flow (记录走过的) — renders its own full-screen overlay
  if (mode === 'record') {
    return <RecordJourneySheet theme={theme} onBack={() => setMode(null)} onClose={onClose} onCreate={onCreate} onToast={onToast} />;
  }

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.bg, zIndex: 200 }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        {/* Top bar */}
        <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {step < 2 ? (
            <NJRoundBtn theme={theme} onPress={back}>
              {step === 0 || presetLocked ? <Icon name="close" color={theme.text} size={16} /> : <Icon name="chevronL" color={theme.text} size={16} />}
            </NJRoundBtn>
          ) : (
            <View style={{ width: 38, height: 38 }} />
          )}
          <View style={{ flex: 1, alignItems: 'center' }}>{step < 2 && !presetLocked ? <NJStepDots count={2} current={step} theme={theme} /> : null}</View>
          <View style={{ width: 38, alignItems: 'flex-end' }}>
            {step < 2 && !presetLocked ? <Text style={{ fontFamily: MONO, fontSize: 11, color: theme.text2, letterSpacing: 0.4 }}>{step + 1} / 2</Text> : null}
          </View>
        </View>

        {/* Body */}
        <Animated.View style={{ flex: 1, opacity: anim, transform: [{ translateX: stepTranslate }] }}>
          {step === 2 ? (
            <NJStepSuccess theme={theme} route={route as NJRoute} tripName={tripName} isStartingNow={isStartingNow} durationMins={durationMins} />
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {step === 0 && <NJStepRoute theme={theme} route={route} setRoute={setRoute} />}
              {step === 1 && route && (
                <NJStepDetails
                  theme={theme}
                  route={route}
                  tripName={tripName}
                  setTripName={setTripName}
                  startDt={startDt}
                  durationMins={durationMins}
                  isStartingNow={isStartingNow}
                  onInvite={() => setShareOpen(true)}
                  onOpenTimePicker={() => setTimeOpen(true)}
                />
              )}
            </ScrollView>
          )}
        </Animated.View>

        {/* Bottom CTA */}
        {step < 2 && (
          <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 16) + 8 }}>
            <Press
              onPress={canAdvance ? next : undefined}
              style={{
                height: 52,
                borderRadius: 16,
                backgroundColor: canAdvance ? theme.accent : theme.dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                ...(canAdvance ? shadow(0.3, 14, 6, theme.accent) : {}),
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: '700', color: canAdvance ? '#fff' : theme.text3, letterSpacing: 0.2 }}>{cta}</Text>
              {canAdvance ? <Icon name="chevronR" color="#fff" size={15} strokeWidth={2.4} /> : null}
            </Press>
          </View>
        )}
      </KeyboardAvoidingView>

      {/* Invite overlay */}
      {shareOpen && <NJSharePanel theme={theme} tripName={tripName || (route && route.name) || t('journeyEdit.newJourneyName')} onClose={() => setShareOpen(false)} onToast={onToast} />}

      {/* Time picker overlay */}
      {timeOpen && (
        <NJTimePickerModal
          theme={theme}
          startDt={startDt}
          durationMins={durationMins}
          onApply={(dt, dur) => {
            setStartDt(dt);
            setDurationMins(dur);
          }}
          onClose={() => setTimeOpen(false)}
        />
      )}
    </View>
  );
}
