# 徒步导航与轨迹记录

Following a planned route on foot, or recording a free walk, from inside the
app. Picking a route and starting means following it and recording it.
Free recording is the same page without a planned line.

## Where it lives

| Piece | File |
| --- | --- |
| Pure maths: GPS filtering, totals, route progress, off-route, formatting | `src/lib/trailGeo.ts` |
| Guidance: progress, off route, waypoints, arrival, voice prompts | `src/lib/trailGuide.ts` |
| AMap offline city packages (Android) | `src/lib/offlineMaps.ts` |
| Recorder singleton: location feeds, persistence, background task | `src/lib/trailRecorder.ts` |
| React bridge, open/closed state, saving and the offline save queue | `src/trail/TrailContext.tsx` |
| Route/track → `TrailRouteRef`, `useOpenTrail()` | `src/trail/trailRoutes.ts` |
| Page, finish summary, mini bar | `src/components/trail/` |

`index.ts` imports `trailGuide` (which imports `trailRecorder`) before `registerRootComponent`, because iOS
relaunches the app headless to deliver background fixes and the task has to be
defined by then. `TrailProvider` sits inside `NavProvider` (it needs
`useData().createTrack`), and `AppShell` renders `TrailLayer` above all pages.

## Entry points

- Route card footer, **跟走**: only when the route has a track. It follows the
  direction the card is showing (`routeReversed`).
- Track detail more menu, **跟着轨迹走**.
- 我的轨迹 more menu, **记录轨迹**: free recording.

Only one recording exists at a time. Opening another route while one is running
shows the running one and toasts `trail.busy`.

## Recording

- **Fix filtering** (`judgeFix`, after `smoothFix`):
  - drop fixes with accuracy worse than 40 m;
  - smooth the rest with an accuracy-weighted Kalman filter (`smoothFix`,
    reset per segment and after 30 s gaps), so standing-still wander averages
    out instead of being drawn;
  - drop steps from the last kept point that stay inside the fix's error circle
    (5–25 m), or within twice that while Doppler speed is under 0.4 m/s;
  - drop jumps faster than 12 m/s, unless the fix's own Doppler speed backs
    the step (×1.5 + 5 m/s); after 3 jumps in a row the last kept point is the
    stale one and the next fix is taken. Judged against the last kept point
    alone, an e-bike or car above 12 m/s had every fix dropped until it slowed,
    and the track drew a straight line across the gap.
- **First point** of each segment waits for 3 smoothed fixes; the pre-start
  dot only seeds it when its accuracy is 15 m or better. The first answers are
  often a cached or Wi-Fi position, and anchoring there drew a 100 m line
  once the GPS settled (the jump rule's speed limit decays as time passes).
- **Lying still** (`src/lib/deviceStillness.ts`): while the accelerometer has
  read still for 4 s (spread of |a| under 4% of its mean) and the fix reports
  under 1.5 m/s, fixes add nothing to the track and the recorder's dot holds
  its position (a fix 40% sharper may still replace it). Android measures it in
  the trail-notification module (`StillnessDetector.kt`), because expo-sensors
  stops listening once the screen locks; iOS uses expo-sensors. No sensor or no
  samples (an older binary) falls back to the GPS filters above, which can't
  tell drift from slow walking: simulated indoor drift still adds ~250 m in
  20 min without the sensor.
- **"You are here"** on the trail map is the recorder's fix on both platforms,
  so it holds still with the track. Android draws it as an AMap marker image
  (`assets/trail/location-*.png`, `-dot` without a heading), not AMap's own
  location layer, which follows raw fixes; the marker's centre anchor and
  `rotation` prop come from `patches/expo-gaode-map+*.patch`.
- **Climb** uses 5 m hysteresis, like imports.
- **Pause** starts a new segment, so a pause doesn't draw a straight line
  across a bus ride. Saving joins the segments into one line, and `durationMs`
  is moving time. While paused, a pill at the top of the page shows
  `已暂停 N 分钟` from `pausedAt` (sessions stored before it existed show just
  `已暂停`), so a pause isn't mistaken for recording when the map fills the screen.
- **Finish** has no confirm dialog: the summary's visible `继续记录` is the way
  back from a mis-tap. The map stops following and frames the walked track
  with its own start/end markers. The summary shows name (rename via ✎ or ⋯),
  date and start–end time, distance, six stats (time, ascent, descent, avg
  speed, max altitude, paused), the elevation profile, and `已走完全程` only
  when `guide.arrived` fired on a route (never a percentage). `放弃` lives in ⋯,
  except for a too-short recording, where it sits beside `继续记录`. A save
  that reaches the server opens the track in 我的轨迹 (`nav.openTrackPage`).
- **Storage**: the session survives a kill. AsyncStorage holds a meta key plus
  200-point chunks, and only the open chunk is rewritten. Writes are throttled
  to every 5 s and flushed when the app goes to background. On next launch the
  page reopens on the recording.
- **Screens wait for the app**: `useTrailSnapshot`/`useTrailGuide` pass fixes on
  only while the app is on screen, and once on return. Android's Fabric stops
  mounting in the background and queues every commit; per-fix renders of the
  tab bar or trail map piled up and drained as lag on the first taps back. The
  tab bar reads `useTrailStatus` so it doesn't re-render on every fix either.
- **Saving offline**: `createTrack` returning null queues the draft under
  `kaipa.trail.pendingSaves.v1`. The queue flushes on launch and when the app
  becomes active.

## Overlays and marks

- **叠加轨迹** (两步路's 叠加): any number of the walker's own tracks drawn on
  the trail map beside the followed line, in the segment colours other than
  the planned blue. A row in the settings (behind the ready panel's handle,
  and at the live sheet's top detent) opens `TrailOverlaySheet`, a bottom
  sheet listing 我的轨迹: each row draws the track's shape in its map colour
  (grey while off), a tap toggles it, and 全部清除 turns them all off.
  Taps change a draft inside the sheet that is committed once on close:
  committing each tap re-rendered the page and the map before the check moved. Its
  first row imports GPX/KML/KMZ files with the 我的轨迹 importer and switches
  the new tracks on; progress and the outcome show in that row, since toasts
  sit under the Modal.
  They are only drawn: progress, off-route and voice follow the one planned
  route. The ids live in `src/lib/trailOverlays.ts` under
  `kaipa.trail.overlays.v1`, outside the session, so the choice survives
  finishing, a kill and no signal (the tracks come from the offline cache).
  The fit button frames the route and all overlays together.
- **Marks**: while recording or paused, a camera button above the map
  controls takes a photo and marks the spot (`addTrailMark`): the recorder's
  fix if under 30 s old, else the last recorded point. Cancelling the camera
  marks nothing. Marks are numbered badges on the map, there as soon as they
  are taken, and are kept in the session (`marks`), so they survive a kill.
- **Route layers**: the route card's annotations come along to the trail
  map. The followed line and every overlay get kilometre labels
  (`trailKmMarkers.tsx`, same pill, density per zoom and 60-label cap as
  MapGlobe's; the dot takes the line's colour, and a line shorter than the
  zoom's spacing falls back to 1/5/10 km so it still gets some), and their named
  waypoints and every overlay's are drawn with the shared
  `buildRouteWaypointMarkers`: one clustered layer, each dot ringed in its
  line's colour (filled when a photo was taken there), and a tap opens the
  mark detail below, read-only, for that line's spots. Both lay out
  for a half-step zoom set once the camera has been quiet for 180 ms. The
  followed line's go once the walk is finished. 距离标记 and 标注点 switches in the trail
  settings (both panels) turn each layer off; they persist under
  `kaipa.trail.layers.v1`, apart from the route card's own map settings.
  The walker's own numbered marks always stay.
- **Mark detail** (`src/components/trail/MarkDetail.tsx`): a tap on a badge
  opens it as a bottom sheet over the map, photo or not: the photo rounded at
  the top (tap to see it whole), then time, name, distance from the start and
  altitude tiles, and copyable coordinates; swipe through all marks; rename
  and delete sit in the ⋯ menu. It is a Modal because the trail page sits
  above the page stack. The track page shows the same sheet from a row of
  photo thumbnails (`标注点 N`), and there rename and delete write the track's
  `waypoints`; a deleted mark's photo is removed from storage only once that
  write succeeded. Deleting a track removes its mark photos too. Route and
  overlay spots open the same sheet with no ⋯ menu and a line under the name
  for the route or track they lie on, in its colour; their altitude comes
  from the line's profile when the spot has none.
- **Photos** (`src/lib/trailMarkPhotos.ts`) are shrunk to 2048 px and moved
  out of the cache into `documents/trail-marks/` at once. On save, marks
  become the track's `waypoints` (`标注点 N`, `km` along the joined line,
  plus `lng`/`lat`/`at`/`photo`) and the photos go up as `track` uploads. A
  save with a photo that can't go up is queued like an offline save, so a
  track never reaches the server pointing at a `file://`. Unused photos are
  swept after a save and each queue flush, sparing ones under 10 minutes old
  (returning from the camera makes the app active, which flushes).

## Location sources

| Platform | Source | Screen off |
| --- | --- | --- |
| iOS | expo-location `startLocationUpdatesAsync` (task `kaipa-trail-recording`) | UIBackgroundModes `location`, blue pill |
| Android with `modules/trail-notification` | AMap continuous location, else `watchPositionAsync` | the module's own foreground service; live notification |
| Android with AMap (binary before the module) | AMap continuous location, `setAllowsBackgroundLocationUpdates` | AMap's foreground service and static notification |
| Android without AMap (binary before the module) | expo-location task with a foreground-service notification | yes |
| Fallback (binary without the task module) | `watchPositionAsync` | no; the page shows `trail.foregroundOnly` |

Only while-in-use permission is ever requested. The background behaviour
needs `expo-task-manager`, `isIosBackgroundLocationEnabled` and
`enableBackgroundLocation` (expo-gaode-map) in the binary, so it needs a new
build. An OTA update onto an older binary falls back to foreground-only.
`enableBackgroundLocation` also declares `ACCESS_BACKGROUND_LOCATION` in the
manifest, which store review may ask about. The answer: it is used for the
foreground-service trail recording only and is never requested at runtime.

### Recording notification (Android)

`modules/trail-notification` runs `TrailRecordingService` (foreground service
type `location`) from the start of a recording until it is finished or
discarded, paused included. Like Komoot and AllTrails, the card shows the
route name (or 自由记录), moving time ticking in the header through the
notification chronometer, and `距离 ↑爬升 ↓下降`; a paused walk shows
`（已暂停）` and the banked time instead. GPS search/weak signal goes in the
sub text. A tap opens `<package>://trail` as an explicit VIEW intent, which
`TrailContext` turns into the 徒步导航 page. JS posts only when the text changes (`syncNotification` in
`trailRecorder.ts`), so the clock costs nothing with the screen off. Starting
a recording asks for `POST_NOTIFICATIONS` on Android 13+; without it the
service still runs, only the card is hidden. The module needs a new dev build.

On Android 16 the card asks to be a Live Update (`android.requestPromotedOngoing`,
permission `POST_PROMOTED_NOTIFICATIONS`): a status-bar chip with the running
clock, and the card pinned on the lock screen. Earlier versions ignore it.

While recording (not paused) the service also holds a partial wake lock
(`syncWakeLock`). The foreground service alone keeps the process alive but
lets the CPU sleep with the screen off. AMap's 2 s loop then stalls, and the
track comes back as a few fixes joined by straight lines.

### Live Activity (iOS)

The same module's iOS side (`TrailLiveActivityModule`) runs an ActivityKit Live
Activity from the same `syncNotification` calls. The lock screen card follows
Komoot's: a header with the hiker badge, route name and status (or the GPS
warning in orange), a large moving-time clock, then distance, ascent and
descent in three captioned columns (captions come from `trail.stat.*`).
Dynamic Island: compact shows distance and clock; expanded shows the same
header, clock and three columns. The view lives in the widget extension
`targets/trail-activity`, added at prebuild by `@bacons/apple-targets`
(bundle id `<app>.trailactivity`; EAS makes its provisioning profile).
`TrailActivityAttributes.swift` exists twice, in the module and the target,
and the copies must match. The clock ticks in the widget from `startedAt`;
JS sends the fields under `live` and only when they change. An activity can
only be started in the foreground, which a recording always is; one left by
a killed process is reused. iOS ends an activity after 8 hours, so a longer
walk keeps recording without it. Turned off in Settings, recording runs
without it. A tap on the card or the island opens `<bundle id>://trail` (the
bundle id is already the app's URL scheme, so dev and release builds each open
themselves); `TrailContext` opens the 徒步导航 page on it. Needs a new build.

## In-app pill

While the page is minimised and the tab bar shows, the 记录 tab is the way
back: its label becomes the moving time, `mm:ss` under an hour and `h:mm:ss` after (orange while recording, grey and
frozen while paused). `TrailMiniBar` appears only where the tab bar is hidden
(`tabsHidden` in `AppRoot.tsx`: detail pages, discover overlays, share
posters and so on). A tap opens the page; a drag moves it. It snaps to the left edge, middle or right edge
(a flick carries toward one), stays between the safe area and the tab bar, and
keeps its spot under `kaipa.trail.miniPosition.v1`.

## Navigation and voice

`trailGuide.ts` subscribes to the recorder at module level, not from a
component. It runs on every fix even with the screen locked and React not
rendering, and the page reads the same state, so what is spoken and what is
shown agree.

- **Progress**: `locateOnRoute` projects the fix onto the route. On
  out-and-back routes it prefers the candidate nearest the previous progress.
  It advances only on fixes with accuracy of 40 m or better.
- **Off route**: more than 50 m from the line, cleared under 35 m. One warning
  haptic plus a spoken prompt, repeated every 2 minutes while still off.
- **Waypoints**: each one is announced once, within 200 m.
- **Arrival**: less than 40 m remaining, and past half the route.
- **Every whole kilometre**: distance and moving time.
- **Voice**:
  - Uses `expo-speech`, in the app language (`setTrailGuideLanguage`).
  - Toggled from the page and stored under `kaipa.trail.voice.v1`.
  - While a recording runs, `expo-audio` sets the session to duck other apps
    and play on silent and in the background. iOS needs `audio` in
    UIBackgroundModes, set in `app.config.js` `ios.infoPlist`.
  - The expo-audio plugin has background playback off, so Android gets no
    media foreground service. Android TTS needs none, since the process is
    already kept alive by the location service.
  - The session goes back to `mixWithOthers` when the recording finishes.
- **Elevation profile**: the route's profile on the panel, with the walked part
  filled in, replaces the progress bar when the route has one. Position on it
  is the fraction along the measured track, since stored profile distances need
  not match the measured length.

## Offline

Route geometry, GPS, recording, guidance and saving all work with no network.

**Android base map**:
- The route card (`RoutePreviewPanel`, above 反馈这条路线) offers the AMap
  offline package for the route's city, through `OfflineMapRow`
  (`src/components/maps/`). `matchOfflineCity` matches the catalog region,
  e.g. "四川 · 甘孜" → 甘孜藏族自治州.
- It belongs to planning, while there is signal. The trail page doesn't offer
  it: at the trailhead there is often no signal, and a whole prefecture package
  is the wrong thing to ask for there. Komoot, AllTrails and 两步路 keep
  downloads in planning too.
- With live progress. Once downloaded, the AMap view uses it automatically.
- Tracks and free recording have no region; 我的轨迹's more menu opens the
  SDK's own offline city manager.

**iOS base map**: still only MapKit's cache, because MapKit has no offline API.
The way forward is the same work as a terrain layer: our own raster tiles
(contours plus hillshade) through an `MKTileOverlay` that caches to disk, with
a "download along route" action prefetching the tiles in a corridor around the
track. That needs a tile source decided first (licence, hosting, coverage in
China), so it is not built yet.
