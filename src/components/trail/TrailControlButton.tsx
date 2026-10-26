// TrailControlButton.tsx — the big footer button of the recording screens:
// 结束/继续 while paused and 继续记录/保存轨迹 once finished share it, so the
// two button rows read as one control in different states.
import React from 'react';
import { Text } from 'react-native';
import { radius, space, type } from '../../design-system';
import type { Theme } from '../../theme/theme';
import { Icon, type IconName } from '../Icon';
import { Press } from '../Press';

export function TrailControlButton({ theme, icon, label, primary, danger, muted, grow = 1, disabled, busy, onPress }: {
  theme: Theme;
  icon?: IconName;
  label: string;
  primary?: boolean;
  danger?: boolean;
  muted?: boolean;
  grow?: number;
  disabled?: boolean;
  busy?: boolean;
  onPress: () => void;
}) {
  const color = primary ? '#FFFFFF' : danger ? theme.danger : muted ? theme.text2 : theme.text;
  return (
    <Press
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      style={{ flex: grow, height: 52, borderRadius: radius.card, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, backgroundColor: primary ? theme.accent : theme.fieldSurface, opacity: busy ? 0.6 : 1 }}
    >
      {icon ? <Icon name={icon} color={color} size={18} /> : null}
      <Text style={[type.quickReply, { color }]}>{label}</Text>
    </Press>
  );
}
