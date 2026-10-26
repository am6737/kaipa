// The map's compass, done the way Apple Maps does it: hidden while the map is
// north-up, revealed by a twist, its needle turning with the map so it always
// points at real north, and a tap levels the map before it fades back out.
// Zooming and panning never reveal it — that is the reset/locate button's job.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated } from 'react-native';
import { motion } from '../../design-system';
import { Icon } from '../Icon';

// A fitted camera can settle a fraction of a degree askew, and a compass
// flickering in on every one of those reads as a bug.
const NORTH_TOLERANCE_DEG = 4;
// Apple leaves the levelled compass up for a beat before it fades.
const HIDE_DELAY_MS = 450;

function headingOffNorth(heading: number) {
  const turned = ((heading % 360) + 360) % 360;
  return Math.min(turned, 360 - turned) > NORTH_TOLERANCE_DEG;
}

/**
 * Map heading for a compass. The degrees go straight into an Animated.Value so
 * a two-finger twist turns the needle without re-rendering the screen; only
 * crossing the north tolerance becomes state. `onOrientation` is stable, so it
 * can be handed to a memoized map.
 */
export function useMapHeading() {
  const heading = useRef(new Animated.Value(0)).current;
  const [offNorth, setOffNorth] = useState(false);
  const onOrientation = useCallback((degrees: number) => {
    heading.setValue(degrees);
    const off = headingOffNorth(degrees);
    setOffNorth((current) => (current === off ? current : off));
  }, [heading]);
  return { heading, offNorth, onOrientation };
}

/** Springs the compass in when `visible` turns on; holds, then fades it out. */
export function MapCompassReveal({ visible, children }: { visible: boolean; children: React.ReactNode }) {
  const reveal = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.spring(reveal, { toValue: 1, useNativeDriver: true, ...motion.pageSpring }).start();
      return;
    }
    const fade = Animated.timing(reveal, { toValue: 0, duration: motion.standard, delay: HIDE_DELAY_MS, useNativeDriver: true });
    fade.start(({ finished }) => { if (finished) setMounted(false); });
    return () => fade.stop();
  }, [reveal, visible]);

  if (!mounted) return null;
  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={{ opacity: reveal, transform: [{ scale: reveal.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] }) }] }}
    >
      {children}
    </Animated.View>
  );
}

/** The compass glyph turned against the map heading, so its red needle stays on north. */
export function MapCompassGlyph({ heading, color, size = 18 }: { heading: Animated.Value; color: string; size?: number }) {
  const rotate = heading.interpolate({ inputRange: [-360, 360], outputRange: ['360deg', '-360deg'] });
  return (
    <Animated.View style={{ transform: [{ rotate }] }}>
      <Icon name="compassN" color={color} size={size} />
    </Animated.View>
  );
}
