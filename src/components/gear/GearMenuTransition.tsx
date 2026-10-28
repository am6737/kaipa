import React from 'react';
import { Modal, Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
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
  /** Fires once the menu has fully closed. A system sheet presented while the
      Modal is still dismissing never appears on iOS (and its promise never
      settles), so open share sheets and pickers from here, not a timer. */
  onClosed?: () => void;
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
  onClosed,
  placement = 'top',
  positionStyle,
  backdropColor,
  children,
}: Props) {
  const [mounted, setMounted] = React.useState(visible);
  const progress = useSharedValue(visible ? 1 : 0);
  const onClosedRef = React.useRef(onClosed);
  onClosedRef.current = onClosed;
  const wasMounted = React.useRef(mounted);

  // iOS dismisses the native modal asynchronously after it is hidden, so wait
  // for its onDismiss. Android has no such event and no such race: a Dialog
  // does not block an activity or chooser from starting.
  React.useEffect(() => {
    if (Platform.OS !== 'ios' && wasMounted.current && !mounted) onClosedRef.current?.();
    wasMounted.current = mounted;
  }, [mounted]);
  const onDismiss = React.useCallback(() => onClosedRef.current?.(), []);

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

  // The Modal stays in the tree with visible={false} rather than unmounting:
  // an unmounted modal never reports its dismissal.
  return (
    <Modal visible={mounted} onDismiss={Platform.OS === 'ios' ? onDismiss : undefined} transparent statusBarTranslucent animationType="none" onRequestClose={onClose}>
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

/** Queues a menu row's action until the menu has closed. Pass `onClosed` to the
    menu, call `run(action)` from a row (after setting the menu invisible), and
    `cancel()` when the menu is dismissed without choosing a row. */
export function usePendingMenuAction() {
  const pending = React.useRef<(() => void) | null>(null);
  return React.useMemo(() => ({
    run: (action: () => void) => { pending.current = action; },
    cancel: () => { pending.current = null; },
    onClosed: () => {
      const action = pending.current;
      pending.current = null;
      action?.();
    },
  }), []);
}
