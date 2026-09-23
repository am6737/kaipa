// Press.tsx — Pressable with the prototype's "kp-press" feedback (scale 0.97 +
// fade on press). Use anywhere a tap target needs that tactile response.
import React, { createContext, useContext, useRef } from 'react';
import { Animated, Pressable, PressableProps, ViewStyle, StyleProp, GestureResponderEvent } from 'react-native';

// The style (flex/layout/background) must land on the Pressable itself so it
// participates in its parent's layout — otherwise a `flex: 1` caller can't
// stretch. Animate the Pressable directly so the whole box scales on press.
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// A page swipe that the pager claims never reaches the JS responder system, so a
// row-wide tap target still holds its press-in state when the finger lifts and
// `onPress` fires: Pressable only cancels on LEAVE_PRESS_RECT, and a full-width row
// is never left while the page slides past it. Travel along the paging axis past
// this is a swipe, not a tap. The vertical axis is untouched — a scroll view does
// terminate the responder, so it already cancels those itself.
export const DRAG_CANCEL_SLOP_X = 20;

/** Where the finger is, resolved the same way Pressability does — the flat
    `pageX` is a fallback there, so reading it alone could silently never trip. */
function pressPointX(event: GestureResponderEvent) {
  const { touches, changedTouches } = event.nativeEvent;
  if (touches != null && touches.length > 0) return touches[0].pageX;
  if (changedTouches != null && changedTouches.length > 0) return changedTouches[0].pageX;
  return event.nativeEvent.pageX;
}

/** Only the pages of a horizontally paged container need the swipe guard, and
    cancelling a net-displaced release is not what a plain button does (iOS fires
    when the finger lifts inside the target however far it wandered). */
export const PressDragGuardContext = createContext(false);

export function useDragCancelledPress(
  onPress?: PressableProps['onPress'],
  enabled: boolean = true,
) {
  const startX = useRef<number | null>(null);
  return {
    onPressIn: (event: GestureResponderEvent) => {
      if (enabled) startX.current = pressPointX(event);
    },
    onPress: (event: GestureResponderEvent) => {
      if (!enabled) {
        onPress?.(event);
        return;
      }
      const from = startX.current;
      startX.current = null;
      if (from != null && Math.abs(pressPointX(event) - from) > DRAG_CANCEL_SLOP_X) return;
      onPress?.(event);
    },
  };
}

interface Props extends PressableProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
  opacityTo?: number;
  haptic?: boolean;
}

export function Press({ children, style, scaleTo = 0.97, opacityTo = 0.82, onPress, ...rest }: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const dragGuard = useDragCancelledPress(onPress, useContext(PressDragGuardContext));

  const animate = (toScale: number, toOpacity: number) => {
    Animated.parallel([
      Animated.spring(scale, { toValue: toScale, useNativeDriver: true, speed: 40, bounciness: 0 }),
      Animated.timing(opacity, { toValue: toOpacity, duration: 90, useNativeDriver: true }),
    ]).start();
  };

  return (
    <AnimatedPressable
      onPressIn={(event) => {
        dragGuard.onPressIn(event);
        animate(scaleTo, opacityTo);
      }}
      onPressOut={() => animate(1, 1)}
      onPress={dragGuard.onPress}
      style={[style, { transform: [{ scale }], opacity }]}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
}
