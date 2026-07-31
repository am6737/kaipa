// JourneyDetailSplit.tsx — the unified route/journey detail. The track map fills
// the top, the rich details (SelectedPoiCard, hero removed) fill the bottom, and
// a draggable divider snaps between three detents: map-maximised, 50/50, and
// details-maximised. Replaces the old full-screen JourneyCardFull.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, PanResponder, ScrollView, useWindowDimensions, Alert } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme } from '../../theme/theme';
import { shadow } from '../../theme/shadow';
import { Poi } from '../../data/pois';
import { buildElevation } from '../../data/elevation';
import { useNav } from '../../nav/NavContext';
import { useI18n } from '../../i18n';
import { CircleBtn } from '../CircleBtn';
import { Icon } from '../Icon';
import { Press } from '../Press';
import { PhotoTile } from '../PhotoTile';
import { TrackMap, TrackMapHandle, MapStyleId, MAPBOX_TOKEN } from './TrackMap';
import { SelectedPoiCard } from '../../screens/JourneyCard';
import { RoutePreviewPanel } from '../discover/RoutePreviewPanel';
import { AppIconButton, radius, space } from '../../design-system';
import { useData } from '../../data/DataContext';
import { useTimeline } from '../../hooks/useTimeline';

export function JourneyDetailSplit({ theme, poi, onClose }: { theme: Theme; poi: Poi; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const nav = useNav();
  const { t } = useI18n();
  const { userId } = useData();

  const isJourney = poi.kind === 'journey';
  const coords = poi.trackCoords || [];
  const hasTrack = coords.length >= 2;
  const mapCoords = hasTrack ? coords : Number.isFinite(poi.lng) && Number.isFinite(poi.lat) ? [[poi.lng, poi.lat] as [number, number]] : [];
  const hasMap = mapCoords.length > 0 && !!MAPBOX_TOKEN;
  const cover = poi.photoUris?.[0];
  const [trackScrub, setTrackScrub] = useState<{ index: number | null; coord?: [number, number] }>({ index: null });
  const [planEditorOpen, setPlanEditorOpen] = useState(false);
  const [selectedPlanDays, setSelectedPlanDays] = useState<Set<string>>(() => new Set());
  const timeline = useTimeline(isJourney ? poi.id : undefined, isJourney ? userId : undefined);

  const deleteSelectedPlanDays = () => {
    if (!selectedPlanDays.size) return;
    const selected = [...selectedPlanDays];
    const itemCount = timeline.rows.filter((row) => selectedPlanDays.has(row.day)).length;
    Alert.alert(
      t('journey.timeline.batchDeleteGroupTitle', { count: selected.length }),
      t('journey.timeline.batchDeleteGroupMessage', { count: itemCount }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            void Promise.all(selected.map((day) => timeline.removeGroup(day)));
            setSelectedPlanDays(new Set());
          },
        },
      ],
    );
  };

  // ── map chrome (2bulu-style side controls) ──────────────────────────────
  const trackMapRef = useRef<TrackMapHandle>(null);
  const [showWaypoints, setShowWaypoints] = useState(false);
  const [mapStyle, setMapStyle] = useState<MapStyleId>('standard');
  const [expanded, setExpanded] = useState(false);

  // named waypoints carry a km position; project each onto the track polyline so
  // it can be dropped as a pin (same km→coord mapping the elevation scrub uses).
  const mapWaypoints = useMemo(() => {
    const wps = poi.trackWaypoints;
    if (!wps?.length || coords.length < 2) return [];
    const totalKm = buildElevation(poi).totalKm || 1;
    const last = coords.length - 1;
    return wps.map((w) => {
      const frac = Math.max(0, Math.min(1, w.km / totalKm));
      return { name: w.name, km: w.km, coord: coords[Math.round(frac * last)] };
    });
  }, [poi.id, poi.trackWaypoints, poi.trackElevation, coords]);

  const openLayerSheet = () => {
    const mk = (id: MapStyleId, label: string) => ({
      label: (mapStyle === id ? '✓  ' : '') + label,
      onPress: () => setMapStyle(id),
    });
    nav.openActionSheet({
      title: t('journey.map.layerTitle'),
      items: [
        mk('standard', t('journey.map.layerStandard')),
        mk('satellite', t('journey.map.layerSatellite')),
        mk('terrain', t('journey.map.layerTerrain')),
      ],
    });
  };

  // top (map) region height detents: map-max / split / details-max
  const MIN_TOP = Math.round(insets.top + 48);
  // Minimized detail panel should only peek identity info; keep tabs out of view.
  const MIN_CARD_PEEK = insets.bottom + 70;
  const MAX_TOP = Math.round(height - MIN_CARD_PEEK);
  const MID = Math.round(height * (isJourney ? 0.5 : 0.4));
  const detents = [MIN_TOP, MID, MAX_TOP];
  // Keep the native Mapbox surface at a stable size while the split handle moves.
  // Resizing MapView every frame can make the underlying native surface flash a
  // dark/grey loading mask; we resize only the clipping window around it.
  const stableMapH = MAX_TOP;
  const panelBg = theme.featureSurface;
  const mapChromeTheme = useMemo<Theme>(() => ({
    ...theme,
    controlSurface: 'rgba(0,0,0,0.46)',
    text: '#FFFFFF',
  }), [theme]);

  const topH = useRef(new Animated.Value(MID)).current;
  const topHVal = useRef(MID);
  useEffect(() => {
    const id = topH.addListener(({ value }) => { topHVal.current = value; });
    return () => topH.removeListener(id);
  }, [topH]);

  // entrance + dismiss slide
  const slide = useRef(new Animated.Value(height)).current;
  useEffect(() => {
    Animated.spring(slide, { toValue: 0, useNativeDriver: true, bounciness: 2, speed: 14 }).start();
  }, [slide, height]);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const close = () => {
    Animated.timing(slide, { toValue: height, duration: 220, useNativeDriver: true }).start(() => closeRef.current());
  };

  const snapTop = (target: number, vy = 0) => {
    setExpanded(target === MAX_TOP);
    Animated.spring(topH, { toValue: target, useNativeDriver: false, velocity: vy, bounciness: 4, speed: 16 }).start();
  };
  const dragBase = useRef(MID);
  const divider = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 2,
      onPanResponderGrant: () => { dragBase.current = topHVal.current; },
      onPanResponderMove: (_e, g) => {
        const next = Math.max(MIN_TOP, Math.min(MAX_TOP, dragBase.current + g.dy));
        topH.setValue(next);
      },
      onPanResponderRelease: (_e, g) => {
        const projected = topHVal.current + g.vy * 120;
        let best = detents[0];
        for (const d of detents) if (Math.abs(d - projected) < Math.abs(best - projected)) best = d;
        snapTop(best, g.vy);
      },
    })
  ).current;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: theme.bg, transform: [{ translateY: slide }], zIndex: 50 }]}>
      {/* ── TOP: track map (or cover) ───────────────────────────── */}
      <Animated.View onTouchStart={() => setTrackScrub({ index: null })} style={{ height: topH, overflow: 'hidden', backgroundColor: theme.dark ? '#000' : '#16181a' }}>
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: stableMapH }}>
          {hasMap ? (
            <TrackMap
              ref={trackMapRef}
              coords={mapCoords}
              theme={theme}
              fill
              interactive
              accent={theme.accent}
              showLegend={false}
              scrubPt={trackScrub.coord}
              waypoints={mapWaypoints}
              showWaypoints={showWaypoints}
              mapStyle={mapStyle}
            />
          ) : cover ? (
            <Image source={{ uri: cover }} contentFit="cover" style={StyleSheet.absoluteFill} />
          ) : (
            <PhotoTile tone={poi.tone} seed={poi.id} style={StyleSheet.absoluteFill} resWidth={1200} />
          )}
        </View>

        {/* Standard floating detail controls stay legible over every map style. */}
        <View style={{ position: 'absolute', top: insets.top + space.xs, left: space.sm }}>
          <AppIconButton theme={mapChromeTheme} name="arrowL" onPress={close} noShadow />
        </View>
        <View style={{ position: 'absolute', top: insets.top + space.xs, right: space.sm, flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
          <AppIconButton theme={mapChromeTheme} name="share" onPress={() => nav.openSharePanel(poi)} noShadow />
          {isJourney ? <AppIconButton theme={mapChromeTheme} name="gearSettings" onPress={() => nav.openJourneySettings(poi)} noShadow /> : null}
        </View>

        {/* right-edge map controls stay out of the way until the map is
            maximised: waypoint toggle, base-map, and recenter-to-track. */}
        {hasMap && expanded && (
          <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, bottom: 0, right: space.sm, justifyContent: 'flex-end' }}>
            <View pointerEvents="box-none" style={{ gap: space.xs, paddingBottom: space.xxxl }}>
              {mapWaypoints.length > 0 && (
                <CircleBtn theme={theme} name="pin" active={showWaypoints} onPress={() => setShowWaypoints((v) => !v)} />
              )}
              <CircleBtn theme={theme} name="layers" onPress={openLayerSheet} />
              <CircleBtn theme={theme} name="locate" onPress={() => trackMapRef.current?.fitRoute()} />
            </View>
          </View>
        )}
      </Animated.View>

      {/* ── DIVIDER: rounded "lip" that overlaps the map's bottom, giving the
          detail panel capsule-rounded left/right shoulders (like a sheet pulled
          up over the map); drag to resize / maximise either half ──────── */}
      <View
        {...divider.panHandlers}
        style={{
          height: 26,
          marginTop: -26,
          backgroundColor: panelBg,
          borderTopLeftRadius: radius.feature,
          borderTopRightRadius: radius.feature,
          alignItems: 'center',
          justifyContent: 'center',
          // a faint upward shadow so the rounded card lifts off the map a touch
          ...shadow(theme.dark ? 0.45 : 0.04, theme.dark ? 12 : 8, -2),
        }}
      >
        <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: theme.dark ? theme.text3 : 'rgba(0,0,0,0.12)' }} />
      </View>

      {/* ── BOTTOM: route / journey details — white panel in light mode ─────── */}
      <View style={{ flex: 1, backgroundColor: panelBg }}>
        {isJourney ? (
          <View style={{ flex: 1, paddingHorizontal: space.md }}>
            <SelectedPoiCard
              theme={theme}
              poi={poi}
              embedded
              scrollContent
              scrollContentBottomPadding={insets.bottom + (planEditorOpen ? 96 : space.xxl)}
              onTrackSelectionChange={(index, coord) => setTrackScrub({ index, coord })}
              planEditorOpen={planEditorOpen}
              onPlanEditorOpenChange={(open) => { setPlanEditorOpen(open); if (!open) setSelectedPlanDays(new Set()); }}
              selectedPlanDays={selectedPlanDays}
              onSelectedPlanDaysChange={setSelectedPlanDays}
            />
          </View>
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            bounces={false}
            alwaysBounceVertical={false}
            overScrollMode="never"
            contentContainerStyle={{ paddingHorizontal: space.md, paddingBottom: insets.bottom + space.xxl }}
          >
            <RoutePreviewPanel theme={theme} poi={poi} />
          </ScrollView>
        )}
      </View>

      {planEditorOpen ? (
        <Press
            onPress={deleteSelectedPlanDays}
            disabled={!selectedPlanDays.size}
            accessibilityState={{ disabled: !selectedPlanDays.size }}
            style={{
              position: 'absolute',
              right: space.md,
              bottom: insets.bottom + space.md,
              zIndex: 1000,
              height: 48,
              paddingHorizontal: space.lg,
              borderRadius: radius.pill,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: space.xs,
              backgroundColor: selectedPlanDays.size ? theme.danger : theme.text,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: selectedPlanDays.size ? theme.danger : theme.text,
              opacity: 1,
              elevation: 100,
              ...shadow(theme.dark ? 0.5 : 0.22, 18, 5),
            }}
          >
            <Icon name="trash" color="#FFFFFF" size={17} />
            <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '800' }}>
              {t('journey.timeline.deleteSelected', { count: selectedPlanDays.size })}
            </Text>
          </Press>
      ) : null}
    </Animated.View>
  );
}
