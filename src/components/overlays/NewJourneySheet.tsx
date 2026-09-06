// NewJourneySheet.tsx — unified journey creation flow:
// choose a route or blank journey → add core details → create and open it.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  Animated,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Keyboard,
  KeyboardAvoidingView,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { File as FSFile } from 'expo-file-system';
import Svg, { Path } from 'react-native-svg';
import { Theme } from '../../theme/theme';
import { shadow } from '../../theme/shadow';
import { MONO } from '../../theme/fonts';
import { Poi, Companion } from '../../data/pois';
import { useData } from '../../data/DataContext';
import { PhotoTile } from '../PhotoTile';
import { Press } from '../Press';
import { Icon } from '../Icon';
import { Avatar } from '../Avatar';
import { NJSection, NJRoundBtn, NJMiniCalendar, NJBottomSheet, NJSharePanel, SELF, NJWheelPicker, NJ_TIME_OPTIONS, njFormatTime } from './NewJourneyParts';
import { useI18n, TKey, TVars } from '../../i18n';
import { AppCard, AppIconButton, layout, radius, space, type } from '../../design-system';
import { TrackMap } from './TrackMap';
import { JourneyDateRangePicker } from './JourneyDateRangePicker';
import {
  locationFromPoi,
  reverseJourneyLocation,
  searchJourneyLocations,
  type JourneyLocationValue,
} from '../../lib/amapGeocoding';
import { parseTrack, computeStats, buildTrackData } from '../../lib/trackParser';
import { extractKmlFromKmz } from '../../lib/kmz';
import { uploadMedia } from '../../lib/storage';
import { AssistantMark } from '../assistant/AssistantMark';

export { NJSection, NJRoundBtn, NJMiniCalendar, NJBottomSheet, NJSharePanel, SELF };

type TFn = (key: TKey, vars?: TVars) => string;

// ──────────────────────────────────────────────────────────────
// Route shape used by the picker (real explore routes + synthetic custom)
// ──────────────────────────────────────────────────────────────
interface NJRoute {
  id: string;
  routeId?: string;
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
    routeId: p.id,
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
const NJ_PRESET_DEFAULT_DURATION = 60 * 24; // route-first planning uses the shared day-range picker

function njInitialPlannedStart(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(7, 30, 0, 0);
  return d;
}

function njPresetDuration(preset?: Poi | null): number {
  if (!preset?.trackDurationMs || preset.trackDurationMs <= 0) return NJ_PRESET_DEFAULT_DURATION;
  const days = Math.max(1, Math.ceil(preset.trackDurationMs / (24 * 60 * 60 * 1000)));
  return days * 24 * 60;
}

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
        backgroundColor: selected ? theme.accentSoft : theme.fieldSurface,
        borderWidth: 1,
        borderColor: selected ? theme.accent : theme.fieldBorder,
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
        {!compact && !route.custom && (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
            <Text style={{ fontFamily: MONO, fontSize: 10.5, color: theme.text, letterSpacing: 0.2 }}>{route.dist}</Text>
            <Text style={{ fontFamily: MONO, fontSize: 10.5, color: theme.text2, letterSpacing: 0.2 }}>↑{(route.asc || '').replace('+', '')}</Text>
            {route.diff ? <Text style={{ fontFamily: MONO, fontSize: 10.5, color: theme.text2, letterSpacing: 0 }}>{route.diff}</Text> : null}
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
// Step 0 — choose route
// ──────────────────────────────────────────────────────────────
function NJStepRoute({ theme, route, setRoute }: { theme: Theme; route: NJRoute | null; setRoute: (r: NJRoute) => void }) {
  const { t } = useI18n();
  const suggestions = useRouteSuggestions();
  const [q, setQ] = useState('');
  const filtered = suggestions.filter((r) => !q || r.name.includes(q) || r.region.includes(q));
  return (
    <View style={{ paddingHorizontal: layout.pagePadding, paddingTop: space.xl, paddingBottom: space.xxl }}>
      <Text style={[type.pageTitle, { color: theme.text, letterSpacing: 0, lineHeight: 32 }]}>{t('journeyEdit.route.heading')}</Text>
      <Text style={[type.body, { color: theme.text2, marginTop: space.xs, marginBottom: space.xl, lineHeight: 21 }]}>{t('journeyEdit.route.subheading')}</Text>

      <NJSection theme={theme} label={t('journeyEdit.route.sectionScratch')}>
        <Press
          onPress={() => setRoute({ id: 'custom', custom: true, name: t('journeyEdit.route.customName'), region: t('journeyEdit.route.customRegion'), tone: 'rock', dist: '—', asc: '—', diff: '—' })}
          style={{
            flexDirection: 'row',
            gap: 12,
            alignItems: 'center',
            padding: 12,
            borderRadius: radius.card,
            backgroundColor: route && route.custom ? theme.accentSoft : 'transparent',
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: route && route.custom ? theme.accent : theme.fieldBorder,
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs, height: layout.fieldHeight, paddingHorizontal: space.sm, borderRadius: radius.control, marginBottom: space.sm, backgroundColor: theme.fieldSurface, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.fieldBorder }}>
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
  onInvite,
  onOpenTimePicker,
}: {
  theme: Theme;
  route: NJRoute;
  tripName: string;
  setTripName: (v: string) => void;
  startDt: Date;
  durationMins: number;
  onInvite: () => void;
  onOpenTimePicker: () => void;
}) {
  const { t } = useI18n();
  const now = useMemo(() => njRoundedNow(), []);
  const endDt = njAddMinutes(startDt, durationMins);
  const nameMissing = !tripName.trim();

  return (
    <View style={{ paddingHorizontal: layout.pagePadding, paddingTop: space.xl, paddingBottom: space.xxl }}>
      <Text style={{ ...type.pageTitle, color: theme.text, lineHeight: 32, marginTop: 4 }}>{t('journeyEdit.details.heading')}</Text>
      <Text style={{ ...type.body, color: theme.text2, marginTop: 6, marginBottom: 22, lineHeight: 21 }}>{t('journeyEdit.details.subheading')}</Text>

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
            backgroundColor: theme.fieldSurface,
            borderWidth: 1,
            borderColor: nameMissing ? theme.danger : theme.fieldBorder,
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
          style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderRadius: radius.card, backgroundColor: theme.fieldSurface, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.fieldBorder }}
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
      <NJSection theme={theme} label={t('journeyEdit.details.companionsLabel')} hint={t('journeyEdit.details.companionsHint')}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 4, paddingRight: 14, height: 40, borderRadius: 20, backgroundColor: theme.dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)', borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
              <Avatar size={32} />
              <Text style={{ fontSize: 13.5, fontWeight: '600', color: theme.text }}>{SELF.name}</Text>
              <Text style={{ fontSize: 11.5, color: theme.text3, fontWeight: '500' }}>{t('journeyEdit.details.self')}</Text>
            </View>
            <Press onPress={onInvite} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 12, paddingRight: 14, height: 40, borderRadius: 20, backgroundColor: theme.accent }}>
              <Icon name="plus" color="#fff" size={14} strokeWidth={2.2} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>{t('journeyEdit.details.invite')}</Text>
            </Press>
          </View>
      </NJSection>

      {/* "创建后" signpost */}
      <NJSection theme={theme} label={t('journeyEdit.details.afterCreateLabel')}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderRadius: radius.card, backgroundColor: theme.fieldSurface, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.fieldBorder }}>
            <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: theme.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="list" color={theme.text2} size={18} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: theme.text }}>{t('journeyEdit.details.afterCreateTitle')}</Text>
              <Text style={{ fontSize: 11.5, color: theme.text2, marginTop: 2, lineHeight: 17 }}>{t('journeyEdit.details.afterCreateSub')}</Text>
            </View>
          </View>
      </NJSection>
    </View>
  );
}

// ──────────────────────────────────────────────────────────────
// Step 2 — success
// ──────────────────────────────────────────────────────────────
function NJStepSuccess({ theme, route, tripName, durationMins }: { theme: Theme; route: NJRoute; tripName: string; durationMins: number }) {
  const { t } = useI18n();
  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, bounciness: 12, speed: 6 }).start();
  }, [pop]);
  const scale = pop.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 }}>
      <Animated.View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center', transform: [{ scale }], ...shadow(0.4, 20, 8, theme.accent) }}>
        <Icon name="check" color="#fff" size={48} strokeWidth={3.2} />
      </Animated.View>
      <Text style={{ fontSize: 26, fontWeight: '700', color: theme.text, marginTop: 26, letterSpacing: 0 }}>{t('journeyEdit.success.createdTitle')}</Text>
      <Text style={{ fontSize: 14.5, color: theme.text2, marginTop: 8, lineHeight: 21, textAlign: 'center', maxWidth: 280 }}>
        <Text style={{ color: theme.text, fontWeight: '600' }}>《{tripName || route.name}》</Text>
        {'\n'}
        {njDurationLabel(durationMins, t)}
        {t('journeyEdit.success.createdNote')}
      </Text>
      <View style={{ marginTop: 28, width: '100%', maxWidth: 320 }}>
        <NJRouteCard theme={theme} route={route} compact />
      </View>
      <Text style={{ fontFamily: MONO, fontSize: 10.5, color: theme.text3, marginTop: 20, letterSpacing: 0 }}>{t('journeyEdit.success.redirectDetail')}</Text>
    </View>
  );
}

// ──────────────────────────────────────────────────────────────
// Build the journey Poi created by the flow
// ──────────────────────────────────────────────────────────────
function buildJourney(route: NJRoute, tripName: string, startDt: Date, durationMins: number, flexibleDates: boolean, t: TFn): Poi {
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
    routeId: route.routeId,
    trackCoords: route.trackCoords,
    trackElevation: route.trackElevation,
    trackDurationMs: route.trackDurationMs,
    trackWaypoints: route.trackWaypoints,
  };
  if (!flexibleDates) {
    base.plannedDate = t('journeyEdit.meta.plannedDate', { month: m, day: d });
    base.date = t('journeyEdit.meta.yearMonth', { year: startDt.getFullYear(), month: m });
    base.countdown = Math.max(0, njDayDiff(startDt, njRoundedNow()));
  }
  return base;
}

// Seed the route picker from an existing journey/route (再次出发 / 开始旅程).
// We clone the route facts onto a fresh planned journey, so reuse the journey's
// original routeId when it has one, otherwise its own id.
function presetToRoute(p: Poi): NJRoute {
  return {
    id: p.routeId || p.id,
    routeId: p.routeId || (p.kind === 'route' ? p.id : undefined),
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
// Route-first planner — map entry with an already selected route
// ──────────────────────────────────────────────────────────────
function NJPresetPlanner({
  theme,
  route,
  tripName,
  setTripName,
  startDt,
  durationMins,
  flexibleDates,
  onOpenTimePicker,
  onClose,
  onCreate,
}: {
  theme: Theme;
  route: NJRoute;
  tripName: string;
  setTripName: (value: string) => void;
  startDt: Date;
  durationMins: number;
  flexibleDates: boolean;
  onOpenTimePicker: () => void;
  onClose: () => void;
  onCreate: () => void;
}) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const plannerHeight = Math.min(Math.max(height * 0.37, 318), 350);
  const mapCoords = useMemo<[number, number][]>(() => {
    if (route.trackCoords?.length) return route.trackCoords;
    if (Number.isFinite(route.lng) && Number.isFinite(route.lat)) return [[route.lng as number, route.lat as number]];
    return [];
  }, [route.lat, route.lng, route.trackCoords]);
  const hasMapLocation = mapCoords.length > 0;
  const dayKey = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][startDt.getDay()] as 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';
  const plannedDate = t('journeyEdit.planner.dateSummary', {
    month: startDt.getMonth() + 1,
    day: startDt.getDate(),
    weekday: t(`journeyEdit.weekday.${dayKey}`),
  });
  const routeMetrics = [route.dist, route.asc ? `↑ ${(route.asc || '').replace('+', '')}` : ''].filter(Boolean);

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.featureSurface }]}>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: height - plannerHeight + radius.feature, overflow: 'hidden' }}>
        {hasMapLocation ? (
          <TrackMap
            fill
            interactive
            showLegend={false}
            coords={mapCoords}
            theme={theme}
            accent={theme.accent}
            routePadding={[insets.top + 84, 34, 48, 34]}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', backgroundColor: theme.fieldSurface }]}>
            <Icon name="pin" color={theme.text2} size={24} />
            <Text style={{ ...type.caption, color: theme.text2, marginTop: space.xs }}>{route.region}</Text>
          </View>
        )}
      </View>

      <View style={{ position: 'absolute', top: insets.top + space.sm, left: space.md, right: space.md, height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <AppIconButton theme={theme} name="close" onPress={onClose} noShadow accessibilityLabel={t('common.close')} />
        <View pointerEvents="none" style={{ position: 'absolute', left: 54, right: 54, alignItems: 'center' }}>
          <View style={{ paddingHorizontal: space.sm, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: 'rgba(0,0,0,0.56)' }}>
            <Text style={{ ...type.navTitle, color: '#FFFFFF' }}>{t('journeyEdit.planner.title')}</Text>
          </View>
        </View>
        <View style={{ width: 44 }} />
      </View>

      <View pointerEvents="none" style={{ position: 'absolute', top: insets.top + 68, left: space.md, maxWidth: '72%', paddingHorizontal: space.sm, paddingVertical: space.xs, borderRadius: radius.control, backgroundColor: 'rgba(0,0,0,0.64)' }}>
        <Text numberOfLines={1} style={{ ...type.cardTitle, color: '#FFFFFF' }}>{route.name}</Text>
        {routeMetrics.length > 0 ? (
          <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.xxs }}>
            {routeMetrics.map((metric, index) => <Text key={`${metric}-${index}`} style={{ fontFamily: MONO, fontSize: 10.5, color: 'rgba(255,255,255,0.72)' }}>{metric}</Text>)}
          </View>
        ) : null}
      </View>

      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: plannerHeight, borderTopLeftRadius: radius.feature, borderTopRightRadius: radius.feature, overflow: 'hidden', backgroundColor: theme.groupedBg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.fieldBorder }}>
        <View style={{ width: 38, height: 4, borderRadius: radius.pill, alignSelf: 'center', marginTop: space.sm, backgroundColor: theme.progressTrack }} />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: 96 }}>
          <View>
            <Text style={{ ...type.eyebrow, color: theme.text2, marginBottom: space.xs }}>{t('journeyEdit.details.nameLabel')}</Text>
            <TextInput
              value={tripName}
              onChangeText={setTripName}
              placeholder={t('journeyEdit.details.namePlaceholder')}
              placeholderTextColor={theme.text3}
              maxLength={32}
              selectTextOnFocus
              style={{ height: 50, paddingHorizontal: space.md, borderRadius: radius.card, backgroundColor: theme.featureSurface, color: theme.text, ...type.cardTitle }}
            />
          </View>

          <View style={{ marginTop: space.md }}>
            <Text style={{ ...type.eyebrow, color: theme.text2, marginBottom: space.xs }}>{t('journeyEdit.details.timeLabel')}</Text>
            <Press onPress={onOpenTimePicker} accessibilityRole="button" style={{ minHeight: 58, paddingHorizontal: space.md, flexDirection: 'row', alignItems: 'center', gap: space.sm, borderRadius: radius.card, backgroundColor: theme.featureSurface }}>
              <Icon name="calendar" color={theme.text2} size={18} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ ...type.cardTitle, color: theme.text }}>{flexibleDates ? njDurationLabel(durationMins, t) : plannedDate}</Text>
                {!flexibleDates ? <Text numberOfLines={1} style={{ ...type.caption, color: theme.text2, marginTop: 2 }}>{njDurationLabel(durationMins, t)}</Text> : null}
              </View>
              <Icon name="chevronR" color={theme.text3} size={15} />
            </Press>
          </View>
        </ScrollView>

        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 68 + Math.max(insets.bottom, space.md), backgroundColor: theme.groupedBg }} />
        <View style={{ position: 'absolute', left: space.md, right: space.md, bottom: Math.max(insets.bottom, space.md) }}>
          <Press onPress={onCreate} accessibilityRole="button" accessibilityLabel={t('journeyEdit.planner.create')} style={{ height: 52, borderRadius: radius.card, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.accent }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#FFFFFF' }}>{t('journeyEdit.planner.create')}</Text>
          </Press>
        </View>
      </View>
    </View>
  );
}

function CreateJourneyRow({
  theme,
  icon,
  label,
  value,
  onPress,
  last = false,
}: {
  theme: Theme;
  icon: 'calendar' | 'pin' | 'route' | 'people';
  label: string;
  value: string;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <Press onPress={onPress} accessibilityRole="button" style={{ minHeight: 68, paddingHorizontal: space.md, flexDirection: 'row', alignItems: 'center', gap: space.md }}>
      <View style={{ width: 36, height: 36, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.accentSoft }}>
        <Icon name={icon} color={theme.accent} size={19} strokeWidth={1.9} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[type.caption, { color: theme.text2 }]}>{label}</Text>
        <Text numberOfLines={1} style={[type.body, { color: theme.text, fontWeight: '600', marginTop: 3 }]}>{value}</Text>
      </View>
      <Icon name="chevronR" color={theme.text3} size={15} />
      {!last ? <View pointerEvents="none" style={{ position: 'absolute', left: 68, right: 0, bottom: 0, height: StyleSheet.hairlineWidth, backgroundColor: theme.hairline }} /> : null}
    </Press>
  );
}

function JourneyRoutePicker({ theme, selected, onClose, onSelect }: { theme: Theme; selected: NJRoute; onClose: () => void; onSelect: (route: NJRoute) => void }) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const suggestions = useRouteSuggestions();
  const [query, setQuery] = useState('');
  const filtered = suggestions.filter((route) => !query || route.name.includes(query) || route.region.includes(query));

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 260, backgroundColor: theme.featureSurface }]}>
      <View style={{ height: insets.top + layout.topBarHeight, paddingTop: insets.top, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center' }}>
        <AppIconButton theme={theme} name="chevronL" onPress={onClose} noShadow />
        <View pointerEvents="none" style={{ position: 'absolute', left: 68, right: 68, bottom: 13, alignItems: 'center' }}>
          <Text numberOfLines={1} style={[type.navTitle, { color: theme.text }]}>{t('journeyEdit.route.heading')}</Text>
        </View>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: layout.pagePadding, paddingTop: space.md, paddingBottom: insets.bottom + space.xxxl }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs, height: layout.fieldHeight, paddingHorizontal: space.sm, borderRadius: radius.control, marginBottom: space.lg, backgroundColor: theme.fieldSurface, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.fieldBorder }}>
          <Icon name="search" color={theme.text2} size={16} />
          <TextInput value={query} onChangeText={setQuery} placeholder={t('journeyEdit.route.searchPlaceholder')} placeholderTextColor={theme.text3} style={{ flex: 1, fontSize: 14, color: theme.text, padding: 0 }} />
        </View>
        <View style={{ gap: space.xs }}>
          <NJRouteCard
            theme={theme}
            route={{ id: 'custom', custom: true, name: t('journeyEdit.route.customName'), region: t('journeyEdit.route.customRegion'), tone: 'rock', dist: '—', asc: '—' }}
            selected={selected.custom}
            onPress={() => {
              onSelect({ id: 'custom', custom: true, name: t('journeyEdit.route.customName'), region: selected.region, tone: 'rock', dist: '—', asc: '—', lng: selected.lng, lat: selected.lat, coord: selected.coord });
              onClose();
            }}
          />
          {filtered.map((route) => (
            <NJRouteCard key={route.id} theme={theme} route={route} selected={!selected.custom && selected.id === route.id} onPress={() => { onSelect(route); onClose(); }} />
          ))}
          {!filtered.length ? <Text style={[type.body, { paddingVertical: space.xxl, color: theme.text3, textAlign: 'center' }]}>{t('journeyEdit.route.empty')}</Text> : null}
        </View>
      </ScrollView>
    </View>
  );
}

function journeyDateSummary(start: Date, durationMins: number, locale: 'zh' | 'en') {
  const totalDays = Math.max(1, Math.round(durationMins / (24 * 60)));
  const end = new Date(start);
  end.setDate(end.getDate() + totalDays - 1);
  const formatter = new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    year: start.getFullYear() === end.getFullYear() ? undefined : 'numeric',
    month: 'short',
    day: 'numeric',
  });
  const startLabel = formatter.format(start);
  const endLabel = formatter.format(end);
  return totalDays === 1 ? startLabel : `${startLabel} - ${endLabel}`;
}

// ──────────────────────────────────────────────────────────────
// Main flow
// ──────────────────────────────────────────────────────────────
export function NewJourneySheet({ theme, onClose, onCreate, onSmartPlan, onToast, preset }: { theme: Theme; onClose: () => void; onCreate: (poi: Poi) => Promise<boolean>; onSmartPlan: (poi: Poi, prompt: string) => Promise<boolean>; onToast: (m: string) => void; preset?: Poi | null }) {
  const { t, resolved } = useI18n();
  const { userId } = useData();
  const insets = useSafeAreaInsets();
  const presetRoute = useMemo(() => (preset ? presetToRoute(preset) : null), [preset]);
  const blankRoute = useMemo<NJRoute>(() => ({
    id: 'custom',
    custom: true,
    name: t('journeyEdit.route.customName'),
    region: t('journeyEdit.form.destinationUnset'),
    tone: 'rock',
    dist: '—',
    asc: '—',
    lng: 104,
    lat: 35,
  }), [t]);
  const [route, setRoute] = useState<NJRoute>(() => presetRoute || blankRoute);
  const [tripName, setTripName] = useState('');
  const [startDt, setStartDt] = useState<Date>(() => preset ? njInitialPlannedStart() : njRoundedNow());
  const [durationMins, setDurationMins] = useState(() => (preset ? njPresetDuration(preset) : NJ_DEFAULT_DURATION));
  const [flexibleDates, setFlexibleDates] = useState(() => Boolean(preset && !preset.plannedDate && !preset.date && (preset.days || preset.totalDays)));
  const [timeOpen, setTimeOpen] = useState(false);
  const [creatingMode, setCreatingMode] = useState<'manual' | 'smart' | null>(null);
  const [trackBusy, setTrackBusy] = useState(false);
  const [trackSource, setTrackSource] = useState<{ uri: string; fileName: string } | null>(null);
  const [locationResults, setLocationResults] = useState<JourneyLocationValue[]>([]);
  const [locationSearching, setLocationSearching] = useState(false);
  const [locationSearchFailed, setLocationSearchFailed] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<JourneyLocationValue | null>(null);

  const nameInit = useRef(false);
  useEffect(() => {
    if (!route.custom && !nameInit.current && !tripName) {
      const datePart = t('journeyEdit.meta.monthDay', { month: startDt.getMonth() + 1, day: startDt.getDate() });
      setTripName(`${datePart} ${route.name}`);
      nameInit.current = true;
    }
  }, [route, startDt, t, tripName]);

  useEffect(() => {
    const query = tripName.trim();
    if (presetRoute || query.length < 2 || query === selectedLocation?.name) {
      setLocationResults([]);
      setLocationSearching(false);
      setLocationSearchFailed(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLocationSearching(true);
      setLocationSearchFailed(false);
      const proximity: [number, number] | undefined = trackSource && route.lng != null && route.lat != null
        ? [route.lng, route.lat]
        : undefined;
      searchJourneyLocations(query, resolved === 'zh' ? 'zh' : 'en', proximity, controller.signal)
        .then((results) => {
          if (!controller.signal.aborted) {
            setLocationResults(results);
            setLocationSearchFailed(false);
          }
        })
        .catch((error) => {
          if (error instanceof Error && error.name === 'AbortError') return;
          if (!controller.signal.aborted) {
            setLocationResults([]);
            setLocationSearchFailed(true);
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setLocationSearching(false);
        });
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [presetRoute, resolved, route.lat, route.lng, selectedLocation?.name, trackSource, tripName]);

  const nameValid = tripName.trim().length > 0;
  const totalDays = Math.max(1, Math.round(durationMins / (24 * 60)));
  const submit = async (mode: 'manual' | 'smart') => {
    if (!nameValid || creatingMode) return;
    setCreatingMode(mode);
    const effectiveRoute = route.custom && !selectedLocation
      ? { ...route, region: tripName.trim() }
      : route;
    const poi = buildJourney(effectiveRoute, tripName, startDt, durationMins, flexibleDates, t);
    if (trackSource && userId) {
      try {
        poi.trackFileUrl = await uploadMedia(trackSource.uri, userId, poi.id);
        poi.trackFileName = trackSource.fileName;
      } catch (error) {
        console.warn('[NewJourney] track upload failed:', error);
        onToast(t('journeyEdit.form.trackUploadFailed'));
        setCreatingMode(null);
        return;
      }
    }
    const prompt = t('journeyEdit.form.smartPrompt', {
      name: tripName.trim(),
      dates: flexibleDates ? t('journeyHome.dateUnset') : journeyDateSummary(startDt, durationMins, resolved),
      count: totalDays,
      track: trackSource ? `${trackSource.fileName} ${route.dist} ${route.asc}` : t('journeyEdit.form.noTrack'),
    });
    const created = mode === 'smart' ? await onSmartPlan(poi, prompt) : await onCreate(poi);
    if (!created) setCreatingMode(null);
  };

  const pickTrack = async () => {
    if (trackBusy) return;
    try {
      const result = await FSFile.pickFileAsync({ mimeTypes: '*/*' });
      if (result.canceled || !result.result) return;
      const file = result.result;
      const fileName = file.name || 'track.gpx';
      const extension = (fileName.split('.').pop() || '').toLowerCase();
      if (!['gpx', 'kml', 'kmz'].includes(extension)) {
        onToast(t('record.track.errFormat'));
        return;
      }
      setTrackBusy(true);
      let text: string;
      let parseName = fileName;
      if (extension === 'kmz') {
        const buffer = await file.arrayBuffer();
        const kml = extractKmlFromKmz(new Uint8Array(buffer));
        if (!kml) throw new Error('KMZ_PARSE_FAILED');
        text = kml;
        parseName = fileName.replace(/\.kmz$/i, '.kml');
      } else {
        text = await file.text();
      }
      if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
      const parsed = parseTrack(text, parseName, t as (key: string, vars?: Record<string, string | number>) => string);
      if (parsed.error || !parsed.points) throw new Error(parsed.error || 'TRACK_PARSE_FAILED');
      const stats = computeStats(parsed.points);
      if (!stats) throw new Error('TRACK_PARSE_FAILED');
      const track = buildTrackData(stats);
      const start = stats.points[0];
      let boundLocation = selectedLocation;
      if (!boundLocation) {
        let trackLocation: JourneyLocationValue;
        try {
          trackLocation = await reverseJourneyLocation(
            start.lon,
            start.lat,
            resolved === 'zh' ? 'zh' : 'en',
          );
        } catch (error) {
          console.warn('[NewJourney] track location lookup failed:', error);
          trackLocation = locationFromPoi(
            parsed.name || tripName.trim() || t('journey.settings.locationUnnamed'),
            start.lon,
            start.lat,
          );
        }
        const destinationName = tripName.trim() || parsed.name || trackLocation.name;
        boundLocation = { ...trackLocation, name: destinationName };
        setTripName(destinationName);
        setSelectedLocation(boundLocation);
        setLocationResults([]);
        setLocationSearchFailed(false);
      }
      setRoute((current) => ({
        ...current,
        name: parsed.name || current.name,
        region: boundLocation.region || current.region,
        lng: boundLocation.lng,
        lat: boundLocation.lat,
        coord: boundLocation.coord,
        ...track,
        asc: track.asc || current.asc,
      }));
      setTrackSource({ uri: file.uri, fileName });
    } catch (error) {
      console.warn('[NewJourney] track parse failed:', error);
      onToast(t('record.track.errParse'));
    } finally {
      setTrackBusy(false);
    }
  };

  if (presetRoute) {
    return (
      <View style={[StyleSheet.absoluteFill, { zIndex: 200 }]}>
        <NJPresetPlanner
          theme={theme}
          route={route}
          tripName={tripName}
          setTripName={setTripName}
          startDt={startDt}
          durationMins={durationMins}
          flexibleDates={flexibleDates}
          onOpenTimePicker={() => setTimeOpen(true)}
          onClose={onClose}
          onCreate={() => void submit('manual')}
        />
        {timeOpen && (
          <JourneyDateRangePicker
            theme={theme}
            initialStart={startDt}
            initialDurationDays={Math.max(1, Math.round(durationMins / (24 * 60)))}
            initialFlexible={flexibleDates}
            onApply={({ start, totalDays, flexible }) => {
              setStartDt(start);
              setDurationMins(totalDays * 24 * 60);
              setFlexibleDates(flexible);
            }}
            onClose={() => setTimeOpen(false)}
          />
        )}
      </View>
    );
  }

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.groupedBg, zIndex: 200 }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={{ height: insets.top + layout.topBarHeight, paddingTop: insets.top, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center' }}>
          <AppIconButton theme={theme} name="close" onPress={onClose} noShadow accessibilityLabel={t('common.close')} />
          <View pointerEvents="none" style={{ position: 'absolute', left: 68, right: 68, bottom: 13, alignItems: 'center' }}>
            <Text numberOfLines={1} style={[type.navTitle, { color: theme.text }]}>{t('journeyEdit.newTitle')}</Text>
          </View>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: layout.pagePadding + space.xs, paddingTop: space.xxxl, paddingBottom: 120 + insets.bottom }}>
          <View>
            <Text style={[type.pageTitle, { color: theme.text, letterSpacing: 0 }]}>{t('journeyEdit.form.whereTitle')}</Text>
            <View style={{ height: 96, marginTop: space.sm, paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.feature, backgroundColor: theme.surfaceTop }}>
              <TextInput
                value={tripName}
                onChangeText={(text) => {
                  setTripName(text);
                  setLocationResults([]);
                  setLocationSearchFailed(false);
                  if (selectedLocation && text !== selectedLocation.name) {
                    setSelectedLocation(null);
                    setRoute((current) => {
                      const trackStart = trackSource ? current.trackCoords?.[0] : undefined;
                      return {
                        ...current,
                        region: t('journeyEdit.form.destinationUnset'),
                        lng: trackStart?.[0] ?? blankRoute.lng,
                        lat: trackStart?.[1] ?? blankRoute.lat,
                        coord: undefined,
                      };
                    });
                  }
                }}
                maxLength={32}
                multiline
                numberOfLines={2}
                placeholder={t('journeyEdit.form.wherePlaceholder')}
                placeholderTextColor={theme.text3}
                style={{ width: '100%', height: 48, padding: 0, paddingRight: 28, color: theme.text, fontSize: 17, lineHeight: 24, fontWeight: '600', textAlignVertical: 'top' }}
              />
              <View style={{ height: 17, marginTop: space.xxs, justifyContent: 'center' }}>
                {selectedLocation ? (
                  <Text numberOfLines={1} style={[type.caption, { color: theme.text2 }]}>
                    {selectedLocation.address || selectedLocation.region}
                  </Text>
                ) : null}
              </View>
              {locationSearching ? <ActivityIndicator size="small" color={theme.text2} style={{ position: 'absolute', right: space.md, top: space.md }} /> : null}
            </View>
            {locationResults.length ? (
              <View style={{ maxHeight: 300, marginTop: space.xs, borderRadius: radius.card, overflow: 'hidden', backgroundColor: theme.surfaceTop, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.fieldBorder }}>
                <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                  {locationResults.map((item, index) => {
                    const detail = item.address || item.region;
                    return (
                      <View key={`${item.lng}-${item.lat}-${index}`}>
                        {index ? <View style={{ height: StyleSheet.hairlineWidth, marginLeft: space.md, backgroundColor: theme.hairline }} /> : null}
                        <Press
                          accessibilityRole="button"
                          onPress={() => {
                            setTripName(item.name);
                            setSelectedLocation(item);
                            setLocationResults([]);
                            setLocationSearchFailed(false);
                            setRoute((current) => ({
                              ...current,
                              region: item.region || item.name,
                              lng: item.lng,
                              lat: item.lat,
                              coord: item.coord,
                            }));
                            Keyboard.dismiss();
                          }}
                          style={{ minHeight: 58, paddingHorizontal: space.md, paddingVertical: space.sm, justifyContent: 'center' }}
                        >
                          <Text numberOfLines={1} style={[type.cardTitle, { color: theme.text }]}>{item.name}</Text>
                          {detail ? <Text numberOfLines={1} style={[type.caption, { color: theme.text2, marginTop: space.xxs }]}>{detail}</Text> : null}
                        </Press>
                      </View>
                    );
                  })}
                </ScrollView>
              </View>
            ) : null}
            {locationSearchFailed ? (
              <Text style={[type.caption, { color: theme.text2, marginTop: space.xs, paddingHorizontal: space.xs }]}>
                {t('journey.settings.locationSearchUnavailable')}
              </Text>
            ) : null}
          </View>

          <View style={{ marginTop: layout.sectionGap }}>
            <Text style={[type.pageTitle, { color: theme.text, letterSpacing: 0 }]}>{t('journeyEdit.form.whenTitle')}</Text>
            <Press onPress={() => setTimeOpen(true)} accessibilityRole="button" style={{ height: 52, marginTop: space.sm, paddingHorizontal: space.md, borderRadius: radius.feature, backgroundColor: theme.surfaceTop, flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <View style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="calendar" color={theme.text} size={18} strokeWidth={1.9} />
              </View>
              <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 15.5, fontWeight: '700', color: theme.text }}>
                  {flexibleDates ? t('journeyEdit.form.durationDays', { count: totalDays }) : journeyDateSummary(startDt, durationMins, resolved)}
                </Text>
                {!flexibleDates ? <Text numberOfLines={1} style={[type.caption, { color: theme.text2 }]}>{t('journeyEdit.form.durationDays', { count: totalDays })}</Text> : null}
              </View>
              <Icon name="chevronR" color={theme.text3} size={15} />
            </Press>
          </View>

          <View style={{ marginTop: layout.sectionGap }}>
            <Text style={[type.sectionTitle, { color: theme.text }]}>{t('journeyEdit.form.trackTitle')}</Text>
            {trackSource ? (
              <View style={{ height: 64, marginTop: space.sm, paddingLeft: space.md, paddingRight: space.xs, borderRadius: radius.feature, backgroundColor: theme.surfaceTop, flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                <View style={{ width: 28, height: 28 }} />
                <View style={{ flex: 1, minWidth: 0, justifyContent: 'center' }}>
                  <Text numberOfLines={1} style={{ fontSize: 15, lineHeight: 20, fontWeight: '700', color: theme.text }}>{trackSource.fileName}</Text>
                  <Text numberOfLines={1} style={[type.caption, { color: theme.text2, marginTop: 3 }]}>{[route.dist, route.asc].filter((value) => value && value !== '—').join('  ')}</Text>
                </View>
                <Press accessibilityRole="button" accessibilityLabel={t('journeyEdit.form.removeTrack')} onPress={() => {
                  setTrackSource(null);
                  setRoute(selectedLocation ? {
                    ...blankRoute,
                    region: selectedLocation.region || selectedLocation.name,
                    lng: selectedLocation.lng,
                    lat: selectedLocation.lat,
                    coord: selectedLocation.coord,
                  } : blankRoute);
                }} style={{ width: layout.iconButton, height: layout.iconButton, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="close" color={theme.text2} size={15} />
                </Press>
              </View>
            ) : (
              <Press disabled={trackBusy} onPress={() => void pickTrack()} accessibilityRole="button" style={{ height: 64, marginTop: space.sm, paddingHorizontal: space.md, borderRadius: radius.feature, backgroundColor: theme.surfaceTop, flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                <View style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}>
                  {trackBusy ? <ActivityIndicator color={theme.text2} /> : <Icon name="upload" color={theme.text} size={18} />}
                </View>
                <View style={{ flex: 1, minWidth: 0, justifyContent: 'center' }}>
                  <Text numberOfLines={1} style={{ fontSize: 15, lineHeight: 20, fontWeight: '700', color: theme.text }}>{t('journeyEdit.form.uploadTrack')}</Text>
                  <Text style={[type.caption, { color: theme.text2, marginTop: 3 }]}>{t('journeyEdit.form.trackFormats')}</Text>
                </View>
                <Icon name="chevronR" color={theme.text3} size={15} />
              </Press>
            )}
          </View>
        </ScrollView>

        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: layout.pagePadding, paddingTop: space.sm, paddingBottom: Math.max(insets.bottom, space.md) + space.xs, backgroundColor: theme.groupedBg }}>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Press
              disabled={!nameValid || Boolean(creatingMode)}
              onPress={() => void submit('manual')}
              style={{ flex: 1, height: 52, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: space.xs, backgroundColor: theme.controlSurface, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.fieldBorder }}
            >
              {creatingMode === 'manual' ? <ActivityIndicator color={theme.text} /> : null}
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82} style={{ fontSize: 15.5, fontWeight: '700', color: nameValid ? theme.text : theme.text3 }}>{creatingMode === 'manual' ? t('journeyEdit.form.creating') : t('journeyEdit.form.manualPlan')}</Text>
            </Press>
            <Press
              disabled={!nameValid || Boolean(creatingMode)}
              onPress={() => void submit('smart')}
              style={{ flex: 1, height: 52, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: space.xs, backgroundColor: nameValid ? theme.accent : theme.fieldSurface }}
            >
              {creatingMode === 'smart' ? <ActivityIndicator color="#FFFFFF" /> : <AssistantMark color={nameValid ? '#FFFFFF' : theme.text3} accentColor={nameValid ? '#FFFFFF' : theme.text3} size={18} />}
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82} style={{ fontSize: 15.5, fontWeight: '700', color: nameValid ? '#FFFFFF' : theme.text3 }}>{creatingMode === 'smart' ? t('journeyEdit.form.planning') : t('journeyEdit.form.smartPlan')}</Text>
            </Press>
          </View>
        </View>
      </KeyboardAvoidingView>

      {timeOpen && (
        <JourneyDateRangePicker
          theme={theme}
          initialStart={startDt}
          initialDurationDays={totalDays}
          initialFlexible={flexibleDates}
          onApply={({ start, totalDays: nextTotalDays, flexible }) => {
            setStartDt(start);
            setDurationMins(nextTotalDays * 24 * 60);
            setFlexibleDates(flexible);
          }}
          onClose={() => setTimeOpen(false)}
        />
      )}
    </View>
  );
}
