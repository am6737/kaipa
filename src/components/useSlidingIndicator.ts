// useSlidingIndicator.ts — one tab underline that glides to the active tab
// (position and width tween together, so it also fits underlines as wide as
// their label). Spread `style` onto an absolutely positioned Animated.View
// placed inside the tabs' container; feed each tab's onLayout to `onTabLayout`.
import { useCallback, useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import { motion } from '../design-system';

export function useSlidingIndicator(activeKey: string, indicatorWidth?: number) {
  const layouts = useRef(new Map<string, { x: number; width: number }>());
  const left = useRef(new Animated.Value(0)).current;
  const width = useRef(new Animated.Value(0)).current;
  const ready = useRef(false);

  const move = useCallback((id: string, animated: boolean) => {
    const tab = layouts.current.get(id);
    if (!tab) return;
    const w = indicatorWidth ?? tab.width;
    const x = tab.x + (tab.width - w) / 2;
    if (!ready.current || !animated) {
      left.setValue(x);
      width.setValue(w);
      ready.current = true;
      return;
    }
    const config = { duration: motion.emphasized, easing: Easing.bezier(0.22, 1, 0.36, 1), useNativeDriver: false };
    Animated.parallel([
      Animated.timing(left, { toValue: x, ...config }),
      Animated.timing(width, { toValue: w, ...config }),
    ]).start();
  }, [indicatorWidth, left, width]);

  useEffect(() => {
    move(activeKey, true);
  }, [activeKey, move]);

  const onTabLayout = useCallback((id: string, layout: { x: number; width: number }) => {
    layouts.current.set(id, layout);
    if (id === activeKey) move(id, ready.current);
  }, [activeKey, move]);

  return { onTabLayout, style: { left, width } };
}
