// Segmented.tsx — shared segmented control.
// `fill` variant = theme-aware light pill (settings/sheets); `glass` variant =
// white-on-dark for full-bleed photo overlays (e.g. JourneyCardFull hero).
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Press } from './Press';
import { Theme } from '../theme/theme';

export type SegOption<T extends string> = { id: T; label: string };

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  variant = 'fill',
  theme,
  size = 'regular',
  stretch = true,
}: {
  value: T;
  options: SegOption<T>[];
  onChange: (v: T) => void;
  variant?: 'glass' | 'fill' | 'underline';
  theme?: Theme;
  size?: 'regular' | 'compact';
  stretch?: boolean;
}) {
  const compact = size === 'compact';

  if (variant === 'underline') {
    return (
      <View style={{ flexDirection: 'row', justifyContent: stretch ? 'space-between' : 'flex-start', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme?.hairline ?? 'rgba(127,127,127,0.25)' }}>
        {options.map((o) => {
          const on = o.id === value;
          return (
            <Press key={o.id} onPress={() => onChange(o.id)} style={stretch ? { flex: 1 } : { marginRight: 18 }}>
              <View style={{ alignItems: 'center', paddingTop: compact ? 2 : 4, paddingBottom: compact ? 7 : 10, paddingHorizontal: stretch ? 0 : 2 }}>
                <Text style={{ fontSize: compact ? 15 : 15.5, fontWeight: on ? '700' : '500', color: on ? (theme?.text ?? '#000') : (theme?.text2 ?? '#8e8e93') }}>
                  {o.label}
                </Text>
              </View>
              <View
                style={{
                  alignSelf: 'center',
                  width: compact ? 18 : 24,
                  height: compact ? 2 : 2.5,
                  borderRadius: 2,
                  backgroundColor: on ? (theme?.accent ?? '#0a84ff') : 'transparent',
                }}
              />
            </Press>
          );
        })}
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
