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

MapKit does not need an API key. Android AMap needs a native key from the
高德开放平台. Add it to `.env` without committing the value:

```bash
AMAP_ANDROID_KEY=your_android_native_key
```

The native key is written to `AndroidManifest.xml` at build time and therefore
cannot be treated as a secret after distribution. Restrict it in the 高德 console
to Kaipa's Android package name and the SHA-1 fingerprint of every allowed
signing certificate. Configure quotas and usage alerts as an additional guard.

The dev build ships a **different package name** (`com.hitosea.letsgo.dev`, see
below), so it needs a key of its own: register one for that package name plus the
SHA-1 of the EAS development keystore (`eas credentials --platform android`
prints it), then give it to the development build environment as
`AMAP_ANDROID_KEY`. Without it the dev build still runs, but AMap tiles stay
blank.

Place search and reverse geocoding run through the authenticated `map-search`
Supabase Edge Function. Its Web Service key must remain server-side:

```bash
supabase secrets set AMAP_WEB_KEY=YOUR_WEB_SERVICE_KEY
infra/supabase/deploy-functions.sh map-search
```

Do not create an `EXPO_PUBLIC_AMAP_WEB_KEY`; every `EXPO_PUBLIC_` variable is
included in the client JavaScript bundle.

### Dev build via EAS (cloud — works from any OS)

This repo has no local Android SDK / Xcode, so use EAS Build. Android is the
fastest path to a real phone (it produces an installable APK).

The development profile builds a **separate app** from the release one: package
`com.hitosea.letsgo.dev`, display name `kaipa dev`, so it installs *next to* the
App Store build instead of replacing it. `eas.json` sets `APP_VARIANT=development`
for that profile, and `app.config.js` turns it into the `.dev` suffix; every other
profile keeps `com.hitosea.letsgo`.

```bash
# 1. one-time: an Expo account + login
eas login

# 2. link the project (writes extra.eas.projectId)
eas init

# 3. provide the native AMap key to the cloud build environment
#    (register it for com.hitosea.letsgo.dev + the dev keystore SHA-1 — see above)
eas env:create --environment development --name AMAP_ANDROID_KEY --value YOUR_KEY --visibility sensitive

# 4. provide the self-hosted Supabase runtime to the cloud build environment
#    (.env is gitignored and never uploaded, so cloud builds only see EAS variables)
eas env:create --environment development --name EXPO_PUBLIC_SUPABASE_URL \
  --value https://8010--main--am--am6737.coder.dootask.com --visibility plaintext
eas env:create --environment development --name EXPO_PUBLIC_SUPABASE_ANON_KEY \
  --value "$(grep -m1 '^EXPO_PUBLIC_SUPABASE_ANON_KEY=' .env | cut -d= -f2-)" --visibility sensitive

# 5. build the Android dev client (APK)
eas build --profile development --platform android

# 6. install the APK on your phone (link/QR printed at the end), then serve the JS.
#    Pass the same APP_VARIANT so the manifest Metro hands the client matches the
#    identifiers baked into the build:
APP_VARIANT=development npm start
```

For iOS you'd additionally need an Apple Developer account and run
`eas build --profile development --platform ios` (device registration handled
interactively by EAS). The `.dev` bundle ID is a second App ID: Apple sign-in on
the dev build only works once `com.hitosea.letsgo.dev` is registered and listed in
the Supabase `GOTRUE_EXTERNAL_APPLE_CLIENT_ID` whitelist — see
`docs/apple-sign-in.md`.


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
