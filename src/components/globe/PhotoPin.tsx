// PhotoPin.tsx — the rounded photo + capsule label marker shared by both the
// native map and the SVG fallback. Each renderer wraps it in its own positioning.
//
// The photo is the real scenery image picked deterministically from the POI's
// tone + id (same source PhotoTile uses), so a given POI always shows the same
// shot. While it loads — or if it fails offline — the tone palette mid-stop sits
// behind it so the pin is never blank.
import React, { useEffect, useRef } from 'react';
import { View, Text, Animated } from 'react-native';
import { Image } from 'expo-image';
import { Theme } from '../../theme/theme';
import { GlobePoi } from './types';
import { paletteFor, photoUrlFor } from '../../data/tones';

const PHOTO_SIZE = 34;
const ACTIVE_SCALE = 1.08;
const PHOTO_RADIUS = 8;

export const PHOTO_PIN_WIDTH = 116;
export const PHOTO_PIN_HEIGHT = 78;
export const PHOTO_PIN_ANCHOR_Y = 17 / PHOTO_PIN_HEIGHT;

export function PhotoPin({ theme, poi, active }: { theme: Theme; poi: GlobePoi; active?: boolean }) {
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
  }, [active, scale]);

  return (
    <Animated.View
      style={{
        width: PHOTO_PIN_WIDTH,
        height: PHOTO_PIN_HEIGHT,
        alignItems: 'center',
        transform: [{ scale }],
      }}
    >
      <View
        style={{
          width: PHOTO_SIZE,
          height: PHOTO_SIZE,
          borderRadius: PHOTO_RADIUS,
          backgroundColor: palette[1],
          zIndex: 2,
          boxShadow: theme.dark ? '0px 2px 5px rgba(0,0,0,0.4)' : '0px 2px 5px rgba(0,0,0,0.16)',
        }}
      >
        <Image
          source={{ uri: poi.coverUri || photoUrlFor(poi.tone, poi.id, 240) }}
          style={{
            width: PHOTO_SIZE,
            height: PHOTO_SIZE,
            borderRadius: PHOTO_RADIUS,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.9)',
            backgroundColor: palette[1],
          }}
          contentFit="cover"
        />
        {count ? (
          <View
            style={{
              position: 'absolute',
              top: -4,
              right: -5,
              minWidth: 16,
              height: 16,
              paddingHorizontal: 4,
              borderRadius: 8,
              backgroundColor: theme.accent,
              borderWidth: 1.5,
              borderColor: '#fff',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800', lineHeight: 11 }}>{count}</Text>
          </View>
        ) : null}
      </View>

      {poi.label ? (
        <View
          style={{
            minWidth: 74,
            maxWidth: PHOTO_PIN_WIDTH,
            minHeight: 40,
            marginTop: -10,
            paddingTop: 12,
            paddingBottom: 7,
            paddingHorizontal: 11,
            borderRadius: 999,
            borderCurve: 'continuous',
            backgroundColor: theme.dark ? theme.surfaceStrong : '#FFFFFF',
            borderWidth: theme.dark ? 1 : 0,
            borderColor: theme.hairline,
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: theme.dark ? '0px 2px 7px rgba(0,0,0,0.42)' : '0px 2px 7px rgba(0,0,0,0.12)',
          }}
        >
          <Text
            numberOfLines={2}
            style={{
              color: theme.text,
              fontSize: 12,
              lineHeight: 16,
              fontWeight: '600',
              textAlign: 'center',
            }}
          >
            {poi.label}
          </Text>
        </View>
      ) : null}
    </Animated.View>
  );
}
