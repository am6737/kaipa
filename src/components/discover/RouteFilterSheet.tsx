import React from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { Poi } from '../../data/pois';
import { AppChoiceChip, layout, radius, space, type } from '../../design-system';
import { useT } from '../../i18n';
import { Theme } from '../../theme/theme';
import { Icon } from '../Icon';
import { Press } from '../Press';
import { NJBottomSheet } from '../overlays/NewJourneyParts';

export type RouteSort = 'hot' | 'near' | 'short';
export type RouteLength = 'short' | 'mid' | 'long';
export type RouteDiff = NonNullable<Poi['diff']>;

export interface RouteFilters {
  sort: RouteSort;
  diff: RouteDiff[];
  len: RouteLength[];
  season: boolean;
}

export const DEFAULT_ROUTE_FILTERS: RouteFilters = { sort: 'hot', diff: [], len: [], season: false };

const SORTS: RouteSort[] = ['hot', 'near', 'short'];
const DIFFS: RouteDiff[] = ['易', '中', '中高', '高'];
const LENGTHS: RouteLength[] = ['short', 'mid', 'long'];

const km = (s: string) => parseFloat(String(s).replace(/[^\d.]/g, '')) || 0;

function lengthBucket(dist: string): RouteLength {
  const d = km(dist);
  return d < 10 ? 'short' : d <= 20 ? 'mid' : 'long';
}

/** Conditions that narrow or reorder the list; the 筛选 button shows this count. */
export function activeRouteFilterCount(f: RouteFilters): number {
  return (f.sort !== 'hot' ? 1 : 0) + f.diff.length + f.len.length + (f.season ? 1 : 0);
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
  let out = list.filter((p) =>
    (!f.diff.length || (!!p.diff && f.diff.includes(p.diff)))
    && (!f.len.length || f.len.includes(lengthBucket(p.dist)))
    && (!f.season || !p.bestMonths?.length || p.bestMonths.includes(month)));
  if (f.sort === 'hot') {
    out = out
      .map((p, i) => ({ p, i }))
      .sort((a, b) => ((b.p.reviews ?? 0) - (a.p.reviews ?? 0)) || (km(b.p.rating ?? '') - km(a.p.rating ?? '')) || a.i - b.i)
      .map(({ p }) => p);
  } else if (f.sort === 'short') {
    out = [...out].sort((a, b) => km(a.dist) - km(b.dist));
  } else if (f.sort === 'near' && opts.location) {
    const { lat, lng } = opts.location;
    const cos = Math.cos((lat * Math.PI) / 180);
    const d2 = (p: Poi) => ((p.lat - lat) ** 2) + (((p.lng - lng) * cos) ** 2);
    out = [...out].sort((a, b) => d2(a) - d2(b));
  }
  return out;
}

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
  const section = (label: string, children: React.ReactNode, hint?: string) => (
    <View style={{ marginBottom: space.lg }}>
      <Text style={[type.readoutLabel, { color: theme.text2, marginBottom: hint ? space.xxs : space.sm }]}>{label}</Text>
      {hint ? <Text style={[type.hint, { color: theme.text3, marginBottom: space.sm }]}>{hint}</Text> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>{children}</View>
    </View>
  );

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 200 }]} pointerEvents="box-none">
      <NJBottomSheet theme={theme} onClose={onClose} backgroundColor={theme.featureSurface} borderless>
        <View accessibilityViewIsModal style={{ paddingHorizontal: layout.pagePadding }}>
          <View style={{ minHeight: layout.iconButton, alignItems: 'center', justifyContent: 'center', marginBottom: space.md }}>
            <Press
              onPress={() => setDraft(DEFAULT_ROUTE_FILTERS)}
              accessibilityRole="button"
              hitSlop={8}
              style={{ position: 'absolute', left: 0, height: layout.iconButton, justifyContent: 'center' }}
            >
              <Text style={[type.chip, { color: activeRouteFilterCount(draft) ? theme.accent : theme.text3 }]}>{t('discover.filter.clear')}</Text>
            </Press>
            <Text style={[type.navTitle, { color: theme.text }]}>{t('discover.filter.title')}</Text>
            <Press
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
              hitSlop={8}
              style={{ position: 'absolute', right: 0, width: layout.iconButton, height: layout.iconButton, alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name="close" size={22} color={theme.text} strokeWidth={2.1} />
            </Press>
          </View>

          {section(t('discover.filter.sort'), SORTS.map((id) => (
            <AppChoiceChip key={id} theme={theme} label={t(`discover.filter.sort_${id}`)} selected={draft.sort === id} onPress={() => setDraft((d) => ({ ...d, sort: id }))} />
          )))}
          {section(t('discover.filter.diff'), DIFFS.map((id) => (
            <AppChoiceChip key={id} theme={theme} label={id} selected={draft.diff.includes(id)} onPress={() => setDraft((d) => ({ ...d, diff: toggle(d.diff, id) }))} />
          )))}
          {section(t('discover.filter.length'), LENGTHS.map((id) => (
            <AppChoiceChip key={id} theme={theme} label={t(`discover.filter.len_${id}`)} selected={draft.len.includes(id)} onPress={() => setDraft((d) => ({ ...d, len: toggle(d.len, id) }))} />
          )))}

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.lg }}>
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

          <Press
            onPress={() => onApply(draft)}
            accessibilityRole="button"
            style={{ height: 50, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.accent, opacity: count ? 1 : 0.5 }}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '700' }}>{t('discover.filter.apply', { count })}</Text>
          </Press>
        </View>
      </NJBottomSheet>
    </View>
  );
}
