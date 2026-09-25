# Map rendering notes

Per-topic notes about the native map (`src/components/globe/MapGlobe.tsx`,
`src/components/maps/NativeMap.*.tsx`). Read this before re-investigating a map
overlay visual issue.

## Framing the camera against the detail card

`MapGlobe` computes one box — `routePadding` = [top, 54, card height + gap, 54] —
and every camera command has to respect it, because the journey/route card covers
the bottom of an otherwise full-screen map. Two rules that are easy to break:

- A single-coordinate frame goes through `moveCamera`, which centres the region in
  the **view**, not in the padded box — that put one-place days under the card.
  `moveCamera` therefore takes `options.edgePadding` and shifts the target centre
  the other way (`offsetCenter` on iOS, `shiftedTarget` on Android).
- A card snapped to its top leaves less room than the bottom padding asks for
  (bottom + 90 > map height). Both native maps mishandle a zero/negative-area box
  by dumping the content mid-view, so `MapGlobe` trades the *top* padding down
  first (`MAP_FRAME_MIN_BAND`) and the strip above the card stays the target.

## Recorded-track polyline flickers during camera moves (MapKit limitation)

**Symptom.** On iOS, a journey's recorded hiking track (the `discover-segment-*`
polylines) visibly flickers/shimmers where the track begins and ends, when you
switch the detail tab, and — decisively — when you pinch-zoom manually. At the
overview zoom a mountain track is only ~1–3 px on screen, so the "flicker" reads
as a couple of dots blinking at the track's ends rather than a line.

**Root cause: MapKit re-renders a vector overlay on every frame of a camera
move.** This is a platform limitation, not a bug in our code, and there is no
JS-side switch for it.

- `react-native-maps` only calls `addOverlay`/`removeOverlay` when a `Polyline`
  mounts or unmounts (`node_modules/react-native-maps/ios/AirMaps/AIRMap.mm`,
  the `didAddSubview`/`didRemoveSubview` block around lines 135–184). It does
  **not** tear the overlay down per frame, so the shimmer is not React re-adding
  the line.
- What MapKit does do is redraw the `MKOverlayRenderer` each frame the camera
  transforms. A thin coloured vector line resampled over terrain tiles that are
  themselves re-resolving shimmers. Apple/Google's own route lines don't, because
  they render into the map's own pipeline, which a third-party `MKOverlay` can't
  reach.

**How it was pinned down (each step had device evidence).** Useful as a method,
and to stop anyone re-trying the dead ends:

1. A coordinate-locked probe (dump only the markers/polylines sitting within
   ~100 m of the track's endpoints) proved the flickering element is the track
   polyline itself — no marker lives at that coordinate at that zoom.
2. Disabling the tab-switch camera fly (`fitCoordinates`) stopped the flicker →
   the trigger is camera motion, not props.
3. Manual pinch-zoom flickers too → not specific to the programmatic fly.
4. `duration = 0` (instant jump) removed the *repeated* flicker but not the
   first big overview→day jump — a single large re-render still costs a frame.

**Dead ends — all tried, all reverted, do not retry:**

- Dimming the track on day switch (`opacity: segment.active ? 1 : 0.45`) — this
  changes `strokeColor`, which on iOS triggers `AIRMapPolyline`'s `update`
  (remove+re-add), but it is **not** what the user was seeing. Keep the dim; it
  is unrelated to the flicker.
- Endpoint-visibility hysteresis / debounce on `MIN_TRACK_ENDPOINT_PIXELS` — the
  green/red endpoints are `hidden` at this zoom anyway, so they were never the
  blinking element.
- Removing `order` from the iOS journey-stop marker id — different element.
- **Decimating the drawn track** (Douglas-Peucker + a hard `maxPoints` budget,
  ~180 points) — the "point count" theory is **false**: 180 points still
  flickered. (Note the repo has a separate, real landmine about decimating track
  geometry: see `docs/hatian-five-day-validation.md` — distance loss. Never feed
  a simplified array to `measureTrack`.)
- **A wider neutral casing/halo under the line** — no effect.
- **Not drawing the track below a pixel threshold** — works, but **rejected on
  product grounds**: an invisible track at overview zoom reads as "this journey
  has no track".

**Resolution.** Accepted as a platform limitation. The flicker only happens
while the camera is moving and settles when it stops. The only true fix is to
stop drawing the track as a vector `MKOverlay` — i.e. bake it into an
image/tile overlay fed to MapKit's tile pipeline — which is a large, separate
piece of work, not worth it unless the shimmer becomes a real UX complaint.
