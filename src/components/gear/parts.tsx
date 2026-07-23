// Gear-domain presentation helpers. App-wide page chrome, cards, section labels,
// metrics and progress now live in src/design-system; compatibility aliases are
// kept here so older gear editors can migrate without a visual rewrite.
import React from 'react';
import { View, Text, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { Image } from 'expo-image';
import { JapaneseYen, Package, Weight } from 'lucide-react-native';
import { Theme } from '../../theme/theme';
import { MONO } from '../../theme/fonts';
import { Icon } from '../Icon';
import { Press } from '../Press';
import { GearItem, GearCat, itemWeight, itemPrice, fmtWeight, WeightUnit } from '../../data/gear';
import {
  AppCard,
  AppHeaderSearch,
  AppIconButton,
  AppMetricStrip,
  AppProgressBar,
  AppPropertyRow,
  AppSectionHeader,
  DetailPage,
  useDetailPageScroll,
} from '../../design-system';

// ── Shared theme tokens (mirror GearScreen) ─────────────────────────────────
export const cardShadow = (t: Theme): ViewStyle =>
  t.dark
    ? { boxShadow: '0px 5px 14px rgba(0,0,0,0.45)' }
    : {};
export const cardBorder = (t: Theme): ViewStyle => ({ borderWidth: StyleSheet.hairlineWidth, borderColor: t.hairline });

// ── Formatting ──────────────────────────────────────────────────────────────
export const yuan = (v: number) => '¥' + Math.round(v).toLocaleString('en-US');
export const fmtKg = (v: number, unit: WeightUnit = 'kg') => fmtWeight(v, unit);
export function GearItemImage({ theme, item, radius = 0, style, contentFit = 'cover' }: { theme: Theme; item: GearItem; radius?: number; style?: StyleProp<ViewStyle>; contentFit?: 'cover' | 'contain' }) {
  const photo = item.photos?.[0];
  return (
    <View style={[{ borderRadius: radius, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: theme.fieldSurface, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }, style]}>
      <Package color={theme.text3} size={24} strokeWidth={1.6} opacity={0.6} />
      {photo ? <Image source={{ uri: photo }} contentFit={contentFit} transition={120} style={StyleSheet.absoluteFill} /> : null}
    </View>
  );
}

// Compatibility aliases while gear screens move to the app-wide design system.
// New product screens should import the App*/DetailPage names from design-system.
export const CircleBtn = AppIconButton;
export const GearPushPage = DetailPage;
export const GearHeaderSearch = AppHeaderSearch;
export const GearCard = AppCard;
export const SectionLabel = AppSectionHeader;
export const useGearPushScroll = useDetailPageScroll;

export function KV({ theme, k, v, leadingDot, first }: { theme: Theme; k: string; v: React.ReactNode; leadingDot?: string; first?: boolean }) {
  return <AppPropertyRow theme={theme} label={k} value={v} leadingColor={leadingDot} first={first} />;
}

// Gear row with a photo thumbnail — used in 分类详情 / 清单详情 lists.
type GearItemRowProps = {
  theme: Theme;
  item: GearItem;
  cat?: GearCat;
  last?: boolean;
  onPress?: () => void;
  weightUnit?: WeightUnit;
  flush?: boolean;
  showImage?: boolean;
  showWeight?: boolean;
  showValue?: boolean;
  imageSize?: number;
  card?: boolean;
};

export function GearItemRow({ theme, item, cat, last, onPress, weightUnit = 'kg', flush = false, showImage = true, showWeight = true, showValue = true, imageSize = 38, card = false }: GearItemRowProps) {
  const qty = item.qty || 1;
  const meta = [showWeight ? fmtKg(itemWeight(item), weightUnit) : null, showValue ? yuan(itemPrice(item)) : null, qty > 1 ? `×${qty}` : null].filter(Boolean).join(' · ');
  const rowGap = 12;
  const rowPaddingX = flush ? 0 : 13;
  if (card) {
    return (
      <Press onPress={onPress} style={{ minHeight: showImage ? imageSize + 28 : 88, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        {showImage ? <GearItemImage theme={theme} item={item} radius={Math.max(10, Math.round(imageSize * 0.24))} style={{ width: imageSize, height: imageSize }} /> : null}
        <View style={{ flex: 1, minWidth: 0, alignSelf: 'stretch', justifyContent: 'space-between', paddingVertical: 2 }}>
          <Text numberOfLines={2} style={{ fontSize: 15, lineHeight: 20, fontWeight: '700', color: theme.text }}>{item.name}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Package color={theme.text2} size={14} strokeWidth={1.8} />
              <Text style={{ fontFamily: MONO, fontSize: 10.5, color: theme.text2 }}>×{qty}</Text>
            </View>
            {showWeight ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 }}>
                <Weight color={theme.text2} size={14} strokeWidth={1.8} />
                <Text numberOfLines={1} style={{ fontFamily: MONO, fontSize: 10.5, color: theme.text2 }}>{fmtKg(itemWeight(item), weightUnit)}</Text>
              </View>
            ) : null}
            {showValue ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, flexShrink: 1 }}>
                <JapaneseYen color={theme.text2} size={13.5} strokeWidth={1.8} />
                <Text numberOfLines={1} style={{ fontFamily: MONO, fontSize: 10.5, color: theme.text2 }}>{Math.round(itemPrice(item)).toLocaleString('en-US')}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </Press>
    );
  }
  return (
    <>
      <Press onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: rowGap, paddingVertical: 10, paddingHorizontal: rowPaddingX }}>
        {showImage ? <GearItemImage theme={theme} item={item} radius={Math.max(9, Math.round(imageSize * 0.24))} style={{ width: imageSize, height: imageSize }} /> : null}
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
            {meta ? <Text style={{ fontFamily: MONO, fontSize: 10.5, color: theme.text2 }}>{meta}</Text> : null}
          </View>
        </View>
        <Icon name="chevronR" color={theme.text3} size={14} />
      </Press>
      {!last && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.hairline, marginLeft: showImage ? rowPaddingX + imageSize + rowGap : rowPaddingX }} />}
    </>
  );
}

export const StatStrip = AppMetricStrip;

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
      <AppProgressBar theme={theme} value={p} color={color} />
    </View>
  );
}
