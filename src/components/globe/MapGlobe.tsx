// MapGlobe.tsx — the real Mapbox 3D globe (@rnmapbox/maps). Only imported when a
// public token is configured; the native module is required for it to run, so
// this lives behind token-gating + an ErrorBoundary (see index.tsx).
//
// The earth sits in real space: the `globe` projection with Mapbox's atmosphere
// kept intact — a blue horizon rim fading into black outer space with a star
// field (see the Atmosphere config below). The backdrop is space-black so the
// globe never flashes the app background before the map paints.
//
// Route/journey points are drawn as rounded-square photo markers (PhotoPin via
// MarkerView) — the default style — rather than flat colored dots, so each point
// previews its real scenery. The current-location pin stays a plain locating dot.
import React, { useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, useWindowDimensions } from 'react-native';
import Mapbox, { MapView, Camera, Atmosphere, StyleImport, MarkerView, ShapeSource, LineLayer } from '@rnmapbox/maps';
import { GlobeProps } from './types';
import { PhotoPin, PHOTO_PIN_ANCHOR_Y } from './PhotoPin';
import { Icon } from '../Icon';
import { LightMapOverrides, LIGHT_MAP_BACKGROUND } from './LightMapStyle';

// Standard keeps Kaipa's original 3D globe. Light starts from Mapbox Light and
// overrides its existing layers below to match the airy travel-map reference.
const STANDARD_STYLE = 'mapbox://styles/mapbox/standard';
const LIGHT_STYLE = 'mapbox://styles/mapbox/light-v11';
const TERRAIN_STYLE = 'mapbox://styles/mapbox/outdoors-v12';
const SATELLITE_STYLE = 'mapbox://styles/mapbox/standard-satellite';

// Deep-space backdrop — the color of "outer space" beyond the atmosphere, used
// both for the Atmosphere spaceColor and the wrapper bg (so no app-bg flash).
const SPACE = '#000010';

const TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN || '';
let tokenSet = false;
function ensureToken() {
  if (!tokenSet && TOKEN) {
    Mapbox.setAccessToken(TOKEN);
    tokenSet = true;
  }
}

function boundsFor(coords: [number, number][]) {
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  coords.forEach(([lon, lat]) => {
    minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
    minLon = Math.min(minLon, lon); maxLon = Math.max(maxLon, lon);
  });
  const pad = Math.max(maxLat - minLat, maxLon - minLon, 0.01) * 0.12;
  return { ne: [maxLon + pad, maxLat + pad] as [number, number], sw: [minLon - pad, minLat - pad] as [number, number] };
}

export default function MapGlobe({ theme, pois, activePoiId, onPoiPress, onBackgroundPress, onMapCoordinatePress, center, focusCoords, focusSegments, focusBoundaries, selectionPin, focusConnector, onRouteBoundaryPress, pin, mapStyle = 'standard', mapLocale = 'zh', showMapLabels = true, cameraAction, focusBottomPadding, onCameraOrientationChange, onCameraGestureStart }: GlobeProps) {
  ensureToken();
  const { height } = useWindowDimensions();
  const lon0 = center?.lon ?? 100;
  const lat0 = center?.lat ?? 32;
  const cameraRef = useRef<Camera>(null);
  const isLightMap = mapStyle === 'light';
  const isTerrainMap = mapStyle === 'terrain';
  const supportsStyleImport = mapStyle === 'standard' || mapStyle === 'satellite';
  const styleURL = mapStyle === 'light' ? LIGHT_STYLE : mapStyle === 'terrain' ? TERRAIN_STYLE : mapStyle === 'satellite' ? SATELLITE_STYLE : STANDARD_STYLE;
  const activeSegment = focusSegments?.find((segment) => segment.active);
  const activeBoundary = focusBoundaries?.find((boundary) => boundary.active);
  const hasFocusedRoutePart = (focusSegments?.some((segment) => !segment.active) ?? false)
    || (focusBoundaries?.some((boundary) => !boundary.active) ?? false);
  const cameraFocusCoords = hasFocusedRoutePart
    ? activeSegment?.coordinates ?? (activeBoundary ? [activeBoundary.coordinate] : focusCoords)
    : focusCoords;
  const focusKey = cameraFocusCoords?.map(([lon, lat]) => `${lon.toFixed(5)},${lat.toFixed(5)}`).join('|') || '';
  const focusShape = useMemo<GeoJSON.FeatureCollection | null>(() => focusCoords && focusCoords.length >= 2 ? ({
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: focusCoords } }],
  }) : null, [focusKey]);
  const connectorShape = useMemo<GeoJSON.Feature | null>(() => focusConnector ? ({
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates: focusConnector.coordinates },
  }) : null, [focusConnector]);

  useEffect(() => {
    // Endpoint editing reuses the detail map. Draft route segments change after
    // every tap, but those changes must not be treated as a new camera target:
    // keep the user's current pan/zoom and only move the endpoint marker.
    if (onMapCoordinatePress) return;
    if (cameraFocusCoords?.length) {
      if (cameraFocusCoords.length >= 2) {
        const bounds = boundsFor(cameraFocusCoords);
        cameraRef.current?.setCamera({
          bounds: {
            ...bounds,
            paddingTop: 90,
            paddingRight: 54,
            paddingBottom: focusBottomPadding ?? Math.round(height * 0.54),
            paddingLeft: 54,
          },
          animationDuration: 900,
        });
      } else {
        cameraRef.current?.setCamera({ centerCoordinate: cameraFocusCoords[0], zoomLevel: 11, animationDuration: 900 });
      }
    }
  // Sheet detent changes update focusBottomPadding, but must not move the map.
  // The latest padding is still used when the route itself changes or when the
  // user explicitly requests “fit route” through cameraAction.
  }, [focusKey, height, onMapCoordinatePress]);

  useEffect(() => {
    if (!cameraAction) return;
    if (cameraAction.type === 'resetNorth') {
      cameraRef.current?.setCamera({ heading: 0, pitch: 0, animationDuration: 360 });
      return;
    }
    if (!cameraFocusCoords?.length) return;
    if (cameraFocusCoords.length >= 2) {
      cameraRef.current?.setCamera({
        bounds: {
          ...boundsFor(cameraFocusCoords),
          paddingTop: 90,
          paddingRight: 54,
          paddingBottom: focusBottomPadding ?? Math.round(height * 0.54),
          paddingLeft: 54,
        },
        heading: 0,
        pitch: 0,
        animationDuration: 650,
      });
    } else {
      cameraRef.current?.setCamera({ centerCoordinate: cameraFocusCoords[0], zoomLevel: 11, heading: 0, pitch: 0, animationDuration: 650 });
    }
  }, [cameraAction?.revision]);

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: isLightMap ? LIGHT_MAP_BACKGROUND : isTerrainMap ? theme.bg : SPACE }]}>
      <MapView
        style={{ flex: 1 }}
        projection={supportsStyleImport ? 'globe' : 'mercator'}
        styleURL={styleURL}
        // NOTE: do NOT set `localizeLabels` here. That maps to the Mapbox SDK's
        // classic Style.localizeLabels(), which rewrites symbol-layer text-fields
        // — but the Standard style keeps its layers inside an imported fragment,
        // so the native call crashes the app on Android (闪退). The Standard style
        // already labels places in their local language; to force a single
        // language use the import config's `language` key instead (see below).
        onCameraChanged={onCameraOrientationChange || onCameraGestureStart ? (state) => {
          onCameraOrientationChange?.(state.properties.heading, state.properties.pitch);
          if (state.gestures.isGestureActive) onCameraGestureStart?.();
        } : undefined}
        onPress={(event) => {
          const coordinates = event.geometry.coordinates;
          if (onMapCoordinatePress && coordinates.length >= 2) {
            onMapCoordinatePress([coordinates[0], coordinates[1]]);
            return;
          }
          onBackgroundPress?.();
        }}
        scaleBarEnabled={false}
        logoEnabled={false}
        attributionEnabled={false}
        compassEnabled={false}
        rotateEnabled
        zoomEnabled
        scrollEnabled
        pitchEnabled
      >
        {/* defaultSettings only (NOT controlled) so pinch-zoom / pan / rotate
            stick and the camera never snaps back on re-render. Opens framed on
            the globe; the user can freely zoom all the way into a detailed map,
            Apple-Maps style. */}
        <Camera ref={cameraRef} defaultSettings={{ centerCoordinate: [lon0, lat0], zoomLevel: 1.6 }} />
        {/* Standard style basemap config: show all labels (place / road / POI /
            transit) so zooming in reveals region, road and place names — a full
            map experience. Follows the app's light/dark mode via the light preset. */}
        {isLightMap ? <LightMapOverrides locale={mapLocale} showLabels={showMapLabels} /> : supportsStyleImport ? (
          <>
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
            {/* The earth in real space: a faint, dim atmosphere rim (low near-horizon
                glow → dark-blue high sky) fading into black outer space with a
                visible star field. */}
            <Atmosphere
              style={{
                color: '#1e3a5f',
                highColor: '#0a1730',
                spaceColor: SPACE,
                horizonBlend: 0.02,
                starIntensity: 0.55,
              }}
            />
          </>
        ) : null}

        {focusShape ? (
          <>
            <ShapeSource id="discover-focus-route" shape={focusShape}>
              <LineLayer slot="top" id="discover-focus-route-line" style={{ lineColor: focusSegments?.length ? theme.trailFaint : theme.accent, lineWidth: focusSegments?.length ? 3 : 4, lineOpacity: focusSegments?.length ? 0.5 : 1, lineEmissiveStrength: 1.3, lineCap: 'round', lineJoin: 'round' } as any} />
            </ShapeSource>
            {focusSegments?.map((segment, index) => {
              const shape = { type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: segment.coordinates } };
              return (
                <React.Fragment key={segment.id}>
                  <ShapeSource id={`discover-segment-${index}`} shape={shape}>
                    <LineLayer slot="top" id={`discover-segment-${index}-line`} style={{ lineColor: segment.color, lineWidth: 4, lineOpacity: segment.active ? 1 : 0.26, lineEmissiveStrength: 1.25, lineCap: 'round', lineJoin: 'round' } as any} />
                  </ShapeSource>
                </React.Fragment>
              );
            })}
            {connectorShape && focusConnector ? (
              <ShapeSource id="journey-endpoint-connector" shape={connectorShape}>
                <LineLayer
                  slot="top"
                  id="journey-endpoint-connector-line"
                  style={{
                    lineColor: focusConnector.color,
                    lineWidth: 2.2,
                    lineOpacity: 0.72,
                    lineDasharray: [1.5, 1.5],
                    lineCap: 'round',
                  } as any}
                />
              </ShapeSource>
            ) : null}
            {focusBoundaries?.map((boundary) => {
              const foreground = boundary.pending ? theme.text : '#FFFFFF';
              return (
                <MarkerView key={boundary.id} coordinate={boundary.coordinate} anchor={{ x: 0.5, y: 1 }} allowOverlap>
                  <Pressable
                    onPress={() => onRouteBoundaryPress?.(boundary.groupKey)}
                    accessibilityRole="button"
                    accessibilityLabel={`${boundary.title} ${boundary.distance}`}
                    hitSlop={7}
                    style={({ pressed }) => ({ alignItems: 'center', opacity: pressed ? 0.72 : boundary.active ? 1 : 0.46, transform: [{ scale: pressed ? 0.96 : 1 }] })}
                  >
                    <View
                      style={{
                        height: 24,
                        maxWidth: 128,
                        paddingLeft: 6,
                        paddingRight: 3,
                        borderRadius: 7,
                        flexDirection: 'row',
                        alignItems: 'center',
                        backgroundColor: boundary.pending ? theme.surfaceTop : boundary.color,
                        borderWidth: boundary.pending ? StyleSheet.hairlineWidth : 0,
                        borderColor: theme.hairline,
                        shadowColor: '#000000',
                        shadowOpacity: boundary.active ? 0.16 : 0.08,
                        shadowRadius: 5,
                        shadowOffset: { width: 0, height: 2 },
                        elevation: boundary.active ? 4 : 2,
                      }}
                    >
                      {boundary.pending ? (
                        <View style={{ width: 4, height: 4, borderRadius: 2, marginRight: 3, borderWidth: 1.5, borderColor: boundary.color }} />
                      ) : null}
                      <Text numberOfLines={1} style={{ flexShrink: 1, color: foreground, fontSize: 10.5, fontWeight: '700', letterSpacing: 0 }}>{boundary.title}</Text>
                      <Text numberOfLines={1} style={{ marginLeft: 2.5, color: foreground, fontSize: 10.5, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{boundary.distance}</Text>
                      <Text style={{ marginLeft: 2.5, color: foreground, fontSize: 12.5, fontWeight: '500', lineHeight: 15 }}>›</Text>
                    </View>
                    <View style={{ width: 1.5, height: 2.5, backgroundColor: boundary.color, opacity: boundary.pending ? 0.55 : 0.9 }} />
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: boundary.color, borderWidth: 1.8, borderColor: '#FFFFFF' }} />
                  </Pressable>
                </MarkerView>
              );
            })}
            {selectionPin ? (
              <MarkerView coordinate={selectionPin.coordinate} anchor={{ x: 0.5, y: 1 }} allowOverlap>
                <View style={{ alignItems: 'center' }}>
                  <View
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 15,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: '#FFFFFF',
                      borderWidth: StyleSheet.hairlineWidth,
                      borderColor: 'rgba(0,0,0,0.08)',
                      shadowColor: '#000000',
                      shadowOpacity: 0.2,
                      shadowRadius: 7,
                      shadowOffset: { width: 0, height: 3 },
                      elevation: 5,
                    }}
                  >
                    <Icon name="pin" color={theme.text2} size={18} strokeWidth={2.1} />
                  </View>
                  <View style={{ width: 8, height: 8, marginTop: -2, borderRadius: 4, backgroundColor: selectionPin.color, borderWidth: 1.8, borderColor: '#FFFFFF' }} />
                </View>
              </MarkerView>
            ) : null}
            <MarkerView coordinate={focusCoords![0]} anchor={{ x: 0.5, y: 0.5 }} allowOverlap>
              <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: '#34C759', borderWidth: 2.5, borderColor: '#FFFFFF' }} />
            </MarkerView>
            {focusBoundaries?.length ? null : (
              <MarkerView coordinate={focusCoords![focusCoords!.length - 1]} anchor={{ x: 0.5, y: 0.5 }} allowOverlap>
                <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: theme.danger, borderWidth: 2.5, borderColor: '#FFFFFF' }} />
              </MarkerView>
            )}
          </>
        ) : null}

        {/* Photo + capsule-label markers. allowOverlap keeps
            every photo visible even when the globe is zoomed far out. Press is
            handled by the Pressable child (MarkerView has no onPress). */}
        {pois.map((p) => (
          <MarkerView
            key={p.id}
            coordinate={[p.lng, p.lat]}
            anchor={{ x: 0.5, y: PHOTO_PIN_ANCHOR_Y }}
            allowOverlap
            isSelected={activePoiId === p.id}
          >
            <Pressable
              onPress={() => onPoiPress?.(p.id)}
              accessibilityRole="button"
              accessibilityLabel={p.label}
              hitSlop={6}
            >
              <PhotoPin theme={theme} poi={p} active={activePoiId === p.id} />
            </Pressable>
          </MarkerView>
        ))}

        {/* current-location pin — a plain locating dot, not a photo */}
        {pin && (
          <MarkerView coordinate={[pin.lng, pin.lat]} anchor={{ x: 0.5, y: 0.5 }} allowOverlap>
            <View
              style={{
                width: 16,
                height: 16,
                borderRadius: 8,
                backgroundColor: theme.dotCore,
                borderWidth: 3,
                borderColor: theme.dotRing,
              }}
            />
          </MarkerView>
        )}
      </MapView>
    </View>
  );
}
