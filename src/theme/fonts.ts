// fonts.ts — font families used across kaipa.
// The prototype uses the SF system stack + an SF Mono stack. On native, the
// platform default already resolves to San Francisco (iOS) / Roboto (Android),
// so we use the platform sentinel for the body font and a real monospace family
// for stats/coordinates.
import { Platform } from 'react-native';

export const SF = Platform.select({ ios: undefined, android: undefined, default: undefined });

// Monospace used for numbers, coordinates, "Day 2/4" style meta.
export const MONO = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'monospace',
});

// Serif used for hero titles on the immersive detail page.
export const SERIF = Platform.select({
  ios: 'Georgia',
  android: 'serif',
  default: 'serif',
});
