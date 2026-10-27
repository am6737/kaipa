import type { TextStyle } from 'react-native';
import { MONO } from '../theme/fonts';

const tabular: TextStyle['fontVariant'] = ['tabular-nums'];

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
  showcase: 30,
  pill: 999,
} as const;

export const layout = {
  pagePadding: 16,
  topBarHeight: 50,
  iconButton: 44,
  fieldHeight: 44,
  listRowMinHeight: 64,
  overviewCardMinHeight: 144,
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
  summaryValue: { fontFamily: MONO, fontSize: 34, fontWeight: '800' as const, letterSpacing: -1.2, fontVariant: tabular },
  // Form & measurement roles, taken from the 出行档案 pages (身高 / 体重 / 年龄).
  question: { fontSize: 27, fontWeight: '700' as const, lineHeight: 38 },
  lead: { fontSize: 14, lineHeight: 23 },
  fieldLabel: { fontSize: 17, fontWeight: '600' as const },
  fieldValue: { fontSize: 21, fontWeight: '600' as const, fontVariant: tabular },
  hint: { fontSize: 12, lineHeight: 19 },
  chip: { fontSize: 14, fontWeight: '600' as const },
  readoutLabel: { fontSize: 14, fontWeight: '500' as const },
  // Live readouts on the recording card: the always-visible row and the grid.
  liveValue: { fontFamily: MONO, fontSize: 26, fontWeight: '700' as const, letterSpacing: -0.5, fontVariant: tabular },
  liveValueLarge: { fontFamily: MONO, fontSize: 30, fontWeight: '700' as const, letterSpacing: -0.5, fontVariant: tabular },
  liveUnit: { fontSize: 13, fontWeight: '600' as const },
  display: { fontSize: 86, fontWeight: '600' as const, letterSpacing: -3, fontVariant: tabular },
  displayUnit: { fontSize: 19, fontWeight: '600' as const },
  // Reading roles, taken from the 攻略详情 pages. Long Chinese text needs the
  // generous leading.
  reading: { fontSize: 14.5, lineHeight: 27 },
  readingLead: { fontSize: 14.5, lineHeight: 25 },
  readingSummary: { fontSize: 15, fontWeight: '600' as const, lineHeight: 25 },
  dayLabel: { fontSize: 15, fontWeight: '800' as const, lineHeight: 21 },
  step: { fontSize: 13, lineHeight: 23 },
  meta: { fontSize: 11.5, lineHeight: 19 },
  tableName: { fontSize: 12.5, lineHeight: 19 },
  tableNumber: { fontSize: 11, lineHeight: 19, fontVariant: tabular },
  indexMono: { fontFamily: MONO, fontSize: 10 },
  rowTitle: { fontSize: 13, lineHeight: 21, fontWeight: '600' as const },
  labelStrong: { fontSize: 13, fontWeight: '700' as const },
  small: { fontSize: 13 },
  note: { fontSize: 12 },
  byline: { fontSize: 13, lineHeight: 21 },
  textInput: { fontSize: 14, lineHeight: 22 },
  micro: { fontSize: 11 },
  microNote: { fontSize: 11, lineHeight: 16 },
  tiny: { fontSize: 10 },
  guideTitle: { fontSize: 15, lineHeight: 24, fontWeight: '700' as const },
  guideTitleCompact: { fontSize: 14, lineHeight: 23, fontWeight: '600' as const },
  planHeading: { fontSize: 22, lineHeight: 30, fontWeight: '800' as const, letterSpacing: -0.5 },
  gearCategory: { fontSize: 13, lineHeight: 19, fontWeight: '800' as const },
  gearSummary: { fontSize: 11, lineHeight: 17 },
  planRowTitle: { fontSize: 14, lineHeight: 22, fontWeight: '600' as const },
  // Conversation roles, taken from the 对话 page. Chat text is never tracked.
  welcomeTitle: { fontSize: 25, lineHeight: 31, fontWeight: '800' as const, letterSpacing: 0 },
  welcomeBody: { fontSize: 19, lineHeight: 27, fontWeight: '700' as const, letterSpacing: 0 },
  message: { fontSize: 14.5, lineHeight: 22, letterSpacing: 0 },
  suggestion: { fontSize: 14.5, fontWeight: '500' as const, letterSpacing: 0 },
  quickReply: { fontSize: 15, lineHeight: 20, fontWeight: '600' as const, letterSpacing: 0 },
  resultTitle: { fontSize: 15, lineHeight: 20, fontWeight: '700' as const, letterSpacing: 0 },
  planTitle: { fontSize: 20, lineHeight: 26, fontWeight: '800' as const, letterSpacing: 0 },
  planDay: { fontSize: 15.5, lineHeight: 21, fontWeight: '800' as const, letterSpacing: 0 },
  planItem: { fontSize: 13.5, lineHeight: 19, letterSpacing: 0 },
  planTime: { fontSize: 12, lineHeight: 18, fontWeight: '600' as const, letterSpacing: 0 },
  sourceTitle: { fontSize: 14, lineHeight: 19, fontWeight: '700' as const, letterSpacing: 0 },
  sourceHost: { fontSize: 11.5, lineHeight: 15, letterSpacing: 0 },
  composerInput: { fontSize: 15, lineHeight: 20 },
  disclaimer: { fontSize: 11, lineHeight: 14, letterSpacing: 0 },
  sheetTitle: { fontSize: 26, lineHeight: 32, fontWeight: '800' as const, letterSpacing: 0 },
  threadTitle: { fontSize: 16, lineHeight: 21, fontWeight: '700' as const, letterSpacing: 0 },
  chatLabel: { fontSize: 12, lineHeight: 16, fontWeight: '600' as const, letterSpacing: 0 },
  chatDetail: { fontSize: 13, lineHeight: 18, letterSpacing: 0 },
  chatDetailStrong: { fontSize: 13, lineHeight: 18, fontWeight: '700' as const, letterSpacing: 0 },
  chatAction: { fontSize: 14, lineHeight: 19, fontWeight: '700' as const, letterSpacing: 0 },
  chatCopy: { fontSize: 13, lineHeight: 17, letterSpacing: 0 },
  journeySuggestion: { fontSize: 15, lineHeight: 21, fontWeight: '500' as const, letterSpacing: 0 },
  researchTitle: { fontSize: 15, lineHeight: 20, fontWeight: '800' as const, letterSpacing: 0 },
  researchLineTitle: { fontSize: 13.5, lineHeight: 19, fontWeight: '700' as const, letterSpacing: 0 },
  researchSubtitle: { fontSize: 12.5, lineHeight: 18, fontWeight: '500' as const, letterSpacing: 0 },
  researchLine: { fontSize: 12.5, lineHeight: 18, letterSpacing: 0 },
  researchMeta: { fontSize: 11.5, lineHeight: 16, letterSpacing: 0 },
  fileName: { fontSize: 9.5, lineHeight: 12, letterSpacing: 0 },
  voiceHint: { fontSize: 13, lineHeight: 18, fontWeight: '600' as const, letterSpacing: 0 },
  threadAction: { fontSize: 15, fontWeight: '700' as const, letterSpacing: 0 },
  threadCardTitle: { fontSize: 16.5, lineHeight: 22, fontWeight: '700' as const, letterSpacing: 0 },
  threadMeta: { fontSize: 12, lineHeight: 16, letterSpacing: 0 },
} as const;

export const motion = {
  quick: 180,
  standard: 230,
  emphasized: 280,
  pageSpring: { bounciness: 0, speed: 16 },
} as const;
