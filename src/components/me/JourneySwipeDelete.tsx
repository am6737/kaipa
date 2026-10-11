// Swipe-to-delete action shared by the 我的旅程 and 我的攻略 lists.
import React from 'react';
import { Trash2 } from 'lucide-react-native';
import ReAnimated, { Extrapolation, interpolate, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import type { Theme } from '../../theme/theme';
import { Press } from '../Press';

export const JOURNEY_SWIPE_SPRING = { mass: 0.7, damping: 22, stiffness: 240, overshootClamping: true } as const;

export function JourneySwipeDeleteAction({
  progress,
  theme,
  label,
  onPress,
}: {
  progress: SharedValue<number>;
  theme: Theme;
  label: string;
  onPress: () => void;
}) {
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.18, 1], [0, 0.62, 1], Extrapolation.CLAMP),
    transform: [{ translateX: interpolate(progress.value, [0, 1], [32, 0], Extrapolation.CLAMP) }],
  }));

  return (
    <ReAnimated.View style={[{ width: 76, alignSelf: 'stretch', backgroundColor: theme.featureSurface }, animatedStyle]}>
      <Press
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={{ flex: 1, width: 76, alignItems: 'center', justifyContent: 'center' }}
      >
        <Trash2 size={28} color={theme.danger} strokeWidth={2.1} />
      </Press>
    </ReAnimated.View>
  );
}
