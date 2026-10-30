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

// The same without the heading cone, for a fix without a heading.
const DOT_IMAGES: Record<string, number> = {
  '#0a84ff': require('../../../assets/trail/location-blue-dot.png'),
  '#5e5ce6': require('../../../assets/trail/location-indigo-dot.png'),
  '#0eafb1': require('../../../assets/trail/location-teal-dot.png'),
  '#2eb85c': require('../../../assets/trail/location-green-dot.png'),
  '#ff9500': require('../../../assets/trail/location-orange-dot.png'),
  '#ff375f': require('../../../assets/trail/location-pink-dot.png'),
  '#000000': require('../../../assets/trail/location-black-dot.png'),
};

export function platformLocationImage(accent: string, withHeading = true): { uri: string; size: number } | undefined {
  if (Platform.OS !== 'android') return undefined;
  const images = withHeading ? LOCATION_IMAGES : DOT_IMAGES;
  const source = Image.resolveAssetSource(images[accent.toLowerCase()] ?? images['#0a84ff']);
  // A dev build serves it from Metro (http), a release names the drawable,
  // an OTA update hands a file:// path; AMap's image loader takes all three.
  return source?.uri ? { uri: source.uri, size: 40 } : undefined;
}

// MapKit's own user-location dot, drawn for AMap, so the Android map matches
// what iOS shows with showsUserLocation. System blue, whatever the accent.
const SYSTEM_IMAGE = require('../../../assets/trail/location-system.png');
const SYSTEM_DOT_IMAGE = require('../../../assets/trail/location-system-dot.png');

export function systemLocationImage(withHeading = true): { uri: string; size: number } | undefined {
  if (Platform.OS !== 'android') return undefined;
  const source = Image.resolveAssetSource(withHeading ? SYSTEM_IMAGE : SYSTEM_DOT_IMAGE);
  return source?.uri ? { uri: source.uri, size: 74 } : undefined;
}
