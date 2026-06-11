// shadow.ts — helpers to translate the prototype's CSS box-shadows into RN
// shadow props. iOS reads shadowColor/Offset/Opacity/Radius; Android uses
// elevation. We approximate the layered glass shadows with a single soft shadow.
import { ViewStyle } from 'react-native';
import { Theme } from './theme';

export function shadow(
  opacity: number,
  radius: number,
  offsetY: number,
  color = '#000',
  elevation?: number
): ViewStyle {
  return {
    shadowColor: color,
    shadowOffset: { width: 0, height: offsetY },
    shadowOpacity: opacity,
    shadowRadius: radius,
    elevation: elevation ?? Math.round(radius / 2),
  };
}

// Elevated card / glass surface shadow (matches the kaipa "elev" signature).
export function elevCard(t: Theme): ViewStyle {
  return t.dark
    ? shadow(0.4, 16, 4, '#000', 8)
    : shadow(0.1, 18, 6, '#000', 5);
}

// Strong floating element (tab bar, FAB, nav buttons).
export function elevFloat(t: Theme): ViewStyle {
  return t.dark
    ? shadow(0.5, 14, 6, '#000', 12)
    : shadow(0.14, 12, 4, '#000', 8);
}

// Accent-tinted shadow for primary CTAs.
export function elevAccent(t: ViewStyle | string): ViewStyle {
  const color = typeof t === 'string' ? t : '#0A84FF';
  return {
    shadowColor: color,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.32,
    shadowRadius: 14,
    elevation: 8,
  };
}
