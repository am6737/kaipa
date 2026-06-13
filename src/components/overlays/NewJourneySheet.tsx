// NewJourneySheet.tsx — 新增旅程 flow (full-screen overlay). Faithful RN port of
// the prototype's new-journey.jsx *planning* path:
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
  PanResponder,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect, Circle } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { Theme } from '../../theme/theme';
import { MONO } from '../../theme/fonts';
import { Poi, Companion, JourneyStatus, EXPLORE_POIS } from '../../data/pois';
import { PhotoTile } from '../PhotoTile';
import { Press } from '../Press';
import { Icon } from '../Icon';
import { RecordJourneySheet } from './RecordJourneySheet';
import { useI18n, TKey, TVars } from '../../i18n';

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
  custom?: boolean;
}

const ROUTE_SUGGESTIONS: NJRoute[] = EXPLORE_POIS.map((p) => ({
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
}));

export const SELF: Companion = { ini: '陈', name: '陈泽宇', color: '#FF7A55', self: true, host: true };

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
function njFormatTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
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

const NJ_TIME_OPTIONS = (() => {
  const out: { value: number; label: string }[] = [];
  for (let h = 0; h < 24; h++) {
    for (const mm of [0, 30]) {
      out.push({ value: h * 60 + mm, label: `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}` });
    }
  }
  return out;
})();

// Fake QR pattern — deterministic stylized placeholder (ported)
function njQrPattern(seed: string): boolean[][] {
  const N = 25;
  let s = 0;
  const str = String(seed || 'kaipa');
  for (let i = 0; i < str.length; i++) s = ((s << 5) - s + str.charCodeAt(i)) | 0;
  if (s === 0) s = 1;
  const cells: boolean[][] = [];
  for (let y = 0; y < N; y++) {
    cells[y] = [];
    for (let x = 0; x < N; x++) {
      const f1 = x < 7 && y < 7;
      const f2 = x >= N - 7 && y < 7;
      const f3 = x < 7 && y >= N - 7;
      if (f1 || f2 || f3) {
        const fx = f2 ? N - 7 : 0;
        const fy = f3 ? N - 7 : 0;
        const lx = x - fx;
        const ly = y - fy;
        const dE = Math.min(lx, ly, 6 - lx, 6 - ly);
        cells[y][x] = dE === 0 || dE >= 2;
      } else if (x === 17 && y === 17) {
        cells[y][x] = true;
      } else if (Math.abs(x - 17) <= 2 && Math.abs(y - 17) <= 2 && (Math.abs(x - 17) === 2 || Math.abs(y - 17) === 2)) {
        cells[y][x] = true;
      } else {
        let h = (x * 374761393 + y * 668265263 + s) | 0;
        h = (h ^ (h >>> 13)) * 1274126177;
        cells[y][x] = ((h ^ (h >>> 16)) & 1) === 1;
      }
    }
  }
  return cells;
}

// ──────────────────────────────────────────────────────────────
// Small primitives
// ──────────────────────────────────────────────────────────────
export function NJSection({ theme, label, hint, children, style }: { theme: Theme; label: string; hint?: React.ReactNode; children: React.ReactNode; style?: any }) {
  return (
    <View style={[{ marginBottom: 22 }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginHorizontal: 4, marginBottom: 8 }}>
        <Text style={{ fontSize: 11, fontWeight: '700', color: theme.text2, letterSpacing: 0.8, textTransform: 'uppercase' }}>{label}</Text>
        {hint ? (typeof hint === 'string' ? <Text style={{ fontSize: 11, color: theme.text3 }}>{hint}</Text> : hint) : null}
      </View>
      {children}
    </View>
  );
}

export function NJRoundBtn({ theme, onPress, children, kind = 'ghost' }: { theme: Theme; onPress: () => void; children: React.ReactNode; kind?: 'ghost' | 'accent' }) {
  const ghost = kind === 'ghost';
  return (
    <Press
      onPress={onPress}
      style={{
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: ghost ? (theme.dark ? '#2C2C2E' : '#FFFFFF') : theme.accent,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOpacity: theme.dark ? 0.5 : 0.14,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 2 },
        elevation: 4,
        borderWidth: theme.dark ? StyleSheet.hairlineWidth : 0,
        borderColor: 'rgba(255,255,255,0.06)',
      }}
    >
      {children}
    </Press>
  );
}

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
        backgroundColor: selected ? theme.accentSoft : theme.dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
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
// Calendar-style date picker — month view, navigable
// ──────────────────────────────────────────────────────────────
export function NJMiniCalendar({ theme, selectedDate, onSelect, allowPast }: { theme: Theme; selectedDate: Date; onSelect: (d: Date) => void; allowPast?: boolean }) {
  const { t } = useI18n();
  const today = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }, []);
  const [cursor, setCursor] = useState(() => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));

  useEffect(() => {
    if (cursor.getFullYear() !== selectedDate.getFullYear() || cursor.getMonth() !== selectedDate.getMonth()) {
      setCursor(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startOffset = firstDay.getDay();
  const daysInMonth = lastDay.getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const canPrev = allowPast || !(year === today.getFullYear() && month === today.getMonth());

  return (
    <View
      style={{
        padding: 12,
        paddingBottom: 8,
        borderRadius: 16,
        backgroundColor: theme.dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.025)',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.hairline,
      }}
    >
      {/* Month header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, paddingHorizontal: 2 }}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: theme.text, letterSpacing: -0.2, flex: 1 }}>
          {t('journeyEdit.calendar.monthHeader', { year, month: month + 1 })}
        </Text>
        <Press onPress={() => canPrev && setCursor(new Date(year, month - 1, 1))} style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', opacity: canPrev ? 1 : 0.35 }}>
          <Icon name="chevronL" color={theme.accent} size={16} />
        </Press>
        <Press onPress={() => setCursor(new Date(year, month + 1, 1))} style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="chevronR" color={theme.accent} size={16} />
        </Press>
      </View>

      {/* Weekday labels */}
      <View style={{ flexDirection: 'row', marginBottom: 4 }}>
        {[
          t('journeyEdit.weekday.sun'),
          t('journeyEdit.weekday.mon'),
          t('journeyEdit.weekday.tue'),
          t('journeyEdit.weekday.wed'),
          t('journeyEdit.weekday.thu'),
          t('journeyEdit.weekday.fri'),
          t('journeyEdit.weekday.sat'),
        ].map((w, i) => (
          <View key={i} style={{ flex: 1, height: 22, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 10.5, fontWeight: '700', color: i === 0 || i === 6 ? '#FF5C3A' : theme.text2, letterSpacing: 0.4 }}>{w}</Text>
          </View>
        ))}
      </View>

      {/* Date cells */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {cells.map((d, i) => {
          if (d === null) return <View key={i} style={{ width: `${100 / 7}%`, height: 36 }} />;
          const date = new Date(year, month, d);
          const isToday = sameDay(date, today);
          const isSelected = sameDay(date, selectedDate);
          const isPast = !allowPast && date < today;
          const col = i % 7;
          const weekend = col === 0 || col === 6;
          const cell = (
            <View style={{ height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: isSelected ? theme.accent : 'transparent', opacity: isPast ? 0.28 : 1 }}>
              <Text style={{ fontSize: 14, fontWeight: isSelected || isToday ? '700' : '500', color: isSelected ? '#fff' : isToday ? theme.accent : weekend ? '#FF5C3A' : theme.text }}>{d}</Text>
              {isToday && !isSelected ? <View style={{ position: 'absolute', bottom: 3, width: 4, height: 4, borderRadius: 2, backgroundColor: theme.accent }} /> : null}
            </View>
          );
          return (
            <View key={i} style={{ width: `${100 / 7}%` }}>
              {isPast ? cell : <Press onPress={() => onSelect(date)}>{cell}</Press>}
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ──────────────────────────────────────────────────────────────
// iOS-style wheel column (single-column time picker)
// ──────────────────────────────────────────────────────────────
const WHEEL_ITEM_H = 38;
const WHEEL_VISIBLE = 5;

function NJWheelColumn({ theme, items, value, onChange, width = 140 }: { theme: Theme; items: { value: number; label: string }[]; value: number; onChange: (v: number) => void; width?: number }) {
  const padding = ((WHEEL_VISIBLE - 1) / 2) * WHEEL_ITEM_H;
  const containerH = WHEEL_VISIBLE * WHEEL_ITEM_H;
  const ref = useRef<ScrollView>(null);
  const offsetRef = useRef(0);

  // External value -> scroll position
  useEffect(() => {
    const idx = items.findIndex((it) => it.value === value);
    if (idx < 0) return;
    const target = idx * WHEEL_ITEM_H;
    if (Math.abs(offsetRef.current - target) > 2) {
      offsetRef.current = target;
      ref.current?.scrollTo({ y: target, animated: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, items]);

  const settle = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    offsetRef.current = y;
    const idx = Math.max(0, Math.min(items.length - 1, Math.round(y / WHEEL_ITEM_H)));
    const item = items[idx];
    if (item && item.value !== value) onChange(item.value);
  };

  const edge = theme.bg;
  const edgeT = theme.dark ? 'rgba(0,0,0,0)' : 'rgba(255,255,255,0)';
  return (
    <View style={{ width, height: containerH }}>
      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={WHEEL_ITEM_H}
        decelerationRate="fast"
        onScroll={(e) => {
          offsetRef.current = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        onMomentumScrollEnd={settle}
        onScrollEndDrag={settle}
        contentContainerStyle={{ paddingVertical: padding }}
      >
        {items.map((it) => {
          const isSel = it.value === value;
          return (
            <View key={it.value} style={{ height: WHEEL_ITEM_H, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 18, fontWeight: isSel ? '600' : '500', color: isSel ? theme.text : theme.text2 }}>{it.label}</Text>
            </View>
          );
        })}
      </ScrollView>
      {/* fade masks (top/bottom) so the wheel edges dissolve into the panel */}
      <LinearGradient colors={[edge, edgeT]} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: padding }} pointerEvents="none" />
      <LinearGradient colors={[edgeT, edge]} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: padding }} pointerEvents="none" />
    </View>
  );
}

function NJWheelPicker({ theme, value, onChange }: { theme: Theme; value: number; onChange: (v: number) => void }) {
  return (
    <View
      style={{
        paddingVertical: 6,
        paddingHorizontal: 4,
        borderRadius: 16,
        backgroundColor: theme.dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.025)',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.hairline,
        overflow: 'hidden',
        alignItems: 'center',
      }}
    >
      {/* center selection bar */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 6,
          right: 6,
          top: '50%',
          height: WHEEL_ITEM_H,
          marginTop: -WHEEL_ITEM_H / 2,
          backgroundColor: theme.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.045)',
          borderRadius: 10,
        }}
      />
      <NJWheelColumn theme={theme} items={NJ_TIME_OPTIONS} value={value} onChange={onChange} width={140} />
    </View>
  );
}

// ──────────────────────────────────────────────────────────────
// Bottom-sheet scaffold (slide up + scrim) for the time / share modals
// ──────────────────────────────────────────────────────────────
export function NJBottomSheet({ theme, onClose, children, full, bodyScrolls }: { theme: Theme; onClose: () => void; children: React.ReactNode; full?: boolean; bodyScrolls?: boolean }) {
  const insets = useSafeAreaInsets();
  // Single value drives both the slide-in entrance and the drag-to-dismiss.
  const translateY = useRef(new Animated.Value(600)).current;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 3, speed: 16 }).start();
  }, [translateY]);
  // A downward drag dismisses; a tap (no movement) still hits buttons underneath.
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => g.dy > 4 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_e, g) => {
        if (g.dy > 0) translateY.setValue(g.dy);
      },
      onPanResponderRelease: (_e, g) => {
        if (g.dy > 100 || g.vy > 0.6) {
          Animated.timing(translateY, { toValue: 700, duration: 200, useNativeDriver: true }).start(() => onCloseRef.current());
        } else {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 4, speed: 16 }).start();
        }
      },
    })
  ).current;
  // Drag the whole sheet by default; sheets with an inner ScrollView (bodyScrolls)
  // confine the gesture to the grabber so the body still scrolls.
  const grabberHandlers = bodyScrolls ? pan.panHandlers : {};
  const sheetHandlers = bodyScrolls ? {} : pan.panHandlers;
  return (
    <View style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end', zIndex: 60 }]}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }]} onPress={onClose} />
      <Animated.View
        {...sheetHandlers}
        style={{
          transform: [{ translateY }],
          backgroundColor: theme.bg,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          paddingBottom: Math.max(insets.bottom, 16) + 6,
          maxHeight: '92%',
          ...(full ? {} : { marginHorizontal: 0 }),
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.border,
        }}
      >
        {/* grabber — drag down to dismiss */}
        <View {...grabberHandlers} style={{ paddingTop: 12, paddingBottom: 6, alignItems: 'center' }}>
          <View style={{ width: 36, height: 5, borderRadius: 3, backgroundColor: theme.dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)' }} />
        </View>
        {children}
      </Animated.View>
    </View>
  );
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
            ? { shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 2 }
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
// Share invite panel (QR + copy link)
// ──────────────────────────────────────────────────────────────
function NJQrDisplay({ seed, size = 172 }: { seed: string; size?: number }) {
  const cells = useMemo(() => njQrPattern(seed), [seed]);
  const N = cells.length;
  return (
    <View style={{ padding: 12, borderRadius: 18, backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 20, shadowOffset: { width: 0, height: 4 }, elevation: 6 }}>
      <Svg width={size} height={size} viewBox={`0 0 ${N} ${N}`}>
        {cells.map((row, y) => row.map((on, x) => (on ? <Rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill="#000" /> : null)))}
        <Rect x={N / 2 - 2.5} y={N / 2 - 2.5} width={5} height={5} fill="#fff" />
        <Circle cx={N / 2} cy={N / 2} r={1.6} fill="#FF5C3A" />
      </Svg>
    </View>
  );
}

export function NJSharePanel({ theme, tripName, onClose, onToast }: { theme: Theme; tripName: string; onClose: () => void; onToast: (m: string) => void }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const link = useMemo(() => {
    const slug = (tripName || 'kaipa').replace(/\s+/g, '').slice(0, 8);
    const code = 1000 + (Math.abs(hashSeed(tripName)) % 9000);
    return `kaipa.app/j/${slug}-${code}`;
  }, [tripName]);

  const copyBtn = (
    <Press
      onPress={() => {
        setCopied(true);
        onToast(t('journeyEdit.share.toastLinkCopied'));
        setTimeout(() => setCopied(false), 1500);
      }}
      style={{ flex: 1, height: 44, borderRadius: 13, backgroundColor: copied ? '#34C759' : theme.accent, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}
    >
      <Icon name="check" color="#fff" size={13} strokeWidth={3} />
      <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>{copied ? t('journeyEdit.share.copied') : t('journeyEdit.share.copyLink')}</Text>
    </Press>
  );

  return (
    <NJBottomSheet theme={theme} onClose={onClose} full>
      <View style={{ paddingHorizontal: 20, paddingBottom: 8 }}>
        <View style={{ alignItems: 'center', marginBottom: 18 }}>
          <Text style={{ fontSize: 20, fontWeight: '700', color: theme.text, letterSpacing: -0.3 }}>{t('journeyEdit.share.title')}</Text>
          <Text style={{ fontSize: 12.5, color: theme.text2, marginTop: 4, lineHeight: 18, textAlign: 'center' }}>
            {t('journeyEdit.share.lead')}<Text style={{ color: theme.text, fontWeight: '600' }}>《{tripName || t('journeyEdit.newJourneyName')}》</Text>
          </Text>
        </View>

        <View style={{ alignItems: 'center', marginBottom: 16 }}>
          <NJQrDisplay seed={tripName + link} size={172} />
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 14, backgroundColor: theme.dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)', borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline, marginBottom: 12 }}>
          <Icon name="share" color={theme.text2} size={14} />
          <Text numberOfLines={1} style={{ flex: 1, fontFamily: MONO, fontSize: 12.5, color: theme.text }}>{link}</Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          {copyBtn}
          <Press
            onPress={() => {
              setSaved(true);
              onToast(t('journeyEdit.share.toastQrSaved'));
              setTimeout(() => setSaved(false), 1500);
            }}
            style={{ flex: 1, height: 44, borderRadius: 13, backgroundColor: saved ? '#34C759' : theme.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)', borderWidth: saved ? 0 : StyleSheet.hairlineWidth, borderColor: theme.hairline, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}
          >
            <Text style={{ fontSize: 14, fontWeight: '700', color: saved ? '#fff' : theme.text }}>{saved ? t('common.saved') : t('journeyEdit.share.saveQr')}</Text>
          </Press>
        </View>
      </View>
    </NJBottomSheet>
  );
}

function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
  return h | 0;
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
      <View style={{ paddingTop: insetsTop + 12, paddingHorizontal: 16, paddingBottom: 12, flexDirection: 'row', alignItems: 'center' }}>
        <NJRoundBtn theme={theme} onPress={onClose}>
          <Icon name="close" color={theme.text} size={16} />
        </NJRoundBtn>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}>
        <Text style={{ fontSize: 28, fontWeight: '700', color: theme.text, letterSpacing: -0.6, lineHeight: 32, marginTop: 4 }}>{t('journeyEdit.newTitle')}</Text>
        <Text style={{ fontSize: 14, color: theme.text2, marginTop: 6, marginBottom: 26, lineHeight: 21 }}>{t('journeyEdit.newSubtitle')}</Text>
        <View style={{ gap: 12 }}>
          {cards.map((c) => (
            <Press
              key={c.key}
              onPress={() => onPick(c.key)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, paddingVertical: 18, borderRadius: 20, backgroundColor: theme.dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.025)', borderWidth: 1, borderColor: theme.hairline }}
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
  const [q, setQ] = useState('');
  const filtered = ROUTE_SUGGESTIONS.filter((r) => !q || r.name.includes(q) || r.region.includes(q));
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
  isOngoing,
  onInvite,
  onOpenTimePicker,
}: {
  theme: Theme;
  route: NJRoute;
  tripName: string;
  setTripName: (v: string) => void;
  startDt: Date;
  durationMins: number;
  isOngoing: boolean;
  onInvite: () => void;
  onOpenTimePicker: () => void;
}) {
  const { t } = useI18n();
  const now = useMemo(() => njRoundedNow(), []);
  const endDt = njAddMinutes(startDt, durationMins);
  const nameMissing = !tripName.trim();

  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 32 }}>
      {!isOngoing && (
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
            backgroundColor: theme.dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.025)',
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
          style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderRadius: 14, backgroundColor: theme.dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.025)', borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}
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
      {!isOngoing && (
        <NJSection theme={theme} label={t('journeyEdit.details.companionsLabel')} hint={t('journeyEdit.details.companionsHint')}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 4, paddingRight: 14, height: 40, borderRadius: 20, backgroundColor: theme.dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)', borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>{SELF.ini}</Text>
              </View>
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
      {!isOngoing && (
        <NJSection theme={theme} label={t('journeyEdit.details.afterCreateLabel')}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 14, backgroundColor: theme.dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.025)', borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
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
function NJStepSuccess({ theme, route, tripName, isOngoing, durationMins }: { theme: Theme; route: NJRoute; tripName: string; isOngoing: boolean; durationMins: number }) {
  const { t } = useI18n();
  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, bounciness: 12, speed: 6 }).start();
  }, [pop]);
  const scale = pop.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 }}>
      <Animated.View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center', transform: [{ scale }], shadowColor: theme.accent, shadowOpacity: 0.4, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 8 }}>
        {isOngoing ? (
          <Svg width={40} height={40} viewBox="0 0 24 24" fill="none">
            <Path d="M5 4v16L18 12 5 4Z" fill="#fff" />
          </Svg>
        ) : (
          <Icon name="check" color="#fff" size={48} strokeWidth={3.2} />
        )}
      </Animated.View>
      <Text style={{ fontSize: 26, fontWeight: '700', color: theme.text, marginTop: 26, letterSpacing: -0.5 }}>{isOngoing ? t('journeyEdit.success.startedTitle') : t('journeyEdit.success.joinedTitle')}</Text>
      <Text style={{ fontSize: 14.5, color: theme.text2, marginTop: 8, lineHeight: 21, textAlign: 'center', maxWidth: 280 }}>
        <Text style={{ color: theme.text, fontWeight: '600' }}>《{tripName || route.name}》</Text>
        {'\n'}
        {njDurationLabel(durationMins, t)}
        {isOngoing ? t('journeyEdit.success.startedNote') : t('journeyEdit.success.joinedNote')}
      </Text>
      <View style={{ marginTop: 28, width: '100%', maxWidth: 320 }}>
        <NJRouteCard theme={theme} route={route} compact />
      </View>
      <Text style={{ fontFamily: MONO, fontSize: 10.5, color: theme.text3, marginTop: 20, letterSpacing: 0.4 }}>{isOngoing ? t('journeyEdit.success.redirectDetail') : t('journeyEdit.success.redirectMine')}</Text>
    </View>
  );
}

// ──────────────────────────────────────────────────────────────
// Build the journey Poi created by the flow
// ──────────────────────────────────────────────────────────────
function buildJourney(route: NJRoute, tripName: string, startDt: Date, durationMins: number, status: JourneyStatus, t: TFn): Poi {
  const totalDays = Math.max(1, Math.ceil(durationMins / (60 * 24)));
  const m = startDt.getMonth() + 1;
  const d = startDt.getDate();
  const lng = route.lng ?? 104.0;
  const lat = route.lat ?? 35.0;
  const base: Poi = {
    id: `j-${Date.now()}`,
    kind: 'journey',
    status,
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
  };
  if (status === 'ongoing') {
    base.dayIndex = 1;
    base.date = t('journeyEdit.meta.recordedToDay', { total: totalDays });
  } else {
    base.plannedDate = t('journeyEdit.meta.plannedDate', { month: m, day: d });
    base.date = t('journeyEdit.meta.yearMonth', { year: startDt.getFullYear(), month: m });
    const cd = Math.max(0, njDayDiff(startDt, njRoundedNow()));
    base.countdown = cd;
  }
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
  const isOngoing = useMemo(() => Math.abs(startDt.getTime() - Date.now()) < 60 * 60 * 1000, [startDt]);
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
      const poi = buildJourney(route, tripName, startDt, durationMins, isOngoing ? 'ongoing' : 'planning', t);
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
      ? isOngoing
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
            <NJStepSuccess theme={theme} route={route as NJRoute} tripName={tripName} isOngoing={isOngoing} durationMins={durationMins} />
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
                  isOngoing={isOngoing}
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
                ...(canAdvance ? { shadowColor: theme.accent, shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 6 } : {}),
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
