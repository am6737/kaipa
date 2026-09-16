import React, { useMemo, useRef } from 'react';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import ReanimatedSwipeable, {
  type SwipeableMethods,
  type SwipeableProps,
} from 'react-native-gesture-handler/ReanimatedSwipeable';

type Props = Omit<
  SwipeableProps,
  'ref' | 'overshootRight' | 'simultaneousWithExternalGesture'
> & {
  onSecondLeftSwipe: (methods: SwipeableMethods) => void;
};

export function TwoStageSwipeable({
  onSecondLeftSwipe,
  onSwipeableOpen,
  onSwipeableClose,
  children,
  ...props
}: Props) {
  const methodsRef = useRef<SwipeableMethods>(null);
  const openRef = useRef(false);
  const triggeredRef = useRef(false);
  const secondSwipeRef = useRef(onSecondLeftSwipe);
  secondSwipeRef.current = onSecondLeftSwipe;

  const observerGesture = useMemo(
    () => Gesture.Pan()
      .activeOffsetX([-8, 8])
      .failOffsetY([-12, 12])
      .runOnJS(true)
      .onUpdate((event) => {
        if (!openRef.current || triggeredRef.current || event.translationX > -18) return;
        triggeredRef.current = true;
        const methods = methodsRef.current;
        if (methods) requestAnimationFrame(() => secondSwipeRef.current(methods));
      })
      .onFinalize(() => {
        triggeredRef.current = false;
      }),
    [],
  );

  return (
    <GestureDetector gesture={observerGesture}>
      <ReanimatedSwipeable
        {...props}
        ref={methodsRef}
        overshootRight={false}
        simultaneousWithExternalGesture={observerGesture}
        onSwipeableOpen={(direction) => {
          openRef.current = true;
          onSwipeableOpen?.(direction);
        }}
        onSwipeableClose={(direction) => {
          openRef.current = false;
          onSwipeableClose?.(direction);
        }}
      >
        {children}
      </ReanimatedSwipeable>
    </GestureDetector>
  );
}
