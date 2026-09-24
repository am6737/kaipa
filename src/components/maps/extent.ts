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

/**
 * The zoom at which a piece of geometry fills `boxPixels` of screen. Used to ask
 * "how much of this track can actually be resolved", which is a property of the
 * framing rather than of the camera: a recorded route is drawn at the size the
 * card frames it to, whether or not the user ever zooms in.
 */
export function zoomToFitSpan(span: { width: number; height: number } | null, boxPixels: number): number {
  const size = Math.max(boxPixels, 1);
  if (!span || Math.max(span.width, span.height) <= 0) return 20;
  return Math.log2(size / (256 * Math.max(span.width, span.height)));
}

/**
 * Douglas-Peucker over a track, in degrees.
 *
 * A recorded route is sampled once a second by the phone, so a 1500-point array is
 * two 200 m straights and a hairpin as far as the screen is concerned - and every
 * one of those points is a `{latitude, longitude}` object handed to the native map
 * in the frame that draws it. Dropping the ones a straight line can express within
 * half a pixel is invisible by construction, and it is the only part of opening a
 * route card that scales with how long the user walked.
 *
 * Longitude is scaled by the cosine of the middle latitude so a degree of each
 * axis means the same ground distance; the tolerance itself is a distance.
 *
 * Returns the input array when nothing was dropped, which keeps the caller's
 * projection cache (and therefore the native polyline) from being invalidated.
 */
export function simplifyTrack(
  coordinates: [number, number][],
  toleranceDegrees: number,
): [number, number][] {
  const count = coordinates.length;
  if (count < 3 || !(toleranceDegrees > 0)) return coordinates;
  const middleLatitude = (coordinates[0][1] + coordinates[count - 1][1]) / 2;
  const scale = Math.abs(Math.cos((middleLatitude * Math.PI) / 180)) || 1;
  const squaredTolerance = toleranceDegrees * toleranceDegrees;
  const keep = new Uint8Array(count);
  keep[0] = 1;
  keep[count - 1] = 1;
  const stack: [number, number][] = [[0, count - 1]];
  let kept = 2;
  while (stack.length) {
    const [first, last] = stack.pop()!;
    let worst = -1;
    let worstDistance = 0;
    for (let index = first + 1; index < last; index += 1) {
      const distance = squaredDistanceToSegment(coordinates[index], coordinates[first], coordinates[last], scale);
      if (distance > worstDistance) {
        worstDistance = distance;
        worst = index;
      }
    }
    if (worst >= 0 && worstDistance > squaredTolerance) {
      keep[worst] = 1;
      kept += 1;
      stack.push([first, worst], [worst, last]);
    }
  }
  if (kept === count) return coordinates;
  const simplified: [number, number][] = [];
  for (let index = 0; index < count; index += 1) {
    if (keep[index]) simplified.push(coordinates[index]);
  }
  return simplified;
}

/** Squared distance from `point` to the `from`-`to` segment, in scaled degrees. */
function squaredDistanceToSegment(
  point: [number, number],
  from: [number, number],
  to: [number, number],
  scale: number,
): number {
  const px = point[0] * scale;
  const py = point[1];
  const ax = from[0] * scale;
  const ay = from[1];
  const bx = to[0] * scale;
  const by = to[1];
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return (px - ax) ** 2 + (py - ay) ** 2;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
  return (px - (ax + t * dx)) ** 2 + (py - (ay + t * dy)) ** 2;
}
