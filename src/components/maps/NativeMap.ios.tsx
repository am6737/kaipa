import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { Dimensions } from 'react-native';
import MapView, { Marker, Polyline, type EdgePadding, type MapType, type Region } from 'react-native-maps';
import { fitBoundsCorners, mapPoiFromProvider, projectTrack, withColorAlpha, type NativeMapHandle, type NativeMapProps } from './types';
import { gcj02ToWgs84, wgs84ToGcj02 } from '../../lib/coordinates';

function point(coordinate: [number, number]) {
  const [longitude, latitude] = wgs84ToGcj02(coordinate);
  return { longitude, latitude };
}

function padding(value: [number, number, number, number] = [28, 28, 28, 28]): EdgePadding {
  return { top: value[0], right: value[1], bottom: value[2], left: value[3] };
}

type Size = { width: number; height: number };

/**
 * Zoom follows the AMap/Google convention every caller and the waypoint
 * clustering assume: the world is 256 * 2^zoom points wide. MapKit only speaks
 * in spans, so the conversion needs the view's size; before layout the window
 * stands in, which is what full-width maps end up at anyway.
 */
function viewSize(size?: Size): Size {
  if (size && size.width > 0 && size.height > 0) return size;
  const window = Dimensions.get('window');
  return { width: window.width, height: window.height };
}

function worldSize(zoom: number) {
  return 256 * 2 ** Math.max(0, Math.min(21, zoom));
}

function mercatorY(latitude: number) {
  const lat = Math.max(-85.051129, Math.min(85.051129, latitude)) * Math.PI / 180;
  return Math.log(Math.tan(Math.PI / 4 + lat / 2));
}

function latitudeAt(y: number) {
  return (2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180 / Math.PI;
}

/** The zoom a visible longitude span of `longitudeDelta` degrees is, at this width. */
export function zoomForSpan(longitudeDelta: number, size?: Size): number {
  return Math.log2((360 * viewSize(size).width) / (256 * longitudeDelta));
}

export function region(coordinate: [number, number], zoom: number, size?: Size): Region {
  const { width, height } = viewSize(size);
  const world = worldSize(zoom);
  const center = point(coordinate);
  // Latitude is not linear in Mercator: take the span the view's height covers
  // around this centre, so a short view isn't zoomed out to fit a square span.
  const y = mercatorY(center.latitude);
  const halfHeight = (height / 2 / world) * 2 * Math.PI;
  return {
    ...center,
    latitudeDelta: latitudeAt(y + halfHeight) - latitudeAt(y - halfHeight),
    longitudeDelta: (360 * width) / world,
  };
}

/**
 * MapKit always puts the region's centre in the middle of the view, so a point
 * that has to land inside a padded box is moved the other way by the distance
 * between the two centres, measured in Mercator points at `zoom`.
 */
export function offsetCenter(
  coordinate: [number, number],
  zoom: number,
  edgePadding: [number, number, number, number] | undefined,
  size: Size,
): [number, number] {
  if (!edgePadding || size.width <= 0 || size.height <= 0) return coordinate;
  const [top, right, bottom, left] = edgePadding;
  const world = worldSize(zoom);
  const offsetX = (right - left) / 2;
  const offsetY = (bottom - top) / 2;
  return [
    coordinate[0] + (offsetX / world) * 360,
    latitudeAt(mercatorY(coordinate[1]) - (offsetY / world) * 2 * Math.PI),
  ];
}

export const NATIVE_MAP_AVAILABLE = true;

/**
 * Every prop of both annotation elements below comes off the descriptor object
 * itself, so an unchanged descriptor can hand React the identical element and
 * reconciliation bails out before it ever walks the marker's subtree. That
 * subtree is a PhotoPin per pin: measured, re-rendering 85 of them in the middle
 * of a camera animation costs half a second of JS thread. `projectTrack` on a
 * 1500-point line is skipped for the same reason.
 */
const elementCache = new WeakMap<object, React.ReactElement>();
function cachedElement(descriptor: object, build: () => React.ReactElement): React.ReactElement {
  const hit = elementCache.get(descriptor);
  if (hit) return hit;
  const element = build();
  elementCache.set(descriptor, element);
  return element;
}

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
  onPoiPress,
  onUserLocationChange,
  onCameraChange,
  onCameraPositionChange,
  onZoomChange,
  onGestureStart,
}, ref) {
  const mapRef = useRef<MapView>(null);
  const fitted = useRef(false);
  const poiPressAt = useRef(0);
  const programmaticUntil = useRef(0);
  const mapReady = useRef(false);
  const hasLayout = useRef(false);
  const layoutSize = useRef({ width: 0, height: 0 });
  const pendingCameraAction = useRef<(() => void) | null>(null);
  const programmaticStartedAt = useRef(0);
  const pendingProgrammaticCompletions = useRef(0);
  const orientationReadAt = useRef(0);
  const orientationSent = useRef({ heading: 0, pitch: 0 });

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

  /**
   * MapKit has no rotation event. A two-finger twist only shows up as a region
   * change — the lat/lon box the view covers grows — so orientation is read off
   * the camera while region changes are arriving and only reported when it
   * actually turned: a plain pan also changes the region. The read rate is what
   * the compass needle animates at, so it stays near frame rate during a twist.
   */
  const reportOrientation = (force = false) => {
    if (!onCameraChange) return;
    const now = Date.now();
    if (!force && now - orientationReadAt.current < 48) return;
    orientationReadAt.current = now;
    void mapRef.current?.getCamera().then((camera) => {
      const heading = camera.heading ?? 0;
      const pitch = camera.pitch ?? 0;
      const last = orientationSent.current;
      const turn = Math.abs(heading - last.heading);
      if (!force && Math.min(turn, 360 - turn) < 0.5 && Math.abs(pitch - last.pitch) < 0.5) return;
      orientationSent.current = { heading, pitch };
      onCameraChange(heading, pitch);
    });
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
        mapRef.current?.fitToCoordinates(projectTrack(fitBoundsCorners(coordinates)), { edgePadding: padding(edgePadding), animated: duration > 0 });
      });
    },
    moveCamera: (coordinate, zoom = 11, duration = 500, options) => {
      markProgrammaticMove(duration);
      runWhenMapIsUsable(() => {
        const target = offsetCenter(coordinate, zoom, options?.edgePadding, layoutSize.current);
        const toRegion = (ms: number) => mapRef.current?.animateToRegion(region(target, zoom, layoutSize.current), ms);
        if (!options?.resetOrientation) {
          toRegion(duration);
          return;
        }
        // Apple Maps reads only `altitude` from a camera, never `zoom`, so a
        // camera move alone can't hit the requested zoom. Level the map first,
        // then let the region move set the zoom; a level map skips step one.
        void mapRef.current?.getCamera().then((camera) => {
          const heading = (((camera.heading ?? 0) % 360) + 360) % 360;
          if (Math.min(heading, 360 - heading) < 0.5 && Math.abs(camera.pitch ?? 0) < 0.5) {
            toRegion(duration);
            return;
          }
          const level = Math.round(duration * 0.4);
          mapRef.current?.animateCamera({ center: point(target), heading: 0, pitch: 0 }, { duration: level });
          setTimeout(() => {
            // The leveling move used up this call's completion; the zoom is a second one.
            markProgrammaticMove(duration - level);
            toRegion(duration - level);
          }, level);
        }, () => toRegion(duration));
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
        layoutSize.current = { width, height };
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
            mapRef.current?.fitToCoordinates(projectTrack(fitBoundsCorners(initialFitCoordinates)), { edgePadding: padding(initialPadding), animated: false });
          };
        }
        flushCameraAction();
      }}
      onPress={(event) => {
        if (Date.now() - poiPressAt.current < 400) return;
        const coordinate = event.nativeEvent.coordinate;
        onPress?.(gcj02ToWgs84([coordinate.longitude, coordinate.latitude]));
      }}
      onPoiClick={(event) => {
        const { coordinate, name, placeId } = event.nativeEvent;
        const poi = mapPoiFromProvider(name, [coordinate.longitude, coordinate.latitude], placeId);
        if (!poi) return;
        poiPressAt.current = Date.now();
        if (onPoiPress) onPoiPress(poi);
        else onPress?.(poi.coordinate);
      }}
      onUserLocationChange={(event) => {
        const coordinate = event.nativeEvent.coordinate;
        if (!coordinate) return;
        onUserLocationChange?.(gcj02ToWgs84([coordinate.longitude, coordinate.latitude]));
      }}
      onPanDrag={onGestureStart ? () => onGestureStart() : undefined}
      onRegionChange={(visibleRegion) => {
        if (visibleRegion.longitudeDelta > 0) onZoomChange?.(zoomForSpan(visibleRegion.longitudeDelta, layoutSize.current));
        reportOrientation();
      }}
      onRegionChangeComplete={(visibleRegion) => {
        if (visibleRegion.longitudeDelta > 0) {
          const zoom = zoomForSpan(visibleRegion.longitudeDelta, layoutSize.current);
          onZoomChange?.(zoom);
          onCameraPositionChange?.({
            center: gcj02ToWgs84([visibleRegion.longitude, visibleRegion.latitude]),
            zoom,
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
        reportOrientation(true);
      }}
    >
      {polylines.map((line) => cachedElement(line, () => (
        <Polyline
          key={line.id}
          coordinates={projectTrack(line.coordinates)}
          strokeColor={withColorAlpha(line.color, line.opacity)}
          strokeWidth={line.width}
          lineDashPattern={line.dashed ? [7, 7] : undefined}
        />
      )))}
      {markers.map((marker) => cachedElement(marker, () => (
        <Marker
          key={marker.id}
          coordinate={point(marker.coordinate)}
          anchor={marker.anchor}
          centerOffset={marker.centerOffset}
          pinColor={marker.content ? undefined : marker.color}
          opacity={marker.opacity}
          zIndex={marker.zIndex}
          onPress={() => marker.onPress?.()}
          tracksViewChanges={false}
        >
          {marker.content}
        </Marker>
      )))}
    </MapView>
  );
});
