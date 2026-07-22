import React from 'react';
import { View } from 'react-native';
import { Theme } from '../../theme/theme';

export function AppProgressBar({
  theme,
  value,
  color,
  height = 5,
}: {
  theme: Theme;
  value: number;
  color?: string;
  height?: number;
}) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: theme.progressTrack, overflow: 'hidden' }}>
      <View style={{ width: `${pct}%`, height: '100%', borderRadius: height / 2, backgroundColor: color || theme.accent }} />
    </View>
  );
}
