// The map's compass, done the way Apple Maps does it: hidden while the map is
// north-up, revealed by a twist, its dial turning with the map so the north
// marker always sits on real north, and a tap levels the map before it fades back out.
// Zooming and panning never reveal it — that is the reset/locate button's job.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Text } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';
import { motion } from '../../design-system';
import { useT } from '../../i18n';
import { useTheme } from '../../theme/AppearanceContext';

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

// komoot's dial: a thin tick every 30°, solid at E/S/W and faint between; the
// north tick is replaced by the marker. Drawn in a 40-unit box, the button size.
const DIAL_TICKS = [30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];

/**
 * The compass dial, turned against the map heading as one piece — ticks, the
 * red north marker and the 北 letter — so the marker always sits on real north.
 */
export function MapCompassGlyph({ heading, color, size = 40 }: { heading: Animated.Value; color: string; size?: number }) {
  const theme = useTheme();
  const t = useT();
  const rotate = heading.interpolate({ inputRange: [-360, 360], outputRange: ['360deg', '-360deg'] });
  return (
    <Animated.View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', transform: [{ rotate }] }}>
      <Svg width={size} height={size} viewBox="0 0 40 40" style={{ position: 'absolute' }}>
        {DIAL_TICKS.map((deg) => (
          <Line
            key={deg}
            x1={20}
            y1={5.2}
            x2={20}
            y2={9.4}
            stroke={deg % 90 === 0 ? color : theme.text3}
            strokeWidth={1.25}
            strokeLinecap="round"
            transform={`rotate(${deg} 20 20)`}
          />
        ))}
        <Path d="M20 4.6 22.6 9.2 17.4 9.2Z" fill={theme.danger} stroke={theme.danger} strokeWidth={0.6} strokeLinejoin="round" />
      </Svg>
      <Text allowFontScaling={false} style={{ color, fontSize: 12.5 * (size / 40), fontWeight: '600', includeFontPadding: false }}>
        {t('journey.map.compassNorth')}
      </Text>
    </Animated.View>
  );
}
