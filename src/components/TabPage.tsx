import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, useWindowDimensions } from 'react-native';
import { motion } from '../design-system';

type Props = {
  /** This page is the bottom-tab selection. */
  selected: boolean;
  /** A route/journey detail sits over the app: hide at once. */
  covered?: boolean;
  /** Shown whatever the selection — Discover carries the detail page. */
  forced?: boolean;
  /** Android only: fade the page in on a tab switch. Off for the map page,
   *  whose AMap view redraws when an opacity layer comes and goes. */
  fadeIn?: boolean;
  /**
   * How the page is put away while it is not shown. `offscreen` keeps every
   * native view alive and slides it out of the window, and on the way back it
   * slides in first and tells the children a frame later, so a heavy page
   * shows its last frame at once and catches up behind it.
   */
  whenHidden: 'transparent' | 'none' | 'offscreen';
  /** Whether the page is the one on screen. */
  children: (shown: boolean) => React.ReactNode;
};

// Android tab switches read as a hard cut without a fade; iOS feels right as is.
const FADE_IN = Platform.OS === 'android';

/**
 * One bottom-tab page. The outgoing page goes at once, never crossfaded under
 * the incoming one: every page draws under the transparent status bar, and a
 * crossfade made the strip behind it flicker as if the status bar redrew. On
 * Android the incoming page fades in over the app background instead.
 */
export function TabPage({ selected, covered = false, forced = false, fadeIn = true, whenHidden, children }: Props) {
  const { width } = useWindowDimensions();
  const shown = forced || (selected && !covered);
  const fade = FADE_IN && fadeIn;
  const opacity = useRef(new Animated.Value(shown || !fade ? 1 : 0)).current;
  const wasSelected = useRef(selected);

  // Hiding reaches the children in the same render; showing waits a frame.
  const deferReveal = whenHidden === 'offscreen';
  const [revealed, setRevealed] = useState(shown);
  const childShown = deferReveal ? shown && revealed : shown;
  useEffect(() => {
    if (!deferReveal) return;
    if (!shown) {
      setRevealed(false);
      return;
    }
    if (revealed) return;
    const frame = requestAnimationFrame(() => setRevealed(true));
    return () => cancelAnimationFrame(frame);
  }, [deferReveal, shown, revealed]);

  useLayoutEffect(() => {
    if (!fade || selected === wasSelected.current) return;
    wasSelected.current = selected;
    if (!selected) {
      // Parked at 0 while away, so the next visit fades in from nothing.
      opacity.setValue(0);
      return;
    }
    Animated.timing(opacity, {
      toValue: 1,
      duration: motion.quick,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [selected, fade, opacity]);

  const hiddenStyle =
    whenHidden === 'none' ? styles.none
    : whenHidden === 'transparent' ? styles.transparent
    : { transform: [{ translateX: width * 2 }] };

  return (
    <Animated.View
      pointerEvents={shown ? 'auto' : 'none'}
      accessibilityElementsHidden={!shown}
      importantForAccessibility={shown ? 'auto' : 'no-hide-descendants'}
      style={[
        StyleSheet.absoluteFill,
        { zIndex: shown ? 1 : 0 },
        fade && selected ? { opacity } : null,
        !shown && hiddenStyle,
      ]}
    >
      {children(childShown)}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  none: { display: 'none' },
  transparent: { opacity: 0 },
});
