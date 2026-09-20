import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Theme } from '../../theme/theme';
import { radius, space, type } from '../../design-system';
import { Icon } from '../Icon';
import type { IconName } from '../Icon';
import { Press } from '../Press';
import { AssistantMark } from '../assistant/AssistantMark';

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
        minHeight: compact ? 136 : 190,
        paddingHorizontal: compact ? space.md : space.xl,
        paddingVertical: compact ? space.lg : space.xxl,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          width: compact ? 44 : 52,
          height: compact ? 44 : 52,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={icon} color={theme.text3} size={compact ? 21 : 24} strokeWidth={1.8} />
      </View>
      <Text style={[type.cardTitle, { marginTop: space.md, color: theme.text, textAlign: 'center' }]}>
        {title}
      </Text>
      {actionLabel && onAction ? (
        <Press
          accessibilityRole="button"
          onPress={onAction}
          style={{
            minHeight: 42,
            marginTop: space.md,
            paddingHorizontal: space.lg,
            borderRadius: radius.pill,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: space.xs,
            backgroundColor: actionIcon === 'send' ? theme.accent : theme.controlSurface,
          }}
        >
          {actionIcon === 'send' ? (
            <AssistantMark color="#FFFFFF" accentColor="#FFFFFF" size={22} />
          ) : (
            <Icon name={actionIcon} color={theme.text2} size={15} strokeWidth={2.1} />
          )}
          <Text style={{ fontSize: 13, fontWeight: '700', color: actionIcon === 'send' ? '#FFFFFF' : theme.text }}>{actionLabel}</Text>
        </Press>
      ) : null}
    </View>
  );
}
