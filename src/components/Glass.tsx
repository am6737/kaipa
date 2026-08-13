import React from 'react';
import { View, ViewStyle, StyleProp, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import type { BlurTint } from 'expo-blur';
import { Theme } from '../theme/theme';
import { Press } from './Press';

const IS_IOS = Platform.OS === 'ios';

interface GlassProps {
  theme: Theme;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  radius?: number;
  intensity?: number;
  tintOverride?: BlurTint;
  bordered?: boolean;
  solidOnAndroid?: boolean;
  androidSolidColor?: string;
}

export function Glass({
  theme,
  children,
  style,
  radius = 20,
  intensity = 40,
  tintOverride,
  bordered = true,
  solidOnAndroid = false,
  androidSolidColor,
}: GlassProps) {
  const tint: BlurTint = tintOverride
    || (IS_IOS
      ? (theme.dark ? 'systemMaterialDark' : 'systemMaterialLight')
      : (theme.dark ? 'dark' : 'light'));
  const useAndroidSolid = !IS_IOS && solidOnAndroid;
  const solidColor = androidSolidColor ?? (theme.dark ? theme.surfaceStrong : '#FFFFFF');
  return (
    <View style={[{ borderRadius: radius, overflow: 'hidden', backgroundColor: useAndroidSolid ? solidColor : undefined }, style]}>
      {!useAndroidSolid ? <BlurView intensity={intensity} tint={tint} style={StyleSheet.absoluteFill} /> : null}
      {!IS_IOS && (
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius: radius,
              backgroundColor: useAndroidSolid ? solidColor : theme.dark ? 'rgba(40,40,44,0.55)' : 'rgba(255,255,255,0.5)',
              borderWidth: bordered ? StyleSheet.hairlineWidth : 0,
              borderColor: theme.border,
            },
          ]}
        />
      )}
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
  accessibilityLabel?: string;
}

export function GlassIconBtn({ theme, size = 38, onPress, children, style, strong, accessibilityLabel }: IconBtnProps) {
  return (
    <Press
      onPress={onPress}
      style={style as StyleProp<ViewStyle>}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Glass theme={theme} radius={size / 2} intensity={strong ? 70 : 50}>
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          {children}
        </View>
      </Glass>
    </Press>
  );
}
