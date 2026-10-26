import { Image, Platform } from 'react-native';

// The shared location marker as images for AMap's location layer, one per
// accent preset (scripts/render-location-marker.py draws them).
const LOCATION_IMAGES: Record<string, number> = {
  '#0a84ff': require('../../../assets/trail/location-blue.png'),
  '#5e5ce6': require('../../../assets/trail/location-indigo.png'),
  '#0eafb1': require('../../../assets/trail/location-teal.png'),
  '#2eb85c': require('../../../assets/trail/location-green.png'),
  '#ff9500': require('../../../assets/trail/location-orange.png'),
  '#ff375f': require('../../../assets/trail/location-pink.png'),
  '#000000': require('../../../assets/trail/location-black.png'),
};

export function platformLocationImage(accent: string): { uri: string; size: number } | undefined {
  if (Platform.OS !== 'android') return undefined;
  const source = Image.resolveAssetSource(LOCATION_IMAGES[accent.toLowerCase()] ?? LOCATION_IMAGES['#0a84ff']);
  // A dev build serves it from Metro (http), a release names the drawable,
  // an OTA update hands a file:// path; AMap's image loader takes all three.
  return source?.uri ? { uri: source.uri, size: 52 } : undefined;
}
