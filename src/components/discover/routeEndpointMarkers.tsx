import { StyleSheet, Text, View } from 'react-native';
import type { Theme } from '../../theme/theme';
import type { MapCoordinate, NativeMapMarker } from '../maps/types';

/**
 * The open route's trailheads, labelled 起/终 so the map itself says which way
 * the route is walked. Tapping the finish offers to start from there, which is
 * how the direction is reversed; a loop has one trailhead, so its only marker
 * offers the opposite turning sense instead.
 */
export function buildRouteEndpointMarkers({
  theme,
  drawnCoords,
  loop,
  labels,
  actionOpen,
  onEndpointPress,
  onActionPress,
}: {
  theme: Theme;
  /** The track in the direction being walked. */
  drawnCoords: MapCoordinate[];
  loop: boolean;
  labels: { start: string; finish: string; action: string };
  actionOpen: boolean;
  onEndpointPress: () => void;
  onActionPress: () => void;
}): NativeMapMarker[] {
  const start = drawnCoords[0];
  const finish = drawnCoords[drawnCoords.length - 1];
  if (!start || !finish) return [];
  // The marker that carries the action: the finish, or a loop's only trailhead.
  const actionAt = loop ? start : finish;
  const values: NativeMapMarker[] = [{
    id: `route-endpoint-start-${labels.start}`,
    coordinate: start,
    anchor: { x: 0.5, y: 0.5 },
    zIndex: 3,
    ...(loop ? { onPress: onEndpointPress } : {}),
    content: <EndpointBadge color="#34C759" label={labels.start} />,
  }];
  if (!loop) {
    values.push({
      id: `route-endpoint-finish-${labels.finish}`,
      coordinate: finish,
      anchor: { x: 0.5, y: 0.5 },
      zIndex: 3,
      onPress: onEndpointPress,
      content: <EndpointBadge color={theme.danger} label={labels.finish} />,
    });
  }
  if (actionOpen) {
    values.push({
      // Android snapshots marker content by id, so the wording lives in it.
      id: `route-endpoint-action-${labels.action}`,
      coordinate: actionAt,
      anchor: { x: 0.5, y: 1 },
      centerOffset: { x: 0, y: -12 },
      zIndex: 6,
      onPress: onActionPress,
      content: (
        <View style={{ alignItems: 'center', paddingBottom: 10 }}>
          <View style={[styles.callout, { backgroundColor: theme.surfaceTop, borderColor: theme.border }]}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: theme.accent }}>{labels.action}</Text>
          </View>
        </View>
      ),
    });
  }
  return values;
}

export function EndpointBadge({ color, label }: { color: string; label: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: color }]}>
      <Text style={styles.badgeText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', shadowColor: '#000000', shadowOpacity: 0.16, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  badgeText: { fontSize: 9, lineHeight: 11, fontWeight: '800', color: '#FFFFFF' },
  // The waypoint bubble's shape, a little taller because this one is a button.
  callout: { minHeight: 36, paddingHorizontal: 12, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
});
