// Segmented.tsx — shared segmented control.
// `fill` variant = theme-aware light pill (settings/sheets); `glass` variant =
// white-on-dark for full-bleed photo overlays.
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View, Text } from 'react-native';
import { Press } from './Press';
import { Theme } from '../theme/theme';
import { motion } from '../design-system';

export type SegOption<T extends string> = { id: T; label: string };

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  variant = 'fill',
  theme,
  size = 'regular',
  stretch = true,
  trailingAction,
  animationDuration = motion.emphasized,
}: {
  value: T;
  options: SegOption<T>[];
  onChange: (v: T) => void;
  variant?: 'glass' | 'fill' | 'underline';
  theme?: Theme;
  size?: 'regular' | 'compact';
  stretch?: boolean;
  trailingAction?: { content: React.ReactNode; onPress: () => void; accessibilityLabel: string };
  animationDuration?: number;
}) {
  const compact = size === 'compact';
  const underlineLayouts = useRef(new Map<string, { x: number; width: number }>());
  const underlineX = useRef(new Animated.Value(0)).current;
  const underlineReady = useRef(false);
  const indicatorWidth = compact ? 18 : 24;

  const positionUnderline = (id: string, animated: boolean) => {
    const layout = underlineLayouts.current.get(id);
    if (!layout) return;
    const nextX = layout.x + (layout.width - indicatorWidth) / 2;
    if (!underlineReady.current || !animated) {
      underlineX.setValue(nextX);
      underlineReady.current = true;
      return;
    }
    Animated.timing(underlineX, {
      toValue: nextX,
      duration: animationDuration,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
      useNativeDriver: true,
    }).start();
  };

  useEffect(() => {
    if (variant === 'underline') positionUnderline(value, true);
  }, [value, variant, indicatorWidth, animationDuration]);

  if (variant === 'underline') {
    return (
      <View
        style={{
          position: 'relative',
          flexDirection: 'row',
          justifyContent: stretch ? 'space-between' : 'flex-start',
        }}
      >
        {options.map((o) => {
          const on = o.id === value;
          return (
            <Press
              key={o.id}
              onPress={() => onChange(o.id)}
              onLayout={(event) => {
                const { x, width } = event.nativeEvent.layout;
                underlineLayouts.current.set(o.id, { x, width });
                if (o.id === value) positionUnderline(o.id, underlineReady.current);
              }}
              style={stretch ? { flex: 1 } : { marginRight: 18 }}
            >
              <View style={{ alignItems: 'center', paddingTop: compact ? 2 : 4, paddingBottom: compact ? 9 : 12, paddingHorizontal: stretch ? 0 : 2 }}>
                <Text style={{ fontSize: compact ? 15 : 15.5, fontWeight: on ? '700' : '500', color: on ? (theme?.text ?? '#000') : (theme?.text2 ?? '#8e8e93') }}>
                  {o.label}
                </Text>
              </View>
            </Press>
          );
        })}
        {trailingAction ? (
          <Press
            onPress={trailingAction.onPress}
            accessibilityRole="button"
            accessibilityLabel={trailingAction.accessibilityLabel}
            style={stretch ? { flex: 1 } : undefined}
          >
            <View style={{ alignItems: 'center', justifyContent: 'center', paddingTop: compact ? 2 : 4, paddingBottom: compact ? 9 : 12, paddingHorizontal: stretch ? 0 : 2 }}>
              {trailingAction.content}
            </View>
          </Press>
        ) : null}
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            bottom: 0,
            width: indicatorWidth,
            height: compact ? 2 : 2.5,
            borderRadius: 2,
            backgroundColor: theme?.accent ?? '#0a84ff',
            transform: [{ translateX: underlineX }],
          }}
        />
      </View>
    );
  }

  const glass = variant === 'glass';
  const containerBg = glass
    ? 'rgba(255,255,255,0.08)'
    : theme?.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';
  return (
    <View style={{ flexDirection: 'row', gap: 4, padding: 4, borderRadius: 13, backgroundColor: containerBg }}>
      {options.map((o) => {
        const on = o.id === value;
        const activeBg = glass ? 'rgba(255,255,255,0.16)' : theme?.bg;
        const activeText = glass ? '#fff' : theme?.text;
        const idleText = glass ? 'rgba(255,255,255,0.55)' : theme?.text2;
        return (
          <Press key={o.id} onPress={() => onChange(o.id)} style={{ flex: 1 }}>
            <View
              style={{
                height: 36,
                borderRadius: 10,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: on ? activeBg : 'transparent',
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: '600', color: on ? activeText : idleText }}>{o.label}</Text>
            </View>
          </Press>
        );
      })}
    </View>
  );
}
