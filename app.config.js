// Native maps use Apple MapKit on iOS and AMap on Android. Native map screens
// require a development build; Expo Go/web keep the existing SVG fallback.
//
// App 标识（app.json）：iOS bundleIdentifier 与 Android package 都是
// com.hitosea.letsgo。注意高德 Android key 按「包名 + SHA1」注册，换包名必须
// 去高德控制台重新注册 key，并把新 key 写进 EXPO_PUBLIC_AMAP_ANDROID_KEY。
//
// development profile（eas.json 里注入 APP_VARIANT=development）在两端标识后
// 加 .dev、显示名加 dev，这样 dev build 与正式包能装在同一台手机上互不覆盖：
//   iOS / Android：com.hitosea.letsgo.dev   显示名：kaipa dev
// 连带影响：dev build 的 Apple 登录 audience 变成 com.hitosea.letsgo.dev，必须
// 同步加进 GOTRUE_EXTERNAL_APPLE_CLIENT_ID（见 docs/apple-sign-in.md）；高德
// Android key 也要为新包名 + 新 keystore 的 SHA1 另注册一个。
// 本地 `npx expo start` 服务 dev build 时要带上 APP_VARIANT=development。

const IS_DEV_VARIANT = process.env.APP_VARIANT === 'development';

const variantId = (value) => (IS_DEV_VARIANT && value ? `${value}.dev` : value);
const variantName = (value) => (IS_DEV_VARIANT ? `${value} dev` : value);
const localizedName = (name) => ({
  ios: { CFBundleDisplayName: variantName(name), CFBundleName: variantName(name) },
  android: { app_name: variantName(name) },
});

module.exports = ({ config }) => ({
  ...config,
  name: variantName(config.name),
  // Launcher names follow the OS language; in-app names follow useI18n().
  locales: {
    ...config.locales,
    en: localizedName(config.name),
    zh: localizedName('开爬'),
    'zh-Hans': localizedName('开爬'),
    'zh-Hant': localizedName('开爬'),
  },
  userInterfaceStyle: 'automatic',
  ios: {
    ...config.ios,
    bundleIdentifier: variantId(config.ios.bundleIdentifier),
    userInterfaceStyle: 'automatic',
  },
  android: {
    ...config.android,
    package: variantId(config.android.package),
    userInterfaceStyle: 'automatic',
  },
  // EAS Update delivers signed JS/assets bundles to an already installed
  // native binary. The channel is selected by the EAS build profile.
  runtimeVersion: { policy: 'appVersion' },
  updates: {
    url: `https://u.expo.dev/${config.extra?.eas?.projectId}`,
    enabled: true,
    checkAutomatically: 'NEVER',
    fallbackToCacheTimeout: 0,
  },
  plugins: [
    [
      'expo-gaode-map',
      {
        androidKey: process.env.AMAP_ANDROID_KEY || process.env.EXPO_PUBLIC_AMAP_ANDROID_KEY || '',
        enableLocation: true,
        locationDescription: '开爬需要访问你的位置，以便在地图上显示当前位置并设置旅程地点。',
      },
    ],
    [
      'expo-location',
      {
        locationWhenInUsePermission: '开爬需要访问你的位置，以便在地图上显示当前位置并设置旅程地点。',
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: '开爬需要访问你的相册，以便选择装备图片或把照片和视频加入旅程瞬间。',
        cameraPermission: '开爬需要使用相机，以便拍摄装备图片或旅程照片和视频。',
        microphonePermission: '开爬在录制视频时需要使用麦克风。',
      },
    ],
    [
      'expo-media-library',
      {
        photosPermission: '开爬需要访问你的相册，以便在 AI 对话中展示和选择最近照片。',
        granularPermissions: ['photo'],
      },
    ],
    [
      'expo-camera',
      {
        cameraPermission: '开爬需要使用相机，以便扫描二维码登录其他设备。',
        microphonePermission: false,
        recordAudioAndroid: false,
      },
    ],
    [
      'expo-speech-recognition',
      {
        microphonePermission: '开爬需要使用麦克风，以便将你的语音转换为文字。',
        speechRecognitionPermission: '开爬需要使用系统语音识别，以便将你的语音转换为文字。',
      },
    ],
    'expo-font',
    'expo-localization',
    'expo-sharing',
    'expo-image',
    'expo-video',
    'expo-updates',
    'expo-apple-authentication',
  ],
});
