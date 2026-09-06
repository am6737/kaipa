// Native maps use Apple MapKit on iOS and AMap on Android. Native map screens
// require a development build; Expo Go/web keep the existing SVG fallback.

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
      'expo-gaode-map',
      {
        androidKey: process.env.AMAP_ANDROID_KEY || process.env.EXPO_PUBLIC_AMAP_ANDROID_KEY || '',
        enableLocation: true,
        locationDescription: 'Kaipa 需要访问你的位置，以便在地图上显示当前位置并设置旅程地点。',
      },
    ],
    [
      'expo-location',
      {
        locationWhenInUsePermission: 'Kaipa 需要访问你的位置，以便在地图上显示当前位置并设置旅程地点。',
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: 'Kaipa 需要访问你的相册，以便选择装备图片或把照片和视频加入旅程瞬间。',
        cameraPermission: 'Kaipa 需要使用相机，以便拍摄装备图片或旅程照片和视频。',
        microphonePermission: 'Kaipa 在录制视频时需要使用麦克风。',
      },
    ],
    [
      'expo-media-library',
      {
        photosPermission: 'Kaipa 需要访问你的相册，以便在 AI 对话中展示和选择最近照片。',
        granularPermissions: ['photo'],
      },
    ],
    [
      'expo-camera',
      {
        cameraPermission: 'Kaipa 需要使用相机，以便扫描二维码登录其他设备。',
        microphonePermission: false,
        recordAudioAndroid: false,
      },
    ],
    [
      'expo-speech-recognition',
      {
        microphonePermission: 'Kaipa 需要使用麦克风，以便将你的语音转换为文字。',
        speechRecognitionPermission: 'Kaipa 需要使用系统语音识别，以便将你的语音转换为文字。',
      },
    ],
    'expo-font',
    'expo-localization',
    'expo-sharing',
  ],
});
