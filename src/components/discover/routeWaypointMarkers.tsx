import { StyleSheet, Text, View } from 'react-native';
import { radius, space } from '../../design-system';
import type { Theme } from '../../theme/theme';
import { MONO } from '../../theme/fonts';
import { clusterWaypoints, projectWaypointPixels, type WaypointCluster } from '../maps/waypointClusters';
import { trackWorldSpan } from '../maps/extent';
import { measureTrack, positionAtDistance } from '../../lib/routeSegments';
import type { MapCoordinate, NativeMapMarker } from '../maps/types';
import type { MarkDetailItem } from '../trail/MarkDetail';

export interface ProjectedRouteWaypoint {
  name: string;
  km: number;
  coord: MapCoordinate;
  /** Ring colour; the accent when absent. Lets several tracks share one layer. */
  color?: string;
  /** A photo was taken there: the dot is filled, so it reads as more to see. */
  photo?: boolean;
}

/** Place the library's `{name, km}` annotations along the geometry as drawn.
 *  `flipKm` means the track is being rendered reversed, so a waypoint's mileage
 *  counts back from the original finish. Positions come from true distance
 *  along the track (`measureTrack`), not from a vertex-index ratio. */
function projectRouteWaypoints(
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

/** A waypoint as a track's library stores it: where it was marked when that is
 *  known, otherwise its distance along the line. */
export type WaypointSource = { name: string; km: number; lng?: number; lat?: number; ele?: number; photo?: string; at?: string };

/** One line's waypoints, on the geometry as the map draws it. */
export interface WaypointLayerLine {
  /** Keeps marker ids and detail keys apart when several lines share the map. */
  key: string;
  coords: MapCoordinate[];
  waypoints: WaypointSource[];
  /** Ring colour of this line's dots. */
  color: string;
  elevation?: { km: number; ele: number }[];
  /** The line's chip in the detail sheet, where the map shows more than one. */
  source?: { name: string; color: string };
  /** Drawn back to front, so a waypoint's mileage counts from the original finish. */
  flipKm?: boolean;
}

export interface WaypointLayer {
  /** Every line's spots in one list, which is what the markers are built from. */
  list: ProjectedRouteWaypoint[];
  /** The same spots as detail items, index for index with `list`. */
  details: MarkDetailItem[];
  /** Where each line sits in those two, so a tap swipes through its own line. */
  lines: { start: number; end: number }[];
}

/** A track's named spots on its line: where they were marked when that is
 *  known, otherwise their distance along it. */
function placeWaypoints(
  coords: MapCoordinate[],
  waypoints: WaypointSource[],
  color: string,
  flipKm = false,
): { marker: ProjectedRouteWaypoint; waypoint: WaypointSource }[] {
  const projected = projectRouteWaypoints(coords, waypoints, flipKm);
  return waypoints.flatMap((waypoint, index) => {
    const coord: MapCoordinate | undefined = waypoint.lng != null && waypoint.lat != null ? [waypoint.lng, waypoint.lat] : projected[index]?.coord;
    return coord ? [{ marker: { name: waypoint.name, km: waypoint.km, coord, color, photo: !!waypoint.photo }, waypoint }] : [];
  });
}

/** Height at a distance along the line, from its km/ele profile. */
function elevationAtKm(profile: { km: number; ele: number }[] | undefined, km: number): number | null {
  if (!profile?.length) return null;
  if (km <= profile[0].km) return profile[0].ele;
  for (let i = 1; i < profile.length; i += 1) {
    const b = profile[i];
    if (km > b.km) continue;
    const a = profile[i - 1];
    return b.km === a.km ? b.ele : a.ele + ((b.ele - a.ele) * (km - a.km)) / (b.km - a.km);
  }
  return profile[profile.length - 1].ele;
}

/** Place several lines' waypoints as one layer: the markers the map draws, and
 *  the detail sheet's items for the same taps. */
export function buildWaypointLayer(lines: WaypointLayerLine[]): WaypointLayer {
  const list: ProjectedRouteWaypoint[] = [];
  const details: MarkDetailItem[] = [];
  const placed: { start: number; end: number }[] = [];
  for (const line of lines) {
    const totalMeters = measureTrack(line.coords)?.totalMeters ?? 0;
    const start = list.length;
    placeWaypoints(line.coords, line.waypoints, line.color, line.flipKm).forEach(({ marker, waypoint }, index) => {
      list.push(marker);
      details.push({
        key: `${line.key}-${index}`,
        name: waypoint.name,
        photo: waypoint.photo,
        at: waypoint.at,
        alongM: line.flipKm ? Math.max(0, totalMeters - waypoint.km * 1000) : waypoint.km * 1000,
        lng: marker.coord[0],
        lat: marker.coord[1],
        ele: waypoint.ele ?? elevationAtKm(line.elevation, waypoint.km),
        source: line.source,
      });
    });
    if (list.length > start) placed.push({ start, end: list.length });
  }
  return { list, details, lines: placed };
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
 *  another pill, badge, or dot. Names are claimed in track order, so the same
 *  names win at a given zoom. */
function placeWaypointLabels(
  waypoints: ProjectedRouteWaypoint[],
  groups: WaypointCluster[],
  zoom: number,
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
  const placed = new Set<number>();
  const gap = 3;
  for (const index of candidates) {
    const { x, y } = pixels[index];
    const half = labelWidth(waypoints[index].name) / 2;
    // The pill sits 3pt above the 9pt dot, which is lifted 4pt off the anchor.
    const box = { left: x - half, right: x + half, top: y - 37, bottom: y - 16 };
    const blocked = obstacles.some((other) => other.owner !== index
      && box.left < other.right + gap && other.left < box.right + gap
      && box.top < other.bottom + gap && other.top < box.bottom + gap);
    if (blocked) continue;
    placed.add(index);
    obstacles.push({ ...box, owner: index });
  }
  return placed;
}

/** Number waypoints in the direction being walked: 1 goes to the spot nearest
 *  the current start along `alongM`, so reversing the line renumbers them.
 *  Ties keep list order. Index for index with the layer's `list`/`details`, so
 *  the map circles and a card's list can share these numbers. */
export function waypointOrder(details: { alongM?: number }[]): number[] {
  return details
    .map((detail, index) => ({ alongM: detail.alongM ?? 0, index }))
    .sort((a, b) => a.alongM - b.alongM || a.index - b.index)
    .reduce<number[]>((numbers, entry, rank) => { numbers[entry.index] = rank + 1; return numbers; }, []);
}

/** The range text a numbered cluster shows: `3–5` when its members sit next to
 *  each other in the walking order, otherwise just how many they are. */
function clusterRangeText(numbers: number[]): string {
  const sorted = [...numbers].sort((a, b) => a - b);
  const consecutive = sorted.every((value, position) => value === sorted[0] + position);
  return consecutive && sorted.length > 1 ? `${sorted[0]}–${sorted[sorted.length - 1]}` : `${sorted.length}`;
}

/** Marker ids end up in Android's content snapshot cache, so anything that
 *  changes what is drawn has to be in the id. Ranges hold spaces and en
 *  dashes; this keeps the id to path-safe characters. */
function idToken(value: string): string {
  return value.replace(/[^0-9A-Za-z]+/g, '');
}

export function buildRouteWaypointMarkers({
  theme,
  waypoints,
  zoom,
  onWaypointPress,
  onClusterPress,
  idPrefix = 'route-wp',
  variant = 'labelled',
  numbers,
}: {
  theme: Theme;
  waypoints: ProjectedRouteWaypoint[];
  zoom: number;
  onWaypointPress: (index: number) => void;
  onClusterPress: (coordinates: MapCoordinate[]) => void;
  /** Keeps ids apart when another layer of the same markers is on the map. */
  idPrefix?: string;
  /** `labelled` draws the white dot with a name pill; `numbered` draws a
   *  solid accent circle with the walking-order index and no names. */
  variant?: 'labelled' | 'numbered';
  /** Per-waypoint numbers for `numbered`, index for index with `waypoints`
   *  (see `waypointOrder`). Falls back to list position plus one. */
  numbers?: number[];
}): NativeMapMarker[] {
  if (!waypoints.length) return [];
  const groups = clusterWaypoints(waypoints.map((waypoint) => waypoint.coord), zoom);
  const numbered = variant === 'numbered';
  const labelled = numbered ? null : placeWaypointLabels(waypoints, groups, zoom);
  const values: NativeMapMarker[] = [];
  groups.forEach((group) => {
    const index = group.indices[0];
    const waypoint = waypoints[index];
    if (group.indices.length > 1) {
      const clusterText = numbered ? clusterRangeText(group.indices.map((member) => numbers?.[member] ?? member + 1)) : `${group.indices.length}`;
      if (numbered) {
        values.push({
          // The pill shows the range, so the range is the snapshot key.
          id: `${idPrefix}-cluster-n-${group.indices[0]}-${idToken(clusterText)}`,
          coordinate: group.coordinate,
          // The pill reads as one big numbered circle: centred on the group.
          anchor: { x: 0.5, y: 0.5 },
          zIndex: 2,
          onPress: () => onClusterPress(group.indices.map((member) => waypoints[member].coord)),
          content: (
            <View style={[styles.numberedCluster, { backgroundColor: theme.accent }]}>
              <Text style={styles.numberedText}>{clusterText}</Text>
            </View>
          ),
        });
        return;
      }
      values.push({
        // Android snapshots marker content by id, so the count lives in it.
        id: `${idPrefix}-cluster-${group.indices[0]}-${group.indices.length}`,
        coordinate: group.coordinate,
        anchor: { x: 0.5, y: 1 },
        centerOffset: { x: 0, y: -12 },
        zIndex: 2,
        // A group expands the map; it never silently picks one member.
        onPress: () => onClusterPress(group.indices.map((member) => waypoints[member].coord)),
        content: (
          <View style={styles.clusterAnchor}>
            <View style={[styles.clusterBadge, { backgroundColor: theme.surfaceTop, borderColor: theme.hairline }]}>
              <Text style={{ fontFamily: MONO, fontSize: 10, fontWeight: '700', color: theme.text }}>{clusterText}</Text>
            </View>
            <View style={[styles.clusterStem, { backgroundColor: theme.text3 }]} />
          </View>
        ),
      });
      return;
    }
    if (numbered) {
      const number = numbers?.[index] ?? index + 1;
      values.push({
        // The number is what's drawn, so it is part of the snapshot key.
        id: `${idPrefix}-n-${index}-${idToken(String(number))}`,
        coordinate: waypoint.coord,
        // A bottom anchor with the circle's radius lifted back down puts the
        // circle's centre exactly on the point (iOS offsets by the anchor).
        anchor: { x: 0.5, y: 1 },
        centerOffset: { x: 0, y: -8.5 },
        zIndex: 1,
        title: waypoint.name,
        onPress: () => onWaypointPress(index),
        content: (
          <View style={styles.waypointPillWrap}>
            <View style={[styles.numberedMarker, { backgroundColor: theme.accent }]}>
              <Text style={styles.numberedText}>{number}</Text>
            </View>
          </View>
        ),
      });
      return;
    }
    const showName = labelled!.has(index);
    values.push({
      // Android snapshots marker content by id, so whether the name shows and the photo fill do too.
      id: `${idPrefix}-${index}${showName ? '' : '-dot'}${waypoint.photo ? '-photo' : ''}`,
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
          <View style={[styles.waypointMarker, { borderColor: waypoint.color ?? theme.accent }, waypoint.photo && { backgroundColor: waypoint.color ?? theme.accent, borderColor: '#FFFFFF', width: 11, height: 11, borderRadius: 5.5 }]} />
        </View>
      ),
    });
  });
  return values;
}

const styles = StyleSheet.create({
  clusterAnchor: { alignItems: 'center' },
  clusterBadge: { minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  clusterStem: { width: 1, height: 4 },
  waypointMarker: { width: 9, height: 9, borderRadius: 4.5, backgroundColor: '#FFFFFF', borderWidth: 2 },
  numberedMarker: { width: 17, height: 17, borderRadius: 8.5, borderWidth: 1.5, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  numberedCluster: { minHeight: 17, minWidth: 17, paddingHorizontal: space.xs, borderRadius: radius.pill, borderWidth: 1.5, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  numberedText: { fontSize: 10, fontWeight: '700', color: '#FFFFFF' },
  waypointPillWrap: { alignItems: 'center' },
  waypointLabel: { maxWidth: 150, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 9, marginBottom: 3, borderWidth: StyleSheet.hairlineWidth },
});
