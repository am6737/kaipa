import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { layout } from '../design-system';
import { Theme, rgba } from '../theme/theme';

interface BottomBackdropProps {
  theme: Theme;
  insetBottom: number;
}

// Slytherin uses a private variable-blur filter. Keep the public Expo version
// visually equivalent with two static blur bands and a gradient mask; the
// gradient hides the lower content while the stacked bands increase blur near
// the controls without animating BlurView intensity.
export function BottomBackdrop({ theme, insetBottom }: BottomBackdropProps) {
  const tint = theme.dark ? 'systemMaterialDark' : 'systemMaterialLight';
  const hasNativeBlur = Platform.OS === 'ios' || Platform.OS === 'web';
  const backdropColor = theme.dark ? theme.bg : theme.featureSurface;
  const solid = rgba(backdropColor, 0.78);
  const gradientStops = theme.dark ? [0, 0.14, 0.72] : [0, 0.12, 0.78];

  return (
    <View pointerEvents="none" style={[styles.backdrop, { height: layout.bottomNavBackdropHeight + insetBottom }]}>
      {hasNativeBlur ? (
        <>
          <BlurView intensity={24} tint={tint} style={StyleSheet.absoluteFill} />
          <BlurView intensity={52} tint={tint} style={[styles.strongBlur, { height: layout.bottomNavStrongBlurHeight + insetBottom }]} />
        </>
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: solid }]} />
      )}
      <LinearGradient
        pointerEvents="none"
        colors={[
          rgba(backdropColor, gradientStops[0]),
          rgba(backdropColor, gradientStops[1]),
          rgba(backdropColor, gradientStops[2]),
          backdropColor,
        ]}
        locations={[0, 0.38, 0.76, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  strongBlur: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
});
