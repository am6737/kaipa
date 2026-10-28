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
  // The zoom rides on the width. MapKit fits a region into the view less its
  // safe area, so a latitude span for the full height came out too tall under
  // the notch and home indicator and the whole map zoomed out to fit it — each
  // follow step a bit more, as the zoom it read back fed the next one. Asking
  // for the latitude of half the shorter side keeps the width binding; MapKit
  // fills the rest of the height. (Latitude is not linear in Mercator, hence
  // the span around this centre.)
  const y = mercatorY(center.latitude);
  const halfHeight = (Math.min(width, height) / 4 / world) * 2 * Math.PI;
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
  onReady,
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

  // A turned MapKit map reports the bounding box of the rotated view as its
  // span, which reads as zoomed out by up to a level at 45°; undo that with the
  // last heading read, as react-native-maps' own getZoomLevel does.
  const visibleZoom = (longitudeDelta: number) => {
    const turned = ((orientationSent.current.heading % 180) + 180) % 180;
    const angle = ((turned > 90 ? 180 - turned : turned) * Math.PI) / 180;
    const { width, height } = viewSize(layoutSize.current);
    const straight = (width * longitudeDelta) / (width * Math.cos(angle) + height * Math.sin(angle));
    return zoomForSpan(straight, layoutSize.current);
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
    // MKMapSnapshotter renders the region on its own, then draws the polylines
    // and markers on top, so it doesn't wait for visible tiles. The region has
    // to be passed: left out, the JS side sends `{}`, which native takes as a
    // region at 0,0 and returns a picture of open sea.
    takeSnapshot: async (marks) => {
      const map = mapRef.current;
      if (!map) throw new Error('map not mounted');
      const { northEast, southWest } = await map.getMapBoundaries();
      const { width, height } = layoutSize.current;
      const path = await map.takeSnapshot({
        format: 'png',
        result: 'file',
        region: {
          latitude: (northEast.latitude + southWest.latitude) / 2,
          longitude: (northEast.longitude + southWest.longitude) / 2,
          latitudeDelta: Math.abs(northEast.latitude - southWest.latitude),
          longitudeDelta: Math.abs(northEast.longitude - southWest.longitude),
        },
      });
      if (!path) throw new Error('map not mounted');
      // The snapshot draws a marker by rendering its view into an opaque
      // context, so a round RN marker comes out on a black square; callers
      // place their own. The points come from the same region the image was
      // rendered from, not from the live view, so the two can't drift apart.
      // The map is north-up and that region has the view's aspect, so it is a
      // plain Web Mercator mapping onto the view size.
      const mercator = (latitude: number) => Math.log(Math.tan(Math.PI / 4 + (latitude * Math.PI) / 360));
      const top = mercator(northEast.latitude);
      const bottom = mercator(southWest.latitude);
      const points = marks?.map((coordinate): [number, number] => {
        const { longitude, latitude } = point(coordinate);
        return [
          ((longitude - southWest.longitude) / (northEast.longitude - southWest.longitude)) * width,
          ((top - mercator(latitude)) / (top - bottom)) * height,
        ];
      });
      return { uri: path.startsWith('file:') ? path : `file://${path}`, points };
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
            if (onReady) setTimeout(onReady, 250);
          };
        } else if (onReady) {
          setTimeout(onReady, 250);
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
        if (visibleRegion.longitudeDelta > 0) onZoomChange?.(visibleZoom(visibleRegion.longitudeDelta));
        reportOrientation();
      }}
      onRegionChangeComplete={(visibleRegion) => {
        if (visibleRegion.longitudeDelta > 0) {
          const zoom = visibleZoom(visibleRegion.longitudeDelta);
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
