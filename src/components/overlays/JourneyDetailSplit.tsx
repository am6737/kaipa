// JourneyDetailSplit.tsx — the unified route/journey detail. The track map fills
// the top, the rich details (SelectedPoiCard, hero removed) fill the bottom, and
// a draggable divider snaps between three detents: map-maximised, 50/50, and
// details-maximised. Replaces the old full-screen JourneyCardFull.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, Animated, PanResponder, ScrollView, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme } from '../../theme/theme';
import { shadow } from '../../theme/shadow';
import { Poi } from '../../data/pois';
import { buildElevation } from '../../data/elevation';
import { useNav } from '../../nav/NavContext';
import { useI18n } from '../../i18n';
import { Icon } from '../Icon';
import { Press } from '../Press';
import { CircleBtn } from '../CircleBtn';
import { PhotoTile } from '../PhotoTile';
import { TrackMap, TrackMapHandle, MapStyleId } from './TrackMap';
import { SelectedPoiCard } from '../../screens/JourneyCard';

export function JourneyDetailSplit({ theme, poi, onClose }: { theme: Theme; poi: Poi; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const nav = useNav();
  const { t } = useI18n();

  const isJourney = poi.kind === 'journey';
  const coords = poi.trackCoords || [];
  const hasMap = coords.length >= 2;
  const cover = poi.photoUris?.[0];
  const [trackScrub, setTrackScrub] = useState<{ index: number | null; coord?: [number, number] }>({ index: null });

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
  const MID = Math.round(height * 0.5);
  const detents = [MIN_TOP, MID, MAX_TOP];
  // Keep the native Mapbox surface at a stable size while the split handle moves.
  // Resizing MapView every frame can make the underlying native surface flash a
  // dark/grey loading mask; we resize only the clipping window around it.
  const stableMapH = MAX_TOP;
  const panelBg = theme.dark ? '#28282C' : theme.surfaceTop;

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
              coords={coords}
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

        {/* back + top actions — bare icons, no circular backdrop */}
        <View style={{ position: 'absolute', top: insets.top + 6, left: 14 }}>
          <Press onPress={close} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="arrowL" color="#fff" size={23} />
          </Press>
        </View>
        <View style={{ position: 'absolute', top: insets.top + 6, right: 14, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Press onPress={() => nav.openSharePanel(poi)} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="share" color="#fff" size={21} />
          </Press>
          {isJourney && (
            <Press onPress={() => nav.openJourneySettings(poi)} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="gearSettings" color="#fff" size={22} />
            </Press>
          )}
        </View>

        {/* right-edge map controls stay out of the way until the map is
            maximised: waypoint toggle, base-map, and recenter-to-track. */}
        {hasMap && expanded && (
          <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, bottom: 0, right: 12, justifyContent: 'flex-end' }}>
            <View pointerEvents="box-none" style={{ gap: 10, paddingBottom: 40 }}>
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
          borderTopLeftRadius: 26,
          borderTopRightRadius: 26,
          alignItems: 'center',
          justifyContent: 'center',
          // a faint upward shadow so the rounded card lifts off the map a touch
          ...shadow(theme.dark ? 0.45 : 0.1, 12, -3),
        }}
      >
        <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: theme.text3 }} />
      </View>

      {/* ── BOTTOM: route / journey details — white panel in light mode ─────── */}
      <View style={{ flex: 1, backgroundColor: panelBg }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          bounces={false}
          alwaysBounceVertical={false}
          overScrollMode="never"
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 28 }}
        >
          <SelectedPoiCard
            theme={theme}
            poi={poi}
            embedded
            onTrackSelectionChange={(index, coord) => setTrackScrub({ index, coord })}
          />
        </ScrollView>
      </View>
    </Animated.View>
  );
}
