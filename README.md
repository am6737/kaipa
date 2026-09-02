# kaipa

A hiking / journey app built with **Expo + React Native**, implementing the
`kaipa-handoff` HTML/CSS prototype. The 发现 (Discover) screen renders routes and
journeys on Apple MapKit for iOS and AMap for Android.

## Quick start

```bash
npm install
npm start          # Metro — press i / a, or scan the QR in Expo Go
```

The app runs in Expo Go using a stylized SVG fallback. Native maps require a
development build.

## Enabling native maps

MapKit does not need an API key. Android AMap and place search need keys from the
高德开放平台. Add them to `.env` without committing the values:

```bash
EXPO_PUBLIC_AMAP_ANDROID_KEY=your_android_native_key
EXPO_PUBLIC_AMAP_WEB_KEY=your_web_service_key
```

The app agent uses `AMAP_WEB_KEY` in the Supabase Edge Function environment.

### Dev build via EAS (cloud — works from any OS)

This repo has no local Android SDK / Xcode, so use EAS Build. Android is the
fastest path to a real phone (it produces an installable APK).

```bash
# 1. one-time: an Expo account + login
eas login

# 2. link the project (writes extra.eas.projectId)
eas init

# 3. provide the AMap keys to the cloud build environment
eas env:create --environment development --name EXPO_PUBLIC_AMAP_ANDROID_KEY --value YOUR_KEY --visibility sensitive
eas env:create --environment development --name EXPO_PUBLIC_AMAP_WEB_KEY --value YOUR_KEY --visibility sensitive

# 4. build the Android dev client (APK)
eas build --profile development --platform android

# 5. install the APK on your phone (link/QR printed at the end), then:
npm start          # the dev client connects and loads the JS
```

For iOS you'd additionally need an Apple Developer account and run
`eas build --profile development --platform ios` (device registration handled
interactively by EAS).


## Self-hosted Supabase isolation

Kaipa should run on its own Supabase instance instead of sharing Auth/database
with other apps. The repo keeps all reproducible schema, migrations, seed data,
and Edge Functions, while generated database files and secrets stay outside Git.

Create a fresh isolated runtime with:

```bash
infra/supabase/setup-kaipa-supabase.sh
```

See `infra/supabase/README.md` for ports, environment overrides, and redeploy
notes.

## Architecture

```
App.tsx                     providers: SafeArea → Appearance(theme) → Notifications
src/
  AppRoot.tsx               auth gate + app shell (active screen + overlays + tabs + toast)
  theme/                    makeTheme (light/dark + accent), AppearanceContext, shadows, fonts
  nav/NavContext.tsx        central UI state (tabs, selected POI, sheet, journey edits, overlays)
  data/                     pois (real lat/lng), tones+PRNG, elevation series, gear, notifications
  components/
    globe/                  native discovery map + SVG fallback, auto-selected
    Glass, PhotoTile, Avatar, Icon, Chip, ListRow, Sheet (draggable detents),
    Donut, ElevationStrip, State, Toast, BottomTabs
    overlays/               ActionSheet, AddRouteSheet, ElevationFull, PhotoWall
  screens/                  DiscoverScreen, JourneyCard, GearScreen, MeScreen, AuthFlow
```

Notes:
- Animations & the draggable bottom sheet use core `Animated` + `PanResponder`
  (no reanimated babel plugin needed).
- Theme mode (系统/浅色/深色) and accent color are chosen on the **我** screen and
  drive the whole app live; both persist via AsyncStorage.

## Implemented

- **发现 (Discover):** native/SVG map with route (探索) & journey (旅程) POIs,
  subtab switch, filter chips, draggable detented sheet, per-POI detail card.
- **Journey/route card:** hero, stat strip, status-aware CTA (出发/完成/再次出发),
  favourite, description, elevation track (→ full elevation overlay), companions,
  timeline digest, photo grid (→ photo wall).
- **装备 (Gear):** value/weight/count donut, 装备/分类/套装 views with metric stepper.
- **我 (Me):** profile, appearance (theme + accent), settings, sign out.
- **Auth:** sign-in/register entry gate (persisted).
- Overlays: action sheet, add-route sheet, full elevation, photo wall, full card, toast.

## Deferred (next iterations)

These prototype flows are represented by toasts/stubs and are the natural next
steps: upload-track, record-journey, new-journey creation wizard, global search,
invite/join + guest share wall, gear smart-add (link/scan recognition), and the
companions / journey-settings full editors.
