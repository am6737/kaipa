// Full-screen track picker: the map stays behind a compact confirmation card;
// the complete waypoint list opens only when needed.
import React, { useMemo, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme } from '../../theme/theme';
import { useI18n } from '../../i18n';
import { Press } from '../Press';
import { Icon } from '../Icon';
import { CircleBtn } from '../CircleBtn';
import { layout, radius, space, type } from '../../design-system';
import { MONO } from '../../theme/fonts';
import { NATIVE_MAP_AVAILABLE } from '../maps/NativeMap';
import { useMapPresentation } from '../maps/MapPresentationContext';
import { TrackMap, type TrackMapHandle } from './TrackMap';
import type { TimelineLocation } from '../../data/timeline';
import { trackPointAtCoordinate, trackLocation, type JourneyTrack, type JourneyTrackPoint } from '../../lib/journeyTracks';

const kmOf = (meters: number) => (meters / 1000).toFixed(1);

class PickerMapBoundary extends React.Component<{ children: React.ReactNode; fallback: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export function TrackPointPickerSheet({ theme, tracks, onClose, onPick }: {
  theme: Theme;
  tracks: JourneyTrack[];
  onClose: () => void;
  onPick: (location: TimelineLocation) => void;
}) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { mapStyle, mapLabelsVisible } = useMapPresentation();
  const mapRef = useRef<TrackMapHandle>(null);
  const [track, setTrack] = useState<JourneyTrack | undefined>(tracks[0]);
  const [point, setPoint] = useState<JourneyTrackPoint>();
  const [panel, setPanel] = useState<'waypoints' | 'tracks' | null>(null);
  const [query, setQuery] = useState('');
  const [cardHeight, setCardHeight] = useState(136);
  const bottom = Math.max(insets.bottom, space.sm);
  const sortedPoints = useMemo(() => [...(track?.waypoints ?? [])].sort((a, b) => a.meters - b.meters), [track]);
  const waypoints = useMemo(() => sortedPoints.map((waypoint) => ({ name: waypoint.name, coord: waypoint.coordinate, km: waypoint.meters / 1000 })), [sortedPoints]);
  const filteredPoints = useMemo(() => sortedPoints.map((item, index) => ({ item, index })).filter(({ item }) => item.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), [query, sortedPoints]);
  // Keep the whole line above both the confirmation card and waypoint entry.
  // On a short/landscape screen reserve a usable map band first.
  const routePadding = useMemo<[number, number, number, number]>(() => {
    const top = Math.min(insets.top + layout.iconButton + space.xxl, height * 0.28);
    return [top, 48, Math.min(bottom + cardHeight + 72, Math.max(28, height - top - 140)), 48];
  }, [bottom, cardHeight, height, insets.top]);

  const closePanel = () => { Keyboard.dismiss(); setPanel(null); setQuery(''); };
  const close = () => { Keyboard.dismiss(); onClose(); };
  const pickWaypoint = (waypoint: JourneyTrackPoint, focus: boolean) => {
    setPoint(waypoint);
    closePanel();
    if (focus) mapRef.current?.focusPoint(waypoint.coordinate);
  };
  const tapMap = (coordinate: [number, number], name?: string) => {
    if (!track) return;
    const position = trackPointAtCoordinate(track, coordinate);
    if (!position) return;
    setPoint({
      name: name?.trim() || t('journey.timeline.trackPointName', { km: kmOf(position.meters) }),
      ...position,
    });
  };
  const fallback = (
    <View style={[styles.fallback, { paddingTop: insets.top + 110, paddingBottom: bottom + cardHeight + 80 }]}>
      <Icon name="route" size={32} color={theme.text3} />
      <Text style={{ color: theme.text2, textAlign: 'center', lineHeight: 22, marginTop: 12 }}>{t('journey.timeline.trackMapUnavailable')}</Text>
    </View>
  );
  const pointMeta = (item: JourneyTrackPoint) => `${t('journey.timeline.trackPointName', { km: kmOf(item.meters) })}${item.elevation != null ? ` · ${Math.round(item.elevation)} m` : ''}`;

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={panel ? closePanel : close}>
      <View style={{ flex: 1, backgroundColor: theme.bg }}>
        {track && NATIVE_MAP_AVAILABLE ? (
          <PickerMapBoundary key={track.id} fallback={fallback}>
            <TrackMap
              key={track.id}
              ref={mapRef}
              coords={track.coords}
              theme={theme}
              fill
              rounded={false}
              showLegend={false}
              interactive
              waypoints={waypoints}
              showWaypoints
              clusterWaypoints
              numberWaypoints
              showWaypointCallout={false}
              mapStyle={mapStyle}
              showMapLabels={mapLabelsVisible}
              accent={theme.accent}
              routePadding={routePadding}
              scrubPt={point?.coordinate}
              onMapPress={tapMap}
              onPoiPress={(poi) => tapMap(poi.coordinate, poi.name)}
              onWaypointPress={(waypoint) => {
                const match = sortedPoints.find((item) => item.coordinate === waypoint.coord);
                if (match) pickWaypoint(match, false);
              }}
            />
          </PickerMapBoundary>
        ) : fallback}

        <View style={[styles.header, { top: insets.top + space.sm }]}>
          <Press accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={close} style={styles.backButton}>
            <Icon name="chevronL" size={25} color={theme.text} />
          </Press>
        </View>

        <Press
          accessibilityRole="button"
          accessibilityState={{ expanded: panel === 'waypoints' }}
          onPress={() => { setQuery(''); setPanel('waypoints'); }}
          style={[styles.waypointEntry, { bottom: bottom + cardHeight + space.md, backgroundColor: theme.controlSurface, borderColor: theme.fieldBorder, boxShadow: theme.dark ? '0px 4px 12px rgba(0,0,0,0.38)' : '0px 4px 12px rgba(0,0,0,0.08)' }]}
        >
          <Text style={{ fontSize: 12, fontWeight: '600', color: theme.text }}>{t('journey.timeline.trackAllWaypoints')}</Text>
          <Text style={{ fontFamily: MONO, fontSize: 11.5, color: theme.text3 }}>{sortedPoints.length}</Text>
          <Icon name="chevronR" size={13} color={theme.text3} />
        </Press>

        <View onLayout={(event) => setCardHeight(event.nativeEvent.layout.height)} style={[styles.confirmCard, { bottom, backgroundColor: theme.dark ? 'rgba(20,20,22,0.90)' : 'rgba(255,255,255,0.94)', borderColor: theme.border, boxShadow: theme.dark ? '0px 8px 24px rgba(0,0,0,0.48)' : '0px 8px 24px rgba(0,0,0,0.15)' }]}>
          <Press
            disabled={tracks.length < 2}
            accessibilityRole="button"
            accessibilityLabel={tracks.length > 1 ? t('journey.timeline.trackBack') : track?.name}
            onPress={() => { setQuery(''); setPanel('tracks'); }}
            style={[styles.routeTitle, { borderBottomColor: theme.border }]}
          >
            <Text numberOfLines={1} style={[type.cardTitle, { flex: 1, color: theme.text2 }]}>{track?.name ?? t('journey.timeline.trackChooseTitle')}</Text>
            {tracks.length > 1 ? <Icon name="chevronDown" size={15} color={theme.text3} /> : null}
          </Press>
          <View style={styles.pointSummary}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
                <Icon name="pin" size={17} color={point ? theme.accent : theme.text3} />
                <Text numberOfLines={2} style={[type.cardTitle, { flex: 1, color: theme.text }]}>{point?.name ?? t('journey.timeline.trackPointEmpty')}</Text>
              </View>
              <Text numberOfLines={2} style={[type.caption, { fontFamily: point ? MONO : undefined, lineHeight: 17, color: theme.text3, marginTop: space.xs }]}>{point ? pointMeta(point) : t('journey.timeline.trackPickerHint')}</Text>
            </View>
            <Press
              disabled={!track || !point}
              accessibilityRole="button"
              accessibilityState={{ disabled: !track || !point }}
              onPress={() => { if (track && point) { Keyboard.dismiss(); onPick(trackLocation(track, point)); } }}
              style={[styles.confirmButton, { backgroundColor: point ? theme.accent : theme.fieldSurface }]}
            >
              <Text style={[type.cardTitle, { color: point ? '#FFFFFF' : theme.text3 }]}>{t('journey.timeline.trackPointConfirm')}</Text>
            </Press>
          </View>
        </View>

        {panel ? (
          <KeyboardAvoidingView style={StyleSheet.absoluteFill} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={closePanel} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.22)' }]} />
            <View pointerEvents="box-none" style={{ flex: 1, justifyContent: 'flex-end', paddingTop: insets.top + space.md }}>
              <View style={[styles.listPanel, { maxHeight: Math.min(height * 0.65, 560), paddingBottom: bottom, backgroundColor: theme.bg, borderColor: theme.border }]}>
                <View style={[styles.handle, { backgroundColor: theme.dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)' }]} />
                <View style={styles.listHeader}>
                  <Text style={[type.sectionTitle, { color: theme.text }]}>{panel === 'tracks' ? t('journey.timeline.trackChooseTitle') : t('journey.timeline.trackAllWaypoints')}</Text>
                  <CircleBtn theme={theme} name="close" noShadow accessibilityLabel={t('common.close')} onPress={closePanel} />
                </View>
                {panel === 'waypoints' && sortedPoints.length > 0 ? (
                  <View style={[styles.search, { backgroundColor: theme.fieldSurface }]}>
                    <Icon name="search" size={16} color={theme.text3} />
                    <TextInput value={query} onChangeText={setQuery} placeholder={t('journey.timeline.trackSearchWaypoints')} placeholderTextColor={theme.text3} accessibilityLabel={t('journey.timeline.trackSearchWaypoints')} autoCorrect={false} style={{ flex: 1, minWidth: 0, color: theme.text, paddingVertical: 0, fontSize: type.body.fontSize }} />
                    {query ? <Press onPress={() => setQuery('')} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('journey.timeline.placeSearchClear')}><Icon name="close" size={14} color={theme.text2} /></Press> : null}
                  </View>
                ) : null}
                <ScrollView style={{ borderRadius: radius.card, overflow: 'hidden' }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ paddingBottom: space.sm }}>
                  {panel === 'tracks' ? tracks.map((item) => (
                    <Press key={item.id} accessibilityRole="button" accessibilityState={{ selected: item === track }} onPress={() => { setTrack(item); setPoint(undefined); closePanel(); }} style={[styles.row, { borderBottomColor: theme.hairline, backgroundColor: item === track ? theme.accentSoft : theme.surfaceTop }]}>
                      <Icon name="route" size={20} color={item === track ? theme.accent : theme.text2} />
                      <View style={{ flex: 1 }}>
                        <Text numberOfLines={2} style={[type.cardTitle, { color: theme.text }]}>{item.name}</Text>
                        <Text style={[type.caption, { fontFamily: MONO, color: theme.text2, marginTop: space.xxs }]}>{t('journey.timeline.trackMeta', { km: kmOf(item.totalMeters), points: item.waypoints.length })}</Text>
                      </View>
                      {item === track ? <Icon name="check" size={18} color={theme.accent} /> : null}
                    </Press>
                  )) : filteredPoints.map(({ item, index }) => {
                    const selected = point === item;
                    return (
                      <Press key={index} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => pickWaypoint(item, true)} style={[styles.row, { borderBottomColor: theme.hairline, backgroundColor: selected ? theme.accentSoft : theme.surfaceTop }]}>
                        <View style={[styles.number, { backgroundColor: selected ? theme.accent : theme.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}><Text style={{ color: selected ? '#FFFFFF' : theme.text2, fontFamily: MONO, fontSize: 11, fontWeight: '700' }}>{index + 1}</Text></View>
                        <View style={{ flex: 1 }}>
                          <Text numberOfLines={2} style={[type.cardTitle, { fontSize: 14, color: theme.text }]}>{item.name}</Text>
                          <Text style={[type.caption, { fontFamily: MONO, fontSize: 11, color: theme.text2, marginTop: space.xxs }]}>{pointMeta(item)}</Text>
                        </View>
                        {selected ? <Icon name="check" size={18} color={theme.accent} /> : null}
                      </Press>
                    );
                  })}
                  {panel === 'waypoints' && filteredPoints.length === 0 ? <Text style={[styles.empty, { color: theme.text2 }]}>{t(sortedPoints.length ? 'journey.timeline.trackNoWaypointMatch' : 'journey.timeline.trackNoWaypoints')}</Text> : null}
                </ScrollView>
              </View>
            </View>
          </KeyboardAvoidingView>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: { position: 'absolute', left: space.sm },
  routeTitle: { minHeight: layout.iconButton, paddingBottom: space.xs, marginBottom: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: space.xs },
  backButton: { width: layout.iconButton, height: layout.iconButton, alignItems: 'center', justifyContent: 'center' },
  waypointEntry: { position: 'absolute', left: space.md, minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: space.xs, borderRadius: radius.pill, paddingHorizontal: space.sm, borderWidth: StyleSheet.hairlineWidth },
  confirmCard: { position: 'absolute', left: space.sm, right: space.sm, borderRadius: radius.feature, paddingHorizontal: space.md, paddingVertical: space.sm, borderWidth: StyleSheet.hairlineWidth },
  pointSummary: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: layout.iconButton },
  confirmButton: { minWidth: 88, minHeight: layout.fieldHeight, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.md, paddingVertical: space.xs },
  listPanel: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: space.md, flexShrink: 1, borderWidth: StyleSheet.hairlineWidth },
  handle: { width: 36, height: 5, borderRadius: 3, alignSelf: 'center', marginTop: space.sm, marginBottom: 6 },
  listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm, marginBottom: space.md },
  search: { minHeight: layout.fieldHeight, paddingHorizontal: space.sm, borderRadius: radius.control, flexDirection: 'row', alignItems: 'center', gap: space.xs, marginBottom: space.md },
  row: { minHeight: layout.listRowMinHeight, paddingVertical: space.sm, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: space.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  number: { width: 28, height: 28, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  empty: { paddingVertical: space.xxl, fontSize: type.body.fontSize, lineHeight: 21, textAlign: 'center' },
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xxxl },
});
