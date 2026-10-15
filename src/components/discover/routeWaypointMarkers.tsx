import { StyleSheet, Text, View } from 'react-native';
import type { Theme } from '../../theme/theme';
import { MONO } from '../../theme/fonts';
import { clusterWaypoints } from '../maps/waypointClusters';
import { trackWorldSpan } from '../maps/extent';
import { measureTrack, positionAtDistance } from '../../lib/routeSegments';
import type { MapCoordinate, NativeMapMarker } from '../maps/types';

export interface ProjectedRouteWaypoint {
  name: string;
  km: number;
  coord: MapCoordinate;
}

/** Place the library's `{name, km}` annotations along the geometry as drawn.
 *  `flipKm` means the track is being rendered reversed, so a waypoint's mileage
 *  counts back from the original finish. Positions come from true distance
 *  along the track (`measureTrack`), not from a vertex-index ratio. */
export function projectRouteWaypoints(
  drawnCoords: MapCoordinate[],
  waypoints: { name: string; km: number }[],
  flipKm = false,
): ProjectedRouteWaypoint[] {
  const measure = measureTrack(drawnCoords);
  if (!measure) return [];
  return waypoints.map((waypoint) => {
    const meters = flipKm
      ? Math.max(0, measure.totalMeters - waypoint.km * 1000)
      : waypoint.km * 1000;
    return {
      name: waypoint.name,
      km: waypoint.km,
      coord: positionAtDistance(measure, meters).coordinate,
    };
  });
}

/** Clustering density to use before the camera has reported a zoom: the zoom
 *  the track fills its opening box at. Mirrors TrackMap's first-frame estimate. */
export function estimateRouteWaypointZoom(
  trackCoords: MapCoordinate[],
  widthPx: number,
  heightPx: number,
): number {
  const span = trackWorldSpan(trackCoords);
  if (!span || widthPx < 1 || heightPx < 1) return 11;
  return Math.min(20, Math.log2(Math.min(
    widthPx / Math.max(span.width, 1e-12),
    heightPx / Math.max(span.height, 1e-12),
  ) / 256));
}

export function buildRouteWaypointMarkers({
  theme,
  waypoints,
  zoom,
  selected,
  onWaypointPress,
  onClusterPress,
}: {
  theme: Theme;
  waypoints: ProjectedRouteWaypoint[];
  zoom: number;
  selected: number | null;
  onWaypointPress: (index: number) => void;
  onClusterPress: (coordinates: MapCoordinate[]) => void;
}): NativeMapMarker[] {
  if (!waypoints.length) return [];
  const groups = clusterWaypoints(waypoints.map((waypoint) => waypoint.coord), zoom);
  const values: NativeMapMarker[] = [];
  groups.forEach((group) => {
    const index = group.indices[0];
    const waypoint = waypoints[index];
    if (group.indices.length > 1) {
      values.push({
        // Android snapshots marker content by id, so the count lives in it.
        id: `route-wp-cluster-${group.indices[0]}-${group.indices.length}`,
        coordinate: group.coordinate,
        anchor: { x: 0.5, y: 1 },
        centerOffset: { x: 0, y: -18 },
        zIndex: 2,
        // A group expands the map; it never silently picks one member.
        onPress: () => onClusterPress(group.indices.map((member) => waypoints[member].coord)),
        content: (
          <View style={styles.clusterAnchor}>
            <View style={[styles.clusterBadge, { backgroundColor: theme.surfaceTop, borderColor: theme.hairline }]}>
              <Text style={{ fontFamily: MONO, fontSize: 12, fontWeight: '700', color: theme.text }}>{group.indices.length}</Text>
            </View>
            <View style={[styles.clusterStem, { backgroundColor: theme.text3 }]} />
          </View>
        ),
      });
      return;
    }
    values.push({
      id: `route-wp-${index}`,
      coordinate: waypoint.coord,
      // The name rides on the map, not behind a tap: the pill sits over the
      // dot like the kilometre labels do. Bottom anchor keeps the dot itself
      // at the waypoint's position whatever the label length.
      anchor: { x: 0.5, y: 1 },
      centerOffset: { x: 0, y: -6 },
      zIndex: 1,
      title: waypoint.name,
      onPress: () => onWaypointPress(index),
      content: (
        <View style={styles.waypointPillWrap}>
          {waypoint.name ? (
            <View style={[styles.waypointLabel, { backgroundColor: theme.dark ? 'rgba(30,32,34,0.9)' : 'rgba(255,255,255,0.94)', borderColor: theme.hairline }]}>
              <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: '700', color: theme.text }}>{waypoint.name}</Text>
            </View>
          ) : null}
          <View style={[styles.waypointMarker, { borderColor: theme.accent }]} />
        </View>
      ),
    });
  });
  if (selected != null && waypoints[selected]) {
    const waypoint = waypoints[selected];
    values.push({
      id: `route-wp-callout-${selected}`,
      coordinate: waypoint.coord,
      // Lift the bubble clear of both the dot and its now-always-visible name
      // pill; the dot stays the anchor of the whole stack.
      anchor: { x: 0.5, y: 1 },
      centerOffset: { x: 0, y: -28 },
      zIndex: 6,
      content: (
        <View style={{ alignItems: 'center', paddingBottom: 10 }}>
          <View style={[styles.callout, { backgroundColor: theme.surfaceTop, borderColor: theme.border }]}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: theme.text2 }}>{waypoint.km.toFixed(1)} km</Text>
          </View>
        </View>
      ),
    });
  }
  return values;
}

const styles = StyleSheet.create({
  clusterAnchor: { alignItems: 'center' },
  clusterBadge: { minWidth: 30, height: 30, paddingHorizontal: 7, borderRadius: 15, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  clusterStem: { width: 1, height: 6 },
  waypointMarker: { width: 13, height: 13, borderRadius: 7, backgroundColor: '#FFFFFF', borderWidth: 3 },
  waypointPillWrap: { alignItems: 'center' },
  waypointLabel: { maxWidth: 150, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 9, marginBottom: 4, borderWidth: StyleSheet.hairlineWidth },
  callout: { maxWidth: 220, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth },
});
