import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Theme } from '../../theme/theme';
import { radius, space, type } from '../../design-system';
import { Icon } from '../Icon';
import type { IconName } from '../Icon';
import { Press } from '../Press';

export function GearEmptyState({
  theme,
  icon,
  title,
  actionLabel,
  actionIcon = 'plus',
  onAction,
  compact = false,
}: {
  theme: Theme;
  icon: IconName;
  title: string;
  actionLabel?: string;
  actionIcon?: IconName;
  onAction?: () => void;
  compact?: boolean;
}) {
  return (
    <View
      style={{
        minHeight: compact ? 190 : 300,
        paddingHorizontal: compact ? space.lg : space.xl,
        paddingVertical: compact ? space.xl : space.xxxl,
        borderRadius: radius.feature,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.fieldBorder,
        backgroundColor: theme.surfaceTop,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          width: compact ? 52 : 64,
          height: compact ? 52 : 64,
          borderRadius: compact ? 18 : 22,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.accentSofter,
        }}
      >
        <Icon name={icon} color={theme.accent} size={compact ? 23 : 28} strokeWidth={1.7} />
      </View>
      <Text style={[type.cardTitle, { marginTop: space.md, color: theme.text, textAlign: 'center' }]}>
        {title}
      </Text>
      {actionLabel && onAction ? (
        <Press
          accessibilityRole="button"
          onPress={onAction}
          style={{
            minHeight: 44,
            marginTop: space.lg,
            paddingHorizontal: space.lg,
            borderRadius: radius.pill,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: space.xs,
            backgroundColor: theme.accent,
          }}
        >
          <Icon name={actionIcon} color="#FFFFFF" size={17} strokeWidth={2.2} />
          <Text style={{ fontSize: 14, fontWeight: '800', color: '#FFFFFF' }}>{actionLabel}</Text>
        </Press>
      ) : null}
    </View>
  );
}
