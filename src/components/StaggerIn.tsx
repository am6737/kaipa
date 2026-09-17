// StaggerIn.tsx — cascades list rows in one-by-one on first appearance.
//
// Wrap each row of a list: on mount the row pops in (fade + rise + a slight
// spring scale) after a per-index delay, capped so long lists finish quickly.
// The staggered flag is captured at mount, so rows that mount later (filter
// switches, edits, refetches) render instantly instead of replaying the show.

import React, { useEffect, useRef } from 'react';
import { Animated } from 'react-native';

// Shared with the map pins (PhotoPin) so cards and pins cascade in the same rhythm.
export const STAGGER_STEP_MS = 55;
export const STAGGER_MAX_DELAY_MS = 660;

export function StaggerIn({
  index,
  staggered = true,
  children,
}: {
  index: number;
  staggered?: boolean;
  children: React.ReactNode;
}) {
  const staggeredAtMount = useRef(staggered).current;
  const progress = useRef(new Animated.Value(staggeredAtMount ? 0 : 1)).current;

  useEffect(() => {
    if (!staggeredAtMount) return;
    const delay = Math.min(index, Math.floor(STAGGER_MAX_DELAY_MS / STAGGER_STEP_MS)) * STAGGER_STEP_MS;
    // The delay is part of the native-driven sequence, so the cascade rhythm
    // stays even when the JS thread is busy right after the data load.
    const entrance = Animated.sequence([
      Animated.delay(delay),
      Animated.spring(progress, {
        toValue: 1,
        bounciness: 7,
        speed: 14,
        useNativeDriver: true,
      }),
    ]);
    entrance.start();
    return () => entrance.stop();
  }, [progress, staggeredAtMount, index]);

  return (
    <Animated.View
      style={{
        opacity: progress,
        transform: [
          { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
          { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}
