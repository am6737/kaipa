import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme } from '../../theme/theme';
import { useI18n } from '../../i18n';
import { Icon } from '../Icon';
import { Press } from '../Press';
import { DetailPage, layout, radius, space, type } from '../../design-system';
import {
  hasMapboxGeocoding,
  JourneyLocationValue,
  locationFromPoi,
  reverseJourneyLocation,
  searchJourneyLocations,
} from '../../lib/mapboxGeocoding';
import { JourneyLocationMapHost } from './JourneyLocationMapHost';

const COORDINATE_EPSILON = 0.000001;

function coordinatesClose(a: [number, number], b: [number, number]) {
  return Math.abs(a[0] - b[0]) < COORDINATE_EPSILON && Math.abs(a[1] - b[1]) < COORDINATE_EPSILON;
}

function sameCoordinate(a: JourneyLocationValue, b: JourneyLocationValue) {
  return coordinatesClose([a.lng, a.lat], [b.lng, b.lat]);
}

function ActionChip({
  theme,
  label,
  loading,
  onPress,
}: {
  theme: Theme;
  label: string;
  loading?: boolean;
  onPress: () => void;
}) {
  return (
    <Press
      accessibilityRole="button"
      onPress={onPress}
      style={{
        height: 40,
        borderRadius: radius.pill,
        paddingHorizontal: space.md,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.xs,
        backgroundColor: theme.surfaceTop,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.hairline,
      }}
    >
      {loading ? <ActivityIndicator size="small" color={theme.accent} /> : null}
      <Text style={[type.body, { color: theme.text, fontWeight: '600' }]}>{label}</Text>
    </Press>
  );
}

function SearchResultRow({
  theme,
  item,
  onPress,
}: {
  theme: Theme;
  item: JourneyLocationValue;
  onPress: () => void;
}) {
  return (
    <Press accessibilityRole="button" onPress={onPress} style={{ minHeight: 68, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md }}>
      <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.fieldSurface }}>
        <Icon name="pin" size={17} color={theme.text2} />
      </View>
      <View style={{ flex: 1, marginLeft: space.sm }}>
        <Text numberOfLines={1} style={[type.cardTitle, { color: theme.text }]}>{item.name}</Text>
        <Text numberOfLines={2} style={[type.caption, { color: theme.text2, lineHeight: 17, marginTop: space.xxs }]}>{item.address}</Text>
      </View>
      <Icon name="chevronR" size={17} color={theme.text3} />
    </Press>
  );
}

export function JourneyLocationPicker({
  theme,
  initialLocation,
  trackStart,
  trackEnd,
  trackCoords,
  onCancel,
  onConfirm,
  onToast,
}: {
  theme: Theme;
  initialLocation: JourneyLocationValue;
  trackStart?: [number, number];
  trackEnd?: [number, number];
  trackCoords?: [number, number][];
  onCancel: () => void;
  onConfirm: (location: JourneyLocationValue) => void;
  onToast: (message: string) => void;
}) {
  const { t, resolved } = useI18n();
  const insets = useSafeAreaInsets();
  const language = resolved === 'zh' ? 'zh' : 'en';
  const [selected, setSelected] = useState(initialLocation);
  const [mapCenter, setMapCenter] = useState<[number, number]>([initialLocation.lng, initialLocation.lat]);
  const [centerRevision, setCenterRevision] = useState(0);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<JourneyLocationValue[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [locating, setLocating] = useState(false);
  const coordinateController = useRef<AbortController | null>(null);

  const geocodingReady = hasMapboxGeocoding();
  const hasQuery = query.trim().length > 0;
  const hasChanged = useMemo(() => !sameCoordinate(selected, initialLocation) || selected.region !== initialLocation.region, [initialLocation, selected]);

  useEffect(() => {
    if (!hasQuery || !geocodingReady) {
      setResults([]);
      setSearching(false);
      setSearchError(false);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSearching(true);
      setSearchError(false);
      searchJourneyLocations(query.trim(), language, mapCenter, controller.signal)
        .then(setResults)
        .catch((error) => {
          if (error instanceof Error && error.name === 'AbortError') return;
          setResults([]);
          setSearchError(true);
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [geocodingReady, hasQuery, language, query]);

  useEffect(() => () => coordinateController.current?.abort(), []);

  const moveTo = (location: JourneyLocationValue) => {
    coordinateController.current?.abort();
    Keyboard.dismiss();
    setQuery('');
    setResults([]);
    setSelected(location);
    setMapCenter([location.lng, location.lat]);
    setCenterRevision((value) => value + 1);
    setResolving(false);
  };

  const useCoordinate = async (coordinate: [number, number], moveCamera = true) => {
    coordinateController.current?.abort();
    const controller = new AbortController();
    coordinateController.current = controller;
    const [lng, lat] = coordinate;

    Keyboard.dismiss();
    setQuery('');
    setResults([]);
    setMapCenter(coordinate);
    if (moveCamera) setCenterRevision((value) => value + 1);
    setResolving(true);

    if (!geocodingReady) {
      setSelected(locationFromPoi(t('journey.settings.locationUnnamed'), lng, lat));
      setResolving(false);
      return;
    }

    try {
      const location = await reverseJourneyLocation(lng, lat, language, controller.signal);
      if (!controller.signal.aborted) setSelected(location);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      if (!controller.signal.aborted) {
        setSelected(locationFromPoi(t('journey.settings.locationUnnamed'), lng, lat));
      }
    } finally {
      if (!controller.signal.aborted) setResolving(false);
    }
  };

  const useCurrentLocation = async () => {
    if (locating) return;
    setLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        onToast(t('journey.settings.locationPermissionDenied'));
        return;
      }
      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      await useCoordinate([current.coords.longitude, current.coords.latitude]);
    } catch {
      onToast(t('journey.settings.locationCurrentFailed'));
    } finally {
      setLocating(false);
    }
  };

  const clearSearch = () => {
    setQuery('');
    setResults([]);
    setSearchError(false);
    Keyboard.dismiss();
  };

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 240, backgroundColor: theme.groupedBg }]}>
      <DetailPage
        theme={theme}
        title={t('journey.settings.locationPickerTitle')}
        onBack={onCancel}
        backgroundColor={theme.groupedBg}
        flatChrome
        scrollable={false}
      >
        <View style={{ flex: 1, paddingHorizontal: layout.pagePadding, paddingTop: space.sm, paddingBottom: insets.bottom + space.md }}>
          <View style={{ zIndex: 20 }}>
            <View
              style={{
                height: 48,
                borderRadius: radius.pill,
                backgroundColor: theme.surfaceTop,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: theme.fieldBorder,
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: space.sm,
              }}
            >
              <Icon name="search" size={19} color={theme.text3} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder={t('journey.settings.locationSearchPlaceholder')}
                placeholderTextColor={theme.text3}
                returnKeyType="search"
                autoCorrect={false}
                style={{ flex: 1, color: theme.text, fontSize: 16, paddingHorizontal: space.sm, paddingVertical: 0 }}
              />
              {searching ? <ActivityIndicator size="small" color={theme.text2} /> : null}
              {query ? (
                <Press accessibilityRole="button" onPress={clearSearch} style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="close" size={17} color={theme.text2} />
                </Press>
              ) : null}
            </View>

            {hasQuery ? (
              <View
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: 56,
                  maxHeight: 340,
                  borderRadius: radius.card,
                  overflow: 'hidden',
                  backgroundColor: theme.surfaceTop,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: theme.hairline,
                }}
              >
                {!geocodingReady || searchError ? (
                  <View style={{ padding: space.xl, alignItems: 'center' }}>
                    <Text style={[type.cardTitle, { color: theme.text, textAlign: 'center' }]}>{t('journey.settings.locationSearchUnavailable')}</Text>
                    <Text style={[type.body, { color: theme.text2, lineHeight: 20, textAlign: 'center', marginTop: space.xs }]}>{t('journey.settings.locationSearchUnavailableSub')}</Text>
                  </View>
                ) : !searching && results.length === 0 ? (
                  <View style={{ padding: space.xl, alignItems: 'center' }}>
                    <Text style={[type.cardTitle, { color: theme.text }]}>{t('journey.settings.locationNoResults')}</Text>
                    <Text style={[type.body, { color: theme.text2, marginTop: space.xs }]}>{t('journey.settings.locationNoResultsSub')}</Text>
                  </View>
                ) : (
                  <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                    {results.map((item, index) => (
                      <View key={`${item.lng}-${item.lat}-${index}`}>
                        {index ? <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.hairline, marginLeft: 62 }} /> : null}
                        <SearchResultRow theme={theme} item={item} onPress={() => moveTo(item)} />
                      </View>
                    ))}
                  </ScrollView>
                )}
              </View>
            ) : null}
          </View>

          <ScrollView
            horizontal
            style={{ flexGrow: 0 }}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: space.xs, paddingTop: space.sm, paddingBottom: space.xs }}
            keyboardShouldPersistTaps="handled"
          >
            <ActionChip theme={theme} label={t('journey.settings.locationUseCurrent')} loading={locating} onPress={() => void useCurrentLocation()} />
            {trackStart ? <ActionChip theme={theme} label={t('journey.settings.locationUseTrackStart')} onPress={() => void useCoordinate(trackStart)} /> : null}
            {trackEnd ? <ActionChip theme={theme} label={t('journey.settings.locationUseTrackEnd')} onPress={() => void useCoordinate(trackEnd)} /> : null}
          </ScrollView>

          <Pressable onPress={Keyboard.dismiss} style={{ flex: 1, minHeight: 240 }}>
            <View
              style={{
                flex: 1,
                borderRadius: radius.feature,
                overflow: 'hidden',
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: theme.hairline,
                backgroundColor: theme.fieldSurface,
              }}
            >
              <JourneyLocationMapHost
                theme={theme}
                center={mapCenter}
                centerRevision={centerRevision}
                selectedCoordinate={mapCenter}
                trackCoords={trackCoords}
                onSelectCoordinate={(coordinate) => void useCoordinate(coordinate, false)}
                fallbackTitle={t('journey.settings.locationMapUnavailable')}
                fallbackBody={t('journey.settings.locationMapUnavailableSub')}
              />
            </View>
          </Pressable>

          <View
            style={{
              marginTop: space.sm,
              minHeight: 112,
              borderRadius: radius.feature,
              backgroundColor: theme.surfaceTop,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: theme.hairline,
              padding: space.md,
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            <View style={{ flex: 1, paddingRight: space.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
                {resolving ? <ActivityIndicator size="small" color={theme.accent} /> : <Icon name="pin" size={18} color={theme.accent} />}
                <Text numberOfLines={1} style={[type.cardTitle, { color: theme.text, flex: 1 }]}>
                  {resolving ? t('journey.settings.locationResolving') : selected.name}
                </Text>
              </View>
              <Text numberOfLines={2} style={[type.body, { color: theme.text2, lineHeight: 20, marginTop: space.xs }]}>{selected.address}</Text>
              <Text numberOfLines={1} style={[type.caption, { color: theme.text3, marginTop: space.xs, fontVariant: ['tabular-nums'] }]}>{selected.coord}</Text>
            </View>
            <Press
              accessibilityRole="button"
              accessibilityState={{ disabled: resolving }}
              disabled={resolving}
              onPress={() => onConfirm(selected)}
              style={{
                minWidth: 88,
                height: 44,
                borderRadius: radius.pill,
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: space.md,
                backgroundColor: resolving ? theme.progressTrack : theme.accent,
              }}
            >
              <Text style={{ color: resolving ? theme.text3 : '#FFFFFF', fontSize: 15, fontWeight: '700' }}>
                {hasChanged ? t('journey.settings.locationConfirm') : t('common.done')}
              </Text>
            </Press>
          </View>
        </View>
      </DetailPage>
    </View>
  );
}
