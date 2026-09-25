// TrackPointPicker.tsx — putting an itinerary place on a recorded track.
//
// The map already draws the track and its marked points, so picking a place is
// tapping that line: the tap snaps to the nearest point of the path and is kept
// as a distance along it. A chart scrub would be the same act through a curve
// most hiking files do not even carry, so the line itself is the control.
import React, { useMemo, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme } from '../../theme/theme';
import { useI18n } from '../../i18n';
import { Press } from '../Press';
import { Icon } from '../Icon';
import { TrackMap } from './TrackMap';
import type { TimelineLocation } from '../../data/timeline';
import {
  elevationAtMeters,
  trackLocation,
  type JourneyTrack,
  type JourneyTrackPoint,
} from '../../lib/journeyTracks';
import { projectOnTrack } from '../../lib/routeSegments';

const kmOf = (meters: number) => (meters / 1000).toFixed(1);

export function TrackPointPickerSheet({ theme, tracks, onClose, onPick }: {
  theme: Theme;
  tracks: JourneyTrack[];
  onClose: () => void;
  onPick: (location: TimelineLocation) => void;
}) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const [track, setTrack] = useState<JourneyTrack | undefined>(tracks.length === 1 ? tracks[0] : undefined);
  const [point, setPoint] = useState<JourneyTrackPoint | undefined>(undefined);

  const waypoints = useMemo(() => (track?.waypoints ?? []).map((waypoint) => ({
    name: waypoint.name,
    coord: waypoint.coordinate,
    km: waypoint.meters / 1000,
  })), [track]);

  const tapLine = (coordinate: [number, number]) => {
    if (!track) return;
    const position = projectOnTrack(track.measure, coordinate);
    if (!position) return;
    const meters = position.distanceMeters;
    setPoint({
      name: t('journey.timeline.trackPointName', { km: kmOf(meters) }),
      meters,
      coordinate: position.coordinate,
      elevation: elevationAtMeters(track, meters),
    });
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: theme.dark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.45)' }}>
        <Pressable onPress={onClose} style={{ flex: 1 }} accessibilityRole="button" />
        <View style={{
          backgroundColor: theme.surfaceTop, borderTopLeftRadius: 28, borderTopRightRadius: 28,
          paddingBottom: Math.max(insets.bottom, 12), overflow: 'hidden',
        }}>
          <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 }}>
            {track ? (
              <Press accessibilityRole="button" onPress={() => { setTrack(undefined); setPoint(undefined); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Icon name="chevronL" size={16} color={theme.text2} />
                <Text style={{ fontSize: 15.5, color: theme.text2 }}>{t('journey.timeline.trackBack')}</Text>
              </Press>
            ) : <View style={{ width: 1 }} />}
            <Text numberOfLines={1} style={{ fontSize: 15.5, fontWeight: '700', color: theme.text, marginHorizontal: 10 }}>
              {track ? track.name : t('journey.timeline.trackChooseTitle')}
            </Text>
            <Press
              accessibilityRole="button"
              onPress={onClose}
              hitSlop={10}
              style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.fieldSurface }}
            >
              <Icon name="close" size={13} color={theme.text2} strokeWidth={2.2} />
            </Press>
          </View>

          {track ? (
            <>
              <View style={{ height: 300 }}>
                <TrackMap
                  coords={track.coords}
                  theme={theme}
                  fill
                  rounded={false}
                  showLegend={false}
                  interactive
                  waypoints={waypoints}
                  showWaypoints
                  accent={theme.accent}
                  scrubPt={point?.coordinate}
                  onMapPress={tapLine}
                  onWaypointPress={(waypoint) => {
                    const match = track.waypoints.find((item) => item.coordinate === waypoint.coord);
                    if (match) setPoint(match);
                  }}
                />
              </View>
              <View style={{ minHeight: 62, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, gap: 12 }}>
                <View style={{ flex: 1 }}>
                  {point ? (
                    <>
                      <Text numberOfLines={1} style={{ fontSize: 14.5, fontWeight: '700', color: theme.text }}>{point.name}</Text>
                      <Text numberOfLines={1} style={{ fontSize: 11.5, color: theme.text3, marginTop: 2 }}>
                        {t('journey.timeline.trackPointName', { km: kmOf(point.meters) })}
                        {point.elevation != null ? ` · ${Math.round(point.elevation)} m` : ''}
                      </Text>
                    </>
                  ) : (
                    <Text style={{ fontSize: 13.5, color: theme.text3 }}>{t('journey.timeline.trackPointHint')}</Text>
                  )}
                </View>
                <Press
                  accessibilityRole="button"
                  onPress={() => { if (track && point) onPick(trackLocation(track, point)); }}
                  style={{
                    height: 40, borderRadius: 20, paddingHorizontal: 18, justifyContent: 'center',
                    backgroundColor: point ? theme.accent : theme.fieldSurface,
                  }}
                >
                  <Text style={{ fontSize: 14.5, fontWeight: '700', color: point ? '#FFFFFF' : theme.text3 }}>
                    {t('journey.timeline.trackPointConfirm')}
                  </Text>
                </Press>
              </View>
            </>
          ) : (
            <View style={{ paddingHorizontal: 18, paddingBottom: 6 }}>
              {tracks.map((item) => (
                <Press
                  key={item.id}
                  accessibilityRole="button"
                  onPress={() => { setTrack(item); setPoint(undefined); }}
                  style={{ paddingVertical: 13 }}
                >
                  <Text numberOfLines={1} style={{ fontSize: 18, fontWeight: '700', color: theme.text }}>{item.name}</Text>
                  <Text numberOfLines={1} style={{ fontSize: 13, color: theme.text3, marginTop: 5 }}>
                    {t('journey.timeline.trackMeta', { km: kmOf(item.totalMeters), points: item.waypoints.length })}
                  </Text>
                </Press>
              ))}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}
