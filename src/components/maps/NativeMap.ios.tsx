import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import MapView, { Marker, Polyline, type EdgePadding, type MapType, type Region } from 'react-native-maps';
import type { NativeMapHandle, NativeMapProps } from './types';

function point([longitude, latitude]: [number, number]) {
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
  onGestureStart,
}, ref) {
  const mapRef = useRef<MapView>(null);
  const fitted = useRef(false);
  const programmaticUntil = useRef(0);
  const mapReady = useRef(false);
  const hasLayout = useRef(false);
  const pendingCameraAction = useRef<(() => void) | null>(null);

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
      markProgrammaticMove(duration);
      runWhenMapIsUsable(() => {
        mapRef.current?.fitToCoordinates(coordinates.map(point), { edgePadding: padding(edgePadding), animated: duration > 0 });
      });
    },
    moveCamera: (coordinate, zoom = 11, duration = 500) => {
      markProgrammaticMove(duration);
      runWhenMapIsUsable(() => mapRef.current?.animateToRegion(region(coordinate, zoom), duration));
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
            mapRef.current?.fitToCoordinates(initialFitCoordinates.map(point), { edgePadding: padding(initialPadding), animated: false });
          };
        }
        flushCameraAction();
      }}
      onPress={(event) => onPress?.([event.nativeEvent.coordinate.longitude, event.nativeEvent.coordinate.latitude])}
      onUserLocationChange={(event) => {
        const coordinate = event.nativeEvent.coordinate;
        if (!coordinate) return;
        onUserLocationChange?.([coordinate.longitude, coordinate.latitude]);
      }}
      onPanDrag={onGestureStart ? () => onGestureStart() : undefined}
      onRegionChangeComplete={() => {
        if (!followUserLocation && Date.now() > programmaticUntil.current) onGestureStart?.();
        if (onCameraChange) {
          void mapRef.current?.getCamera().then((camera) => onCameraChange(camera.heading, camera.pitch));
        }
      }}
    >
      {polylines.map((line) => (
        <Polyline
          key={line.id}
          coordinates={line.coordinates.map(point)}
          strokeColor={line.color}
          strokeWidth={line.width}
          lineDashPattern={line.dashed ? [7, 7] : undefined}
        />
      ))}
      {markers.map((marker) => (
        <Marker
          key={marker.id}
          coordinate={point(marker.coordinate)}
          anchor={marker.anchor}
          title={marker.title}
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
