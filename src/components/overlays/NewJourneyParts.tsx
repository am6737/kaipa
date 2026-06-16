import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Animated,
  StyleSheet,
  PanResponder,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Svg, { Rect, Circle } from 'react-native-svg';
import { Theme } from '../../theme/theme';
import { MONO } from '../../theme/fonts';
import { Companion } from '../../data/pois';
import { Press } from '../Press';
import { Icon } from '../Icon';
import { useI18n, TKey, TVars } from '../../i18n';

type TFn = (key: TKey, vars?: TVars) => string;

export const SELF: Companion = { ini: '陈', name: '陈泽宇', color: '#FF7A55', self: true, host: true };

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
        boxShadow: theme.dark ? '0px 2px 10px rgba(0,0,0,0.5)' : '0px 2px 10px rgba(0,0,0,0.14)',
        borderWidth: theme.dark ? StyleSheet.hairlineWidth : 0,
        borderColor: 'rgba(255,255,255,0.06)',
      }}
    >
      {children}
    </Press>
  );
}

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

// ── Time wheel (shared between NewJourneySheet + EditJourneySheet) ──

const WHEEL_ITEM_H = 38;
const WHEEL_VISIBLE = 5;

export const NJ_TIME_OPTIONS = (() => {
  const out: { value: number; label: string }[] = [];
  for (let h = 0; h < 24; h++) {
    for (const mm of [0, 30]) {
      out.push({ value: h * 60 + mm, label: `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}` });
    }
  }
  return out;
})();

export function njFormatTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function NJWheelColumn({ theme, items, value, onChange, width = 140 }: { theme: Theme; items: { value: number; label: string }[]; value: number; onChange: (v: number) => void; width?: number }) {
  const padding = ((WHEEL_VISIBLE - 1) / 2) * WHEEL_ITEM_H;
  const containerH = WHEEL_VISIBLE * WHEEL_ITEM_H;
  const ref = useRef<ScrollView>(null);
  const offsetRef = useRef(0);

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
    if (item && item.value !== value) { Haptics.selectionAsync(); onChange(item.value); }
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
        onScroll={(e) => { offsetRef.current = e.nativeEvent.contentOffset.y; }}
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
      <LinearGradient colors={[edge, edgeT]} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: padding }} pointerEvents="none" />
      <LinearGradient colors={[edgeT, edge]} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: padding }} pointerEvents="none" />
    </View>
  );
}

export function NJWheelPicker({ theme, value, onChange }: { theme: Theme; value: number; onChange: (v: number) => void }) {
  return (
    <View style={{ overflow: 'hidden', alignItems: 'center' }}>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
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

export function NJDateWheelPicker({ theme, year, month, day, onChange }: { theme: Theme; year: number; month: number; day: number; onChange: (y: number, m: number, d: number) => void }) {
  const years = useMemo(() => {
    const out: { value: number; label: string }[] = [];
    for (let y = 2020; y <= 2035; y++) out.push({ value: y, label: `${y}年` });
    return out;
  }, []);
  const months = useMemo(() => {
    const out: { value: number; label: string }[] = [];
    for (let m = 1; m <= 12; m++) out.push({ value: m, label: `${m}月` });
    return out;
  }, []);
  const days = useMemo(() => {
    const dim = new Date(year, month, 0).getDate();
    const out: { value: number; label: string }[] = [];
    for (let d = 1; d <= dim; d++) out.push({ value: d, label: `${d}日` });
    return out;
  }, [year, month]);
  const safeDay = Math.min(day, days.length);
  return (
    <View style={{ overflow: 'hidden', flexDirection: 'row', justifyContent: 'center' }}>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: '50%',
          height: WHEEL_ITEM_H,
          marginTop: -WHEEL_ITEM_H / 2,
          backgroundColor: theme.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.045)',
          borderRadius: 10,
        }}
      />
      <NJWheelColumn theme={theme} items={years} value={year} onChange={(v) => onChange(v, month, safeDay)} width={100} />
      <NJWheelColumn theme={theme} items={months} value={month} onChange={(v) => onChange(year, v, safeDay)} width={80} />
      <NJWheelColumn theme={theme} items={days} value={safeDay} onChange={(v) => onChange(year, month, v)} width={80} />
    </View>
  );
}

export function NJBottomSheet({ theme, onClose, children, full, bodyScrolls }: { theme: Theme; onClose: () => void; children: React.ReactNode; full?: boolean; bodyScrolls?: boolean }) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(600)).current;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 3, speed: 16 }).start();
  }, [translateY]);
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
        <View {...grabberHandlers} style={{ paddingTop: 12, paddingBottom: 6, alignItems: 'center' }}>
          <View style={{ width: 36, height: 5, borderRadius: 3, backgroundColor: theme.dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)' }} />
        </View>
        {children}
      </Animated.View>
    </View>
  );
}

function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
  return h | 0;
}

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
          <View style={{ padding: 12, borderRadius: 18, backgroundColor: '#fff', boxShadow: '0px 4px 20px rgba(0,0,0,0.1)' }}>
            <NJQrDisplay seed={tripName + link} size={172} />
          </View>
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

function NJQrDisplay({ seed, size = 172 }: { seed: string; size?: number }) {
  const cells = useMemo(() => njQrPattern(seed), [seed]);
  const N = cells.length;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${N} ${N}`}>
      {cells.map((row, y) => row.map((on, x) => (on ? <Rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill="#000" /> : null)))}
      <Rect x={N / 2 - 2.5} y={N / 2 - 2.5} width={5} height={5} fill="#fff" />
      <Circle cx={N / 2} cy={N / 2} r={1.6} fill="#FF5C3A" />
    </Svg>
  );
}
