// How large a piece of geometry appears on the native map at a given zoom.
// The map SDK reports zoom in the same 256-pixel-tile world Mercator scheme,
// so a track's on-screen size is computable from its coordinates alone.

const mercatorY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2));

/**
 * A track's bounding box as a fraction of the whole Mercator world. Measured
 * once per geometry — a GPS track is tens of thousands of points and the zoom
 * callback fires continuously during a pinch.
 */
export function trackWorldSpan(coordinates: [number, number][]): { width: number; height: number } | null {
  if (coordinates.length < 2) return null;
  let minLng = 180;
  let maxLng = -180;
  let minLat = 90;
  let maxLat = -90;
  coordinates.forEach(([lng, lat]) => {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  });
  return {
    width: (maxLng - minLng) / 360,
    height: Math.abs(mercatorY(maxLat) - mercatorY(minLat)) / (2 * Math.PI),
  };
}

/** Its longest screen dimension, in density-independent pixels, at `zoom`. */
export function trackSpanOnScreen(span: { width: number; height: number } | null, zoom: number): number {
  if (!span) return 0;
  return Math.max(span.width, span.height) * 256 * 2 ** zoom;
}
