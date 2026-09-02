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
  markers = [],
  polylines = [],
  onPress,
  onCameraChange,
  onGestureStart,
}, ref) {
  const mapRef = useRef<MapView>(null);
  const fitted = useRef(false);

  useImperativeHandle(ref, () => ({
    fitCoordinates: (coordinates, edgePadding, duration = 600) => {
      if (!coordinates.length) return;
      mapRef.current?.fitToCoordinates(coordinates.map(point), { edgePadding: padding(edgePadding), animated: duration > 0 });
    },
    moveCamera: (coordinate, zoom = 11, duration = 500) => {
      mapRef.current?.animateToRegion(region(coordinate, zoom), duration);
    },
    resetNorth: () => {
      void mapRef.current?.getCamera().then((camera) => {
        mapRef.current?.animateCamera({ ...camera, heading: 0, pitch: 0 }, { duration: 360 });
      });
    },
  }), []);

  const mapType: MapType = mapStyle === 'satellite' ? 'hybrid' : mapStyle === 'terrain' ? 'mutedStandard' : 'standard';
  return (
    <MapView
      ref={mapRef}
      style={style}
      mapType={mapType}
      initialRegion={region(initialCenter, initialZoom)}
      showsCompass={false}
      showsScale={false}
      showsBuildings={mapStyle !== 'terrain'}
      showsPointsOfInterests={showLabels}
      showsTraffic={false}
      scrollEnabled={interactive}
      zoomEnabled={interactive}
      rotateEnabled={interactive}
      pitchEnabled={interactive}
      onMapReady={() => {
        if (fitted.current || !initialFitCoordinates?.length) return;
        fitted.current = true;
        mapRef.current?.fitToCoordinates(initialFitCoordinates.map(point), { edgePadding: padding(initialPadding), animated: false });
      }}
      onPress={(event) => onPress?.([event.nativeEvent.coordinate.longitude, event.nativeEvent.coordinate.latitude])}
      onPanDrag={onGestureStart ? () => onGestureStart() : undefined}
      onRegionChangeComplete={onCameraChange ? () => {
        void mapRef.current?.getCamera().then((camera) => onCameraChange(camera.heading, camera.pitch));
      } : undefined}
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
