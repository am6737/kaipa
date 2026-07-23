import React from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import { Theme } from '../../theme/theme';
import { radius } from '../tokens';

export function AppCard({
  theme,
  children,
  style,
  radius: radiusOverride,
}: {
  theme: Theme;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  radius?: number;
}) {
  return (
    <View
      style={[
        {
          backgroundColor: theme.surfaceTop,
          borderRadius: radiusOverride ?? radius.card,
          ...(theme.dark ? { boxShadow: '0px 5px 14px rgba(0,0,0,0.45)' } : {}),
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
