// trailKmMarkers.tsx — kilometre labels along the line the 徒步导航 page follows.
//
// The route card's labels (MapGlobe's `distanceMarkers`) on the trail map: the
// same pill over a dot, the same density per zoom and the same cap, so a route
// reads the same on both pages. They stop short of the finish, which carries
// its 终 badge here.
import { StyleSheet, Text, View } from 'react-native';
import { measureTrack, positionAtDistance } from '../../lib/routeSegments';
import type { Theme } from '../../theme/theme';
import type { MapCoordinate, NativeMapMarker } from '../maps/types';

const MAX_LABELS = 60;
const NICE_STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200];

/** Label spacing for a zoom, as on the route card. */
export function kmStepForZoom(zoom: number): number {
  return zoom < 8 ? 50 : zoom < 11 ? 10 : zoom < 13 ? 5 : 1;
}

export function buildTrailKmMarkers({ theme, coords, stepKm, idPrefix, color }: {
  theme: Theme;
  coords: MapCoordinate[];
  stepKm: number;
  idPrefix: string;
  /** The line's own colour, for the dot; the followed route's is the accent. */
  color?: string;
}): NativeMapMarker[] {
  const measure = measureTrack(coords);
  if (!measure || measure.totalMeters < 1000) return [];
  const usable = measure.totalMeters - 120;
  const totalKm = measure.totalMeters / 1000;
  // A line shorter than the zoom's spacing would get no label at all; as on the
  // route card, it falls back to a spacing it can carry.
  let step = stepKm < totalKm ? stepKm : totalKm <= 10 ? 1 : totalKm <= 50 ? 5 : 10;
  if (usable / 1000 / step > MAX_LABELS) {
    const minStep = Math.ceil(usable / 1000 / MAX_LABELS);
    step = NICE_STEPS.find((each) => each >= minStep) ?? Math.ceil(minStep / 50) * 50;
  }
  const values: NativeMapMarker[] = [];
  for (let km = step; km * 1000 < usable; km += step) {
    values.push({
      id: `${idPrefix}-${step}-${km}`,
      coordinate: positionAtDistance(measure, km * 1000).coordinate,
      anchor: { x: 0.5, y: 1 },
      zIndex: 1,
      content: (
        <View style={styles.wrap}>
          <View style={[styles.pill, { backgroundColor: theme.dark ? 'rgba(30,32,34,0.9)' : 'rgba(255,255,255,0.94)' }]}>
            <Text style={[styles.text, { color: theme.text }]}>{km} km</Text>
          </View>
          <View style={[styles.dot, { backgroundColor: color ?? theme.accent }]} />
        </View>
      ),
    });
  }
  return values;
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  pill: { minWidth: 38, paddingHorizontal: 6, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', shadowColor: '#000000', shadowOpacity: 0.16, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  text: { fontSize: 9.5, lineHeight: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  dot: { width: 5, height: 5, marginTop: -1, borderRadius: 3, borderWidth: 1.5, borderColor: '#FFFFFF' },
});
