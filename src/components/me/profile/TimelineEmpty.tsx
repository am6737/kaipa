// TimelineEmpty.tsx — 时间线空状态：标题、说明，可选一个主按钮和一个次按钮。
import React from 'react';
import { Text, View } from 'react-native';
import type { Theme } from '../../../theme/theme';
import { layout, radius, space, type } from '../../../design-system';
import { Press } from '../../Press';

type EmptyAction = { label: string; onPress: () => void };

export function TimelineEmpty({ theme, title, body, action, secondaryAction }: {
  theme: Theme;
  title: string;
  body: string;
  action?: EmptyAction;
  secondaryAction?: EmptyAction;
}) {
  return (
    <View style={{ alignItems: 'center', paddingTop: space.xxxl + space.xs, paddingBottom: space.xxxl, paddingHorizontal: space.xl }}>
      <Text style={[type.sectionTitle, { color: theme.text, textAlign: 'center' }]}>{title}</Text>
      <Text style={[type.lead, { color: theme.text2, marginTop: space.xs, textAlign: 'center', maxWidth: 300 }]}>{body}</Text>
      {/* 两个按钮拉伸到同一宽度（以较宽的为准），高度本来就一致。 */}
      <View style={{ alignSelf: 'center', alignItems: 'stretch', marginTop: space.xl }}>
        {action ? (
          <EmptyButton theme={theme} action={action} primary={Boolean(secondaryAction)} />
        ) : null}
        {secondaryAction ? (
          <EmptyButton theme={theme} action={secondaryAction} style={{ marginTop: space.sm }} />
        ) : null}
      </View>
    </View>
  );
}

// 只有一个按钮时保持原来的浅色样式；有两个时第一个是实心的主按钮。
function EmptyButton({ theme, action, primary, style }: {
  theme: Theme;
  action: EmptyAction;
  primary?: boolean;
  style?: object;
}) {
  return (
    <Press
      onPress={action.onPress}
      accessibilityRole="button"
      style={[{
        paddingHorizontal: space.xl,
        height: layout.fieldHeight,
        borderRadius: radius.card,
        backgroundColor: primary ? theme.accent : theme.accentSoft,
        alignItems: 'center',
        justifyContent: 'center',
      }, style]}
    >
      <Text style={[type.chip, { color: primary ? '#FFFFFF' : theme.accent }]}>{action.label}</Text>
    </Press>
  );
}
