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

// Between the old 40px photo (a wall of pins country-wide) and 28px (too small
// to read once the map opens on one province).
export const PHOTO_SIZE = 34;
const ACTIVE_SCALE = 1.08;
const PHOTO_RADIUS = 6;

export const PHOTO_PIN_WIDTH = 112;
export const PHOTO_PIN_HEIGHT = 58;
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
    <View
      collapsable={false}
      style={{
        width: PHOTO_PIN_WIDTH,
        height: PHOTO_PIN_HEIGHT,
        // AMap (expo-gaode-map MarkerBitmapRenderer) sizes the baked bitmap from
        // the union of views that draw something, then crops that size from the
        // frame's top-left corner. A label narrower than the photo's right edge
        // cut the photo in half and shifted the anchor. A practically invisible
        // fill makes the whole frame count, so the crop is the frame.
        backgroundColor: staticRender ? 'rgba(255,255,255,0.004)' : undefined,
      }}
    >
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
          backgroundColor: poi.muted ? theme.fieldSurface : palette[1],
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
            backgroundColor: poi.muted ? theme.fieldSurface : palette[1],
          }}
          contentFit="cover"
        />
        {poi.muted ? (
          // A wash rather than a grayscale filter: the filter renders every pin
          // offscreen on iOS, which stutters with the whole catalog on the map.
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: PHOTO_SIZE,
              height: PHOTO_SIZE,
              borderRadius: PHOTO_RADIUS,
              backgroundColor: theme.dark ? 'rgba(28,28,30,0.62)' : 'rgba(255,255,255,0.62)',
            }}
          />
        ) : null}
        {count ? (
          <View
            style={{
              position: 'absolute',
              top: -4,
              right: -5,
              minWidth: 15,
              height: 15,
              paddingHorizontal: 3.5,
              borderRadius: 7.5,
              backgroundColor: theme.accent,
              borderWidth: 1.5,
              borderColor: '#fff',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: '#fff', fontSize: 8.5, fontWeight: '800', lineHeight: 10 }}>{count}</Text>
          </View>
        ) : null}
      </View>

      {poi.label ? (
        <View
          style={{
            minWidth: 40,
            maxWidth: PHOTO_PIN_WIDTH,
            height: 23,
            marginTop: -5,
            paddingTop: 5,
            paddingHorizontal: 7,
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
            numberOfLines={1}
            style={{
              color: poi.muted ? theme.text3 : theme.text,
              fontSize: 12.5,
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
