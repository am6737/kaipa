import React from 'react';
import { StyleSheet, ViewStyle } from 'react-native';
import { Theme } from '../theme/theme';
import { Icon, IconName } from './Icon';
import { Press } from './Press';

const shadow = (t: Theme): ViewStyle =>
  t.dark
    ? { boxShadow: '0px 2px 10px rgba(0,0,0,0.5)' }
    : { boxShadow: '0px 2px 10px rgba(0,0,0,0.14)' };

const subtleShadow = (t: Theme): ViewStyle =>
  t.dark
    ? { boxShadow: '0px 1px 5px rgba(0,0,0,0.24)' }
    : { boxShadow: '0px 1px 5px rgba(0,0,0,0.07)' };

export function CircleBtn({ theme, name, onPress, noShadow, softShadow, active, danger, size = 44 }: { theme: Theme; name: IconName; onPress: () => void; noShadow?: boolean; softShadow?: boolean; active?: boolean; danger?: boolean; size?: number }) {
  return (
    <Press
      onPress={onPress}
      opacityTo={1}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: active ? theme.accent : theme.controlSurface,
        ...(noShadow ? {} : softShadow ? subtleShadow(theme) : shadow(theme)),
        borderWidth: theme.dark && !active && !softShadow ? StyleSheet.hairlineWidth : 0,
        borderColor: 'rgba(255,255,255,0.06)',
      }}
    >
      <Icon name={name} color={active ? '#fff' : danger ? theme.danger : theme.text} size={name === 'more' ? 22 : size >= 44 ? 22 : 21} />
    </Press>
  );
}
