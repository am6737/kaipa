import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import type { MapViewRef } from 'expo-gaode-map';
import { gcj02ToWgs84, wgs84ToGcj02 } from '../../lib/coordinates';
import { projectTrack, withColorAlpha, type NativeMapHandle, type NativeMapProps } from './types';

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

function shiftedTarget(
  center: { longitude: number; latitude: number },
  zoom: number,
  layout: { width: number; height: number },
  edgePadding: [number, number, number, number],
) {
  const [top, right, bottom, left] = edgePadding;
  const visibleLeft = Math.max(0, Math.min(layout.width - 1, left));
  const visibleTop = Math.max(0, Math.min(layout.height - 1, top));
  const visibleRight = Math.max(visibleLeft + 1, Math.min(layout.width, layout.width - right));
  const visibleBottom = Math.max(visibleTop + 1, Math.min(layout.height, layout.height - bottom));
  const offsetX = (layout.width / 2) - ((visibleLeft + visibleRight) / 2);
  const offsetY = (layout.height / 2) - ((visibleTop + visibleBottom) / 2);
  const worldSize = 256 * (2 ** zoom);
  const x = center.longitude / 360 + 0.5 + offsetX / worldSize;
  const normalizedY = (1 - Math.log(Math.tan((center.latitude * Math.PI) / 180) + 1 / Math.cos((center.latitude * Math.PI) / 180)) / Math.PI) / 2;
  const y = normalizedY + offsetY / worldSize;
  const latitude = (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;
  const longitude = ((((x % 1) + 1) % 1) - 0.5) * 360;
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
  onCameraPositionChange,
  onZoomChange,
  onGestureStart,
}, ref) {
  const mapRef = useRef<MapViewRef>(null);
  const fitted = useRef(false);
  const programmaticUntil = useRef(0);
  // Fires onGestureStart once per user gesture instead of on every throttled
  // camera-move event (iOS fires it only at pan start). Reset when the map
  // settles so the next gesture is detected again.
  const gestureStartFired = useRef(false);
  const mapReady = useRef(false);
  const hasLayout = useRef(false);
  const layoutSize = useRef({ width: 390, height: 844 });
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
      const padding = edgePadding ?? [28, 28, 28, 28];
      markProgrammaticMove(duration);
      runWhenMapIsUsable(() => {
        const points = projectTrack(coordinates);
        const [top, right, bottom, left] = padding;
        const viewportWidthPx = Math.max(1, layoutSize.current.width - left - right);
        const viewportHeightPx = Math.max(1, layoutSize.current.height - top - bottom);
        const bounds = module?.getRouteBounds?.(points, {
          viewportWidthPx,
          viewportHeightPx,
          paddingPx: 0,
        });
        if (!bounds) return;
        const map = mapRef.current;
        if (!map) return;
        void map.getCameraPosition().then((camera) => {
          const target = shiftedTarget(bounds.center, bounds.recommendedZoom, layoutSize.current, padding);
          void map.moveCamera({
            target,
            zoom: bounds.recommendedZoom,
            bearing: camera.bearing,
            tilt: camera.tilt,
          }, duration);
        }).catch(() => undefined);
      });
    },
    moveCamera: (coordinate, zoom = 11, duration = 500, options) => {
      markProgrammaticMove(duration);
      runWhenMapIsUsable(() => {
        const gcj02 = point(coordinate);
        const target = options?.edgePadding
          ? shiftedTarget(gcj02, zoom, layoutSize.current, options.edgePadding)
          : gcj02;
        void mapRef.current?.moveCamera({
          target,
          zoom,
          ...(options?.resetOrientation ? { bearing: 0, tilt: 0 } : {}),
        }, duration);
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
        layoutSize.current = { width, height };
        hasLayout.current = width > 0 && height > 0;
        flushCameraAction();
      }}
    >
    <MapView
          ref={mapRef}
      style={StyleSheet.absoluteFill}
      mapType={nativeMapType}
      initialCameraPosition={{ target: point(initialCenter), zoom: initialZoom, bearing: 0, tilt: 0 }}
      labelsEnabled={showLabels}
      // 3D building extrusion is expensive during gestures and does not add
      // useful information to the discovery map.
      buildingsEnabled={false}
      compassEnabled={false}
      scaleControlsEnabled={false}
      zoomControlsEnabled={false}
      myLocationButtonEnabled={false}
      // Android renders the shared app marker from MapGlobe instead of AMap's
      // platform-specific blue location indicator.
      myLocationEnabled={false}
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
      // Camera events cross the JS bridge. Keep live updates sparse while the
      // native map remains responsible for rendering the gesture at 60fps.
      // 10Hz is plenty for the quarter-zoom quantizer and the distance-step
      // bucket check; it keeps gesture-time JS work off the low-end devices.
      cameraEventThrottleMs={100}
      onLoad={() => {
        mapReady.current = true;
        if (!fitted.current && initialFitCoordinates?.length) {
          fitted.current = true;
          markProgrammaticMove(0);
          pendingCameraAction.current = () => {
            const padding = initialPadding ?? [28, 28, 28, 28];
            const [top, right, bottom, left] = padding;
            const points = projectTrack(initialFitCoordinates);
            const bounds = module.getRouteBounds?.(points, {
              viewportWidthPx: Math.max(1, layoutSize.current.width - left - right),
              viewportHeightPx: Math.max(1, layoutSize.current.height - top - bottom),
              paddingPx: 0,
            });
            if (!bounds) return;
            void mapRef.current?.moveCamera({
              target: shiftedTarget(bounds.center, bounds.recommendedZoom, layoutSize.current, padding),
              zoom: bounds.recommendedZoom,
              bearing: 0,
              tilt: 0,
            }, 0);
          };
        }
        flushCameraAction();
      }}
      onMapPress={(event) => {
        const { longitude, latitude } = event.nativeEvent;
        onPress?.(gcj02ToWgs84([longitude, latitude]));
      }}
      onLocation={(event) => {
        const { longitude, latitude } = event.nativeEvent;
        onUserLocationChange?.(gcj02ToWgs84([longitude, latitude]));
      }}
      onCameraMove={(event) => {
        const camera = event.nativeEvent.cameraPosition;
        if (typeof camera.zoom === 'number') onZoomChange?.(camera.zoom);
        if (!followUserLocation && Date.now() > programmaticUntil.current && !gestureStartFired.current) {
          gestureStartFired.current = true;
          onGestureStart?.();
        }
      }}
      onCameraIdle={(event) => {
        gestureStartFired.current = false;
        const camera = event.nativeEvent.cameraPosition;
        if (typeof camera.zoom === 'number' && camera.target) {
          onCameraPositionChange?.({
            center: gcj02ToWgs84([camera.target.longitude, camera.target.latitude]),
            zoom: camera.zoom,
          });
        }
        onCameraChange?.(camera.bearing || 0, camera.tilt || 0);
      }}
    >
      {polylines.map((line) => (
        <Polyline
          key={line.id}
          points={projectTrack(line.coordinates)}
          strokeColor={withColorAlpha(line.color, line.opacity)}
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
