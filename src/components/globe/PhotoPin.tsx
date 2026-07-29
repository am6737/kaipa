// PhotoPin.tsx — the circular photo marker shared by both the real Mapbox globe
// and the SVG fallback. It renders only the circular photo marker and shadow;
// each globe wraps it in its own positioning
// (MarkerView coordinate vs. absolute orthographic projection).
//
// The photo is the real scenery image picked deterministically from the POI's
// tone + id (same source PhotoTile uses), so a given POI always shows the same
// shot. While it loads — or if it fails offline — the tone palette mid-stop sits
// behind it so the pin is never blank.
import React, { useEffect, useRef } from 'react';
import { View, Text, Animated } from 'react-native';
import { Image } from 'expo-image';
import { Theme } from '../../theme/theme';
import { GlobePoi, poiColor } from './types';
import { paletteFor, photoUrlFor } from '../../data/tones';

const BASE = 40;
const ACTIVE_SCALE = 1.3; // 40 * 1.3 = 52

export function PhotoPin({ theme, poi, active }: { theme: Theme; poi: GlobePoi; active?: boolean }) {
  const { fill } = poiColor(poi, theme);
  const ring = 2.5;
  const inner = BASE - ring * 2;
  const palette = paletteFor(poi.tone);
  const count = poi.count && poi.count > 1 ? poi.count : 0;

  const scale = useRef(new Animated.Value(active ? ACTIVE_SCALE : 1)).current;
  useEffect(() => {
    Animated.spring(scale, {
      toValue: active ? ACTIVE_SCALE : 1,
      useNativeDriver: true,
      bounciness: 8,
      speed: 14,
    }).start();
  }, [active]);

  return (
    <Animated.View
      style={{
        width: BASE,
        height: BASE,
        borderRadius: BASE / 2,
        backgroundColor: fill,
        padding: ring,
        boxShadow: theme.dark ? '0px 2px 6px rgba(0,0,0,0.45)' : '0px 2px 6px rgba(0,0,0,0.22)',
        transform: [{ scale }],
      }}
    >
      <Image
        source={{ uri: poi.coverUri || photoUrlFor(poi.tone, poi.id, 240) }}
        style={{ width: inner, height: inner, borderRadius: inner / 2, backgroundColor: palette[1] }}
      />
      {count ? (
        <View
          style={{
            position: 'absolute',
            top: -3,
            right: -3,
            minWidth: 17,
            height: 17,
            paddingHorizontal: 4,
            borderRadius: 8.5,
            backgroundColor: theme.accent,
            borderWidth: 1.5,
            borderColor: '#fff',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800', lineHeight: 13 }}>{count}</Text>
        </View>
      ) : null}
    </Animated.View>
  );
}
