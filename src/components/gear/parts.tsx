// parts.tsx — shared primitives for the 装备 detail pages (装备详情 / 分类详情 /
// 套装详情). Mirrors the gx-design prototype's drill-down screens: a slide-in
// full-screen shell with floating circular back / ··· buttons, frosted cards,
// section labels, gear rows with a photo thumbnail, share bars and stat strips.
// Kept visually identical to GearScreen's chrome (surfaceTop cards + soft shadow
// on theme.bg) so a pushed detail reads as the same surface, not a new world.
import React, { useEffect, useRef } from 'react';
import { Animated, View, Text, ScrollView, StyleSheet, Dimensions, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme } from '../../theme/theme';
import { MONO } from '../../theme/fonts';
import { Icon, IconName } from '../Icon';
import { Press } from '../Press';
import { PhotoTile } from '../PhotoTile';
import { hashStr, TONES } from '../../data/tones';
import { GearItem, GearCat } from '../../data/gear';

// ── Shared theme tokens (mirror GearScreen) ─────────────────────────────────
export const cardShadow = (t: Theme): ViewStyle =>
  t.dark
    ? { boxShadow: '0px 5px 14px rgba(0,0,0,0.45)' }
    : { boxShadow: '0px 8px 16px rgba(0,0,0,0.1)' };
export const cardBorder = (t: Theme): ViewStyle => ({ borderWidth: StyleSheet.hairlineWidth, borderColor: t.hairline });
export const trackBg = (t: Theme) => (t.dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.07)');
const iconBtnShadow = (t: Theme): ViewStyle =>
  t.dark
    ? { boxShadow: '0px 2px 10px rgba(0,0,0,0.5)' }
    : { boxShadow: '0px 2px 10px rgba(0,0,0,0.14)' };

// ── Formatting ──────────────────────────────────────────────────────────────
export const yuan = (v: number) => '¥' + Math.round(v).toLocaleString('en-US');
export const fmtKg = (v: number) => v.toFixed(2) + ' kg';
export const toneFor = (name: string) => TONES[Math.abs(hashStr(name)) % TONES.length];

// ── A solid circular icon button (back / ··· / chevron affordance) ──────────
export function CircleBtn({ theme, name, onPress }: { theme: Theme; name: IconName; onPress: () => void }) {
  return (
    <Press
      onPress={onPress}
      style={{
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.dark ? '#2C2C2E' : '#FFFFFF',
        ...iconBtnShadow(theme),
        borderWidth: theme.dark ? StyleSheet.hairlineWidth : 0,
        borderColor: 'rgba(255,255,255,0.06)',
      }}
    >
      <Icon name={name} color={theme.text} size={name === 'more' ? 22 : 21} />
    </Press>
  );
}

// ── Full-screen pushed detail page ──────────────────────────────────────────
// Slides in from the right. With `hero`, a full-bleed view sits at the top and
// the floating back/··· buttons overlay it; without one, a transparent nav bar
// carries an optional centered title. Content scrolls beneath either.
export function GearPushPage({
  theme,
  onBack,
  title,
  right,
  hero,
  children,
}: {
  theme: Theme;
  onBack: () => void;
  title?: string;
  right?: React.ReactNode;
  hero?: React.ReactNode;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const width = Dimensions.get('window').width;
  const tx = useRef(new Animated.Value(width)).current;
  useEffect(() => {
    Animated.spring(tx, { toValue: 0, useNativeDriver: true, bounciness: 0, speed: 16 }).start();
  }, [tx]);

  const navH = insets.top + 50;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: theme.bg, transform: [{ translateX: tx }] }]}>
      <View style={{ flex: 1 }}>
        {hero}
        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingTop: hero ? 6 : navH + 4, paddingBottom: insets.bottom + 48 }}
        >
          {children}
        </ScrollView>
      </View>

      {/* floating nav chrome */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: navH }} pointerEvents="box-none">
        <View style={{ position: 'absolute', left: 14, top: insets.top + 5 }}>
          <CircleBtn theme={theme} name="arrowL" onPress={onBack} />
        </View>
        {title && !hero ? (
          <View pointerEvents="none" style={{ position: 'absolute', left: 64, right: 64, top: insets.top + 12, height: 26, justifyContent: 'center' }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: theme.text, textAlign: 'center' }} numberOfLines={1}>
              {title}
            </Text>
          </View>
        ) : null}
        {right ? <View style={{ position: 'absolute', right: 14, top: insets.top + 5 }}>{right}</View> : null}
      </View>
    </Animated.View>
  );
}

// ── Frosted card matching GearScreen's Card ─────────────────────────────────
export function GearCard({ theme, children, style }: { theme: Theme; children: React.ReactNode; style?: ViewStyle }) {
  return <View style={{ backgroundColor: theme.surfaceTop, borderRadius: 16, ...cardBorder(theme), ...cardShadow(theme), ...style }}>{children}</View>;
}

// Uppercase section label with an optional count / trailing accessory.
export function SectionLabel({ theme, text, trailing }: { theme: Theme; text: string; trailing?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 22, marginBottom: 8, paddingHorizontal: 4 }}>
      <Text style={{ fontSize: 12, fontWeight: '600', color: theme.text3, letterSpacing: 0.4, textTransform: 'uppercase' }}>{text}</Text>
      {trailing}
    </View>
  );
}

// Key/value row used by the 规格 / 自定义属性 cards.
export function KV({ theme, k, v, leadingDot, first }: { theme: Theme; k: string; v: React.ReactNode; leadingDot?: string; first?: boolean }) {
  return (
    <>
      {!first && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.hairline, marginLeft: 16 }} />}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, paddingHorizontal: 16, paddingVertical: 13 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {leadingDot ? <View style={{ width: 8, height: 8, borderRadius: 3, backgroundColor: leadingDot }} /> : null}
          <Text style={{ fontSize: 14.5, color: theme.text2 }}>{k}</Text>
        </View>
        {typeof v === 'string' ? (
          <Text style={{ fontSize: 14.5, fontWeight: '600', color: theme.text, textAlign: 'right', flexShrink: 1 }}>{v}</Text>
        ) : (
          v
        )}
      </View>
    </>
  );
}

// Gear row with a photo thumbnail — used in 分类详情 / 套装详情 lists.
export function GearItemRow({ theme, item, cat, last, onPress }: { theme: Theme; item: GearItem; cat?: GearCat; last?: boolean; onPress?: () => void }) {
  const qty = item.qty || 1;
  return (
    <>
      <Press onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 13 }}>
        <PhotoTile tone={toneFor(item.name)} seed={item.name} radius={9} style={{ width: 38, height: 38 }} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '600', color: theme.text }}>{item.name}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
            {cat ? (
              <>
                <View style={{ width: 6, height: 6, borderRadius: 2, backgroundColor: cat.color }} />
                <Text style={{ fontSize: 11, color: theme.text2 }}>{cat.name}</Text>
                <View style={{ width: StyleSheet.hairlineWidth, height: 9, backgroundColor: theme.hairline }} />
              </>
            ) : null}
            <Text style={{ fontFamily: MONO, fontSize: 10.5, color: theme.text2 }}>
              {fmtKg(item.w)} · {yuan(item.p)}{qty > 1 ? ` · ×${qty}` : ''}
            </Text>
          </View>
        </View>
        <Icon name="chevronR" color={theme.text3} size={14} />
      </Press>
      {!last && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.hairline, marginLeft: 63 }} />}
    </>
  );
}

// A 4-up readout strip (装备总值 / 总重量 / 数量 / 分类).
export function StatStrip({ theme, stats }: { theme: Theme; stats: { label: string; value: string }[] }) {
  return (
    <View style={{ flexDirection: 'row', paddingVertical: 4 }}>
      {stats.map((s) => (
        <View key={s.label} style={{ flex: 1, alignItems: 'center', paddingHorizontal: 2 }}>
          <Text style={{ fontSize: 16, fontWeight: '800', letterSpacing: -0.4, color: theme.text }}>{s.value}</Text>
          <Text style={{ fontSize: 10.5, fontWeight: '600', color: theme.text2, marginTop: 4 }}>{s.label}</Text>
        </View>
      ))}
    </View>
  );
}

// Horizontal share bar: label on the left, % + filled track, sub caption.
export function ShareBar({ theme, label, pct, sub, color, last }: { theme: Theme; label: string; pct: number; sub: string; color: string; last?: boolean }) {
  const p = Math.max(0, Math.min(100, pct));
  return (
    <View style={{ paddingVertical: 9, borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 7 }}>
        <Text style={{ fontSize: 13, color: theme.text2 }}>{label}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 7 }}>
          <Text style={{ fontFamily: MONO, fontSize: 10.5, color: theme.text3 }}>{sub}</Text>
          <Text style={{ fontSize: 13.5, fontWeight: '700', color: theme.text }}>{p.toFixed(1)}%</Text>
        </View>
      </View>
      <View style={{ height: 5, borderRadius: 3, backgroundColor: trackBg(theme), overflow: 'hidden' }}>
        <View style={{ width: `${p}%`, height: '100%', backgroundColor: color, borderRadius: 3 }} />
      </View>
    </View>
  );
}
