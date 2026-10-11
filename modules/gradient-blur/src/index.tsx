import React from 'react';
import { Platform, type StyleProp, type ViewStyle } from 'react-native';
import { requireNativeViewManager } from 'expo-modules-core';

type NativeProps = {
  tint?: 'light' | 'dark';
  startFraction?: number;
  endFraction?: number;
  endAlpha?: number;
  style?: StyleProp<ViewStyle>;
  pointerEvents?: 'none';
};

let NativeGradientBlur: React.ComponentType<NativeProps> | null = null;
if (Platform.OS === 'ios') {
  try {
    NativeGradientBlur = requireNativeViewManager<NativeProps>('GradientBlur');
  } catch {
    // A runtime without the module (Expo Go, or a binary predating it): render nothing.
    NativeGradientBlur = null;
  }
}

export interface GradientBlurProps {
  tint?: 'light' | 'dark';
  /** Height fraction where the blur starts fading in. */
  startFraction?: number;
  /** Height fraction where the blur reaches full strength; below it stays uniform to the screen edge. */
  endFraction?: number;
  style?: StyleProp<ViewStyle>;
}

export function GradientBlur({ tint = 'light', startFraction = 0, endFraction = 0.6, style }: GradientBlurProps) {
  if (!NativeGradientBlur) return null;
  return (
    <NativeGradientBlur
      tint={tint}
      startFraction={startFraction}
      endFraction={endFraction}
      style={style}
      pointerEvents="none"
    />
  );
}
