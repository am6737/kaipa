// parts.tsx — shared primitives for the 装备 detail pages (装备详情 / 分类详情 /
// 清单详情). Mirrors the gx-design prototype's drill-down screens: a slide-in
// full-screen shell with floating circular back / ··· buttons, frosted cards,
// section labels, gear rows with a photo thumbnail, share bars and stat strips.
// Kept visually identical to GearScreen's chrome (surfaceTop cards + soft shadow
// on theme.bg) so a pushed detail reads as the same surface, not a new world.
import React, { useEffect, useRef } from 'react';
import { Animated, View, Text, TextInput, ScrollView, StyleSheet, Dimensions, ViewStyle, KeyboardAvoidingView, Platform, Easing, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { JapaneseYen, Package, Weight } from 'lucide-react-native';
import { Theme } from '../../theme/theme';
import { MONO } from '../../theme/fonts';
import { Icon } from '../Icon';
import { Press } from '../Press';
import { PhotoTile } from '../PhotoTile';
import { hashStr, TONES } from '../../data/tones';
import { GearItem, GearCat, itemWeight, itemPrice, fmtWeight, WeightUnit } from '../../data/gear';

// ── Shared theme tokens (mirror GearScreen) ─────────────────────────────────
export const cardShadow = (t: Theme): ViewStyle =>
  t.dark
    ? { boxShadow: '0px 5px 14px rgba(0,0,0,0.45)' }
    : {};
export const cardBorder = (t: Theme): ViewStyle => ({ borderWidth: StyleSheet.hairlineWidth, borderColor: t.hairline });
export const trackBg = (t: Theme) => (t.dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.07)');

// ── Formatting ──────────────────────────────────────────────────────────────
export const yuan = (v: number) => '¥' + Math.round(v).toLocaleString('en-US');
export const fmtKg = (v: number, unit: WeightUnit = 'kg') => fmtWeight(v, unit);
export const toneFor = (name: string) => TONES[Math.abs(hashStr(name)) % TONES.length];

import { CircleBtn } from '../CircleBtn';
export { CircleBtn };

const GearPushScrollContext = React.createContext<{ scrollBy: (dy: number) => void } | null>(null);
export function useGearPushScroll() {
  return React.useContext(GearPushScrollContext);
}

// ── Full-screen pushed detail page ──────────────────────────────────────────
// Slides in from the right. With `hero`, a full-bleed view sits at the top and
// the floating back/··· buttons overlay it; without one, a transparent nav bar
// carries an optional centered title. Content scrolls beneath either.
export function GearPushPage({
  theme,
  onBack,
  backgroundColor,
  title,
  right,
  overlay,
  hero,
  flatChrome,
  onContentTouchStart,
  onEnterComplete,
  children,
}: {
  theme: Theme;
  onBack: () => void;
  backgroundColor?: string;
  title?: string;
  right?: React.ReactNode;
  overlay?: React.ReactNode;
  hero?: React.ReactNode;
  flatChrome?: boolean;
  onContentTouchStart?: () => void;
  onEnterComplete?: () => void;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const width = Dimensions.get('window').width;
  const tx = useRef(new Animated.Value(width)).current;
  const onEnterCompleteRef = useRef(onEnterComplete);
  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(0);
  useEffect(() => { onEnterCompleteRef.current = onEnterComplete; }, [onEnterComplete]);
  useEffect(() => {
    const animation = Animated.spring(tx, { toValue: 0, useNativeDriver: true, bounciness: 0, speed: 16 });
    animation.start(({ finished }) => {
      if (finished) onEnterCompleteRef.current?.();
    });
    return () => animation.stop();
  }, [tx]);

  const navH = insets.top + 50;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: backgroundColor || (theme.dark ? theme.bg : '#FFFFFF'), transform: [{ translateX: tx }] }]}>
      <View style={{ flex: 1 }}>
        {hero}
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={insets.top}
        >
          <ScrollView
            ref={scrollRef}
            style={{ flex: 1 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets
            onTouchStart={onContentTouchStart}
            onScroll={(event) => {
              scrollY.current = event.nativeEvent.contentOffset.y;
            }}
            scrollEventThrottle={16}
            contentContainerStyle={{ paddingTop: hero ? 6 : navH + 4, paddingBottom: insets.bottom + 120 }}
          >
            <GearPushScrollContext.Provider value={{ scrollBy: (dy: number) => scrollRef.current?.scrollTo({ y: Math.max(0, scrollY.current + dy), animated: true }) }}>
              {children}
            </GearPushScrollContext.Provider>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>

      {/* floating nav chrome */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: navH }} pointerEvents="box-none">
        <View style={{ position: 'absolute', left: 14, top: insets.top + 5 }}>
          <CircleBtn theme={theme} name="arrowL" onPress={onBack} noShadow={flatChrome} softShadow={!flatChrome} size={44} />
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
      {overlay}
    </Animated.View>
  );
}

// Animated search chrome for pushed list pages. It starts at the search
// button's position and grows left across the top bar, keeping search controls
// out of the scrolling content and making opening/closing feel continuous.
export function GearHeaderSearch({
  theme,
  open,
  value,
  placeholder,
  onChangeText,
  onClose,
  actions,
}: {
  theme: Theme;
  open: boolean;
  value: string;
  placeholder: string;
  onChangeText: (value: string) => void;
  onClose: () => void;
  actions: React.ReactNode;
}) {
  const { width } = useWindowDimensions();
  const progress = useRef(new Animated.Value(open ? 1 : 0)).current;
  const inputRef = useRef<TextInput>(null);
  const expandedWidth = Math.max(180, width - 84);

  useEffect(() => {
    if (!open) inputRef.current?.blur();
    Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration: open ? 280 : 230,
      easing: open ? Easing.bezier(0.2, 0.8, 0.2, 1) : Easing.bezier(0.4, 0, 0.6, 1),
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished && open) inputRef.current?.focus();
    });
  }, [open, progress]);

  return (
    <View pointerEvents="box-none" style={{ width: expandedWidth, height: 44 }}>
      <Animated.View
        pointerEvents={open ? 'none' : 'box-none'}
        style={{
          position: 'absolute',
          right: 0,
          height: 44,
          opacity: progress.interpolate({ inputRange: [0, 0.45, 1], outputRange: [1, 0, 0] }),
        }}
      >
        {actions}
      </Animated.View>

      <Animated.View
        pointerEvents={open ? 'auto' : 'none'}
        style={{
          position: 'absolute',
          right: 0,
          width: progress.interpolate({ inputRange: [0, 1], outputRange: [44, expandedWidth] }),
          height: 44,
          borderRadius: 22,
          paddingHorizontal: 14,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 9,
          overflow: 'hidden',
          opacity: progress.interpolate({ inputRange: [0, 0.08, 1], outputRange: [0, 1, 1] }),
          backgroundColor: theme.dark ? '#000000' : '#FFFFFF',
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.hairline,
        }}
      >
        <Icon name="search" color={theme.text2} size={17} />
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          onBlur={onClose}
          placeholder={placeholder}
          placeholderTextColor={theme.text3}
          returnKeyType="search"
          editable={open}
          style={{ flex: 1, minWidth: 0, padding: 0, fontSize: 15, color: theme.text }}
        />
        <Press onPress={onClose} hitSlop={10}>
          <Icon name="close" color={theme.text2} size={15} />
        </Press>
      </Animated.View>
    </View>
  );
}

// ── Frosted card matching GearScreen's Card ─────────────────────────────────
export function GearCard({ theme, children, style }: { theme: Theme; children: React.ReactNode; style?: ViewStyle }) {
  return <View style={{ backgroundColor: theme.surfaceTop, borderRadius: 16, ...cardBorder(theme), ...cardShadow(theme), ...style }}>{children}</View>;
}

// Uppercase section label with an optional count / trailing accessory.
export function SectionLabel({ theme, text, trailing, marginTop = 22 }: { theme: Theme; text: string; trailing?: React.ReactNode; marginTop?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop, marginBottom: 8 }}>
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
        {showImage ? <PhotoTile tone={toneFor(item.name)} seed={item.name} radius={Math.max(10, Math.round(imageSize * 0.24))} style={{ width: imageSize, height: imageSize }} /> : null}
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
        {showImage ? <PhotoTile tone={toneFor(item.name)} seed={item.name} radius={Math.max(9, Math.round(imageSize * 0.24))} style={{ width: imageSize, height: imageSize }} /> : null}
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
