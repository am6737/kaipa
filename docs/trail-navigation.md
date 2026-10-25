# 徒步导航与轨迹记录

Following a planned route on foot, or recording a free walk, from inside the
app. Picking a route and starting means following it and recording it.
Free recording is the same page without a planned line.

## Where it lives

| Piece | File |
| --- | --- |
| Pure maths: GPS filtering, totals, route progress, off-route, formatting | `src/lib/trailGeo.ts` |
| Recorder singleton: location feeds, persistence, background task | `src/lib/trailRecorder.ts` |
| React bridge, open/closed state, saving and the offline save queue | `src/trail/TrailContext.tsx` |
| Route/track → `TrailRouteRef`, `useOpenTrail()` | `src/trail/trailRoutes.ts` |
| Page, finish summary, mini bar | `src/components/trail/` |

`index.ts` imports `trailRecorder` before `registerRootComponent`, because iOS
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

- **Fix filtering** (`judgeFix`):
  - drop fixes with accuracy worse than 40 m;
  - drop steps inside the fix's error circle (standing still);
  - drop jumps faster than 12 m/s.
- **Climb** uses 5 m hysteresis, like imports.
- **Pause** starts a new segment, so a pause doesn't draw a straight line
  across a bus ride. Saving joins the segments into one line, and `durationMs`
  is moving time.
- **Storage**: the session survives a kill. AsyncStorage holds a meta key plus
  200-point chunks, and only the open chunk is rewritten. Writes are throttled
  to every 5 s and flushed when the app goes to background. On next launch the
  page reopens on the recording.
- **Saving offline**: `createTrack` returning null queues the draft under
  `kaipa.trail.pendingSaves.v1`. The queue flushes on launch and when the app
  becomes active.

## Location sources

| Platform | Source | Screen off |
| --- | --- | --- |
| iOS | expo-location `startLocationUpdatesAsync` (task `kaipa-trail-recording`) | UIBackgroundModes `location`, blue pill |
| Android with AMap | AMap continuous location, `setAllowsBackgroundLocationUpdates` | AMap's foreground service and notification |
| Android without AMap | expo-location task with a foreground-service notification | yes |
| Fallback (binary without the task module) | `watchPositionAsync` | no; the page shows `trail.foregroundOnly` |

Only while-in-use permission is ever requested. The background behaviour
needs `expo-task-manager`, `isIosBackgroundLocationEnabled` and
`enableBackgroundLocation` (expo-gaode-map) in the binary, so it needs a new
build. An OTA update onto an older binary falls back to foreground-only.
`enableBackgroundLocation` also declares `ACCESS_BACKGROUND_LOCATION` in the
manifest, which store review may ask about. The answer: it is used for the
foreground-service trail recording only and is never requested at runtime.

## Navigation

- **Progress**: `locateOnRoute` projects the fix onto the route. On
  out-and-back routes it prefers the candidate nearest the previous progress,
  so the walker doesn't jump between the two passes.
- **Off route**: more than 50 m from the line, cleared under 35 m. It is judged
  only on fixes with accuracy of 40 m or better, and gives one warning haptic.
- **Arrival**: less than 40 m remaining, and past half the route (loops start
  at their finish).

## Offline

Route geometry, GPS, recording and saving all work with no network.

Base map tiles are not downloaded ahead of time. MapKit has no offline API.
AMap's offline city packages (Android) are a possible follow-up. Until then,
tiles come only from whatever the map SDK cached while online.
