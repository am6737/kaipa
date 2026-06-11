// Glass.tsx — frosted-glass surfaces (the iOS 26 "liquid glass" material used by
// the prototype's pills, sheets and tab bar). Built on expo-blur with a theme
// tint + hairline border.
import React from 'react';
import { View, ViewStyle, StyleProp, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { Theme } from '../theme/theme';
import { Press } from './Press';

interface GlassProps {
  theme: Theme;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  radius?: number;
  intensity?: number;
  tintOverride?: 'light' | 'dark' | 'default';
  bordered?: boolean;
}

export function Glass({
  theme,
  children,
  style,
  radius = 20,
  intensity = 40,
  tintOverride,
  bordered = true,
}: GlassProps) {
  const tint = tintOverride || (theme.dark ? 'dark' : 'light');
  return (
    <View style={[{ borderRadius: radius, overflow: 'hidden' }, style]}>
      <BlurView intensity={intensity} tint={tint} style={StyleSheet.absoluteFill} />
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius: radius,
            backgroundColor: theme.dark ? 'rgba(40,40,44,0.55)' : 'rgba(255,255,255,0.5)',
            borderWidth: bordered ? StyleSheet.hairlineWidth : 0,
            borderColor: theme.border,
          },
        ]}
      />
      <View style={{ position: 'relative' }}>{children}</View>
    </View>
  );
}

interface IconBtnProps {
  theme: Theme;
  size?: number;
  onPress?: () => void;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  strong?: boolean;
}

// Round frosted glass icon button used on the globe (search / compass / locate).
export function GlassIconBtn({ theme, size = 38, onPress, children, style, strong }: IconBtnProps) {
  return (
    <Press onPress={onPress} style={style as StyleProp<ViewStyle>}>
      <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden' }}>
        <BlurView intensity={strong ? 50 : 30} tint={theme.dark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius: size / 2,
              backgroundColor: theme.dark ? 'rgba(60,60,64,0.5)' : 'rgba(255,255,255,0.62)',
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: theme.border,
            },
          ]}
        />
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          {children}
        </View>
      </View>
    </Press>
  );
}
