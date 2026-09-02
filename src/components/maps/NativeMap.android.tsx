import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { View } from 'react-native';
import type { MapViewRef } from 'expo-gaode-map';
import { gcj02ToWgs84, wgs84ToGcj02 } from '../../lib/coordinates';
import type { NativeMapHandle, NativeMapProps } from './types';

const AMAP_ANDROID_KEY = (process.env.EXPO_PUBLIC_AMAP_ANDROID_KEY || '').trim();
let AMap: typeof import('expo-gaode-map') | null = null;
let amapInitialized = false;

if (AMAP_ANDROID_KEY) {
  try {
    // Lazy loading keeps Expo Go usable when the AMap native module is absent.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    AMap = require('expo-gaode-map') as typeof import('expo-gaode-map');
  } catch {
    AMap = null;
  }
}

function ensureAmapReady(module: typeof import('expo-gaode-map')): boolean {
  if (amapInitialized) return true;
  try {
    module.ExpoGaodeMapModule.setPrivacyConfig({
      hasShow: true,
      hasContainsPrivacy: true,
      hasAgree: true,
      privacyVersion: '2026-09-02',
    });
    module.ExpoGaodeMapModule.initSDK({ androidKey: AMAP_ANDROID_KEY });
    amapInitialized = true;
    return true;
  } catch {
    return false;
  }
}

function point(coordinate: [number, number]) {
  const [longitude, latitude] = wgs84ToGcj02(coordinate);
  return { longitude, latitude };
}

export const NATIVE_MAP_AVAILABLE = !!AMap;

export const NativeMap = forwardRef<NativeMapHandle, NativeMapProps>(function NativeMap({
  style,
  initialCenter,
  initialZoom = 5,
  initialFitCoordinates,
  initialPadding,
  mapStyle = 'standard',
  showLabels = true,
  interactive = true,
  markers = [],
  polylines = [],
  onPress,
  onCameraChange,
  onGestureStart,
}, ref) {
  const mapRef = useRef<MapViewRef>(null);
  const fitted = useRef(false);
  const module = AMap;

  useImperativeHandle(ref, () => ({
    fitCoordinates: (coordinates, edgePadding, duration = 600) => {
      if (!coordinates.length) return;
      const totalPadding = edgePadding ? Math.max(...edgePadding) : 28;
      void mapRef.current?.fitToCoordinates(coordinates.map(point), { duration, paddingPx: totalPadding });
    },
    moveCamera: (coordinate, zoom = 11, duration = 500) => {
      void mapRef.current?.moveCamera({ target: point(coordinate), zoom }, duration);
    },
    resetNorth: () => {
      void mapRef.current?.moveCamera({ bearing: 0, tilt: 0 }, 360);
    },
  }), []);

  if (!module || !ensureAmapReady(module)) return <View style={style} />;
  const { MapView, Marker, Polyline, MapType } = module;

  const nativeMapType = mapStyle === 'satellite'
    ? MapType.Satellite
    : mapStyle === 'terrain'
      ? MapType.Navi
      : MapType.Standard;

  return (
    <MapView
      ref={mapRef}
      style={style}
      mapType={nativeMapType}
      initialCameraPosition={{ target: point(initialCenter), zoom: initialZoom, bearing: 0, tilt: 0 }}
      labelsEnabled={showLabels}
      buildingsEnabled={mapStyle !== 'terrain'}
      compassEnabled={false}
      scaleControlsEnabled={false}
      zoomControlsEnabled={false}
      myLocationButtonEnabled={false}
      scrollGesturesEnabled={interactive}
      zoomGesturesEnabled={interactive}
      rotateGesturesEnabled={interactive}
      tiltGesturesEnabled={interactive}
      onLoad={() => {
        if (fitted.current || !initialFitCoordinates?.length) return;
        fitted.current = true;
        const totalPadding = initialPadding ? Math.max(...initialPadding) : 28;
        void mapRef.current?.fitToCoordinates(initialFitCoordinates.map(point), { duration: 0, paddingPx: totalPadding });
      }}
      onMapPress={(event) => {
        const { longitude, latitude } = event.nativeEvent;
        onGestureStart?.();
        onPress?.(gcj02ToWgs84([longitude, latitude]));
      }}
      onCameraMove={(event) => {
        const camera = event.nativeEvent.cameraPosition;
        onCameraChange?.(camera.bearing || 0, camera.tilt || 0);
      }}
    >
      {polylines.map((line) => (
        <Polyline
          key={line.id}
          points={line.coordinates.map(point)}
          strokeColor={line.color}
          strokeWidth={line.width}
          dotted={line.dashed}
        />
      ))}
      {markers.map((marker) => (
        <Marker
          key={marker.id}
          position={point(marker.coordinate)}
          anchor={marker.anchor}
          title={marker.title}
          pinColor={marker.content ? undefined : 'red'}
          opacity={marker.opacity}
          cacheKey={marker.id}
          onMarkerPress={() => marker.onPress?.()}
        >
          {marker.content}
        </Marker>
      ))}
    </MapView>
  );
});
