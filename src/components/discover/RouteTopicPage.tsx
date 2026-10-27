// RouteTopicPage.tsx — curated route lists behind the journey starter cards
// (当季推荐 / 新手入门 / 硬核挑战). A poster hero sets the theme, then the
// matching catalog routes. Lists are derived from route fields (best months,
// difficulty), so they stay honest without any operations data.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, ChevronRight, Sparkles } from 'lucide-react-native';
import { AppFilterButton, DetailPage, layout, radius, space, type } from '../../design-system';
import { useI18n } from '../../i18n';
import { useData } from '../../data/DataContext';
import type { Poi } from '../../data/pois';
import type { RouteTopic } from '../../nav/NavContext';
import { Theme } from '../../theme/theme';
import { Press } from '../Press';
import { PhotoTile } from '../PhotoTile';
import { PosterBackButton } from '../PosterBackButton';

const climb = (route: Poi) => parseFloat(route.asc.replace(/[^\d.]/g, '')) || 0;
const distance = (route: Poi) => parseFloat(route.dist.replace(/[^\d.]/g, '')) || 0;
const province = (route: Poi) => route.region.split('·')[0].trim();
const UNSORTED_REGION = '未分类';

// One split at 20 km: shorter routes are usually done in a day, longer ones
// mean a night out or more.
type DistanceBand = 'all' | 'short' | 'long';
type TopicSort = 'recommended' | 'distance' | 'climb';
const DISTANCE_BANDS: DistanceBand[] = ['all', 'short', 'long'];
const TOPIC_SORTS: TopicSort[] = ['recommended', 'distance', 'climb'];
const inBand = (route: Poi, band: DistanceBand) => {
  const km = distance(route);
  return band === 'all' || (band === 'short' ? km < 20 : km >= 20);
};
const hasCover = (route: Poi) => Number(Boolean(route.photoUris?.[0]));
// Rows built with the page; the rest wait for the slide-in to finish, so a
// long topic doesn't hold the tap before the page starts moving.
const FIRST_ROWS = 6;

/** Routes for a topic, best lead first. Shared with the starter cards. */
export function topicRoutes(routes: Poi[], topic: RouteTopic, month: number): Poi[] {
  const ordered = routes.map((route, index) => ({ route, index }));
  const pick = (keep: (route: Poi) => boolean, rank: (a: Poi, b: Poi) => number) => ordered
    .filter(({ route }) => keep(route))
    .sort((a, b) => hasCover(b.route) - hasCover(a.route) || rank(a.route, b.route) || a.index - b.index)
    .map(({ route }) => route);
  if (topic === 'season') return pick((route) => Boolean(route.bestMonths?.includes(month)), () => 0);
  if (topic === 'easy') return pick((route) => route.diff === '易' || route.diff === '中', (a, b) => Number(a.diff === '中') - Number(b.diff === '中') || climb(a) - climb(b));
  return pick((route) => route.diff === '高', (a, b) => climb(b) - climb(a));
}

export function RouteTopicPage({
  theme,
  topic,
  onClose,
  onOpenRoute,
  onCreateJourney,
  onAsk,
}: {
  theme: Theme;
  topic: RouteTopic;
  onClose: () => void;
  onOpenRoute: (route: Poi) => void;
  onCreateJourney: (route: Poi) => void;
  onAsk: (prompt: string) => void;
}) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const data = useData();
  const month = new Date().getMonth() + 1;
  const routes = useMemo(() => topicRoutes(data.routes, topic, month), [data.routes, topic, month]);
  const lead = routes[0];
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const [band, setBand] = useState<DistanceBand>('all');
  const [region, setRegion] = useState<string | null>(null);
  const [sort, setSort] = useState<TopicSort>('recommended');
  const [filterAnchor, setFilterAnchor] = useState<{ y: number; height: number; right: number } | null>(null);
  const [entered, setEntered] = useState(false);
  const filterRef = useRef<View>(null);
  const regions = useMemo(() => {
    const counts = new Map<string, number>();
    routes.forEach((route) => {
      const name = province(route);
      if (name && name !== UNSORTED_REGION) counts.set(name, (counts.get(name) ?? 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  }, [routes]);
  const visibleRoutes = useMemo(() => {
    const kept = routes.filter((route) => inBand(route, band) && (!region || province(route) === region));
    if (sort === 'distance') return kept.slice().sort((a, b) => distance(a) - distance(b));
    if (sort === 'climb') return kept.slice().sort((a, b) => climb(a) - climb(b));
    return kept;
  }, [routes, band, region, sort]);
  const activeFilters = Number(band !== 'all') + Number(Boolean(region)) + Number(sort !== 'recommended');
  const clearFilters = () => { setBand('all'); setRegion(null); setSort('recommended'); };
  const openFilters = () => {
    // DetailPage fills the window, so window coordinates place the popover.
    filterRef.current?.measureInWindow((x, y, width, height) => setFilterAnchor({ y, height, right: Math.max(0, windowWidth - (x + width)) }));
  };

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => subscription.remove();
  }, [onClose]);

  return (
    // The poster scrolls with the list and runs under the top bar, so the page
    // owns its scroll view; an empty hero tells DetailPage not to pad for the bar.
    <DetailPage
      theme={theme}
      onBack={onClose}
      scrollable={false}
      hero={<View />}
      left={<PosterBackButton onPress={onClose} />}
      onEnterComplete={() => setEntered(true)}
      overlay={filterAnchor ? (
        <View style={styles.filterBackdrop}>
          <Press accessibilityRole="button" accessibilityLabel={t('common.cancel')} onPress={() => setFilterAnchor(null)} style={StyleSheet.absoluteFill}>{null}</Press>
          <View
            style={[
              styles.filterSheet,
              { right: filterAnchor.right, width: Math.min(330, windowWidth - layout.pagePadding * 2), backgroundColor: theme.featureSurface },
              // Open downward from the button, or upward when it sits low on screen.
              filterAnchor.y > windowHeight / 2
                ? { bottom: windowHeight - (filterAnchor.y + filterAnchor.height) - 12 }
                : { top: Math.max(insets.top, filterAnchor.y - 12) },
            ]}
          >
            <Text style={[styles.filterLabel, { color: theme.text3 }]}>{t('journeyHome.topic.filter.distance')}</Text>
            <View style={styles.filterSegmented}>
              {DISTANCE_BANDS.map((value) => (
                <Press key={value} accessibilityRole="tab" accessibilityState={{ selected: band === value }} onPress={() => setBand(value)} style={[styles.filterSegment, band === value && styles.filterSegmentSelected]}>
                  <Text style={[styles.filterSegmentText, { color: band === value ? theme.text : theme.text2 }]}>{t(`journeyHome.topic.filter.band.${value}`)}</Text>
                </Press>
              ))}
            </View>
            {regions.length > 1 ? (
              <>
                <Text style={[styles.filterLabel, { color: theme.text3 }]}>{t('journeyHome.topic.filter.region')}</Text>
                <View style={styles.regionChips}>
                  {[null, ...regions].map((value) => {
                    const selected = region === value;
                    return (
                      <Press key={value ?? 'all'} accessibilityRole="radio" accessibilityState={{ selected }} onPress={() => setRegion(value)} style={[styles.regionChip, { backgroundColor: selected ? theme.text : '#F0F0F0' }]}>
                        <Text style={[styles.regionChipText, { color: selected ? theme.featureSurface : theme.text2 }]}>{value ?? t('common.all')}</Text>
                      </Press>
                    );
                  })}
                </View>
              </>
            ) : null}
            <View style={[styles.filterDivider, { backgroundColor: theme.hairline }]} />
            {TOPIC_SORTS.map((value) => (
              <Press key={value} accessibilityRole="radio" accessibilityState={{ selected: sort === value }} onPress={() => { setSort(value); setFilterAnchor(null); }} style={styles.filterOption}>
                <Text style={[styles.filterOptionText, { color: theme.text }]}>{t(`journeyHome.topic.filter.sort.${value}`)}</Text>
                <View style={[styles.radio, { borderColor: sort === value ? theme.text : '#D9D9D9', backgroundColor: sort === value ? theme.text : 'transparent' }]}>
                  {sort === value ? <Check size={11} color={theme.featureSurface} strokeWidth={3} /> : null}
                </View>
              </Press>
            ))}
          </View>
        </View>
      ) : null}
    >
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}>
        <PhotoTile tone={lead?.tone} seed={lead?.id ?? topic} resWidth={900} style={[styles.poster, { paddingTop: insets.top + layout.topBarHeight }]}>
          {lead?.photoUris?.[0] ? <Image source={{ uri: lead.photoUris[0] }} contentFit="cover" style={StyleSheet.absoluteFill} /> : null}
          <LinearGradient colors={['rgba(0, 0, 0, 0.18)', 'rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0.62)']} locations={[0, 0.3, 1]} style={StyleSheet.absoluteFill} />
          <View style={styles.posterCopy}>
            <View style={styles.posterTag}>
              <Text style={styles.posterTagText}>{t(`journeyHome.topic.${topic}.tag`, { month })}</Text>
            </View>
            <Text style={styles.posterTitle}>{t(`journeyHome.topic.${topic}.title`, { month })}</Text>
            <Text style={styles.posterBody}>{t(`journeyHome.topic.${topic}.body`)}</Text>
            <Text style={styles.posterCount}>{t('journeyHome.topic.count', { count: routes.length })}</Text>
          </View>
        </PhotoTile>

        <View style={[styles.sheet, { backgroundColor: theme.featureSurface }]}>
          <View style={styles.listHeader}>
            <Text style={[type.sectionTitle, { color: theme.text }]}>{t('journeyHome.topic.listTitle')}</Text>
            {routes.length ? (
              <View ref={filterRef} collapsable={false}>
                <AppFilterButton
                  theme={theme}
                  label={activeFilters ? t('common.filterCount', { count: activeFilters }) : t('common.all')}
                  active={Boolean(activeFilters)}
                  expanded={Boolean(filterAnchor)}
                  onPress={openFilters}
                />
              </View>
            ) : null}
          </View>
          {visibleRoutes.length ? (entered ? visibleRoutes : visibleRoutes.slice(0, FIRST_ROWS)).map((route) => (
            <Press key={route.id} accessibilityRole="button" accessibilityLabel={route.name} onPress={() => onOpenRoute(route)} scaleTo={0.985} style={styles.row}>
              <PhotoTile tone={route.tone} seed={route.id} resWidth={240} radius={radius.card} style={styles.thumb}>
                {route.photoUris?.[0] ? <Image source={{ uri: route.photoUris[0] }} contentFit="cover" style={StyleSheet.absoluteFill} /> : null}
              </PhotoTile>
              <View style={styles.rowCopy}>
                <Text numberOfLines={1} style={[type.cardTitle, { color: theme.text, fontSize: 16 }]}>{route.name}</Text>
                <Text numberOfLines={1} style={[styles.rowMeta, { color: theme.text2 }]}>{route.region.replace(/\s*·\s*/g, ' ')}</Text>
                <Text numberOfLines={1} style={[styles.rowMeta, { color: theme.text2 }]}>
                  {[route.dist, t('journeyHome.topic.climb', { value: route.asc.replace('+', '') }), route.diff ? t('journeyHome.topic.diff', { value: route.diff }) : ''].filter(Boolean).join('  ')}
                </Text>
                {topic === 'season' && route.seasonNote ? (
                  <Text numberOfLines={1} style={[styles.rowNote, { color: theme.text3 }]}>{route.seasonNote}</Text>
                ) : null}
              </View>
              <Press accessibilityRole="button" accessibilityLabel={t('journeyHome.topic.create')} onPress={() => onCreateJourney(route)} style={[styles.createButton, { backgroundColor: theme.controlSurface }]}>
                <Text style={[styles.createText, { color: theme.text }]}>{t('journeyHome.topic.create')}</Text>
              </Press>
            </Press>
          )) : routes.length ? (
            <View style={styles.empty}>
              <Text style={[type.body, { color: theme.text2, textAlign: 'center' }]}>{t('journeyHome.topic.filter.empty')}</Text>
              <Press accessibilityRole="button" onPress={clearFilters} style={styles.clearFilters}>
                <Text style={[styles.filterButtonText, { color: theme.accent }]}>{t('journeyHome.topic.filter.clear')}</Text>
              </Press>
            </View>
          ) : (
            <Text style={[type.body, styles.empty, { color: theme.text2, textAlign: 'center' }]}>{t('journeyHome.topic.empty')}</Text>
          )}

          <Press accessibilityRole="button" onPress={() => onAsk(t(`journeyHome.topic.${topic}.askPrompt`))} scaleTo={0.985} style={[styles.ask, { backgroundColor: theme.controlSurface }]}>
            <Sparkles color={theme.text} size={20} strokeWidth={2} />
            <View style={styles.askCopy}>
              <Text style={[type.cardTitle, { color: theme.text }]}>{t('journeyHome.topic.askTitle')}</Text>
              <Text style={[styles.rowMeta, { color: theme.text2 }]}>{t('journeyHome.topic.askBody')}</Text>
            </View>
            <ChevronRight color={theme.text3} size={20} strokeWidth={2} />
          </Press>
        </View>
      </ScrollView>
    </DetailPage>
  );
}

const styles = StyleSheet.create({
  poster: { minHeight: 440, justifyContent: 'flex-end' },
  posterCopy: { paddingHorizontal: layout.pagePadding + space.xxs, paddingBottom: space.xxxl + space.xs },
  posterTag: { alignSelf: 'flex-start', paddingHorizontal: space.sm, paddingVertical: space.xxs, borderRadius: radius.pill, backgroundColor: 'rgba(255, 255, 255, 0.88)' },
  posterTagText: { fontSize: 12.5, fontWeight: '700', color: '#2E2E2E' },
  posterTitle: { marginTop: space.sm, fontSize: 29, lineHeight: 38, fontWeight: '800', letterSpacing: 0, color: '#FFFFFF' },
  posterBody: { marginTop: space.xs, fontSize: 15, lineHeight: 23, color: 'rgba(255, 255, 255, 0.88)' },
  posterCount: { marginTop: space.sm, fontSize: 13, fontWeight: '700', color: 'rgba(255, 255, 255, 0.78)' },
  // Rounded sheet that overlaps the poster's bottom edge.
  sheet: { marginTop: -space.xl, borderTopLeftRadius: radius.showcase, borderTopRightRadius: radius.showcase, paddingHorizontal: layout.pagePadding, paddingTop: space.xl, gap: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  thumb: { width: 84, height: 84 },
  rowCopy: { flex: 1, minWidth: 0, gap: 3 },
  rowMeta: { fontSize: 13, lineHeight: 18 },
  rowNote: { fontSize: 12, lineHeight: 17 },
  createButton: { minHeight: 34, paddingHorizontal: space.sm, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  createText: { fontSize: 13, fontWeight: '700' },
  empty: { paddingVertical: space.xxl, alignItems: 'center' },
  clearFilters: { marginTop: space.xs, paddingVertical: space.xs, paddingHorizontal: space.sm },
  listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  // The popover mirrors the 我的旅程 list filter; the clear link keeps the button's old type.
  filterButtonText: { fontSize: 14.5, fontWeight: '600', letterSpacing: 0 },
  filterBackdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 20, backgroundColor: 'rgba(0, 0, 0, 0.12)' },
  filterSheet: { position: 'absolute', borderRadius: 23, paddingHorizontal: 11, paddingTop: 12, paddingBottom: 10, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 12 },
  filterLabel: { fontSize: 12, fontWeight: '600', paddingHorizontal: 8, marginBottom: 6 },
  filterSegmented: { flexDirection: 'row', borderRadius: 17, padding: 2, marginBottom: 12, minHeight: 34, backgroundColor: '#F0F0F0' },
  filterSegment: { flex: 1, minHeight: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  filterSegmentSelected: { backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  filterSegmentText: { fontSize: 13, fontWeight: '600' },
  regionChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 2, marginBottom: 12 },
  regionChip: { minHeight: 30, paddingHorizontal: space.sm, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  regionChipText: { fontSize: 13, fontWeight: '600' },
  filterDivider: { height: StyleSheet.hairlineWidth, marginHorizontal: 8, marginBottom: 2 },
  filterOption: { minHeight: 43, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  filterOptionText: { fontSize: 14, fontWeight: '600' },
  radio: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  ask: { marginTop: space.xs, minHeight: layout.listRowMinHeight, borderRadius: radius.feature, paddingHorizontal: space.md, paddingVertical: space.sm, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  askCopy: { flex: 1, minWidth: 0, gap: 2 },
});
