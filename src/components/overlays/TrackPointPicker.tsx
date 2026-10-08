// Full-screen track picker: the map stays behind a compact confirmation card;
// the complete waypoint list opens only when needed.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme } from '../../theme/theme';
import { useI18n } from '../../i18n';
import { Press } from '../Press';
import { Icon } from '../Icon';
import { JourneyGroupPicker } from '../journey/JourneyGroupPicker';
import { layout, radius, space, type } from '../../design-system';
import { MONO } from '../../theme/fonts';
import { NATIVE_MAP_AVAILABLE } from '../maps/NativeMap';
import { useMapPresentation } from '../maps/MapPresentationContext';
import { TrackMap, type TrackMapHandle } from './TrackMap';
import type { TimelineLocation } from '../../data/timeline';
import { hasAmapGeocoding, reverseJourneyLocation } from '../../lib/amapGeocoding';
import { trackPointAtCoordinate, trackLocation, type JourneyTrack, type JourneyTrackPoint } from '../../lib/journeyTracks';

type PickedPoint = JourneyTrackPoint & { address?: string };

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
  const { t, resolved } = useI18n();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { mapStyle, mapLabelsVisible } = useMapPresentation();
  const mapRef = useRef<TrackMapHandle>(null);
  const [track, setTrack] = useState<JourneyTrack | undefined>(tracks[0]);
  const [point, setPoint] = useState<PickedPoint>();
  const [panel, setPanel] = useState<'waypoints' | 'tracks' | null>(null);
  const [query, setQuery] = useState('');
  const [resolving, setResolving] = useState(false);
  const locationRequest = useRef<AbortController | null>(null);
  useEffect(() => () => locationRequest.current?.abort(), []);
  const [cardHeight, setCardHeight] = useState(136);
  const bottom = Math.max(insets.bottom, space.sm);
  const panelBottom = Math.max(insets.bottom, space.md);
  const panelMaxHeight = Math.min(520, (height - insets.top) * 0.65);
  const [panelHeaderHeight, setPanelHeaderHeight] = useState(76);
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
  const close = () => { locationRequest.current?.abort(); Keyboard.dismiss(); onClose(); };
  const pickWaypoint = (waypoint: JourneyTrackPoint, focus: boolean) => {
    locationRequest.current?.abort();
    setResolving(false);
    setPoint(waypoint);
    closePanel();
    if (focus) mapRef.current?.focusPoint(waypoint.coordinate);
  };
  const tapMap = async (coordinate: [number, number], name?: string) => {
    if (!track) return;
    const position = trackPointAtCoordinate(track, coordinate);
    if (!position) return;
    locationRequest.current?.abort();
    const controller = new AbortController();
    locationRequest.current = controller;
    const placeName = name?.trim();
    const picked: PickedPoint = { ...position, name: placeName || t('journey.timeline.trackMapPointSelected') };
    setPoint(picked);
    if (!hasAmapGeocoding()) { setResolving(false); return; }
    setResolving(true);
    try {
      const location = await reverseJourneyLocation(coordinate[0], coordinate[1], resolved, controller.signal);
      if (controller.signal.aborted) return;
      // POI names come from the tapped native feature. Reverse lookup only adds
      // its address; background taps use the address without moving the point.
      setPoint({ ...picked, name: placeName || location.address || location.name || picked.name, address: location.address });
    } catch {
      // The exact selected coordinate is usable even when lookup is unavailable.
    } finally {
      if (!controller.signal.aborted) setResolving(false);
    }
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
              scrubLabel={point?.name}
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
            accessibilityRole="button"
            accessibilityLabel={t('journey.timeline.trackChooseTitle')}
            accessibilityState={{ expanded: panel === 'tracks' }}
            onPress={() => { setQuery(''); setPanel('tracks'); }}
            style={[styles.routeTitle, { borderBottomColor: theme.border }]}
          >
            <Text numberOfLines={1} style={[type.cardTitle, { flex: 1, color: theme.text2 }]}>{track?.name ?? t('journey.timeline.trackChooseTitle')}</Text>
            <Icon name="chevronDown" size={15} color={theme.text3} />
          </Press>
          <View style={styles.pointSummary}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
                <Icon name="pin" size={17} color={point ? theme.accent : theme.text3} />
                <Text numberOfLines={2} style={[type.cardTitle, { flex: 1, color: theme.text }]}>{point?.name ?? t('journey.timeline.trackPointEmpty')}</Text>
              </View>
              {resolving || (point?.address && point.address !== point.name) ? (
                <Text numberOfLines={1} style={[type.caption, { color: theme.text2, marginTop: space.xxs }]}>{resolving ? t('journey.settings.locationResolving') : point?.address}</Text>
              ) : null}
              <Text numberOfLines={2} style={[type.caption, { fontFamily: point ? MONO : undefined, lineHeight: 17, color: theme.text3, marginTop: space.xs }]}>{point ? pointMeta(point) : t('journey.timeline.trackPickerHint')}</Text>
            </View>
            <Press
              disabled={!track || !point}
              accessibilityRole="button"
              accessibilityState={{ disabled: !track || !point }}
              onPress={() => { if (track && point) { Keyboard.dismiss(); locationRequest.current?.abort(); onPick({ ...trackLocation(track, point), address: point.address }); } }}
              style={[styles.confirmButton, { backgroundColor: point ? theme.accent : theme.fieldSurface }]}
            >
              <Text style={[type.cardTitle, { color: point ? '#FFFFFF' : theme.text3 }]}>{t('journey.timeline.trackPointConfirm')}</Text>
            </Press>
          </View>
        </View>

        {panel ? (
          <KeyboardAvoidingView style={StyleSheet.absoluteFill} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={closePanel} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }]} />
            <View pointerEvents="box-none" style={{ flex: 1, justifyContent: 'flex-end', paddingTop: insets.top + space.md }}>
              <View style={[styles.listPanel, { maxHeight: panelMaxHeight, paddingBottom: panelBottom, backgroundColor: theme.surfaceTop }]}>
                <View onLayout={(event) => setPanelHeaderHeight(event.nativeEvent.layout.height)}>
                  <View style={styles.handleArea}><View style={[styles.handle, { backgroundColor: theme.text3 }]} /></View>
                  <View style={styles.listHeader}>
                    <Text style={[type.sectionTitle, { color: theme.text }]}>{panel === 'tracks' ? t('journey.timeline.trackChooseTitle') : t('journey.timeline.trackAllWaypoints')}</Text>
                    <Press accessibilityRole="button" accessibilityLabel={t('common.close')} hitSlop={8} onPress={closePanel} style={[styles.panelClose, { backgroundColor: theme.fieldSurface }]}><Icon name="close" size={16} color={theme.text2} /></Press>
                  </View>
                </View>
                {panel === 'waypoints' && sortedPoints.length > 0 ? (
                  <View style={[styles.search, { backgroundColor: theme.fieldSurface }]}>
                    <Icon name="search" size={16} color={theme.text3} />
                    <TextInput value={query} onChangeText={setQuery} placeholder={t('journey.timeline.trackSearchWaypoints')} placeholderTextColor={theme.text3} accessibilityLabel={t('journey.timeline.trackSearchWaypoints')} autoCorrect={false} style={{ flex: 1, minWidth: 0, color: theme.text, paddingVertical: 0, fontSize: type.body.fontSize }} />
                    {query ? <Press onPress={() => setQuery('')} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('journey.timeline.placeSearchClear')}><Icon name="close" size={14} color={theme.text2} /></Press> : null}
                  </View>
                ) : null}
                {panel === 'tracks' ? (
                  <JourneyGroupPicker
                    theme={theme}
                    embedded
                    showSelectionIndicator={false}
                    title={t('journey.timeline.trackChooseTitle')}
                    value={track?.id}
                    data={tracks.map((item) => ({ value: item.id, label: item.name, summary: t('journey.timeline.trackMeta', { km: kmOf(item.totalMeters), points: item.waypoints.length }) }))}
                    maxHeight={panelMaxHeight - panelHeaderHeight - panelBottom}
                    onChange={(id) => {
                      const nextTrack = tracks.find((item) => item.id === id);
                      if (!nextTrack) return;
                      locationRequest.current?.abort();
                      setResolving(false);
                      setTrack(nextTrack);
                      setPoint(undefined);
                      closePanel();
                    }}
                  />
                ) : (
                  <ScrollView style={{ borderRadius: radius.card, overflow: 'hidden' }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ paddingBottom: space.sm }}>
                    {filteredPoints.map(({ item, index }) => {
                      const selected = point === item;
                      return (
                        <Press key={index} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => pickWaypoint(item, true)} style={[styles.row, { backgroundColor: selected ? theme.accentSoft : theme.surfaceTop }]}>
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
                )}
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
  listPanel: { borderTopLeftRadius: radius.feature, borderTopRightRadius: radius.feature, paddingHorizontal: space.md, flexShrink: 1 },
  handleArea: { paddingTop: space.sm, paddingBottom: space.md, alignItems: 'center' },
  handle: { width: 32, height: 4, borderRadius: 2 },
  panelClose: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  listHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.sm, paddingHorizontal: space.xxs, paddingBottom: space.md },
  search: { minHeight: layout.fieldHeight, paddingHorizontal: space.sm, borderRadius: radius.control, flexDirection: 'row', alignItems: 'center', gap: space.xs, marginBottom: space.md },
  row: { minHeight: layout.listRowMinHeight, paddingVertical: space.sm, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  number: { width: 28, height: 28, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  empty: { paddingVertical: space.xxl, fontSize: type.body.fontSize, lineHeight: 21, textAlign: 'center' },
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xxxl },
});
