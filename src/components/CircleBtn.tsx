import React from 'react';
import { StyleSheet, ViewStyle } from 'react-native';
import { Theme } from '../theme/theme';
import { Icon, IconName } from './Icon';
import { Press } from './Press';

const shadow = (t: Theme): ViewStyle =>
  t.dark
    ? { boxShadow: '0px 2px 10px rgba(0,0,0,0.5)' }
    : { boxShadow: '0px 2px 10px rgba(0,0,0,0.14)' };

export function CircleBtn({ theme, name, onPress, noShadow }: { theme: Theme; name: IconName; onPress: () => void; noShadow?: boolean }) {
  return (
    <Press
      onPress={onPress}
      style={{
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.dark ? '#2C2C2E' : '#FFFFFF',
        ...(noShadow ? {} : shadow(theme)),
        borderWidth: theme.dark ? StyleSheet.hairlineWidth : 0,
        borderColor: 'rgba(255,255,255,0.06)',
      }}
    >
      <Icon name={name} color={theme.text} size={name === 'more' ? 22 : 21} />
    </Press>
  );
}
