// The map's distance scale, done the way Apple Maps does it: it shows up while
// the zoom changes, grows and steps through round distances with the pinch, and
// fades back out once the map settles. Panning alone never reveals it.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { motion, type } from '../../design-system';
import type { Theme } from '../../theme/theme';

const MAX_BAR_WIDTH = 120;
const SEGMENTS = 3;
const HIDE_DELAY_MS = 1600;
// Room past the bar's end for the last label's overhang and the unit.
const LABEL_HALF = 20;
// Web Mercator ground resolution at zoom 0 on the equator, for 256px tiles —
// the zoom convention both NativeMap implementations report.
const METERS_PER_PIXEL_Z0 = 156543.03392;
const NICE_STEPS = [1, 2, 5];

type Listener = (zoom: number, latitude: number) => void;

/**
 * Map zoom for a scale bar, kept out of React state: the screen hands over every
 * zoom frame, and only the bar itself re-renders. Both callbacks are stable.
 */
export function useMapScale() {
  const store = useRef({ zoom: NaN, latitude: 35, listeners: new Set<Listener>() }).current;
  const onZoom = useCallback((zoom: number) => {
    if (!Number.isFinite(zoom) || Math.abs(zoom - store.zoom) < 0.001) return;
    const first = !Number.isFinite(store.zoom);
    store.zoom = zoom;
    // The first report is the map settling at launch, not the user zooming.
    if (!first) store.listeners.forEach((listener) => listener(zoom, store.latitude));
  }, [store]);
  const onLatitude = useCallback((latitude: number) => {
    if (Number.isFinite(latitude)) store.latitude = latitude;
  }, [store]);
  return { scale: store, onZoom, onLatitude };
}

export type MapScaleStore = ReturnType<typeof useMapScale>['scale'];

function niceStep(maxMeters: number) {
  const magnitude = 10 ** Math.floor(Math.log10(maxMeters));
  let step = magnitude;
  for (const factor of NICE_STEPS) if (factor * magnitude <= maxMeters) step = factor * magnitude;
  return step;
}

function measure(zoom: number, latitude: number) {
  const metersPerPixel = (METERS_PER_PIXEL_Z0 * Math.cos((latitude * Math.PI) / 180)) / 2 ** zoom;
  const step = niceStep((MAX_BAR_WIDTH * metersPerPixel) / SEGMENTS);
  return { step, segmentWidth: Math.round(step / metersPerPixel) };
}

function label(meters: number, km: boolean) {
  if (!km) return String(meters);
  const value = meters / 1000;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** Right-aligned scale bar: alternating segments with round distances above. */
export function MapScaleBar({ scale, theme }: { scale: MapScaleStore; theme: Theme }) {
  const [reading, setReading] = useState<{ step: number; segmentWidth: number } | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const listener: Listener = (zoom, latitude) => {
      const next = measure(zoom, latitude);
      setReading((current) => (current && current.step === next.step && current.segmentWidth === next.segmentWidth ? current : next));
      Animated.timing(opacity, { toValue: 1, duration: motion.quick, useNativeDriver: true }).start();
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: motion.standard, useNativeDriver: true }).start();
      }, HIDE_DELAY_MS);
    };
    scale.listeners.add(listener);
    return () => {
      scale.listeners.delete(listener);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [opacity, scale]);

  if (!reading) return null;
  const { step, segmentWidth } = reading;
  const km = step * SEGMENTS >= 1000;
  const halo = { textShadowColor: theme.controlSurface, textShadowRadius: 3, textShadowOffset: { width: 0, height: 0 } };
  return (
    <Animated.View pointerEvents="none" style={{ opacity, alignItems: 'flex-end' }}>
      <View style={{ width: segmentWidth * SEGMENTS + LABEL_HALF, height: 14 }}>
        {Array.from({ length: SEGMENTS + 1 }, (_, index) => (
          <Text
            key={index}
            allowFontScaling={false}
            numberOfLines={1}
            style={[type.caption, halo, {
              position: 'absolute',
              left: index * segmentWidth - LABEL_HALF,
              width: LABEL_HALF * 2,
              textAlign: 'center',
              color: theme.text,
              fontWeight: '600',
              fontVariant: ['tabular-nums'],
            }]}
          >
            {label(index * step, km)}
          </Text>
        ))}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', borderRadius: 2, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: theme.text2 }}>
          {Array.from({ length: SEGMENTS }, (_, index) => (
            <View key={index} style={{ width: segmentWidth, height: 4, backgroundColor: index % 2 === 0 ? theme.text : theme.controlSurface }} />
          ))}
        </View>
        <Text allowFontScaling={false} style={[type.caption, halo, { width: LABEL_HALF, textAlign: 'right', color: theme.text, fontWeight: '600' }]}>
          {km ? 'km' : 'm'}
        </Text>
      </View>
    </Animated.View>
  );
}
