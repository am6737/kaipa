// distanceMarkers.tsx — the "N km" pills drawn along a track.
//
// The route card on the globe and the track detail map draw the same labels,
// so the step rule and the pill live here.
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Theme } from '../../theme/theme';

// A long route at high zoom would otherwise build one distance marker per
// km (hundreds of custom marker bitmaps), and rebuilding them all when the
// zoom crosses a step bucket causes a visible stutter — worst on Android
// where each marker content is re-snapshotted into a bitmap.
export const MAX_DISTANCE_MARKERS = 60;

export function cappedStepKm(stepKm: number, totalMeters: number): number {
  const slots = Math.floor((totalMeters - 120) / 1000 / stepKm);
  if (slots <= MAX_DISTANCE_MARKERS) return stepKm;
  // Round the minimum step up to a "nice" km value so labels stay readable.
  const minStep = Math.ceil((totalMeters - 120) / 1000 / MAX_DISTANCE_MARKERS);
  const niceSteps = [1, 2, 5, 10, 20, 25, 50, 100, 200];
  return niceSteps.find((step) => step >= minStep) ?? Math.ceil(minStep / 50) * 50;
}

/** A step that keeps a whole track, fitted to the screen, at about ten labels. */
export function distanceStepForLength(totalMeters: number): number {
  const totalKm = totalMeters / 1000;
  return cappedStepKm(totalKm <= 10 ? 1 : totalKm <= 50 ? 5 : 10, totalMeters);
}

/** The pill alone; callers add the dot or spacer that suits their anchor. */
export function DistancePill({ theme, label }: { theme: Theme; label: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: theme.dark ? 'rgba(30,32,34,0.9)' : 'rgba(255,255,255,0.94)' }]}>
      <Text style={[styles.text, { color: theme.text }]}>{label}</Text>
    </View>
  );
}

/** Pill over an accent dot, anchored at the dot: { x: 0.5, y: 1 }. */
export function DistanceMarker({ theme, label }: { theme: Theme; label: string }) {
  return (
    // Let Android measure the marker from its content. A fixed width here is in
    // RN dp but the native marker snapshot is density-scaled, making the pill
    // unexpectedly wide on high-density devices.
    <View style={styles.wrap}>
      <DistancePill theme={theme} label={label} />
      <View style={[styles.dot, { backgroundColor: theme.accent }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  pill: { minWidth: 38, paddingHorizontal: 6, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', shadowColor: '#000000', shadowOpacity: 0.16, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  text: { fontSize: 9.5, lineHeight: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  dot: { width: 5, height: 5, marginTop: -1, borderRadius: 3, borderWidth: 1.5, borderColor: '#FFFFFF' },
});
