import React from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Poi } from '../../data/pois';
import { AppChoiceChip, AppStepSlider, layout, radius, space, type } from '../../design-system';
import { useT } from '../../i18n';
import { Theme } from '../../theme/theme';
import { Press } from '../Press';
import { NJBottomSheet } from '../overlays/NewJourneyParts';

export type RouteSort = 'hot' | 'near' | 'short';
export type RouteDiff = NonNullable<Poi['diff']>;
/** Day buckets; 4 means four days or more. */
export type RouteDays = 1 | 2 | 3 | 4;

export interface RouteFilters {
  sort: RouteSort;
  diff: RouteDiff[];
  /** Longest route to show, in km; null shows every length. */
  maxKm: number | null;
  /** Most ascent to show, in m; null shows every route. */
  maxAscent: number | null;
  days: RouteDays[];
  season: boolean;
}

export const DEFAULT_ROUTE_FILTERS: RouteFilters = { sort: 'hot', diff: [], maxKm: null, maxAscent: null, days: [], season: false };

const SORTS: RouteSort[] = ['hot', 'near', 'short'];
const DIFFS: RouteDiff[] = ['易', '中', '中高', '高'];
const DAYS: RouteDays[] = [1, 2, 3, 4];
// Slider stops; the last stop (null) means 不限.
const MAX_KM_STEPS: (number | null)[] = [5, 10, 15, 20, 30, 50, null];
const MAX_ASCENT_STEPS: (number | null)[] = [300, 600, 1000, 1500, 2000, 3000, null];

const num = (s: string) => parseFloat(String(s).replace(/[^\d.]/g, '')) || 0;

/** Conditions that narrow or reorder the list; the 筛选 button shows this count. */
export function activeRouteFilterCount(f: RouteFilters): number {
  return (f.sort !== 'hot' ? 1 : 0) + f.diff.length + (f.maxKm != null ? 1 : 0)
    + (f.maxAscent != null ? 1 : 0) + f.days.length + (f.season ? 1 : 0);
}

/**
 * Filters and sorts the explore list. `near` needs a location and falls back to
 * the incoming order without one; `hot` ranks by reviews then rating, keeping
 * the incoming order for routes that have neither.
 */
export function applyRouteFilters(
  list: Poi[],
  f: RouteFilters,
  opts: { location?: { lat: number; lng: number } | null; month?: number } = {},
): Poi[] {
  const month = opts.month ?? new Date().getMonth() + 1;
  // A route matches a day chip when that many days is one of its ways to walk
  // it: [1, 2, 3] shows under 1, 2 and 3; the 4 chip takes any count from 4 up.
  // Routes without day data only show while no day chip is picked.
  const dayMatch = (p: Poi) =>
    !!p.routeDays?.some((n) => f.days.includes(Math.min(n, 4) as RouteDays));
  let out = list.filter((p) =>
    (!f.diff.length || (!!p.diff && f.diff.includes(p.diff)))
    && (f.maxKm == null || num(p.dist) <= f.maxKm)
    && (f.maxAscent == null || num(p.asc) <= f.maxAscent)
    && (!f.days.length || dayMatch(p))
    && (!f.season || !p.bestMonths?.length || p.bestMonths.includes(month)));
  if (f.sort === 'hot') {
    out = out
      .map((p, i) => ({ p, i }))
      .sort((a, b) => ((b.p.reviews ?? 0) - (a.p.reviews ?? 0)) || (num(b.p.rating ?? '') - num(a.p.rating ?? '')) || a.i - b.i)
      .map(({ p }) => p);
  } else if (f.sort === 'short') {
    out = [...out].sort((a, b) => num(a.dist) - num(b.dist));
  } else if (f.sort === 'near' && opts.location) {
    const { lat, lng } = opts.location;
    const cos = Math.cos((lat * Math.PI) / 180);
    const d2 = (p: Poi) => ((p.lat - lat) ** 2) + (((p.lng - lng) * cos) ** 2);
    out = [...out].sort((a, b) => d2(a) - d2(b));
  }
  return out;
}

// Full-height filter sheet: chips for categories, sliders for amounts, and one
// apply button that shows how many routes the draft leaves.
export function RouteFilterSheet({
  theme,
  value,
  countFor,
  onApply,
  onClose,
}: {
  theme: Theme;
  value: RouteFilters;
  /** How many routes a draft would show, for the apply button. */
  countFor: (draft: RouteFilters) => number;
  onApply: (next: RouteFilters) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [draft, setDraft] = React.useState<RouteFilters>(value);
  const count = countFor(draft);
  const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);
  const section = (label: string, children: React.ReactNode) => (
    <View style={styles.section}>
      <Text style={[type.cardTitle, { color: theme.text, marginBottom: space.sm }]}>{label}</Text>
      <View style={styles.chips}>{children}</View>
    </View>
  );

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 200 }]} pointerEvents="box-none">
      <NJBottomSheet theme={theme} onClose={onClose} full bodyScrolls backgroundColor={theme.featureSurface} borderless>
        <View accessibilityViewIsModal style={styles.header}>
          <Text style={[type.navTitle, { color: theme.text }]}>{t('discover.filter.title')}</Text>
          <Press
            onPress={() => setDraft(DEFAULT_ROUTE_FILTERS)}
            disabled={!activeRouteFilterCount(draft)}
            accessibilityRole="button"
            hitSlop={8}
            style={[styles.clear, { backgroundColor: theme.fieldSurface, opacity: activeRouteFilterCount(draft) ? 1 : 0.5 }]}
          >
            <Text style={[type.chip, { color: theme.text }]}>{t('discover.filter.clear')}</Text>
          </Press>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
          {section(t('discover.filter.sort'), SORTS.map((id) => (
            <AppChoiceChip key={id} theme={theme} label={t(`discover.filter.sort_${id}`)} selected={draft.sort === id} onPress={() => setDraft((d) => ({ ...d, sort: id }))} />
          )))}
          {section(t('discover.filter.diff'), DIFFS.map((id) => (
            <AppChoiceChip key={id} theme={theme} label={t(`discover.diffBadge.${id}`)} selected={draft.diff.includes(id)} onPress={() => setDraft((d) => ({ ...d, diff: toggle(d.diff, id) }))} />
          )))}
          <View style={styles.section}>
            <AppStepSlider
              theme={theme}
              caption={t('discover.filter.maxKm')}
              steps={MAX_KM_STEPS.map((v) => (v == null ? t('discover.filter.any') : t('discover.filter.upToKm', { count: v })))}
              index={MAX_KM_STEPS.indexOf(draft.maxKm)}
              onChange={(i) => setDraft((d) => ({ ...d, maxKm: MAX_KM_STEPS[i] }))}
            />
          </View>
          <View style={styles.section}>
            <AppStepSlider
              theme={theme}
              caption={t('discover.filter.maxAscent')}
              steps={MAX_ASCENT_STEPS.map((v) => (v == null ? t('discover.filter.any') : t('discover.filter.upToM', { count: v })))}
              index={MAX_ASCENT_STEPS.indexOf(draft.maxAscent)}
              onChange={(i) => setDraft((d) => ({ ...d, maxAscent: MAX_ASCENT_STEPS[i] }))}
            />
          </View>
          {section(t('discover.filter.days'), DAYS.map((id) => (
            <AppChoiceChip key={id} theme={theme} label={t(`discover.filter.days_${id}`)} selected={draft.days.includes(id)} onPress={() => setDraft((d) => ({ ...d, days: toggle(d.days, id) }))} />
          )))}
          <View style={[styles.section, styles.switchRow]}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[type.cardTitle, { color: theme.text }]}>{t('discover.filter.season')}</Text>
              <Text style={[type.hint, { color: theme.text3, marginTop: space.xxs }]}>{t('discover.filter.seasonHint')}</Text>
            </View>
            <Switch
              accessibilityLabel={t('discover.filter.season')}
              value={draft.season}
              onValueChange={(season) => setDraft((d) => ({ ...d, season }))}
              trackColor={{ false: theme.progressTrack, true: theme.accent }}
              thumbColor="#FFFFFF"
              ios_backgroundColor={theme.progressTrack}
            />
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Press
            onPress={() => onApply(draft)}
            disabled={!count}
            accessibilityRole="button"
            style={[styles.apply, { backgroundColor: theme.accent, opacity: count ? 1 : 0.5 }]}
          >
            <Text style={styles.applyText}>{count ? t('discover.filter.apply', { count }) : t('discover.filter.none')}</Text>
          </Press>
        </View>
      </NJBottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { minHeight: layout.iconButton, paddingHorizontal: layout.pagePadding, marginBottom: space.xs, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  clear: { minHeight: 36, paddingHorizontal: space.md, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: layout.pagePadding, paddingBottom: space.md },
  section: { marginBottom: space.xl },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  footer: { paddingHorizontal: layout.pagePadding, paddingTop: space.sm },
  apply: { height: 50, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  applyText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
