import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { ScrollView as GestureScrollView } from 'react-native-gesture-handler';
import type { Poi } from '../../data/pois';
import type { TimelineGroupRoute } from '../../data/timeline';
import { radius, space, type } from '../../design-system';
import { useI18n } from '../../i18n';
import {
  distanceMeters,
  measureTrack,
  nearestTrackPosition,
  positionAtDistance,
  type TrackPosition,
} from '../../lib/routeSegments';
import type { Theme } from '../../theme/theme';
import { Icon } from '../Icon';
import { Press } from '../Press';
import { JourneyLocationMapHost } from './JourneyLocationMapHost';
import { NJBottomSheet } from './NewJourneyParts';

function kmLabel(meters: number) {
  return `${(meters / 1000).toFixed(1)} km`;
}

export function JourneyRouteBoundarySheet({
  theme,
  info,
  groupLabel,
  minimumMeters,
  maximumMeters,
  current,
  backgroundMap = false,
  mapSelectionRequest,
  onSelectionChange,
  onEndpointCoordinateChange,
  onClose,
  onSave,
}: {
  theme: Theme;
  info: Poi;
  groupLabel: string;
  minimumMeters: number;
  maximumMeters?: number;
  current?: TimelineGroupRoute;
  backgroundMap?: boolean;
  mapSelectionRequest?: { coordinate: [number, number]; revision: number };
  onSelectionChange?: (position: TrackPosition) => void;
  onEndpointCoordinateChange?: (coordinate: [number, number]) => void;
  onClose: () => void;
  onSave: (route: TimelineGroupRoute | null) => Promise<void> | void;
}) {
  const { width, height } = useWindowDimensions();
  const sheetHeight = backgroundMap
    ? Math.max(390, Math.min(height * 0.48, 520))
    : Math.max(480, Math.min(height * 0.84, 760));
  const sheetBodyHeight = Math.max(backgroundMap ? 326 : 416, sheetHeight - 64);
  const { t } = useI18n();
  const measure = useMemo(() => measureTrack(info.trackCoords), [info.trackCoords]);
  const upperBound = Math.min(maximumMeters ?? measure?.totalMeters ?? 0, measure?.totalMeters ?? 0);
  const initialPosition = useMemo(() => {
    if (!measure) return null;
    if (current) return positionAtDistance(measure, current.endDistanceMeters);
    const suggested = Math.min(upperBound, Math.max(minimumMeters + 10_000, minimumMeters + 100));
    return positionAtDistance(measure, suggested);
  }, [current, measure, minimumMeters, upperBound]);
  const [selection, setSelection] = useState<TrackPosition | null>(initialPosition);
  const [source, setSource] = useState<TimelineGroupRoute['source']>(current?.source ?? 'map');
  const [locationName, setLocationName] = useState(current?.locationName);
  const [distanceText, setDistanceText] = useState(initialPosition ? (initialPosition.distanceMeters / 1000).toFixed(1) : '');
  const [centerRevision, setCenterRevision] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [endpointCoordinate, setEndpointCoordinate] = useState<[number, number]>(() => (
    current && Number.isFinite(current.longitude) && Number.isFinite(current.latitude)
      ? [current.longitude, current.latitude]
      : initialPosition?.coordinate ?? [info.lng, info.lat]
  ));
  const bodyScrollYRef = useRef(0);
  const bodyScrollGestureRef = useRef<any>(null);

  useEffect(() => {
    if (!measure || !mapSelectionRequest) return;
    const snapped = nearestTrackPosition(measure, mapSelectionRequest.coordinate);
    const allowedMeters = Math.min(upperBound, Math.max(minimumMeters + 2, snapped.distanceMeters));
    const trackPosition = positionAtDistance(measure, allowedMeters);
    const position = {
      ...trackPosition,
      distanceFromTrackMeters: distanceMeters(trackPosition.coordinate, mapSelectionRequest.coordinate),
    };
    setSelection(position);
    setEndpointCoordinate(mapSelectionRequest.coordinate);
    setSource('map');
    setLocationName(undefined);
    setDistanceText((position.distanceMeters / 1000).toFixed(1));
    setError('');
  }, [mapSelectionRequest?.revision, measure, minimumMeters, upperBound]);

  useEffect(() => {
    if (selection) onSelectionChange?.(selection);
  }, [onSelectionChange, selection]);

  useEffect(() => {
    onEndpointCoordinateChange?.(endpointCoordinate);
  }, [endpointCoordinate, onEndpointCoordinateChange]);

  const waypointOptions = useMemo(() => {
    if (!measure) return [];
    return (info.trackWaypoints ?? [])
      .filter((waypoint) => Number.isFinite(waypoint.km))
      .map((waypoint) => ({ name: waypoint.name, position: positionAtDistance(measure, waypoint.km * 1000) }))
      .filter(({ position }) => position.distanceMeters > minimumMeters + 1 && position.distanceMeters < upperBound + 1)
      .sort((a, b) => a.position.distanceMeters - b.position.distanceMeters);
  }, [info.trackWaypoints, measure, minimumMeters, upperBound]);

  if (!measure || !selection) return null;

  const choose = (position: TrackPosition, nextSource: TimelineGroupRoute['source'], name?: string) => {
    setSelection(position);
    setEndpointCoordinate(position.coordinate);
    setSource(nextSource);
    setLocationName(name);
    setDistanceText((position.distanceMeters / 1000).toFixed(1));
    setCenterRevision((revision) => revision + 1);
    setError('');
  };

  const chooseMapCoordinate = (coordinate: [number, number]) => {
    const snapped = nearestTrackPosition(measure, coordinate);
    const allowedMeters = Math.min(upperBound, Math.max(minimumMeters + 2, snapped.distanceMeters));
    const trackPosition = positionAtDistance(measure, allowedMeters);
    setSelection({
      ...trackPosition,
      distanceFromTrackMeters: distanceMeters(trackPosition.coordinate, coordinate),
    });
    setEndpointCoordinate(coordinate);
    setSource('map');
    setLocationName(undefined);
    setDistanceText((trackPosition.distanceMeters / 1000).toFixed(1));
    setCenterRevision((revision) => revision + 1);
    setError('');
  };

  const applyDistance = () => {
    const km = Number.parseFloat(distanceText.replace(',', '.'));
    if (!Number.isFinite(km)) {
      setError(t('journey.timeline.routeInvalidDistance'));
      return;
    }
    // The UI presents one decimal place. When the real track ends at e.g.
    // 6.46 km it is shown as 6.5 km, so entering that displayed upper bound
    // should snap to the exact track end instead of being rejected as 40 m over.
    const displayedUpperKm = Number((upperBound / 1000).toFixed(1));
    const requestedMeters = Math.abs(km - displayedUpperKm) < 0.0001
      ? upperBound
      : km * 1000;
    if (requestedMeters <= minimumMeters + 1 || requestedMeters > upperBound + 1) {
      setError(t('journey.timeline.routeRange', { start: kmLabel(minimumMeters), end: kmLabel(upperBound) }));
      return;
    }
    choose(positionAtDistance(measure, requestedMeters), 'distance');
    Keyboard.dismiss();
  };

  const save = async () => {
    if (selection.distanceMeters <= minimumMeters + 1 || selection.distanceMeters > upperBound + 1) {
      setError(t('journey.timeline.routeBoundaryRange', { start: kmLabel(minimumMeters), end: kmLabel(upperBound) }));
      return;
    }
    setSaving(true);
    try {
      await onSave({
        endDistanceMeters: selection.distanceMeters,
        longitude: endpointCoordinate[0],
        latitude: endpointCoordinate[1],
        trackPointIndex: selection.trackPointIndex,
        trackPointFraction: selection.trackPointFraction,
        source,
        locationName,
      });
      onClose();
    } catch (saveError) {
      console.warn('[JourneyRouteBoundarySheet] save failed', saveError);
      setError(t('journey.timeline.routeSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const clear = () => {
    Alert.alert(
      t('journey.timeline.routeClearConfirmTitle'),
      t('journey.timeline.routeClearConfirmBody', { day: groupLabel }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('journey.timeline.routeClearShort'),
          style: 'destructive',
          onPress: async () => {
            setSaving(true);
            try {
              await onSave(null);
              onClose();
            } catch (clearError) {
              console.warn('[JourneyRouteBoundarySheet] clear failed', clearError);
              setError(t('journey.timeline.routeSaveFailed'));
            } finally {
              setSaving(false);
            }
          },
        },
      ],
    );
  };

  const selectedWaypoint = source === 'waypoint' ? locationName : undefined;

  const sheet = (
    <NJBottomSheet
        theme={theme}
        onClose={onClose}
        full
        bodyScrolls
        pullDownToDismiss
        bodyScrollYRef={bodyScrollYRef}
        bodyScrollGestureRef={bodyScrollGestureRef}
        minimizedOffset={backgroundMap ? Math.max(0, sheetHeight - 112) : undefined}
        dragHeader={(
          <View style={{ width: '100%', paddingHorizontal: backgroundMap ? space.md : space.lg, paddingTop: space.xs, paddingBottom: space.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              {backgroundMap ? (
                <Press
                  scaleTo={1}
                  onPress={onClose}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.back')}
                  style={{ width: 40, height: 40, marginRight: space.xs, marginTop: -2, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Icon name="chevronL" color={theme.text} size={24} strokeWidth={2.1} />
                </Press>
              ) : null}
              <View style={{ flex: 1, minWidth: 0, paddingTop: backgroundMap ? 2 : 0 }}>
                <Text numberOfLines={1} style={[type.pageTitle, { color: theme.text, fontSize: backgroundMap ? 20 : 23 }]}>
                  {backgroundMap
                    ? t('journey.timeline.routeEditTitle', { day: groupLabel })
                    : t('journey.timeline.routeSetEndTitle', { day: groupLabel })}
                </Text>
                <Text numberOfLines={1} style={[type.caption, { color: theme.text3, marginTop: backgroundMap ? 2 : space.xxs }]}>
                  {backgroundMap
                    ? t('journey.timeline.routeEditHint', { start: kmLabel(minimumMeters), end: kmLabel(upperBound) })
                    : t('journey.timeline.routeRange', { start: kmLabel(minimumMeters), end: kmLabel(upperBound) })}
                </Text>
              </View>
            </View>
          </View>
        )}
        keyboardAvoiding
        fillBehindKeyboard
        bottomPadding={space.sm}
        backgroundColor={theme.featureSurface}
        showBackdrop={!backgroundMap}
      >
        <View style={{ height: sheetBodyHeight, position: 'relative' }}>
          <GestureScrollView
            ref={bodyScrollGestureRef}
            keyboardShouldPersistTaps="handled"
            bounces={false}
            alwaysBounceVertical={false}
            overScrollMode="never"
            directionalLockEnabled
            onScroll={(event) => {
              bodyScrollYRef.current = Math.max(0, event.nativeEvent.contentOffset.y);
            }}
            scrollEventThrottle={8}
            contentContainerStyle={{ paddingBottom: 88 }}
          >
            {!backgroundMap ? (
              <View style={{ height: 244, marginHorizontal: space.md, borderRadius: radius.feature, overflow: 'hidden', backgroundColor: theme.fieldSurface }}>
                <JourneyLocationMapHost
                  theme={theme}
                  center={selection.coordinate}
                  centerRevision={centerRevision}
                  selectedCoordinate={endpointCoordinate}
                  trackCoords={measure.coordinates}
                  onSelectCoordinate={chooseMapCoordinate}
                  fallbackTitle={t('journey.timeline.routeMapFallbackTitle')}
                  fallbackBody={t('journey.timeline.routeMapFallbackBody')}
                />
                <View pointerEvents="none" style={{ position: 'absolute', left: 12, right: 12, bottom: 10, alignItems: 'center' }}>
                  <View style={{ minHeight: 30, paddingHorizontal: 11, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.dark ? 'rgba(28,28,30,0.88)' : 'rgba(255,255,255,0.9)', borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
                    <Icon name="pin" color={theme.text2} size={14} />
                    <Text style={[type.caption, { color: theme.text2, fontWeight: '600' }]}>{t('journey.timeline.routeMapHint')}</Text>
                  </View>
                </View>
              </View>
            ) : null}

            <View
              style={{
                marginHorizontal: backgroundMap ? space.lg : space.md,
                marginTop: backgroundMap ? 0 : space.sm,
                padding: backgroundMap ? space.sm : space.md,
                borderRadius: radius.feature,
                backgroundColor: theme.surfaceTop,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: theme.fieldBorder,
              }}
            >
              {backgroundMap ? (
                <>
                  <View style={{ minHeight: 34, paddingHorizontal: space.xxs, flexDirection: 'row', alignItems: 'center' }}>
                    <Text numberOfLines={1} style={[type.body, { flex: 1, color: theme.text, fontWeight: '600' }]}>
                      {locationName || t('journey.timeline.routeCurrentEnd')}
                    </Text>
                    <Text style={[type.metric, { color: theme.text, fontSize: 15 }]}>
                      {t('journey.timeline.routeDayDistance', { distance: kmLabel(selection.distanceMeters - minimumMeters) })}
                    </Text>
                  </View>
                  <View style={{ marginTop: space.xs, paddingHorizontal: space.xxs, flexDirection: 'row', alignItems: 'center' }}>
                    <Text numberOfLines={1} style={[type.caption, { flex: 1, color: theme.text3 }]}>{t('journey.timeline.routeCumulativeDistance')}</Text>
                    <View style={{ width: 92, height: 36, borderRadius: radius.control, paddingHorizontal: space.sm, flexDirection: 'row', alignItems: 'center', backgroundColor: theme.fieldSurface }}>
                      <TextInput value={distanceText} onChangeText={(value) => { setDistanceText(value); setError(''); }} onSubmitEditing={applyDistance} keyboardType="decimal-pad" returnKeyType="done" selectTextOnFocus style={[type.metric, { flex: 1, color: theme.text, padding: 0, textAlign: 'right', fontSize: 14 }]} />
                      <Text style={[type.caption, { color: theme.text2, marginLeft: 3 }]}>km</Text>
                    </View>
                    <Press scaleTo={1} onPress={applyDistance} accessibilityLabel={t('journey.timeline.routeDistanceTitle')} style={{ width: 32, height: 36, alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="locate" color={theme.text2} size={16} />
                    </Press>
                  </View>
                  {error ? <Text style={[type.caption, { color: theme.danger, lineHeight: 17, marginTop: space.xs }]}>{error}</Text> : null}
                </>
              ) : (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={[type.cardTitle, { color: theme.text }]}>{locationName || t('journey.timeline.routeTrackEnd', { day: groupLabel })}</Text>
                      {selection.distanceFromTrackMeters != null ? <Text numberOfLines={1} style={[type.caption, { color: theme.text3, marginTop: 3 }]}>{t('journey.timeline.routeSnapped', { distance: Math.round(selection.distanceFromTrackMeters) })}</Text> : null}
                    </View>
                    <View style={{ alignItems: 'flex-end', marginLeft: space.sm }}>
                      <Text style={[type.metric, { color: theme.text }]}>{kmLabel(selection.distanceMeters - minimumMeters)}</Text>
                      <Text style={[type.caption, { color: theme.text3, marginTop: 2 }]}>{t('journey.timeline.routeCumulative', { distance: kmLabel(selection.distanceMeters) })}</Text>
                    </View>
                  </View>
                  <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.hairline, marginVertical: space.md }} />
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text numberOfLines={1} style={[type.body, { color: theme.text, fontWeight: '600', flexShrink: 1 }]}>{t('journey.timeline.routeCumulativeDistance')}</Text>
                    <View style={{ flex: 1, minWidth: space.xs }} />
                    <View style={{ width: 96, height: 40, borderRadius: radius.control, paddingHorizontal: space.sm, flexDirection: 'row', alignItems: 'center', backgroundColor: theme.fieldSurface }}>
                      <TextInput value={distanceText} onChangeText={(value) => { setDistanceText(value); setError(''); }} onSubmitEditing={applyDistance} keyboardType="decimal-pad" returnKeyType="done" selectTextOnFocus style={[type.metric, { flex: 1, color: theme.text, padding: 0, textAlign: 'right', fontSize: 15 }]} />
                      <Text style={[type.caption, { color: theme.text2, marginLeft: 4 }]}>km</Text>
                    </View>
                    <Press scaleTo={1} onPress={applyDistance} accessibilityLabel={t('journey.timeline.routeDistanceTitle')} style={{ width: 36, height: 40, marginLeft: space.xxs, alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="locate" color={theme.text2} size={17} />
                    </Press>
                  </View>
                  <Text style={[type.caption, { color: error ? theme.danger : theme.text3, lineHeight: 17, marginTop: space.xs }]}>{error || t('journey.timeline.routeDistanceHint', { start: kmLabel(minimumMeters), end: kmLabel(upperBound) })}</Text>
                </>
              )}
            </View>

            {waypointOptions.length ? (
              <View style={{ marginTop: backgroundMap ? space.sm : space.md, marginHorizontal: backgroundMap ? space.lg : space.md }}>
                <Text style={[type.eyebrow, { color: theme.text3, marginBottom: space.xs }]}>{t('journey.timeline.routeSuggestedWaypoints')}</Text>
                <View style={{ borderRadius: radius.feature, overflow: 'hidden', backgroundColor: theme.surfaceTop, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.fieldBorder }}>
                  {waypointOptions.map(({ name, position }, index) => {
                    const selected = selectedWaypoint === name;
                    return (
                      <Press
                        key={`${name}-${position.distanceMeters}`}
                        scaleTo={1}
                        onPress={() => choose(position, 'waypoint', name)}
                        style={{
                          minHeight: backgroundMap ? 50 : 56,
                          paddingHorizontal: space.md,
                          flexDirection: 'row',
                          alignItems: 'center',
                          borderTopWidth: index ? StyleSheet.hairlineWidth : 0,
                          borderTopColor: theme.hairline,
                          backgroundColor: selected ? theme.accentSofter : 'transparent',
                        }}
                      >
                        <Text numberOfLines={1} style={[type.body, { flex: 1, color: selected ? theme.accent : theme.text, fontWeight: selected ? '700' : '500' }]}>{name}</Text>
                        <Text style={[type.metric, { color: selected ? theme.accent : theme.text2, fontSize: 14 }]}>{kmLabel(position.distanceMeters)}</Text>
                        {selected ? <Icon name="check" color={theme.accent} size={15} strokeWidth={2.3} /> : null}
                      </Press>
                    );
                  })}
                </View>
              </View>
            ) : null}
          </GestureScrollView>

          <View
            pointerEvents="box-none"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: space.xs,
              zIndex: 4,
              alignItems: 'center',
            }}
          >
            <View style={{ width: Math.min(width - space.xxxl * 2, 360), flexDirection: 'row', gap: space.sm }}>
              {current ? (
                <Press
                  disabled={saving}
                  onPress={clear}
                  style={{
                    width: 88,
                    height: 56,
                    borderRadius: radius.pill,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: theme.controlSurface,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: theme.fieldBorder,
                    opacity: saving ? 0.45 : 1,
                    boxShadow: theme.dark
                      ? '0px 4px 12px rgba(0,0,0,0.38)'
                      : '0px 4px 12px rgba(0,0,0,0.08)',
                  }}
                >
                  <Text style={{ color: theme.danger, fontSize: 15, fontWeight: '600' }}>{t('journey.timeline.routeClearShort')}</Text>
                </Press>
              ) : null}
              <Press
                disabled={saving}
                onPress={save}
                style={{
                  flex: 1,
                  height: 56,
                  borderRadius: radius.pill,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: theme.controlSurface,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: theme.fieldBorder,
                  opacity: saving ? 0.62 : 1,
                  boxShadow: theme.dark
                    ? '0px 4px 12px rgba(0,0,0,0.38)'
                    : '0px 4px 12px rgba(0,0,0,0.08)',
                }}
              >
                {saving ? (
                  <ActivityIndicator size="small" color={theme.text} />
                ) : (
                  <Text style={{ color: theme.text, fontSize: 16, fontWeight: '700' }}>{t('common.save')}</Text>
                )}
              </Press>
            </View>
          </View>
        </View>
    </NJBottomSheet>
  );

  if (backgroundMap) return sheet;
  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose}>
      {sheet}
    </Modal>
  );
}
