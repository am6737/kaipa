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

## First-load place pins

The iOS visibility rail starts annotations at opacity zero. Visibility must be
replayed when the map registers its API and when new annotations mount: route
data and map mounting can arrive in either order. An inactive `Globe` skips
renders, so the caller can send visibility while the map still has no pins.
`DiscoverScreen` also reapplies visibility when it becomes active. Keep these
handoffs without rebuilding the pin array on mode switches. Replay the pending
stagger option as well as the visible keys; an empty catalog must not consume
the first entrance. Otherwise the first route batch appears all at once.
Regression cases
live in `scripts/test-map-marker-rebuild.cjs` (catalog before map mount, and pins
after the visibility command); they use a mocked map, so cold launch still needs
device verification.

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

## Track-point picker waypoint groups

The full-screen itinerary picker enables `TrackMap.clusterWaypoints`. Nearby
annotations combine into count badges at the current map zoom; zooming or
pressing a badge reveals smaller groups. Badge presses only move the camera,
while the complete waypoint list remains available for direct selection.
`src/components/maps/waypointClusters.ts` groups in Mercator map pixels with fixed
anchors, so a chain of nearby waypoints cannot swallow an entire long route.
Each badge uses an actual member coordinate and sits above the line, keeping the
polyline visible. Only annotations are grouped; track geometry and stored
waypoint distances remain intact. Groups update at half-zoom steps to avoid
rebuilding native annotations on every pinch frame. Check with
`node --test scripts/test-waypoint-clusters.cjs`.

## Selecting base-map places in the itinerary picker

`NativeMap.onPoiPress` carries the provider's place name and coordinate, converted
to WGS-84 once at the platform adapter. Android uses AMap's `onPressPoi`; iOS uses
`onPoiClick`. Upstream react-native-maps 1.27.2 only implements that event for
Google Maps, so `patches/react-native-maps+1.27.2.patch` enables MapKit selectable
POI features on iOS 16+ and forwards their names/coordinates through the existing
Fabric event. The native feature remains selected, while the app draws a compact
name label and its own place card. MKMapItemRequest fills in names not yet
available on the feature annotation; stale requests are cancelled on deselection.
Installing this iOS change requires a native rebuild, not a JavaScript refresh.
Both adapters suppress the background tap that can follow a POI selection so it
cannot overwrite the place with the finger's location. Plain background taps
still preserve the exact tapped coordinate. Validate adapter events with
`node --test scripts/test-map-poi-selection.cjs`; those mocked tests do not
replace an iOS native build or real-device verification.

The picker reverse-geocodes selected coordinates to show an address. A native
POI name always takes precedence over a reverse-geocoded locality. A background
tap starts as “已选位置” and becomes its resolved address; it never moves to a
nearby POI or back onto the track. Each selection aborts the previous lookup,
including when choosing a waypoint, switching tracks or closing the picker.
Check this flow with `node --test scripts/test-track-point-picker-selection.cjs`.


## Mixed map-place / hiking-track itinerary legs

Map places within 50 m of a uniquely associated track position follow the
recorded track directly. Nearby competing positions more than 100 m apart along
the file require explicit selection. Names and POI coordinates stay intact.

Distant map places can request a walking access road to the track start/end
when the nearest projection is within 100 m along that endpoint. Interior or
ambiguous access is not inferred. The remaining route follows the original
track slice, in either direction. `pendingTrack` remains set until access has
been verified; `trackBridge` enables this limited road request.

The map-search function reports `actualFrom` / `actualTo` before normalizing
its display endpoints. Both actual endpoints must be within the same 50 m
association tolerance used for nearby map places. A road leaving a larger gap
is rejected. For `trackAccess` walking requests up to 10 km apart, a missing or
truncated AMap route falls back to BRouter's OSM `hiking-mountain` profile, with
a 12-second timeout and verified endpoints. `TRACK_ACCESS_ROUTER_URL` can point
to a dedicated BRouter instance; the default is the public brouter.de endpoint.
Ordinary road plans do not use this fallback. Returned WGS-84 geometry is kept
in the access-v3 device/server cache namespace; failed requests remain askable.
The map attributes the supplementary road network to OpenStreetMap/BRouter.
These services establish mapped connectivity, not current on-site access.

Live validation using the reported sixth-day coordinates found AMap stopped
~260 m before the selected track start. BRouter hiking returned 53 road points,
about 2.06 km, with raw endpoints ~41 m / ~43 m from the selected places. The
road fixture stores only public route geometry, without account identifiers.

While unresolved, the map omits that connecting line and the distance capsule
reads “接入点待确认”. Edit the destination stop and choose “补充上一站到这里的路线”
to draw the road or import a GPX/KML/KMZ covering both locations. Drawing requires
intermediate points and no segment longer than 250 m. Imported tracks are sliced
between unambiguous positions within 50 m of both places. The added path lives
in the destination's `location.incomingPath` JSON and uses existing timeline
persistence/versioning, so no schema migration is required. It is ignored if the
previous stop or either endpoint changes. Saved entries retain their source;
drawn mileage is explicitly estimated. Finish saving the itinerary editor to
persist the added path. This does not overwrite the journey's original track.

Validation: journey track/identity/geometry and track-picker selection scripts,
`npx tsc --noEmit`, and the map-search Deno direction tests. Native map behavior
and the specific real-world road still need device/provider verification.


Deployment verification: the real sixth-day coordinate pair was sent through
an authenticated HTTP request to the self-hosted map-search function. It returned
HTTP 200, `source: osm`, 53 points and about 2.067 km; the temporary test account
was removed. A concurrent, unfinished resource-guard integration in the checkout
references database RPCs not yet installed in this runtime. For this deployment,
a temporary staging tree contained the existing map-search entrypoint plus only
the access-router integration, and used `infra/supabase/deploy-functions.sh
map-search`. The checkout's unrelated resource-guard edits were preserved. A
later full-checkout deployment must install those guard RPCs first.


The walking-network credit is a compact, tappable “© OpenStreetMap” at the lower
left of the visible journey map. It is rendered inside `MapGlobe`, anchored to the bottom of its visible-map
viewport (`mapBottomInset` excludes the covering detail card), and respects the
safe-area bottom in fullscreen. Cover images omit the map and its credit. Tapping opens
source details for OpenStreetMap/BRouter and a link to the data license.
