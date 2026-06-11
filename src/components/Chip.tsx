// Chip.tsx — pill filter chip used in the discover sheet + elsewhere.
import React from 'react';
import { Text, View } from 'react-native';
import { Theme } from '../theme/theme';
import { Press } from './Press';

export function FilterChip({
  theme,
  label,
  active,
  onPress,
}: {
  theme: Theme;
  label: string;
  active?: boolean;
  onPress?: () => void;
}) {
  return (
    <Press onPress={onPress}>
      <View
        style={{
          height: 30,
          paddingHorizontal: 13,
          borderRadius: 15,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: active ? theme.accentSoft : theme.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
          borderWidth: active ? 1 : 0,
          borderColor: active ? theme.accent : 'transparent',
        }}
      >
        <Text
          style={{
            fontSize: 13,
            fontWeight: active ? '700' : '500',
            color: active ? theme.accent : theme.text2,
          }}
        >
          {label}
        </Text>
      </View>
    </Press>
  );
}
