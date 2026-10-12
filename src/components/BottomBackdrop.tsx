import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Theme, rgba } from '../theme/theme';

interface BottomBackdropProps {
  theme: Theme;
  /** Height fraction where the veil reaches full strength — the same value the iOS mask uses. */
  plateauAt: number;
  /** Peak veil alpha over the controls; keep it equal to GradientBlur's endAlpha. */
  alpha: number;
}

// Stand-in for modules/gradient-blur off iOS. iOS masks a real UIBlurEffect natively;
// here the same falloff is composed out of a page-colour gradient (plus a CSS
// backdrop-filter frost on web). Android gets the gradient alone, following Glass's
// solidOnAndroid convention: every expo-blur layer there re-samples the whole screen
// on each scroll frame, and the pill itself is already solid.
// It fills whatever band its parent gives it and never eats touches.
export function BottomBackdrop({ theme, plateauAt, alpha }: BottomBackdropProps) {
  const backdropColor = theme.dark ? theme.bg : theme.featureSurface;
  // Ease into the plateau the way the native mask's smoothstep does. Endpoints share
  // the backdrop's RGB so Core Animation never interpolates through grey.
  const ease = (stop: number) => alpha * stop * stop * (3 - 2 * stop);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Platform.OS === 'web' ? (
        <BlurView intensity={18} tint={theme.dark ? 'systemMaterialDark' : 'systemMaterialLight'} style={StyleSheet.absoluteFill} />
      ) : null}
      <LinearGradient
        colors={[
          rgba(backdropColor, 0),
          rgba(backdropColor, ease(0.25)),
          rgba(backdropColor, ease(0.5)),
          rgba(backdropColor, alpha),
          rgba(backdropColor, alpha),
        ]}
        locations={[0, plateauAt * 0.3, plateauAt * 0.65, plateauAt, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}
