import { MONO } from '../theme/fonts';

// Kaipa's visual constants. Product screens should compose these tokens instead
// of introducing one-off spacing, radii, type sizes, or animation timings.
export const space = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 30,
  xxxl: 40,
} as const;

export const radius = {
  control: 11,
  card: 16,
  feature: 24,
  pill: 999,
} as const;

export const layout = {
  pagePadding: 16,
  topBarHeight: 50,
  iconButton: 44,
  fieldHeight: 44,
  listRowMinHeight: 64,
  sectionGap: 30,
} as const;

export const type = {
  pageTitle: { fontSize: 25, fontWeight: '800' as const, letterSpacing: -0.5 },
  navTitle: { fontSize: 17, fontWeight: '700' as const },
  sectionTitle: { fontSize: 18, fontWeight: '800' as const },
  eyebrow: { fontSize: 12, fontWeight: '600' as const, letterSpacing: 0.4 },
  cardTitle: { fontSize: 15, fontWeight: '700' as const },
  body: { fontSize: 14.5 },
  caption: { fontSize: 11.5 },
  metric: { fontFamily: MONO, fontSize: 16, fontWeight: '800' as const },
} as const;

export const motion = {
  quick: 180,
  standard: 230,
  emphasized: 280,
  pageSpring: { bounciness: 0, speed: 16 },
} as const;
