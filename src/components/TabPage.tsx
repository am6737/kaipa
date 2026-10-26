import React, { useLayoutEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import { motion } from '../design-system';

type Props = {
  /** This page is the bottom-tab selection. */
  selected: boolean;
  /** A route/journey detail sits over the app: hide at once, no fade. */
  covered?: boolean;
  /** Shown whatever the selection — Discover carries the detail page. */
  forced?: boolean;
  /** How the page is put away once it is fully off screen. */
  whenHidden: 'transparent' | 'none' | 'keep';
  /** `shown` stays true while the page still sits under an incoming one. */
  children: (shown: boolean) => React.ReactNode;
};

/**
 * One bottom-tab page. A tab switch fades the incoming page in on top while
 * the outgoing one stays put underneath until the fade ends, so the change
 * reads as one crossfade instead of two half-transparent pages.
 */
export function TabPage({ selected, covered = false, forced = false, whenHidden, children }: Props) {
  const visible = forced || (selected && !covered);
  const [leaving, setLeaving] = useState(false);
  const opacity = useRef(new Animated.Value(selected ? 1 : 0)).current;
  const wasSelected = useRef(selected);

  useLayoutEffect(() => {
    if (selected === wasSelected.current) return;
    wasSelected.current = selected;
    if (selected) {
      setLeaving(false);
      Animated.timing(opacity, {
        toValue: 1,
        duration: motion.quick,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
      return;
    }
    setLeaving(true);
    const timer = setTimeout(() => {
      // Parked at 0 so the next visit starts its fade from nothing.
      opacity.setValue(0);
      setLeaving(false);
    }, motion.quick);
    return () => clearTimeout(timer);
  }, [selected, opacity]);

  const shown = visible || (leaving && !covered);
  const hiddenStyle = whenHidden === 'none' ? styles.none : whenHidden === 'transparent' ? styles.transparent : null;

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
      style={[
        StyleSheet.absoluteFill,
        { zIndex: visible ? 2 : shown ? 1 : 0 },
        selected && !covered ? { opacity } : null,
        !shown && hiddenStyle,
      ]}
    >
      {children(shown)}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  none: { display: 'none' },
  transparent: { opacity: 0 },
});
