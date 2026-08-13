// TrackMap.tsx — shared route-line map used by the elevation overlay (rounded
// card) and journey detail surfaces (full-bleed hero). Renders the track as a
// Mapbox line with start/end markers and an optional synced scrub point.
import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Mapbox, { MapView, Camera, ShapeSource, LineLayer, CircleLayer, SymbolLayer, MarkerView, StyleImport, Atmosphere } from '@rnmapbox/maps';
import { Theme } from '../../theme/theme';
import { useI18n } from '../../i18n';

export const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN || '';
let _mbTokenSet = false;
export function ensureMapboxToken() {
  if (!_mbTokenSet && MAPBOX_TOKEN) { Mapbox.setAccessToken(MAPBOX_TOKEN); _mbTokenSet = true; }
}
export const STANDARD_STYLE = 'mapbox://styles/mapbox/standard';
const SPACE = '#000010';

// Base-map layers the map-chrome layer button cycles through. `standard` +
// `satellite` are Mapbox Standard styles (they accept the <StyleImport> config,
// e.g. lightPreset); `terrain` is the classic outdoors style (contours/relief,
// no StyleImport).
export type MapStyleId = 'standard' | 'satellite' | 'terrain';
export const MAP_STYLES: Record<MapStyleId, string> = {
  standard: STANDARD_STYLE,
  satellite: 'mapbox://styles/mapbox/standard-satellite',
  terrain: 'mapbox://styles/mapbox/outdoors-v12',
};

export type TrackMapWaypoint = { name: string; coord: [number, number]; km?: number };
export interface TrackMapHandle {
  /** re-frame the camera to fit the whole track */
  fitRoute: () => void;
  /** restore a north-up, top-down camera without changing the current center */
  resetNorth: () => void;
}

function trackBounds(coords: [number, number][]) {
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const [lon, lat] of coords) {
    minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
    minLon = Math.min(minLon, lon); maxLon = Math.max(maxLon, lon);
  }
  const padDeg = Math.max(maxLat - minLat, maxLon - minLon) * 0.15;
  return {
    ne: [maxLon + padDeg, maxLat + padDeg] as [number, number],
    sw: [minLon - padDeg, minLat - padDeg] as [number, number],
  };
}

export const TrackMap = forwardRef<TrackMapHandle, {
  coords: [number, number][];
  theme: Theme;
  /** fixed-height rounded card. Ignored when `fill` is set. */
  height?: number;
  /** fill the parent container (full-bleed hero) instead of a fixed card */
  fill?: boolean;
  rounded?: boolean;
  showLegend?: boolean;
  scrubPt?: [number, number];
  accent: string;
  /** allow pinch-zoom / pan / rotate / pitch. Off = a static framed thumbnail. */
  interactive?: boolean;
  /** named waypoints to plot as pins when `showWaypoints` is on */
  waypoints?: TrackMapWaypoint[];
  /** whether the waypoint pins are visible */
  showWaypoints?: boolean;
  /** which base map to render (defaults to the Mapbox Standard style) */
  mapStyle?: MapStyleId;
  /** coarse visibility control for Mapbox's own labels */
  showMapLabels?: boolean;
  /** reports camera orientation so full-screen chrome can reveal a compass */
  onCameraOrientationChange?: (heading: number, pitch: number) => void;
  /** camera padding used when framing the full route: [top, right, bottom, left] */
  routePadding?: [number, number, number, number];
}>(function TrackMap({
  coords, theme, height, fill, rounded = true, showLegend = true, scrubPt, accent, interactive = false,
  waypoints, showWaypoints = false, mapStyle = 'standard', showMapLabels = true, onCameraOrientationChange,
  routePadding = [28, 28, 28, 28],
}, ref) {
  const { t } = useI18n();
  ensureMapboxToken();
  const cameraRef = useRef<Camera>(null);
  const wpSourceRef = useRef<ShapeSource>(null);
  const lastWpTapAt = useRef(0);
  const [selectedWp, setSelectedWp] = useState<{ name: string; km?: number; coord: [number, number] } | null>(null);
  // drop any open callout when the waypoint layer is hidden or the track changes.
  useEffect(() => { setSelectedWp(null); }, [showWaypoints, coords]);

  // Stable across scrub frames so the native source isn't re-clustered every
  // render (which would make the pins/labels flicker while dragging the chart).
  const waypointGeoJSON = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: 'FeatureCollection',
    features: (showWaypoints ? waypoints ?? [] : []).map((w, i) => ({
      type: 'Feature',
      id: i,
      properties: { name: w.name, km: w.km ?? null },
      geometry: { type: 'Point', coordinates: w.coord },
    })),
  }), [showWaypoints, waypoints]);
  useImperativeHandle(ref, () => ({
    fitRoute: () => {
      if (coords.length === 1) {
        cameraRef.current?.setCamera({ centerCoordinate: coords[0], zoomLevel: 11, animationDuration: 600 });
        return;
      }
      if (coords.length < 2) return;
      const b = trackBounds(coords);
      cameraRef.current?.fitBounds(b.ne, b.sw, routePadding, 600);
    },
    resetNorth: () => {
      cameraRef.current?.setCamera({ heading: 0, pitch: 0, animationDuration: 360 });
    },
  }), [coords, routePadding]);

  // Tap a cluster → zoom in until it splits; tap a single waypoint → open its
  // name callout. lastWpTapAt lets the map's own onPress tell an empty-map tap
  // (dismiss) apart from a tap that landed on a waypoint (keep), order-agnostic.
  const onWaypointPress = async (ev: any) => {
    const f = ev?.features?.[0];
    const coord = f?.geometry?.coordinates as [number, number] | undefined;
    if (!f || !coord) return;
    lastWpTapAt.current = Date.now();
    if (f.properties?.cluster) {
      setSelectedWp(null);
      try {
        const zoom = await wpSourceRef.current?.getClusterExpansionZoom(f);
        if (zoom != null) cameraRef.current?.setCamera({ centerCoordinate: coord, zoomLevel: zoom + 0.4, animationDuration: 500 });
      } catch { /* getClusterExpansionZoom can reject mid-gesture; ignore */ }
    } else {
      const km = typeof f.properties?.km === 'number' ? f.properties.km : undefined;
      setSelectedWp({ name: f.properties?.name ?? '', km, coord });
    }
  };
  const handleMapPress = () => {
    if (Date.now() - lastWpTapAt.current < 350) return;
    setSelectedWp(null);
  };

  if (!coords.length) return null;

  const routeGeoJSON: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } }],
  };

  const hasWaypoints = waypointGeoJSON.features.length > 0;

  const bounds = coords.length >= 2 ? trackBounds(coords) : null;
  const styleURL = MAP_STYLES[mapStyle] || STANDARD_STYLE;
  const supportsStyleImport = mapStyle === 'standard' || mapStyle === 'satellite';
  const s = coords[0], e = coords[coords.length - 1];
  const cameraDefaults = bounds
    ? { bounds: { ...bounds, paddingTop: routePadding[0], paddingRight: routePadding[1], paddingBottom: routePadding[2], paddingLeft: routePadding[3] } }
    : { centerCoordinate: s, zoomLevel: 11 };
  const routeColor = accent;
  const routeOuter = theme.dark ? '#FFFFFF' : 'rgba(255,255,255,0.9)';
  const routeHalo = theme.dark ? 'rgba(0,0,0,0.85)' : 'rgba(0,0,0,0.16)';

  const containerStyle = fill
    ? StyleSheet.absoluteFill
    : { height, borderRadius: rounded ? 18 : 0, overflow: 'hidden' as const, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline };

  if (!MAPBOX_TOKEN) {
    return (
      <View style={[containerStyle, { backgroundColor: theme.dark ? '#16181a' : '#e8edee', alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ fontSize: 12, color: theme.text3 }}>Map unavailable</Text>
      </View>
    );
  }

  return (
    <View style={[containerStyle, { backgroundColor: SPACE }, fill ? { overflow: 'hidden' } : null]}>
      <MapView
        style={{ flex: 1 }}
        styleURL={styleURL}
        projection="globe"
        onPress={interactive ? handleMapPress : undefined}
        onCameraChanged={onCameraOrientationChange ? (state) => {
          onCameraOrientationChange(state.properties.heading, state.properties.pitch);
        } : undefined}
        scrollEnabled={interactive} zoomEnabled={interactive} rotateEnabled={interactive}
        pitchEnabled={interactive} scaleBarEnabled={false} logoEnabled={false}
        attributionEnabled={false} compassEnabled={false}
      >
        {/* defaultSettings frames the route once on mount, then user gestures own
            the camera (it never snaps back on re-render / resize). The layer /
            recenter buttons drive it imperatively through cameraRef instead. */}
        <Camera ref={cameraRef} defaultSettings={cameraDefaults} />
        {supportsStyleImport && (
          <StyleImport
            id="basemap"
            existing
            config={{
              lightPreset: theme.mapLightPreset,
              showPlaceLabels: showMapLabels,
              showRoadLabels: showMapLabels,
              showPointOfInterestLabels: showMapLabels,
              showTransitLabels: showMapLabels,
            } as any}
          />
        )}
        <Atmosphere
          style={{
            color: '#1e3a5f',
            highColor: '#0a1730',
            spaceColor: SPACE,
            horizonBlend: 0.02,
            starIntensity: 0.55,
          }}
        />
        {coords.length >= 2 ? (
          <>
            <ShapeSource id="elev-route" shape={routeGeoJSON}>
              <LineLayer slot="top" id="elev-route-shadow" style={{ lineColor: routeHalo, lineWidth: theme.dark ? 7 : 8, lineBlur: theme.dark ? 1 : 2.5, lineCap: 'round', lineJoin: 'round' } as any} />
              <LineLayer slot="top" id="elev-route-outer" style={{ lineColor: routeOuter, lineOpacity: 1, lineEmissiveStrength: 1.2, lineWidth: theme.dark ? 5.2 : 5.5, lineBlur: 0, lineCap: 'round', lineJoin: 'round' } as any} />
              <LineLayer slot="top" id="elev-route-line" style={{ lineColor: routeColor, lineOpacity: 1, lineEmissiveStrength: 1.6, lineWidth: theme.dark ? 3.5 : 3.5, lineCap: 'round', lineJoin: 'round' } as any} />
            </ShapeSource>
            <MarkerView coordinate={s} anchor={{ x: 0.5, y: 0.5 }} allowOverlap>
              <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: '#34C759', borderWidth: 2.5, borderColor: '#fff' }} />
            </MarkerView>
            <MarkerView coordinate={e} anchor={{ x: 0.5, y: 0.5 }} allowOverlap>
              <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: theme.danger, borderWidth: 2.5, borderColor: '#fff' }} />
            </MarkerView>
          </>
        ) : (
          <MarkerView coordinate={s} anchor={{ x: 0.5, y: 0.5 }} allowOverlap>
            <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: routeColor, borderWidth: 3, borderColor: '#fff', boxShadow: '0px 2px 6px rgba(0,0,0,0.28)' }} />
          </MarkerView>
        )}
        {/* named waypoints — native clustered source so hundreds stay smooth:
            dense areas merge into a count bubble and split apart (revealing more
            pins + labels) as you zoom in. Labels collide natively (textOptional),
            so only as many names as fit are drawn; tap any pin for its callout. */}
        {hasWaypoints && (
          <ShapeSource id="waypoints" ref={wpSourceRef} shape={waypointGeoJSON} cluster clusterRadius={44} clusterMaxZoomLevel={14} onPress={onWaypointPress}>
            <CircleLayer
              slot="top"
              id="wp-cluster"
              filter={['has', 'point_count'] as any}
              style={{ circleColor: accent, circleOpacity: 0.94, circleStrokeColor: '#fff', circleStrokeWidth: 1.5, circleRadius: ['step', ['get', 'point_count'], 9, 10, 12, 50, 15] } as any}
            />
            <SymbolLayer
              slot="top"
              id="wp-cluster-count"
              filter={['has', 'point_count'] as any}
              style={{ textField: ['get', 'point_count_abbreviated'], textSize: 10, textColor: '#fff', textAllowOverlap: true } as any}
            />
            <CircleLayer
              slot="top"
              id="wp-dot"
              filter={['!', ['has', 'point_count']] as any}
              style={{ circleColor: '#fff', circleRadius: 6, circleStrokeColor: accent, circleStrokeWidth: 3 } as any}
            />
            <SymbolLayer
              slot="top"
              id="wp-label"
              filter={['!', ['has', 'point_count']] as any}
              style={{
                textField: ['get', 'name'],
                textSize: 11.5,
                textColor: theme.dark ? '#ffffff' : '#15181b',
                textHaloColor: theme.dark ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.95)',
                textHaloWidth: 1.4,
                textAnchor: 'left',
                textOffset: [0.75, 0],
                textOptional: true,
                textAllowOverlap: false,
              } as any}
            />
          </ShapeSource>
        )}
        {scrubPt && (
          <MarkerView coordinate={scrubPt} anchor={{ x: 0.5, y: 0.5 }} allowOverlap>
            <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: routeColor, borderWidth: 2.5, borderColor: '#fff', opacity: 0.9 }} />
          </MarkerView>
        )}
        {showWaypoints && selectedWp && (
          <MarkerView coordinate={selectedWp.coord} anchor={{ x: 0.5, y: 1 }} allowOverlap>
            <View style={{ alignItems: 'center', paddingBottom: 10 }}>
              <View style={{ maxWidth: 220, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 12, backgroundColor: theme.dark ? 'rgba(28,28,30,0.96)' : 'rgba(255,255,255,0.98)', borderWidth: StyleSheet.hairlineWidth, borderColor: theme.border, boxShadow: theme.dark ? '0px 6px 18px rgba(0,0,0,0.5)' : '0px 6px 18px rgba(0,0,0,0.16)' }}>
                <Text numberOfLines={2} style={{ fontSize: 13.5, fontWeight: '700', color: theme.text }}>{selectedWp.name}</Text>
                {selectedWp.km != null && (
                  <Text style={{ fontSize: 11, color: theme.text2, marginTop: 2 }}>{selectedWp.km.toFixed(1)} km</Text>
                )}
              </View>
              <View style={{ width: 0, height: 0, borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 7, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: theme.dark ? 'rgba(28,28,30,0.96)' : 'rgba(255,255,255,0.98)', marginTop: -1 }} />
            </View>
          </MarkerView>
        )}
      </MapView>
      {showLegend && (
        <View style={{ position: 'absolute', left: 12, bottom: 10, flexDirection: 'row', gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#34C759' }} />
            <Text style={{ fontSize: 10.5, color: theme.dark ? '#ccc' : theme.text2 }}>{t('journey.elevation.waypointStart')}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.danger }} />
            <Text style={{ fontSize: 10.5, color: theme.dark ? '#ccc' : theme.text2 }}>{t('journey.elevation.waypointEnd')}</Text>
          </View>
        </View>
      )}
    </View>
  );
});
