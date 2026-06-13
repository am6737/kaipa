// parts.tsx — shared primitives for the 我 (Me) screen and its pushed sub-pages.
// Ported from the prototype's MeSection / MeCard / MeRow / SwitchRow / ColorDot
// so every 我 surface (main screen, 账户与登录, 通知, 关于 …) shares one look:
// uppercase section labels, frosted soft-shadow cards, hairline-divided rows.
import React from 'react';
import { View, Text, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { Theme } from '../../theme/theme';
import { elevCard } from '../../theme/shadow';
import { Icon, IconName } from '../Icon';
import { Press } from '../Press';

export function MeSection({
  theme,
  title,
  first,
  children,
}: {
  theme: Theme;
  title?: string;
  first?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={{ marginTop: first ? 22 : 28 }}>
      {title ? (
        <Text
          style={{
            fontSize: 11,
            fontWeight: '600',
            color: theme.text2,
            letterSpacing: 1,
            textTransform: 'uppercase',
            paddingLeft: 22,
            paddingRight: 22,
            marginBottom: 8,
          }}
        >
          {title}
        </Text>
      ) : null}
      <View style={{ paddingHorizontal: 16 }}>{children}</View>
    </View>
  );
}

// Frosted soft-shadow rounded card. `clip` (default true) clips rows; turn it
// off when a child (e.g. a popover) must overflow the card bounds.
export function MeCard({
  theme,
  children,
  style,
  clip = true,
}: {
  theme: Theme;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  clip?: boolean;
}) {
  // The shadow lives on the OUTER view (no overflow:hidden — that would clip the
  // shadow on iOS). An inner view does the rounded-corner clipping for the rows,
  // so cards float crisply on a white page via shadow + hairline edge.
  return (
    <View
      style={[
        {
          borderRadius: 16,
          backgroundColor: theme.dark ? theme.surfaceTop : '#FFFFFF',
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.hairline,
        },
        elevCard(theme),
        style,
      ]}
    >
      <View style={{ borderRadius: 16, overflow: clip ? 'hidden' : 'visible' }}>{children}</View>
    </View>
  );
}

export function MeRow({
  theme,
  label,
  detail,
  detailLeading,
  leading,
  onPress,
  danger,
  last,
}: {
  theme: Theme;
  label: string;
  detail?: string;
  detailLeading?: React.ReactNode;
  leading?: React.ReactNode;
  onPress?: () => void;
  danger?: boolean;
  last?: boolean;
}) {
  const body = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: leading ? 12 : 0,
        paddingHorizontal: 14,
        minHeight: 50,
        paddingVertical: 11,
        borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
        borderColor: theme.hairline,
      }}
    >
      {leading}
      <Text
        style={{
          flex: 1,
          fontSize: 16,
          color: danger ? theme.danger : theme.text,
          fontWeight: danger ? '600' : '400',
          textAlign: danger ? 'center' : 'left',
        }}
      >
        {label}
      </Text>
      {detailLeading}
      {detail ? (
        <Text style={{ fontSize: 15, color: theme.text2, marginRight: onPress && !danger ? 6 : 0 }} numberOfLines={1}>
          {detail}
        </Text>
      ) : null}
      {onPress && !danger ? <Icon name="chevronR" color={theme.text3} size={15} /> : null}
    </View>
  );
  if (!onPress) return body;
  return <Press onPress={onPress}>{body}</Press>;
}

// iOS-style toggle.
export function MeSwitch({ theme, on }: { theme: Theme; on: boolean }) {
  return (
    <View
      style={{
        width: 44,
        height: 27,
        borderRadius: 14,
        backgroundColor: on ? '#34C759' : theme.dark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.12)',
      }}
    >
      <View
        style={{
          position: 'absolute',
          top: 2.5,
          left: on ? 19.5 : 2.5,
          width: 22,
          height: 22,
          borderRadius: 11,
          backgroundColor: '#fff',
          shadowColor: '#000',
          shadowOpacity: 0.25,
          shadowRadius: 2.5,
          shadowOffset: { width: 0, height: 1 },
          elevation: 2,
        }}
      />
    </View>
  );
}

export function SwitchRow({
  theme,
  label,
  sub,
  value,
  onChange,
  last,
}: {
  theme: Theme;
  label: string;
  sub?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  last?: boolean;
}) {
  return (
    <Press onPress={() => onChange(!value)}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingHorizontal: 14,
          minHeight: 50,
          paddingVertical: 9,
          borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
          borderColor: theme.hairline,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, color: theme.text }}>{label}</Text>
          {sub ? <Text style={{ fontSize: 12, color: theme.text2, marginTop: 2 }}>{sub}</Text> : null}
        </View>
        <MeSwitch theme={theme} on={value} />
      </View>
    </Press>
  );
}

// Tiny circular colour swatch used in the 重点色 row / popover.
export function ColorDot({
  theme,
  color,
  size = 20,
  dashed,
}: {
  theme: Theme;
  color?: string;
  size?: number;
  dashed?: boolean;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: dashed ? 'transparent' : color,
        borderWidth: dashed ? 1.5 : StyleSheet.hairlineWidth,
        borderColor: dashed
          ? theme.dark
            ? 'rgba(255,255,255,0.30)'
            : 'rgba(0,0,0,0.25)'
          : 'rgba(0,0,0,0.10)',
        borderStyle: dashed ? 'dashed' : 'solid',
      }}
    />
  );
}

export type { IconName };
