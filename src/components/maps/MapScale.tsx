// The map's distance scale, done the way Apple Maps does it: it shows up while
// the zoom changes, grows and steps through round distances with the pinch, and
// fades back out once the map settles. Panning alone never reveals it. On iOS
// it is Apple's own MKScaleView; the drawn bar stands in on Android and on
// binaries that predate the native module.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Text, View } from 'react-native';
import { motion, type } from '../../design-system';
import type { Theme } from '../../theme/theme';
import { useT } from '../../i18n';
import { NativeMapScale } from '../../../modules/map-scale';

const MAX_BAR_WIDTH = 140;
// MKScaleView's look: a round total split in two, labelled at both ends and the
// middle, the unit riding on the last number.
const SEGMENTS = 2;
const BAR_HEIGHT = 4;
const LABEL_WIDTH = 48;
// Below this the middle reading would run into its neighbours.
const MIDDLE_LABEL_MIN_WIDTH = 100;
const HIDE_DELAY_MS = 1600;
// Room for MKScaleView's widest reading and its legend; it right-aligns inside.
const NATIVE_SIZE = { width: 200, height: 32 };
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

// The total snaps to a round distance and the bar's length follows the zoom
// between snaps, so it grows with a pinch and jumps back at each new reading.
function measure(zoom: number, latitude: number) {
  const metersPerPixel = (METERS_PER_PIXEL_Z0 * Math.cos((latitude * Math.PI) / 180)) / 2 ** zoom;
  const total = niceStep(MAX_BAR_WIDTH * metersPerPixel);
  return { total, width: Math.round(total / metersPerPixel) };
}

function label(meters: number, km: boolean) {
  const value = km ? meters / 1000 : meters;
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

/** Right-aligned scale bar: alternating segments with round distances above. */
export function MapScaleBar({ scale, theme }: { scale: MapScaleStore; theme: Theme }) {
  if (NativeMapScale) {
    return <NativeMapScale pointerEvents="none" colorScheme={theme.dark ? 'dark' : 'light'} style={NATIVE_SIZE} />;
  }
  return <DrawnMapScaleBar scale={scale} theme={theme} />;
}

function DrawnMapScaleBar({ scale, theme }: { scale: MapScaleStore; theme: Theme }) {
  const t = useT();
  const [reading, setReading] = useState<{ total: number; width: number } | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const listener: Listener = (zoom, latitude) => {
      const next = measure(zoom, latitude);
      setReading((current) => (current && current.total === next.total && current.width === next.width ? current : next));
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
  const { total, width } = reading;
  const km = total >= 1000;
  const unit = t(km ? 'journey.map.scaleKilometers' : 'journey.map.scaleMeters');
  const segmentWidth = width / SEGMENTS;
  // Apple outlines its legend and bar in the map's contrast colour rather than
  // drawing a plate behind them.
  const halo = { textShadowColor: theme.controlSurface, textShadowRadius: 2, textShadowOffset: { width: 0, height: 0 } };
  const text = [type.caption, halo, { position: 'absolute' as const, color: theme.text, fontWeight: '600' as const, fontVariant: ['tabular-nums' as const] }];
  return (
    <Animated.View pointerEvents="none" style={{ opacity, alignItems: 'flex-end' }}>
      {/* Trailing legend, as MKScaleView lays it out on the right: 0 sits on the
          bar's start, the middle reading on its tick, the last one with its unit
          ends flush with the bar. */}
      <View style={{ width, height: 15 }}>
        <Text allowFontScaling={false} numberOfLines={1} style={[...text, { left: 0 }]}>0</Text>
        {width >= MIDDLE_LABEL_MIN_WIDTH ? (
          <Text
            allowFontScaling={false}
            numberOfLines={1}
            style={[...text, { left: segmentWidth - LABEL_WIDTH / 2, width: LABEL_WIDTH, textAlign: 'center' }]}
          >
            {label(total / SEGMENTS, km)}
          </Text>
        ) : null}
        <Text allowFontScaling={false} numberOfLines={1} style={[...text, { right: 0, width: LABEL_WIDTH * 2, textAlign: 'right' }]}>
          {`${label(total, km)} ${unit}`}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', width, height: BAR_HEIGHT, borderWidth: 1, borderColor: theme.controlSurface, backgroundColor: theme.controlSurface }}>
        {Array.from({ length: SEGMENTS }, (_, index) => (
          <View key={index} style={{ flex: 1, backgroundColor: index % 2 === 0 ? theme.text : theme.controlSurface }} />
        ))}
      </View>
    </Animated.View>
  );
}
