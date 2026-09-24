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

export const PHOTO_SIZE = 40;
const ACTIVE_SCALE = 1.08;
const PHOTO_RADIUS = 8;

export const PHOTO_PIN_WIDTH = 116;
export const PHOTO_PIN_HEIGHT = 70;
export const PHOTO_PIN_ANCHOR_Y = (PHOTO_SIZE / 2) / PHOTO_PIN_HEIGHT;

export function photoPinScaleForZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return 0.65 + Math.max(0, Math.min(1, (zoom - 3) / 8)) * 0.35;
}

export function PhotoPin({ theme, poi, active, mapScale = 1, staticRender = false, entranceDelayMs }: {
  theme: Theme;
  poi: GlobePoi;
  active?: boolean;
  mapScale?: number | Animated.Value;
  /** Avoid transforms when a native map snapshots this view into a bitmap. */
  staticRender?: boolean;
  /** per-index entrance delay so pins pop in one-by-one on the first data load */
  entranceDelayMs?: number;
}) {
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

  // First-appearance pop-in: when a delay is given the pin springs from
  // scale 0 after it (same rhythm as the card list's StaggerIn). The delay
  // is captured at mount, so later re-renders never replay the entrance.
  const entranceDelay = useRef(entranceDelayMs).current;
  const entrance = useRef(new Animated.Value(entranceDelay === undefined ? 1 : 0)).current;
  useEffect(() => {
    if (entranceDelay === undefined) return;
    const entranceAnim = Animated.sequence([
      Animated.delay(entranceDelay),
      Animated.spring(entrance, {
        toValue: 1,
        useNativeDriver: true,
        bounciness: 7,
        speed: 14,
      }),
    ]);
    entranceAnim.start();
    // Safety net: if a platform's marker content doesn't animate live, the
    // pin still becomes visible instead of staying frozen at scale 0.
    const fallback = setTimeout(() => entrance.setValue(1), entranceDelay + 900);
    return () => {
      entranceAnim.stop();
      clearTimeout(fallback);
    };
  }, [entrance, entranceDelay]);

  return (
    <View style={{ width: PHOTO_PIN_WIDTH, height: PHOTO_PIN_HEIGHT }}>
    <Animated.View
      style={{
        width: PHOTO_PIN_WIDTH,
        height: PHOTO_PIN_HEIGHT,
        alignItems: 'center',
        // Scale around the photo center so its geographic anchor stays fixed.
        transformOrigin: staticRender ? undefined : [PHOTO_PIN_WIDTH / 2, PHOTO_SIZE / 2, 0],
        transform: staticRender ? undefined : [{ scale: Animated.multiply(Animated.multiply(scale, mapScale), entrance) }],
        opacity: staticRender ? 1 : entrance,
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
            minWidth: 52,
            maxWidth: PHOTO_PIN_WIDTH,
            minHeight: 28,
            marginTop: -7,
            paddingTop: 8,
            paddingBottom: 3,
            paddingHorizontal: 6,
            borderRadius: 999,
            borderCurve: 'continuous',
            backgroundColor: theme.dark ? theme.surfaceStrong : '#FFFFFF',
            borderWidth: theme.dark ? 1 : 0,
            borderColor: theme.hairline,
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: theme.dark ? '0px 2px 4px rgba(0,0,0,0.38)' : '0px 2px 4px rgba(0,0,0,0.09)',
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
    </View>
  );
}
