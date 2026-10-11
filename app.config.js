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

const fs = require('fs');
const path = require('path');

// DooPush 推送凭据：dev 变体读 *_DEV 变量（DooPush 后台需为 com.hitosea.letsgo.dev
// 单独建应用）。构建时由 EAS 环境变量注入，本地由 Expo CLI 从 .env 加载。
const DOOPUSH_APP_ID = IS_DEV_VARIANT
  ? process.env.EXPO_PUBLIC_DOOPUSH_APP_ID_DEV
  : process.env.EXPO_PUBLIC_DOOPUSH_APP_ID;
const DOOPUSH_APP_KEY = IS_DEV_VARIANT
  ? process.env.EXPO_PUBLIC_DOOPUSH_APP_KEY_DEV
  : process.env.EXPO_PUBLIC_DOOPUSH_APP_KEY;
// Android 按 DooPush 文档接 OEM 厂商通道；不配置 FCM。各厂商凭据缺失时跳过。
const DOOPUSH_OPPO_APP_KEY = IS_DEV_VARIANT
  ? process.env.DOOPUSH_OPPO_APP_KEY_DEV
  : process.env.DOOPUSH_OPPO_APP_KEY;
const DOOPUSH_OPPO_APP_SECRET = IS_DEV_VARIANT
  ? process.env.DOOPUSH_OPPO_APP_SECRET_DEV
  : process.env.DOOPUSH_OPPO_APP_SECRET;
// vivo 客户端只需 appId + apiKey（apiKey 即 vivo 控制台 AppKey）；AppSecret 仅服务端用。
const DOOPUSH_VIVO_APP_ID = IS_DEV_VARIANT
  ? process.env.DOOPUSH_VIVO_APP_ID_DEV
  : process.env.DOOPUSH_VIVO_APP_ID;
const DOOPUSH_VIVO_API_KEY = IS_DEV_VARIANT
  ? process.env.DOOPUSH_VIVO_API_KEY_DEV
  : process.env.DOOPUSH_VIVO_API_KEY;
// 华为 HMS 无内联凭证模式，只能靠 agconnect-services.json（AGC 控制台下载，不含密钥）
// 是否存在决定启用；荣耀同理靠 mcs-services.json。服务端凭据都配在 DooPush 后台。
const DOOPUSH_HMS_AGCONNECT_FILE = IS_DEV_VARIANT
  ? './agconnect-services.dev.json'
  : './agconnect-services.json';
const HAS_HMS_AGCONNECT = fs.existsSync(path.resolve(DOOPUSH_HMS_AGCONNECT_FILE));
const DOOPUSH_HONOR_MCS_FILE = IS_DEV_VARIANT
  ? './mcs-services.dev.json'
  : './mcs-services.json';
const HAS_HONOR_MCS = fs.existsSync(path.resolve(DOOPUSH_HONOR_MCS_FILE));

const variantId = (value) => (IS_DEV_VARIANT && value ? `${value}.dev` : value);
const variantName = (value) => (IS_DEV_VARIANT ? `${value} dev` : value);
const localizedName = (name) => ({
  ios: { CFBundleDisplayName: variantName(name), CFBundleName: variantName(name) },
  android: { app_name: variantName(name) },
});

module.exports = ({ config }) => {
  const next = {
    ...config,
    extra: {
      ...config.extra,
      // Set EXPO_UPDATE_MODE per release: silent, prompt, or next_launch.
      updateMode: process.env.EXPO_UPDATE_MODE || 'prompt',
      // 把按环境选好的 DooPush 凭据带到运行时（APP_VARIANT 不会进 JS bundle）
      doopush: {
        appId: DOOPUSH_APP_ID,
        appKey: DOOPUSH_APP_KEY,
      },
    },
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
  };

  // DooPush 插件要求 appId/appKey 必填。构建引导阶段（如 eas env:push）凭据
  // 尚未就绪时跳过插件，避免 config 解析失败；运行期缺凭据由 PushBootstrap 跳过。
  if (DOOPUSH_APP_ID && DOOPUSH_APP_KEY) {
    const androidVendors = {};

    if (DOOPUSH_OPPO_APP_KEY && DOOPUSH_OPPO_APP_SECRET) {
      androidVendors.oppo = {
        appKey: DOOPUSH_OPPO_APP_KEY,
        appSecret: DOOPUSH_OPPO_APP_SECRET,
      };
    }
    // vivo：内联凭证模式，plugin 在 prebuild 时写成 assets/vivo-services.json。
    if (DOOPUSH_VIVO_APP_ID && DOOPUSH_VIVO_API_KEY) {
      androidVendors.vivo = {
        appId: DOOPUSH_VIVO_APP_ID,
        apiKey: DOOPUSH_VIVO_API_KEY,
      };
    }
    if (HAS_HMS_AGCONNECT) {
      androidVendors.hms = { agconnectServicesFile: DOOPUSH_HMS_AGCONNECT_FILE };
    }
    // 荣耀：mcs-services.json 之外还要把 app_id/developer_id 作为内联值传入，
    // 否则原生清单占位符为空，运行期报 3607「缺少 AppId」。
    if (HAS_HONOR_MCS) {
      const honorVendor = { mcsServicesFile: DOOPUSH_HONOR_MCS_FILE };
      try {
        const mcs = JSON.parse(fs.readFileSync(path.resolve(DOOPUSH_HONOR_MCS_FILE), 'utf8'));
        if (mcs.app_id) honorVendor.appId = String(mcs.app_id);
        if (mcs.developer_id) honorVendor.developerId = String(mcs.developer_id);
      } catch {}
      androidVendors.honor = honorVendor;
    }

    next.plugins = [
      ...(next.plugins || []),
      [
        'doopush-react-native-sdk',
        {
          appId: DOOPUSH_APP_ID,
          appKey: DOOPUSH_APP_KEY,
          baseURL: 'https://doopush.com/api/v1',
          ios: { mode: IS_DEV_VARIANT ? 'development' : 'production' },
          ...(Object.keys(androidVendors).length > 0
            ? { android: { vendors: androidVendors } }
            : {}),
        },
      ],
    ];

    // 荣耀 asplugin 要求根 build.gradle 的 AGP classpath 带显式版本，否则配置期报错。
    if (HAS_HONOR_MCS) {
      next.plugins.push('./plugins/withHonorAgpClasspath');
    }
  }

  return next;
};
