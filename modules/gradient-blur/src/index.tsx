import React from 'react';
import { Platform, type StyleProp, type ViewStyle } from 'react-native';
import { requireNativeViewManager } from 'expo-modules-core';

type NativeProps = {
  tint?: 'light' | 'dark';
  material?: BlurMaterial;
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

/**
 * False in Expo Go and in binaries that predate this module, so callers can pick a
 * JS-only fallback instead of rendering an invisible layer.
 */
export const isGradientBlurAvailable = NativeGradientBlur !== null;

/** Blur material thickness; `thin`/`ultra` read as a lighter frost than `regular`, and
 * `clearGlass` swaps to iOS 26's clear Liquid Glass, which frosts without the white wash. */
export type BlurMaterial = 'regular' | 'thin' | 'ultra' | 'clearGlass';

export interface GradientBlurProps {
  tint?: 'light' | 'dark';
  material?: BlurMaterial;
  /** Height fraction where the blur starts fading in. */
  startFraction?: number;
  /** Height fraction where the blur reaches full strength; below it stays uniform to the screen edge. */
  endFraction?: number;
  /** Peak mask opacity at and below `endFraction`. */
  endAlpha?: number;
  style?: StyleProp<ViewStyle>;
}

export function GradientBlur({
  tint = 'light',
  material = 'regular',
  startFraction = 0,
  endFraction = 0.6,
  endAlpha = 1,
  style,
}: GradientBlurProps) {
  if (!NativeGradientBlur) return null;
  return (
    <NativeGradientBlur
      tint={tint}
      material={material}
      startFraction={startFraction}
      endFraction={endFraction}
      endAlpha={endAlpha}
      style={style}
      pointerEvents="none"
    />
  );
}
