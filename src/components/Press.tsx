// Press.tsx — the app's tap target. It carries NO press animation: the
// prototype's "kp-press" scale (0.97 + spring back) and fade (0.82) were both
// removed app-wide on 2026-09-24 (user: "点击的时候不要触发缩小的效果，整个 app
// 的按钮都是这样" → "淡出也去掉"). Feedback is carried by the content's state
// change instead (switch slide, color, sheet opening). `scaleTo`/`opacityTo`
// are still accepted so the ~30 legacy call sites compile, but they are
// ignored — don't add new ones.
import React, { createContext, useContext, useRef } from 'react';
import { Pressable, PressableProps, ViewStyle, StyleProp, GestureResponderEvent } from 'react-native';

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
  /** @deprecated Ignored — the press-in scale was removed app-wide. */
  scaleTo?: number;
  /** @deprecated Ignored — the press-in fade was removed app-wide. */
  opacityTo?: number;
  haptic?: boolean;
}

export function Press({ children, style, onPress, ...rest }: Props) {
  const dragGuard = useDragCancelledPress(onPress, useContext(PressDragGuardContext));

  return (
    <Pressable
      onPressIn={dragGuard.onPressIn}
      onPress={dragGuard.onPress}
      style={style}
      {...rest}
    >
      {children}
    </Pressable>
  );
}
