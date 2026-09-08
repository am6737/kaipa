# Android terrain maps

## SDK and bridge

- `expo-gaode-map@2.3.0` uses AMap Android
  `3dmap-location-search:11.2.000_loc11.2.000_sea9.8.0` by default.
- AMap documents full terrain support from Android 3D SDK 9.1.0.
- `patches/expo-gaode-map+2.3.0.patch` exposes the synchronous Android
  `MapsInitializer.setTerrainEnable(boolean)` API and an optional public TS method.
  The existing JS proxy forwards it to the native module; iOS is not patched.
- `NativeMap.android.tsx` enables terrain after SDK/privacy initialization and
  before the first native map view. The engine remains enabled for all maps.

Terrain is a process-wide engine selection, not `AMap.mapType`. AMap requires
selection before constructing map views and prohibits mixing ordinary and terrain
engines. Do not toggle it in response to an individual map's style or lifetime.
Standard and satellite remain base-map choices within the terrain engine. The
legacy `terrain` style now uses Standard, not Navi. iOS MapKit and Expo Go/web
fallback behavior are unchanged.

## Build and verification

Run `yarn install` to apply the patch, then rebuild the Android development or
release app using the existing build process (locally: `yarn android`). An OTA
JS update cannot install this native bridge. Old binaries keep their ordinary
maps and log a rebuild warning instead of failing to render.

Automated checks:

```bash
node --test scripts/test-amap-terrain.cjs
npx tsc --noEmit
```

Device acceptance checks (both light and dark mode):

- Cold-launch Discover; inspect a mountainous area at regional and close zooms,
  then tilt the map to inspect elevation. Check tiles actually load, not just
  that the bridge returns successfully.
- Switch Standard / Satellite repeatedly; preserve camera, labels and gestures.
- Open journey/track maps over Discover, then close them; check both maps,
  markers, polylines and location for regressions or engine conflicts.
- Verify terrain availability for the production key/network/device and required
  AMap attribution / terrain approval-number disclosure before release.

The bridge enables the official terrain renderer; it does not guarantee the
same colors, vegetation shading or ocean styling as the consumer AMap app.

## Official references

- https://lbs.amap.com/api/android-sdk/guide/create-map/terrain
- https://a.amap.com/lbs/static/unzip/Android_Map_Doc/3D/com/amap/api/maps/MapsInitializer.html#setTerrainEnable-boolean-
- https://a.amap.com/lbs/static/unzip/Android_Map_Doc/3D/com/amap/api/maps/AMap.html#getTerrainApprovalNumber--
