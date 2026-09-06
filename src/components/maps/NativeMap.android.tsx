import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import type { MapViewRef } from 'expo-gaode-map';
import { gcj02ToWgs84, wgs84ToGcj02 } from '../../lib/coordinates';
import type { NativeMapHandle, NativeMapProps } from './types';

let AMap: typeof import('expo-gaode-map') | null = null;
let amapInitialized = false;

try {
  // Lazy loading keeps Expo Go usable when the AMap native module is absent.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  AMap = require('expo-gaode-map') as typeof import('expo-gaode-map');
} catch {
  AMap = null;
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
    // The config plugin writes the build-only key to AndroidManifest.xml.
    module.ExpoGaodeMapModule.initSDK({});
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
  showUserLocation = false,
  followUserLocation = false,
  markers = [],
  polylines = [],
  onPress,
  onUserLocationChange,
  onCameraChange,
  onGestureStart,
}, ref) {
  const mapRef = useRef<MapViewRef>(null);
  const fitted = useRef(false);
  const programmaticUntil = useRef(0);
  const mapReady = useRef(false);
  const hasLayout = useRef(false);
  const pendingCameraAction = useRef<(() => void) | null>(null);
  const module = AMap;

  const markProgrammaticMove = (duration: number) => {
    programmaticUntil.current = Date.now() + duration + 180;
  };

  const flushCameraAction = () => {
    if (!mapReady.current || !hasLayout.current || !pendingCameraAction.current) return;
    const action = pendingCameraAction.current;
    pendingCameraAction.current = null;
    requestAnimationFrame(action);
  };

  const runWhenMapIsUsable = (action: () => void) => {
    pendingCameraAction.current = action;
    flushCameraAction();
  };

  useImperativeHandle(ref, () => ({
    fitCoordinates: (coordinates, edgePadding, duration = 600) => {
      if (!coordinates.length) return;
      const totalPadding = edgePadding ? Math.max(...edgePadding) : 28;
      markProgrammaticMove(duration);
      runWhenMapIsUsable(() => {
        void mapRef.current?.fitToCoordinates(coordinates.map(point), { duration, paddingPx: totalPadding });
      });
    },
    moveCamera: (coordinate, zoom = 11, duration = 500) => {
      markProgrammaticMove(duration);
      runWhenMapIsUsable(() => {
        void mapRef.current?.moveCamera({ target: point(coordinate), zoom }, duration);
      });
    },
    resetNorth: () => {
      markProgrammaticMove(360);
      runWhenMapIsUsable(() => {
        void mapRef.current?.moveCamera({ bearing: 0, tilt: 0 }, 360);
      });
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
    <View
      style={style}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        hasLayout.current = width > 0 && height > 0;
        flushCameraAction();
      }}
      onTouchMove={() => onGestureStart?.()}
    >
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFill}
      mapType={nativeMapType}
      initialCameraPosition={{ target: point(initialCenter), zoom: initialZoom, bearing: 0, tilt: 0 }}
      labelsEnabled={showLabels}
      buildingsEnabled={mapStyle !== 'terrain'}
      compassEnabled={false}
      scaleControlsEnabled={false}
      zoomControlsEnabled={false}
      myLocationButtonEnabled={false}
      myLocationEnabled={showUserLocation}
      followUserLocation={followUserLocation}
      userLocationRepresentation={{
        showsAccuracyRing: false,
        showsHeadingIndicator: true,
        showMyLocation: true,
        locationType: followUserLocation ? 'LOCATION_ROTATE' : 'LOCATION_ROTATE_NO_CENTER',
      }}
      scrollGesturesEnabled={interactive}
      zoomGesturesEnabled={interactive}
      rotateGesturesEnabled={interactive}
      tiltGesturesEnabled={interactive}
      onLoad={() => {
        mapReady.current = true;
        if (!fitted.current && initialFitCoordinates?.length) {
          fitted.current = true;
          const totalPadding = initialPadding ? Math.max(...initialPadding) : 28;
          markProgrammaticMove(0);
          pendingCameraAction.current = () => {
            void mapRef.current?.fitToCoordinates(initialFitCoordinates.map(point), { duration: 0, paddingPx: totalPadding });
          };
        }
        flushCameraAction();
      }}
      onMapPress={(event) => {
        const { longitude, latitude } = event.nativeEvent;
        onGestureStart?.();
        onPress?.(gcj02ToWgs84([longitude, latitude]));
      }}
      onLocation={(event) => {
        const { longitude, latitude } = event.nativeEvent;
        onUserLocationChange?.(gcj02ToWgs84([longitude, latitude]));
      }}
      onCameraMove={(event) => {
        const camera = event.nativeEvent.cameraPosition;
        if (!followUserLocation && Date.now() > programmaticUntil.current) onGestureStart?.();
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
    </View>
  );
});
