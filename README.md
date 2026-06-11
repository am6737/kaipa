# kaipa

A hiking / journey app built with **Expo + React Native**, implementing the
`kaipa-handoff` HTML/CSS prototype. The headline 发现 (Discover) screen renders an
interactive **3D globe via Mapbox** (`@rnmapbox/maps`), with routes and journeys
pinned at their real coordinates.

## Quick start

```bash
npm install
npm start          # Metro — press i / a, or scan the QR in Expo Go
```

The app runs **as-is in Expo Go** using a stylized SVG globe fallback. To get the
**real Mapbox globe** you need a token and a native dev build (see below).

## Enabling the Mapbox globe

`@rnmapbox/maps` is a native module — it does **not** run in Expo Go and needs a
custom dev build.

1. Create a free Mapbox account and tokens at
   <https://account.mapbox.com/access-tokens/>.
2. Put your **public** token (`pk.…`) in `.env`:
   ```
   EXPO_PUBLIC_MAPBOX_TOKEN=pk.your_token_here
   ```
   For iOS native builds also add the **secret download** token (`sk.…` with the
   `Downloads:Read` scope) to `MAPBOX_DOWNLOAD_TOKEN` (never commit it).
3. Build & run a dev client:
   ```bash
   npx expo run:ios      # or: npx expo run:android
   ```

When `EXPO_PUBLIC_MAPBOX_TOKEN` is set and the native module is available, the
globe uses Mapbox (`projection: globe`); otherwise it transparently falls back to
the SVG globe — so the app never crashes if the token/dev-build isn't there.

### Two Mapbox tokens you need

| Token | env var | scope | used when |
|-------|---------|-------|-----------|
| Public | `EXPO_PUBLIC_MAPBOX_TOKEN` | default public (`pk.…`) | at runtime, to draw tiles |
| Secret download | `MAPBOX_DOWNLOAD_TOKEN` | `Downloads:Read` (`sk.…`) | at native build time, to fetch the Mapbox SDK (both iOS **and** Android) |

### Dev build via EAS (cloud — works from any OS)

This repo has no local Android SDK / Xcode, so use EAS Build. Android is the
fastest path to a real phone (it produces an installable APK).

```bash
# 1. one-time: an Expo account + login
eas login

# 2. link the project (writes extra.eas.projectId)
eas init

# 3. provide the Mapbox tokens to the cloud build env (development environment)
eas env:create --environment development --name EXPO_PUBLIC_MAPBOX_TOKEN --value pk.YOURTOKEN --visibility plaintext
eas env:create --environment development --name MAPBOX_DOWNLOAD_TOKEN  --value sk.YOURTOKEN --visibility secret

# 4. build the Android dev client (APK)
eas build --profile development --platform android

# 5. install the APK on your phone (link/QR printed at the end), then:
npm start          # the dev client connects and loads the JS
```

For iOS you'd additionally need an Apple Developer account and run
`eas build --profile development --platform ios` (device registration handled
interactively by EAS).

## Architecture

```
App.tsx                     providers: SafeArea → Appearance(theme) → Notifications
src/
  AppRoot.tsx               auth gate + app shell (active screen + overlays + tabs + toast)
  theme/                    makeTheme (light/dark + accent), AppearanceContext, shadows, fonts
  nav/NavContext.tsx        central UI state (tabs, selected POI, sheet, journey edits, overlays)
  data/                     pois (real lat/lng), tones+PRNG, elevation series, gear, notifications
  components/
    globe/                  Mapbox globe + SVG fallback (orthographic projection), auto-selected
    Glass, PhotoTile, Avatar, Icon, Chip, ListRow, Sheet (draggable detents),
    Donut, ElevationStrip, State, Toast, BottomTabs
    overlays/               ActionSheet, AddRouteSheet, ElevationFull, PhotoWall, JourneyCardFull
  screens/                  DiscoverScreen, JourneyCard, GearScreen, MeScreen, AuthFlow
```

Notes:
- Animations & the draggable bottom sheet use core `Animated` + `PanResponder`
  (no reanimated babel plugin needed).
- Theme mode (系统/浅色/深色) and accent color are chosen on the **我** screen and
  drive the whole app live; both persist via AsyncStorage.

## Implemented

- **发现 (Discover):** Mapbox/SVG globe with route (探索) & journey (旅程) POIs,
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
