// app.config.js — extends app.json and injects the Mapbox config plugin.
//
// @rnmapbox/maps needs two tokens:
//   • A PUBLIC access token (pk.…) read at runtime from EXPO_PUBLIC_MAPBOX_TOKEN
//     (see .env). This is what draws the map/globe tiles.
//   • A SECRET download token (sk.…) used ONLY at native build time to fetch the
//     Mapbox iOS SDK from their private Maven/CocoaPods. Put it in
//     MAPBOX_DOWNLOAD_TOKEN (never commit it). Leaving it empty is fine until you
//     run `npx expo run:ios` / build with EAS.
//
// The globe requires a native dev build — it does NOT run in Expo Go. Without a
// token the app falls back to a stylized SVG globe so everything still runs.

module.exports = ({ config }) => ({
  ...config,
  userInterfaceStyle: 'automatic',
  ios: {
    ...config.ios,
    userInterfaceStyle: 'automatic',
  },
  android: {
    ...config.android,
    userInterfaceStyle: 'automatic',
  },
  plugins: [
    [
      '@rnmapbox/maps',
      {
        RNMapboxMapsDownloadToken: process.env.MAPBOX_DOWNLOAD_TOKEN || '',
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: 'Kaipa 需要访问你的相册，以便把照片或视频加入旅程瞬间。',
        cameraPermission: 'Kaipa 需要使用相机，以便为旅程拍摄照片或视频。',
        microphonePermission: 'Kaipa 在录制视频时需要使用麦克风。',
      },
    ],
    'expo-font',
    'expo-localization',
  ],
});
