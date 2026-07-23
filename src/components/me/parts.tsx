// Shared settings primitives used by the pushed pages under 设置.
import React from 'react';
import { View, Text, StyleSheet, Switch, ViewStyle, StyleProp } from 'react-native';
import { Theme } from '../../theme/theme';
import { Icon, IconName } from '../Icon';
import { Press } from '../Press';
import { layout, radius, space, type } from '../../design-system';

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
    <View style={{ marginTop: first ? space.lg : layout.sectionGap }}>
      {title ? (
        <Text
          style={{
            ...type.eyebrow,
            color: theme.text3,
            textTransform: 'uppercase',
            paddingHorizontal: space.xl,
            marginBottom: space.xs,
          }}
        >
          {title}
        </Text>
      ) : null}
      <View style={{ paddingHorizontal: space.xl }}>{children}</View>
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
          borderRadius: radius.feature,
          backgroundColor: theme.surfaceTop,
          borderWidth: 0,
        },
        style,
      ]}
    >
      <View style={{ borderRadius: radius.feature, overflow: clip ? 'hidden' : 'visible' }}>{children}</View>
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
        gap: leading ? space.md : 0,
        paddingHorizontal: space.md,
        minHeight: 78,
        paddingVertical: space.md,
      }}
    >
      {leading}
      <Text
        style={{
          flex: 1,
          ...type.cardTitle,
          color: danger ? theme.danger : theme.text,
          fontWeight: danger ? '700' : type.cardTitle.fontWeight,
          textAlign: danger ? 'center' : 'left',
        }}
      >
        {label}
      </Text>
      {detailLeading}
      {detail ? (
        <Text style={[type.caption, { color: theme.text2, marginRight: onPress && !danger ? space.xxs : 0 }]} numberOfLines={1}>
          {detail}
        </Text>
      ) : null}
      {onPress && !danger ? <Icon name="chevronR" color={theme.text3} size={15} /> : null}
    </View>
  );
  if (!onPress) return body;
  return <Press onPress={onPress} scaleTo={1} opacityTo={1}>{body}</Press>;
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
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        paddingHorizontal: space.md,
        minHeight: 78,
        paddingVertical: space.md,
      }}
    >
      <Press onPress={() => onChange(!value)} scaleTo={1} opacityTo={1} style={{ flex: 1 }}>
        <View style={{ flex: 1 }}>
          <Text style={[type.cardTitle, { color: theme.text }]}>{label}</Text>
          {sub ? <Text style={[type.caption, { color: theme.text2, lineHeight: 17, marginTop: space.xxs }]}>{sub}</Text> : null}
        </View>
      </Press>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: theme.progressTrack, true: theme.accent }}
        thumbColor="#FFFFFF"
        ios_backgroundColor={theme.progressTrack}
      />
    </View>
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
