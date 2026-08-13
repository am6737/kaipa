import React from 'react';
import { Modal, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import ReAnimated, {
  Easing,
  cancelAnimation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import type { Theme } from '../../theme/theme';

type Props = {
  theme: Theme;
  visible: boolean;
  onClose: () => void;
  placement?: 'top' | 'bottom';
  positionStyle: StyleProp<ViewStyle>;
  backdropColor?: string;
  children: React.ReactNode;
};

/** Shared motion shell for the compact gear and gear-set popover menus. */
export function GearMenuTransition({
  theme,
  visible,
  onClose,
  placement = 'top',
  positionStyle,
  backdropColor,
  children,
}: Props) {
  const [mounted, setMounted] = React.useState(visible);
  const progress = useSharedValue(visible ? 1 : 0);

  React.useLayoutEffect(() => {
    cancelAnimation(progress);
    if (visible) {
      setMounted(true);
      progress.value = withTiming(1, {
        duration: 140,
        easing: Easing.bezier(0.16, 1, 0.3, 1),
      });
      return;
    }

    progress.value = withTiming(0, {
      duration: 90,
      easing: Easing.in(Easing.cubic),
    }, (finished) => {
      if (finished) runOnJS(setMounted)(false);
    });
  }, [progress, visible]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const surfaceStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { translateY: interpolate(progress.value, [0, 1], [placement === 'bottom' ? 6 : -6, 0]) },
      { scale: interpolate(progress.value, [0, 1], [0.975, 1]) },
    ],
  }));

  if (!visible && !mounted) return null;

  return (
    <Modal visible transparent statusBarTranslucent animationType="none" onRequestClose={onClose}>
      <View style={StyleSheet.absoluteFill}>
        <ReAnimated.View pointerEvents="box-none" style={[StyleSheet.absoluteFill, backdropStyle]}>
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor: backdropColor
                  ?? (theme.dark ? 'rgba(0,0,0,0.20)' : 'rgba(0,0,0,0.055)'),
              },
            ]}
          />
        </ReAnimated.View>
        <ReAnimated.View style={[positionStyle, surfaceStyle]}>
          {children}
        </ReAnimated.View>
      </View>
    </Modal>
  );
}
