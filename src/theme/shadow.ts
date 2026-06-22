import { ViewStyle } from 'react-native';
import { Theme } from './theme';

function toRgba(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const n = h.length === 3
    ? parseInt(h[0] + h[0] + h[1] + h[1] + h[2] + h[2], 16)
    : parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export function shadow(
  opacity: number,
  radius: number,
  offsetY: number,
  color = '#000',
): ViewStyle {
  return { boxShadow: `0px ${offsetY}px ${radius}px ${toRgba(color, opacity)}` };
}

export function elevCard(t: Theme): ViewStyle {
  return t.dark ? shadow(0.33, 12, 4) : {};
}

export function elevFloat(t: Theme): ViewStyle {
  return t.dark ? shadow(0.5, 14, 6) : shadow(0.14, 12, 4);
}

export function elevAccent(t: ViewStyle | string): ViewStyle {
  const color = typeof t === 'string' ? t : '#0A84FF';
  return shadow(0.32, 14, 6, color);
}
