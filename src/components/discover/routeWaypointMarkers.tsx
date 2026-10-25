import { StyleSheet, Text, View } from 'react-native';
import type { Theme } from '../../theme/theme';
import { MONO } from '../../theme/fonts';
import { clusterWaypoints, projectWaypointPixels, type WaypointCluster } from '../maps/waypointClusters';
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

/** Rough on-screen width of a name pill (11pt bold, 8pt side padding, capped
 *  by `waypointLabel.maxWidth`); only used to decide which names fit. */
function labelWidth(name: string): number {
  let text = 0;
  for (const char of name) text += char.charCodeAt(0) > 0x2e7f ? 11.5 : 6.8;
  return Math.min(150, text + 18);
}

/** Which lone waypoints keep their name pill at this zoom. Dots and count
 *  badges are always drawn; a name is dropped only when its pill would cover
 *  another pill, badge, or dot. The selected waypoint always keeps its name,
 *  the rest go in track order, so the same names win at a given zoom. */
function placeWaypointLabels(
  waypoints: ProjectedRouteWaypoint[],
  groups: WaypointCluster[],
  zoom: number,
  selected: number | null,
): Set<number> {
  const pixels = projectWaypointPixels(waypoints.map((waypoint) => waypoint.coord), zoom);
  type Box = { left: number; right: number; top: number; bottom: number; owner: number };
  const obstacles: Box[] = [];
  const candidates: number[] = [];
  groups.forEach((group) => {
    const { x, y } = pixels[group.indices[0]];
    if (group.indices.length > 1) {
      obstacles.push({ left: x - 12, right: x + 12, top: y - 26, bottom: y, owner: -1 });
      return;
    }
    obstacles.push({ left: x - 5, right: x + 5, top: y - 5, bottom: y + 5, owner: group.indices[0] });
    if (waypoints[group.indices[0]].name) candidates.push(group.indices[0]);
  });
  if (selected != null && candidates.includes(selected)) {
    candidates.splice(candidates.indexOf(selected), 1);
    candidates.unshift(selected);
  }
  const placed = new Set<number>();
  const gap = 3;
  for (const index of candidates) {
    const { x, y } = pixels[index];
    const half = labelWidth(waypoints[index].name) / 2;
    // The pill sits 3pt above the 9pt dot, which is lifted 4pt off the anchor.
    const box = { left: x - half, right: x + half, top: y - 37, bottom: y - 16 };
    // The selection callout stacks on the pill, so the selected name always shows.
    const blocked = index !== selected && obstacles.some((other) => other.owner !== index
      && box.left < other.right + gap && other.left < box.right + gap
      && box.top < other.bottom + gap && other.top < box.bottom + gap);
    if (blocked) continue;
    placed.add(index);
    obstacles.push({ ...box, owner: index });
  }
  return placed;
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
  const labelled = placeWaypointLabels(waypoints, groups, zoom, selected);
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
        centerOffset: { x: 0, y: -12 },
        zIndex: 2,
        // A group expands the map; it never silently picks one member.
        onPress: () => onClusterPress(group.indices.map((member) => waypoints[member].coord)),
        content: (
          <View style={styles.clusterAnchor}>
            <View style={[styles.clusterBadge, { backgroundColor: theme.surfaceTop, borderColor: theme.hairline }]}>
              <Text style={{ fontFamily: MONO, fontSize: 10, fontWeight: '700', color: theme.text }}>{group.indices.length}</Text>
            </View>
            <View style={[styles.clusterStem, { backgroundColor: theme.text3 }]} />
          </View>
        ),
      });
      return;
    }
    const showName = labelled.has(index);
    values.push({
      // Android snapshots marker content by id, so whether the name shows does too.
      id: showName ? `route-wp-${index}` : `route-wp-${index}-dot`,
      coordinate: waypoint.coord,
      // The name rides on the map, not behind a tap: the pill sits over the
      // dot like the kilometre labels do, unless it would cover a neighbour.
      // Bottom anchor keeps the dot itself at the waypoint's position whatever
      // the label length.
      anchor: { x: 0.5, y: 1 },
      centerOffset: { x: 0, y: -4 },
      zIndex: 1,
      title: waypoint.name,
      onPress: () => onWaypointPress(index),
      content: (
        <View style={styles.waypointPillWrap}>
          {showName ? (
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
      centerOffset: { x: 0, y: -24 },
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
  clusterBadge: { minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  clusterStem: { width: 1, height: 4 },
  waypointMarker: { width: 9, height: 9, borderRadius: 4.5, backgroundColor: '#FFFFFF', borderWidth: 2 },
  waypointPillWrap: { alignItems: 'center' },
  waypointLabel: { maxWidth: 150, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 9, marginBottom: 3, borderWidth: StyleSheet.hairlineWidth },
  callout: { maxWidth: 220, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth },
});
