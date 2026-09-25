// pinOverlap.ts — when the map hands a press to a pin the visibility rail has
// hidden, decide whether a pin the user could actually see was under that same
// finger, and if so whose press it really was.
//
// Why this exists: the 发现 map keeps both mode layers (探索 + 旅程) mounted and
// hides one of them by animating the opacity of the pin's *content* (see
// `PinVisibilityApi`). The annotation view itself stays fully interactive, so at
// low zoom — where a whole country fits on screen and every pin's box overlaps
// another's — MapKit can hand the tap to an invisible pin. `MapGlobe` then drops
// the press because it is not in the visible set, and the user's report is "I
// tapped the pin and nothing happened; the second tap worked".
//
// The asymmetry below is the whole point, and it comes from the two different
// boxes a pin has:
//  - the layout frame (PHOTO_PIN_WIDTH x PHOTO_PIN_HEIGHT, which includes the
//    name capsule). This is the area the native hit-test actually uses.
//  - the drawn photo (PHOTO_SIZE, centred on the geographic point, scaled down
//    with zoom by `photoPinScaleForZoom`). This is what the user aimed at.
// So a candidate only wins if a good part of its *photo* sits inside the frame
// of the pin that ate the tap. Requiring photo-level overlap is what keeps this
// from teleporting a tap on empty Hunan to a pin in Sichuan at zoom 3.
//
// Pure on purpose: no React, no react-native, so the geometry is testable from
// node without the map. All offsets are relative to the pressed pin, which is
// why the camera's centre never has to be known — only its zoom.

/** A pin, as far as this module is concerned. */
export interface OverlapPin {
  id: string;
  lng: number;
  lat: number;
}

/** The two boxes, in density-independent pixels at zoom (see above). */
export interface PinBoxes {
  /** Width/height of the layout frame the native hit-test uses. */
  frameWidth: number;
  frameHeight: number;
  /** Where the geographic point sits inside that frame, as a fraction (0.5 =
      centred). Photo pins put it at the photo's centre. */
  anchorY: number;
  /** Side of the drawn photo, before `scale`. */
  photoSize: number;
  /** `photoPinScaleForZoom(zoom)`. */
  scale: number;
}

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const WORLD_PIXELS_AT_ZOOM_0 = 256;
const TWO_PI = Math.PI * 2;

// World Mercator, the same projection `maps/extent.ts` measures spans with.
const mercatorY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2));

/** `pin`'s position in pixels, relative to `origin`'s, at `zoom`. */
function offsetPixels(pin: OverlapPin, origin: OverlapPin, zoom: number): { x: number; y: number } {
  const world = WORLD_PIXELS_AT_ZOOM_0 * 2 ** zoom;
  return {
    x: ((pin.lng - origin.lng) / 360) * world,
    // +y is south on screen, and mercatorY grows north.
    y: ((mercatorY(origin.lat) - mercatorY(pin.lat)) / TWO_PI) * world,
  };
}

function frameBox(at: { x: number; y: number }, boxes: PinBoxes): Box {
  const { frameWidth: w, frameHeight: h, anchorY } = boxes;
  return { left: at.x - w / 2, top: at.y - h * anchorY, right: at.x + w / 2, bottom: at.y + h * (1 - anchorY) };
}

/** The drawn photo: a square centred on the geographic point. */
function photoBox(at: { x: number; y: number }, boxes: PinBoxes): Box {
  const half = (boxes.photoSize * boxes.scale) / 2;
  return { left: at.x - half, top: at.y - half, right: at.x + half, bottom: at.y + half };
}

function overlapFraction(outer: Box, inner: Box): number {
  const width = Math.min(outer.right, inner.right) - Math.max(outer.left, inner.left);
  const height = Math.min(outer.bottom, inner.bottom) - Math.max(outer.top, inner.top);
  if (width <= 0 || height <= 0) return 0;
  const innerArea = (inner.right - inner.left) * (inner.bottom - inner.top);
  if (innerArea <= 0) return 0;
  return (width * height) / innerArea;
}

/** How much of a candidate's photo must sit inside the pressed pin's frame for
    the tap to count as aimed at it. Half: below that the two pins read as two
    separate things on screen, and guessing would open the wrong journey. */
export const MIN_PHOTO_OVERLAP = 0.5;

export interface OverlapMatch<T> {
  pin: T;
  /** Fraction (0..1) of the candidate's drawn photo inside the pressed frame. */
  score: number;
}

/**
 * The visible pin the user most likely meant when the map pressed `pressed`.
 * Returns the best candidate and how confident the geometry is, or null when no
 * candidate's photo is meaningfully inside the frame that ate the tap.
 */
export function pickPinUnderPress<T extends OverlapPin>(
  pressed: T,
  candidates: readonly T[],
  zoom: number,
  boxes: PinBoxes,
  minimumOverlap: number = MIN_PHOTO_OVERLAP,
): OverlapMatch<T> | null {
  if (!Number.isFinite(zoom) || !candidates.length) return null;
  if (!(boxes.frameWidth > 0) || !(boxes.frameHeight > 0) || !(boxes.photoSize > 0)) return null;
  const pressedBox = frameBox({ x: 0, y: 0 }, boxes);
  let best: OverlapMatch<T> | null = null;
  for (const candidate of candidates) {
    if (candidate.id === pressed.id) continue;
    if (!Number.isFinite(candidate.lng) || !Number.isFinite(candidate.lat)) continue;
    const at = offsetPixels(candidate, pressed, zoom);
    const score = overlapFraction(pressedBox, photoBox(at, boxes));
    if (score <= 0) continue;
    if (!best || score > best.score) best = { pin: candidate, score };
  }
  return best && best.score >= minimumOverlap ? best : null;
}
