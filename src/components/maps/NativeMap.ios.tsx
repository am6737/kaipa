import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import MapView, { Marker, Polyline, type EdgePadding, type MapType, type Region } from 'react-native-maps';
import { projectTrack, withColorAlpha, type NativeMapHandle, type NativeMapProps } from './types';
import { gcj02ToWgs84, wgs84ToGcj02 } from '../../lib/coordinates';

function point(coordinate: [number, number]) {
  const [longitude, latitude] = wgs84ToGcj02(coordinate);
  return { longitude, latitude };
}

function padding(value: [number, number, number, number] = [28, 28, 28, 28]): EdgePadding {
  return { top: value[0], right: value[1], bottom: value[2], left: value[3] };
}

function region(coordinate: [number, number], zoom: number): Region {
  const delta = 360 / (2 ** Math.max(0, Math.min(20, zoom)));
  return {
    ...point(coordinate),
    latitudeDelta: delta,
    longitudeDelta: delta,
  };
}

export const NATIVE_MAP_AVAILABLE = true;

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
  const mapRef = useRef<MapView>(null);
  const fitted = useRef(false);
  const programmaticUntil = useRef(0);
  const mapReady = useRef(false);
  const hasLayout = useRef(false);
  const pendingCameraAction = useRef<(() => void) | null>(null);
  const programmaticStartedAt = useRef(0);
  const pendingProgrammaticCompletions = useRef(0);

  const markProgrammaticMove = (duration: number) => {
    programmaticUntil.current = Date.now() + duration + 180;
    programmaticStartedAt.current = Date.now();
    pendingProgrammaticCompletions.current += 1;
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
      markProgrammaticMove(duration);
      runWhenMapIsUsable(() => {
        mapRef.current?.fitToCoordinates(projectTrack(coordinates), { edgePadding: padding(edgePadding), animated: duration > 0 });
      });
    },
    moveCamera: (coordinate, zoom = 11, duration = 500, options) => {
      markProgrammaticMove(duration);
      runWhenMapIsUsable(() => {
        if (options?.resetOrientation) {
          mapRef.current?.animateCamera({ center: point(coordinate), zoom, heading: 0, pitch: 0 }, { duration });
        } else {
          mapRef.current?.animateToRegion(region(coordinate, zoom), duration);
        }
      });
    },
    resetNorth: () => {
      markProgrammaticMove(360);
      runWhenMapIsUsable(() => {
        void mapRef.current?.getCamera().then((camera) => {
          mapRef.current?.animateCamera({ ...camera, heading: 0, pitch: 0 }, { duration: 360 });
        });
      });
    },
  }), []);

  const mapType: MapType = mapStyle === 'satellite' ? 'hybrid' : mapStyle === 'terrain' ? 'mutedStandard' : 'standard';
  return (
    <MapView
      ref={mapRef}
      style={style}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        hasLayout.current = width > 0 && height > 0;
        flushCameraAction();
      }}
      mapType={mapType}
      initialRegion={region(initialCenter, initialZoom)}
      showsCompass={false}
      showsScale={false}
      showsBuildings={mapStyle !== 'terrain'}
      showsPointsOfInterests={showLabels}
      showsTraffic={false}
      showsUserLocation={showUserLocation}
      followsUserLocation={followUserLocation}
      scrollEnabled={interactive}
      zoomEnabled={interactive}
      rotateEnabled={interactive}
      pitchEnabled={interactive}
      onMapReady={() => {
        mapReady.current = true;
        if (!fitted.current && initialFitCoordinates?.length) {
          fitted.current = true;
          markProgrammaticMove(0);
          pendingCameraAction.current = () => {
            mapRef.current?.fitToCoordinates(projectTrack(initialFitCoordinates), { edgePadding: padding(initialPadding), animated: false });
          };
        }
        flushCameraAction();
      }}
      onPress={(event) => {
        const coordinate = event.nativeEvent.coordinate;
        onPress?.(gcj02ToWgs84([coordinate.longitude, coordinate.latitude]));
      }}
      onUserLocationChange={(event) => {
        const coordinate = event.nativeEvent.coordinate;
        if (!coordinate) return;
        onUserLocationChange?.(gcj02ToWgs84([coordinate.longitude, coordinate.latitude]));
      }}
      onPanDrag={onGestureStart ? () => onGestureStart() : undefined}
      onRegionChange={(visibleRegion) => {
        if (visibleRegion.longitudeDelta > 0) onZoomChange?.(Math.log2(360 / visibleRegion.longitudeDelta));
      }}
      onRegionChangeComplete={(visibleRegion) => {
        if (visibleRegion.longitudeDelta > 0) onZoomChange?.(Math.log2(360 / visibleRegion.longitudeDelta));
        if (visibleRegion.longitudeDelta > 0) {
          onCameraPositionChange?.({
            center: gcj02ToWgs84([visibleRegion.longitude, visibleRegion.latitude]),
            zoom: Math.log2(360 / visibleRegion.longitudeDelta),
          });
        }
        // Our own move is attributed by counting completions, not by wall clock.
        // While the detail tree mounts, the completion of a 250ms fit can be
        // delivered a second late; the previous time-window check read that as a
        // user gesture and silently un-focused the route framing. The window
        // stays as a second guard, and the count self-heals after 4s in case a
        // move is interrupted and never reports a completion.
        const counted = pendingProgrammaticCompletions.current > 0
          && Date.now() - programmaticStartedAt.current < 4000;
        if (counted) pendingProgrammaticCompletions.current -= 1;
        if (!counted && !followUserLocation && Date.now() > programmaticUntil.current) onGestureStart?.();
        if (onCameraChange) {
          void mapRef.current?.getCamera().then((camera) => onCameraChange(camera.heading, camera.pitch));
        }
      }}
    >
      {polylines.map((line) => (
        <Polyline
          key={line.id}
          coordinates={projectTrack(line.coordinates)}
          strokeColor={withColorAlpha(line.color, line.opacity)}
          strokeWidth={line.width}
          lineDashPattern={line.dashed ? [7, 7] : undefined}
        />
      ))}
      {markers.map((marker) => (
        <Marker
          key={marker.id}
          coordinate={point(marker.coordinate)}
          anchor={marker.anchor}
          centerOffset={marker.centerOffset}
          pinColor={marker.content ? undefined : marker.color}
          opacity={marker.opacity}
          onPress={() => marker.onPress?.()}
          tracksViewChanges={false}
        >
          {marker.content}
        </Marker>
      ))}
    </MapView>
  );
});
