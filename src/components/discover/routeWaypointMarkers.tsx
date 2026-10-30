import { StyleSheet, Text, View } from 'react-native';
import { radius, space } from '../../design-system';
import type { Theme } from '../../theme/theme';
import { MONO } from '../../theme/fonts';
import type { TrackWaypoint } from '../../data/pois';
import { clusterWaypoints, projectWaypointPixels, type WaypointCluster } from '../maps/waypointClusters';
import { trackWorldSpan } from '../maps/extent';
import { measureTrack, positionAtDistance } from '../../lib/routeSegments';
import { elevationAtKm } from '../../lib/routePreview';
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
export type WaypointSource = TrackWaypoint;

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
        highlight: waypoint.highlight,
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

/** The range text a numbered cluster shows and the snapshot-key tail for it:
 *  `3–5` when its members sit next to each other in the walking order,
 *  otherwise a localized count (`2 处`), because a bare count reads as one
 *  waypoint's number. The tail keeps a range apart from a count (`r` vs `c`:
 *  `2–5` and 25 spots would otherwise share `25`) and folds in the drawn
 *  text, so a language switch never reuses a stale Android snapshot. */
function numberedClusterText(numbers: number[], spotsLabel?: (n: number) => string): { text: string; key: string } {
  const sorted = [...numbers].sort((a, b) => a - b);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (sorted.length > 1 && sorted.every((value, position) => value === first + position)) {
    return { text: `${first}–${last}`, key: `r${first}_${last}` };
  }
  const text = spotsLabel?.(sorted.length) ?? `${sorted.length}`;
  return { text, key: `c${sorted.length}_${idToken(text)}` };
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
  hideIndex,
  clusterSpotsLabel,
}: {
  theme: Theme;
  waypoints: ProjectedRouteWaypoint[];
  zoom: number;
  onWaypointPress: (index: number) => void;
  onClusterPress: (coordinates: MapCoordinate[]) => void;
  /** Keeps ids apart when another layer of the same markers is on the map. */
  idPrefix?: string;
  /** `labelled` draws the white dot with a name pill; `numbered` draws a
   *  solid accent circle with the walking-order index and no names, and a
   *  stacked hollow pill for a cluster; `plain` draws the dots only — a route
   *  preview keeps the spots but drops the badges and the cluster counts, so
   *  the line is not covered in discs. */
  variant?: 'labelled' | 'numbered' | 'plain';
  /** Per-waypoint numbers for `numbered`, index for index with `waypoints`
   *  (see `waypointOrder`). Falls back to list position plus one. */
  numbers?: number[];
  /** The waypoint a drop pin already stands on: its own dot goes, so the pin
   *  replaces it instead of shading it. A cluster keeps its badge — the pin
   *  sits above it by z-order, and hiding the group would hide its members. */
  hideIndex?: number | null;
  /** Labels a non-consecutive `numbered` cluster's count ("2 处" / "2 spots"),
   *  so it can't be mistaken for one waypoint's number. Falls back to the
   *  bare count when the caller has no translation to pass. */
  clusterSpotsLabel?: (n: number) => string;
}): NativeMapMarker[] {
  if (!waypoints.length) return [];
  const groups = clusterWaypoints(waypoints.map((waypoint) => waypoint.coord), zoom);
  const plain = variant === 'plain';
  const numbered = variant === 'numbered';
  const labelled = numbered || plain ? null : placeWaypointLabels(waypoints, groups, zoom);
  const values: NativeMapMarker[] = [];
  groups.forEach((group) => {
    const index = group.indices[0];
    const waypoint = waypoints[index];
    if (group.indices.length === 1 && hideIndex === index) return;
    if (group.indices.length > 1) {
      if (plain) {
        values.push({
          id: `${idPrefix}-cluster-plain-${group.indices[0]}-${group.indices.length}`,
          coordinate: group.coordinate,
          anchor: { x: 0.5, y: 1 },
          centerOffset: { x: 0, y: -8 },
          zIndex: 1,
          onPress: () => onClusterPress(group.indices.map((member) => waypoints[member].coord)),
          content: (
            <View style={[styles.waypointMarker, { borderColor: waypoint.color ?? theme.accent, width: 14, height: 14, borderRadius: 7 }]} />
          ),
        });
        return;
      }
      if (numbered) {
        const cluster = numberedClusterText(group.indices.map((member) => numbers?.[member] ?? member + 1), clusterSpotsLabel);
        values.push({
          // Android snapshots marker content by id, so the look, the range or
          // count, and the drawn text all live in it.
          id: `${idPrefix}-cluster-s-${group.indices[0]}-${cluster.key}`,
          coordinate: group.coordinate,
          // A hollow pill with a second one peeking up-right: it reads as a
          // stack, which a single numbered circle never can. The wrapper pads
          // 3pt on every side, so the offset back pill is inside the snapshot
          // bounds (Android crops to the drawn views) and the front pill —
          // the visual subject — sits exactly centred on the group coordinate.
          anchor: { x: 0.5, y: 0.5 },
          zIndex: 2,
          onPress: () => onClusterPress(group.indices.map((member) => waypoints[member].coord)),
          content: (
            <View style={styles.numberedClusterWrap}>
              <View style={[styles.numberedClusterBack, { backgroundColor: theme.controlSurface, borderColor: theme.accent }]} />
              <View style={[styles.numberedClusterFront, { backgroundColor: theme.controlSurface, borderColor: theme.accent }]}>
                <Text style={[styles.numberedClusterText, { color: theme.accent }]}>{cluster.text}</Text>
              </View>
            </View>
          ),
        });
        return;
      }
      const clusterText = `${group.indices.length}`;
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
              <Text style={{ fontFamily: MONO, fontSize: 11, fontWeight: '700', color: theme.text }}>{clusterText}</Text>
            </View>
            <View style={[styles.clusterStem, { backgroundColor: theme.text3 }]} />
          </View>
        ),
      });
      return;
    }
    if (plain) {
      values.push({
        // Android snapshots marker content by id, so the photo fill is in it too.
        id: `${idPrefix}-plain-${index}${waypoint.photo ? '-photo' : ''}`,
        coordinate: waypoint.coord,
        anchor: { x: 0.5, y: 1 },
        centerOffset: { x: 0, y: -6 },
        zIndex: 1,
        title: waypoint.name,
        onPress: () => onWaypointPress(index),
        content: (
          <View style={[styles.waypointMarker, { borderColor: waypoint.color ?? theme.accent }, waypoint.photo && { backgroundColor: waypoint.color ?? theme.accent }]} />
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
        centerOffset: { x: 0, y: -10.5 },
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
      centerOffset: { x: 0, y: -6 },
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
          <View style={[styles.waypointMarker, { borderColor: waypoint.color ?? theme.accent }, waypoint.photo && { backgroundColor: waypoint.color ?? theme.accent, borderColor: '#FFFFFF', width: 14, height: 14, borderRadius: 7 }]} />
        </View>
      ),
    });
  });
  return values;
}

const styles = StyleSheet.create({
  clusterAnchor: { alignItems: 'center' },
  clusterBadge: { minWidth: 22, height: 22, paddingHorizontal: 5, borderRadius: 11, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  clusterStem: { width: 1, height: 4 },
  waypointMarker: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#FFFFFF', borderWidth: 2 },
  numberedMarker: { width: 21, height: 21, borderRadius: 10.5, borderWidth: 1.5, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  numberedText: { fontSize: 11.5, fontWeight: '700', color: '#FFFFFF' },
  // Hollow stacked cluster pill (numbered variant): the 3pt padding on every
  // side keeps the offset back pill inside Android's snapshot crop and the
  // front pill centred in the box. controlSurface is opaque in both themes —
  // surfaceTop is translucent in dark, which ghosts the map through it.
  numberedClusterWrap: { padding: 3 },
  numberedClusterBack: { position: 'absolute', left: 5, top: 0, right: 0, bottom: 5, borderRadius: radius.pill, borderWidth: 1.5, opacity: 0.9 },
  numberedClusterFront: { minWidth: 22, height: 22, paddingHorizontal: 5, borderRadius: radius.pill, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', shadowColor: '#000000', shadowOpacity: 0.16, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  numberedClusterText: { fontSize: 11.5, fontWeight: '700' },
  waypointPillWrap: { alignItems: 'center' },
  waypointLabel: { maxWidth: 150, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 9, marginBottom: 3, borderWidth: StyleSheet.hairlineWidth },
});
