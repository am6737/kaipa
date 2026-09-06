// theme.ts — theme builder for kaipa (ported from prototype theme.jsx).
// Appearance mode: 'system' | 'light' | 'dark' (system resolved at runtime).
// Accent color: any hex; 6 curated presets exposed for the 我 page picker.
//
// CSS-only values from the prototype (box-shadow / radial-gradient strings) are
// re-expressed as React-Native-friendly primitives: gradient *stops* (arrays)
// and plain color tokens. Components compose shadows via Platform shadow props.

export type AccentPreset = { id: string; color: string; name: string };

export const ACCENT_PRESETS: AccentPreset[] = [
  { id: 'blue', color: '#0A84FF', name: '蓝色' },
  { id: 'indigo', color: '#5E5CE6', name: '靛色' },
  { id: 'teal', color: '#0EAFB1', name: '青色' },
  { id: 'green', color: '#2EB85C', name: '绿色' },
  { id: 'orange', color: '#FF9500', name: '橙色' },
  { id: 'pink', color: '#FF375F', name: '粉色' },
];

export function hexToRgb(hex: string): [number, number, number] {
  let h = (hex || '').replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) return [10, 132, 255];
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgba(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export type Mode = 'light' | 'dark';

export interface Theme {
  name: string;
  en: string;
  dark: boolean;
  bg: string;
  groupedBg: string;
  featureSurface: string;
  controlSurface: string;
  fieldSurface: string;
  fieldBorder: string;
  progressTrack: string;
  surfaceTop: string;
  surface: string;
  surfaceStrong: string;
  border: string;
  hairline: string;
  text: string;
  text2: string;
  text3: string;
  accent: string;
  accentSoft: string;
  accentSofter: string;
  accentShadow: string;
  danger: string;
  dangerSoft: string;
  // Globe / map
  globeStops: string[]; // radial gradient stops (center -> edge)
  globeRim: string;
  globeGrid: string;
  globeAtmos: string; // atmosphere glow color
  trailMine: string;
  trailOthers: string;
  trailFaint: string;
  dotCore: string;
  dotRing: string;
}

export function makeTheme(mode: Mode, accent?: string): Theme {
  const a = accent || '#0A84FF';
  if (mode === 'dark') {
    return {
      name: '黑',
      en: 'Dark',
      dark: true,
      bg: '#000000',
      groupedBg: '#1C1C1E',
      featureSurface: '#000000',
      controlSurface: '#2C2C2E',
      fieldSurface: 'rgba(255,255,255,0.07)',
      fieldBorder: 'rgba(255,255,255,0.08)',
      progressTrack: 'rgba(255,255,255,0.10)',
      surfaceTop: 'rgba(40,40,44,0.92)',
      surface: 'rgba(255,255,255,0.05)',
      surfaceStrong: 'rgba(28,28,30,0.96)',
      border: 'rgba(255,255,255,0.10)',
      hairline: 'rgba(255,255,255,0.10)',
      text: '#FFFFFF',
      text2: 'rgba(235,235,245,0.62)',
      text3: 'rgba(235,235,245,0.30)',
      accent: a,
      accentSoft: rgba(a, 0.18),
      accentSofter: rgba(a, 0.1),
      accentShadow: rgba(a, 0.3),
      danger: '#FF453A',
      dangerSoft: 'rgba(255,69,58,0.18)',
      globeStops: ['#2A2A2D', '#18181A', '#0A0A0C', '#000000'],
      globeRim: 'rgba(255,255,255,0.10)',
      globeGrid: 'rgba(255,255,255,0.10)',
      globeAtmos: 'rgba(95,179,255,0.18)',
      trailMine: '#FF7A55',
      trailOthers: '#FFFFFF',
      trailFaint: 'rgba(255,255,255,0.35)',
      dotCore: '#FFFFFF',
      dotRing: a,
    };
  }
  return {
    name: '白',
    en: 'Light',
    dark: false,
    bg: '#F2F2F7',
    groupedBg: '#F4F4F5',
    featureSurface: '#FFFFFF',
    controlSurface: '#FFFFFF',
    fieldSurface: 'rgba(0,0,0,0.045)',
    fieldBorder: 'rgba(0,0,0,0.035)',
    progressTrack: 'rgba(0,0,0,0.07)',
    surfaceTop: '#FFFFFF',
    surface: 'rgba(245,245,247,0.95)',
    surfaceStrong: '#FFFFFF',
    border: 'rgba(0,0,0,0.06)',
    hairline: 'rgba(0,0,0,0.08)',
    text: '#000000',
    text2: 'rgba(60,60,67,0.62)',
    text3: 'rgba(60,60,67,0.32)',
    accent: a,
    accentSoft: rgba(a, 0.12),
    accentSofter: rgba(a, 0.06),
    accentShadow: rgba(a, 0.28),
    danger: '#FF3B30',
    dangerSoft: 'rgba(255,59,48,0.10)',
    globeStops: ['#FFFFFF', '#F2F2F4', '#D8D8DC', '#B8B8BE'],
    globeRim: 'rgba(0,0,0,0.08)',
    globeGrid: 'rgba(0,0,0,0.10)',
    globeAtmos: 'rgba(120,140,160,0.18)',
    trailMine: '#FF5C3A',
    trailOthers: '#000000',
    trailFaint: 'rgba(0,0,0,0.35)',
    dotCore: '#FFFFFF',
    dotRing: a,
  };
}
