import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, Keyboard, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type TextStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme } from '../theme/theme';
import { useNav } from '../nav/NavContext';
import { useI18n } from '../i18n';
import { useData } from '../data/DataContext';
import { Icon } from '../components/Icon';
import { Press } from '../components/Press';
import type { Poi } from '../data/pois';
import { radius, space } from '../design-system';
import { TrackThumbnail } from '../components/tracks/TrackThumbnail';
import { searchPublishedTracks, type PublishedTrackCard } from '../hooks/useSocial';
import { formatTrackAscent, formatTrackDistance } from '../lib/trackParser';
import { regionLabel } from '../lib/regionLabel';

const CHINA_REGIONS = [
  '全国', '北京', '上海', '天津', '重庆', '河北', '山西', '辽宁', '吉林', '黑龙江',
  '江苏', '浙江', '安徽', '福建', '江西', '山东', '河南', '湖北', '湖南', '广东',
  '海南', '四川', '贵州', '云南', '陕西', '甘肃', '青海', '台湾', '内蒙古', '广西',
  '西藏', '宁夏', '新疆', '香港', '澳门',
];
const INTERNATIONAL_REGIONS = ['尼泊尔'];
const SEARCH_FIELD_HEIGHT = 52;
type SearchTab = 'all' | 'route' | 'track' | 'journey' | 'guide';

const TAB_LABELS: Array<{ id: SearchTab; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'route', label: '路线' },
  { id: 'track', label: '轨迹' },
  { id: 'journey', label: '旅程' },
  { id: 'guide', label: '攻略' },
];

function includesQuery(value: string | undefined, query: string) {
  return Boolean(value && value.toLocaleLowerCase().includes(query));
}

function poiMatches(poi: Poi, query: string) {
  return [poi.name, poi.region, poi.coord, poi.desc].some((value) => includesQuery(value, query));
}

/** Splits text into plain/matched segments so the query keyword can be tinted. */
function splitHighlight(text: string, query: string): Array<{ text: string; hit: boolean }> {
  if (!query) return [{ text, hit: false }];
  const lower = text.toLocaleLowerCase();
  const parts: Array<{ text: string; hit: boolean }> = [];
  let cursor = 0;
  while (cursor < text.length) {
    const at = lower.indexOf(query, cursor);
    if (at === -1) {
      parts.push({ text: text.slice(cursor), hit: false });
      break;
    }
    if (at > cursor) parts.push({ text: text.slice(cursor, at), hit: false });
    parts.push({ text: text.slice(at, at + query.length), hit: true });
    cursor = at + query.length;
  }
  return parts;
}

function Highlight({ text, query, theme, style, numberOfLines = 1 }: { text: string; query: string; theme: Theme; style?: StyleProp<TextStyle>; numberOfLines?: number }) {
  return (
    <Text numberOfLines={numberOfLines} style={style}>
      {splitHighlight(text, query).map((part, index) =>
        part.hit ? <Text key={index} style={{ color: theme.accent }}>{part.text}</Text> : <React.Fragment key={index}>{part.text}</React.Fragment>,
      )}
    </Text>
  );
}

export function SearchScreen({ theme, onOpaqueChange }: { theme: Theme; onOpaqueChange?: (opaque: boolean) => void }) {
  const nav = useNav();
  const { t } = useI18n();
  const { routes, journeys } = useData();
  const insets = useSafeAreaInsets();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<'china' | 'international'>('china');
  const [activeTab, setActiveTab] = useState<SearchTab>('all');

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 180, useNativeDriver: true }).start(({ finished }) => {
      if (finished) onOpaqueChange?.(true);
    });
    return () => {
      onOpaqueChange?.(false);
    };
  }, [fadeAnim, onOpaqueChange]);

  const close = () => {
    onOpaqueChange?.(false);
    Keyboard.dismiss();
    Animated.timing(fadeAnim, { toValue: 0, duration: 160, useNativeDriver: true }).start(() => nav.closeSearch());
  };

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const hasQuery = normalizedQuery.length > 0;
  const source = scope === 'china' ? CHINA_REGIONS : INTERNATIONAL_REGIONS;
  const [chipsWidth, setChipsWidth] = useState(0);
  const places = useMemo(
    () => source.filter((region) => !normalizedQuery || region.toLocaleLowerCase().includes(normalizedQuery)),
    [normalizedQuery, source],
  );
  const matchingRoutes = useMemo(
    () => routes.filter((route) => !normalizedQuery || poiMatches(route, normalizedQuery)),
    [normalizedQuery, routes],
  );
  const matchingJourneys = useMemo(
    () => journeys.filter((journey) => !normalizedQuery || poiMatches(journey, normalizedQuery)),
    [journeys, normalizedQuery],
  );
  // Guides are currently loaded per route. Until a global guide query is added,
  // expose matching routes as guide entry points and open their guide library.
  const matchingGuides = useMemo(
    () => matchingRoutes.filter((route) => Boolean(route.desc || route.name)),
    [matchingRoutes],
  );

  // Published tracks live on the server, not in local data, so they are asked
  // for once typing pauses. A reply for an older query is dropped.
  const [publishedTracks, setPublishedTracks] = useState<PublishedTrackCard[]>([]);
  const trackQuery = query.trim();
  useEffect(() => {
    if (!trackQuery) {
      setPublishedTracks([]);
      return undefined;
    }
    let alive = true;
    const timer = setTimeout(() => {
      searchPublishedTracks(trackQuery, 30)
        .then((result) => { if (alive) setPublishedTracks(result); })
        .catch(() => { if (alive) setPublishedTracks([]); });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [trackQuery]);

  const choosePlace = (region: string) => {
    nav.setDiscoverRegion(region);
    close();
  };

  const openPoi = (poi: Poi) => {
    nav.openPoint(poi);
    close();
  };

  const openTrack = (track: PublishedTrackCard) => {
    nav.openPublishedTrack(track.id);
    close();
  };

  const openGuide = (route: Poi) => {
    nav.openRouteGuide({ route, view: 'guides' });
    close();
  };

  // The request page sits on top of the search result, so 返回 lands back here
  // with the query still filled in — which is now also the prefilled ask.
  const requestRoute = () => nav.openRouteRequest(query.trim() || undefined);

  const resultCount = (tab: SearchTab) => {
    if (tab === 'route') return matchingRoutes.length;
    if (tab === 'track') return publishedTracks.length;
    if (tab === 'journey') return matchingJourneys.length;
    if (tab === 'guide') return matchingGuides.length;
    return matchingRoutes.length + publishedTracks.length + matchingJourneys.length + matchingGuides.length;
  };

  const renderThumb = (poi: Poi) => (poi.photoUris?.[0] ? <Image source={{ uri: poi.photoUris[0] }} style={styles.thumb} /> : null);

  const renderPoi = (poi: Poi, kind: 'route' | 'journey') => (
    <Press key={`${kind}-${poi.id}`} onPress={() => openPoi(poi)} style={styles.resultRow}>
      {renderThumb(poi)}
      <View style={styles.resultCopy}>
        <Highlight text={poi.name} query={normalizedQuery} theme={theme} style={[styles.resultTitle, { color: theme.text }]} />
        <View style={styles.resultSubRow}>
          <Text style={[styles.resultSubKind, { color: theme.text3 }]}>{kind === 'route' ? '路线' : '旅程'}</Text>
          <Highlight text={kind === 'route' ? (regionLabel(poi.region) || poi.desc || '') : (poi.date || regionLabel(poi.region))} query={normalizedQuery} theme={theme} style={[styles.resultSub, { color: theme.text3 }]} />
        </View>
      </View>
    </Press>
  );

  const renderTrack = (track: PublishedTrackCard) => {
    const stats = [
      track.distM != null ? formatTrackDistance(track.distM) : null,
      track.ascM != null ? formatTrackAscent(track.ascM) : null,
    ].filter(Boolean).join('  ');
    return (
      <Press key={`track-${track.id}`} onPress={() => openTrack(track)} style={styles.resultRow}>
        <View style={[styles.thumb, { backgroundColor: theme.fieldSurface }]}>
          <TrackThumbnail theme={theme} coords={track.coords} size={60} />
        </View>
        <View style={styles.resultCopy}>
          <Highlight text={track.name || '未命名轨迹'} query={normalizedQuery} theme={theme} style={[styles.resultTitle, { color: theme.text }]} />
          <View style={styles.resultSubRow}>
            <Text style={[styles.resultSubKind, { color: theme.text3 }]}>轨迹</Text>
            <Highlight text={[track.owner.nick, stats].filter(Boolean).join('  ')} query={normalizedQuery} theme={theme} style={[styles.resultSub, { color: theme.text3 }]} />
          </View>
        </View>
      </Press>
    );
  };

  const renderGuide = (route: Poi) => (
    <Press key={`guide-${route.id}`} onPress={() => openGuide(route)} style={styles.resultRow}>
      {renderThumb(route)}
      <View style={styles.resultCopy}>
        <Highlight text={`${route.name} 攻略`} query={normalizedQuery} theme={theme} style={[styles.resultTitle, { color: theme.text }]} />
        <View style={styles.resultSubRow}>
          <Text style={[styles.resultSubKind, { color: theme.text3 }]}>攻略</Text>
          <Highlight text={regionLabel(route.region) || '路线攻略'} query={normalizedQuery} theme={theme} style={[styles.resultSub, { color: theme.text3 }]} />
        </View>
      </View>
    </Press>
  );

  const renderSection = (title: string, tab: SearchTab, content: React.ReactNode, more?: () => void) => {
    const count = resultCount(tab);
    if (!count) return null;
    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.text2 }]}>{title}</Text>
          {count > 3 && more ? (
            <Press onPress={more} accessibilityRole="button" style={styles.morePress}>
              <Text style={[styles.moreText, { color: theme.text3 }]}>更多</Text>
              <Icon name="chevronR" color={theme.text3} size={14} />
            </Press>
          ) : null}
        </View>
        {content}
      </View>
    );
  };

  const listForTab = () => {
    if (activeTab === 'route') return matchingRoutes.map((route) => renderPoi(route, 'route'));
    if (activeTab === 'track') return publishedTracks.map(renderTrack);
    if (activeTab === 'journey') return matchingJourneys.map((journey) => renderPoi(journey, 'journey'));
    if (activeTab === 'guide') return matchingGuides.map(renderGuide);
    return null;
  };

  const renderEmpty = () => (
    <View style={styles.empty}>
      <Text style={[styles.emptyTitle, { color: theme.text }]}>没有找到相关内容</Text>
      <Text style={[styles.emptySub, { color: theme.text3 }]}>换个关键词试试</Text>
      <Press onPress={requestRoute} accessibilityRole="button" style={styles.emptyLinkPress}>
        <Text style={[styles.emptyLink, { color: theme.accent }]}>没有找到想走的路线？告诉我们</Text>
      </Press>
    </View>
  );

  const renderTabs = () => (
    <View style={styles.tabBar}>
      {TAB_LABELS.map((tab) => {
        const selected = activeTab === tab.id;
        return (
          <Press key={tab.id} onPress={() => setActiveTab(tab.id)} accessibilityRole="tab" accessibilityState={{ selected }} style={styles.tabPress}>
            <Text style={[styles.tabText, { color: selected ? theme.text : theme.text3, fontWeight: selected ? '700' : '500' }]}>{tab.label}</Text>
            <View style={[styles.tabUnderline, { backgroundColor: selected ? theme.accent : 'transparent' }]} />
          </Press>
        );
      })}
    </View>
  );

  return (
    <Animated.View
      onStartShouldSetResponder={() => true}
      onResponderGrant={() => Keyboard.dismiss()}
      style={[StyleSheet.absoluteFill, { backgroundColor: theme.groupedBg, opacity: fadeAnim, zIndex: 200 }]}
    >
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <View style={[styles.searchField, { backgroundColor: theme.featureSurface, borderColor: theme.fieldBorder }]}>
          <Press onPress={close} accessibilityRole="button" accessibilityLabel={t('common.back')} style={styles.backButton}>
            <Icon name="arrowL" color={theme.text} size={22} strokeWidth={2.2} />
          </Press>
          <TextInput
            value={query}
            onChangeText={(value) => { setQuery(value); if (!value.trim()) setActiveTab('all'); }}
            placeholder="搜索地点、路线、轨迹、旅程或攻略"
            placeholderTextColor={theme.text3}
            returnKeyType="search"
            autoCorrect={false}
            style={[styles.searchInput, { color: theme.text }]}
          />
          {query.length > 0 ? (
            <Press onPress={() => { setQuery(''); setActiveTab('all'); }} accessibilityRole="button" accessibilityLabel="清空" style={styles.clearButton}>
              <Icon name="close" color={theme.text3} size={12} strokeWidth={2.6} />
            </Press>
          ) : null}
        </View>
      </View>

      {!hasQuery ? (
        <View style={styles.scopeBar}>
          {(['china', 'international'] as const).map((item) => {
            const selected = scope === item;
            return (
              <Press key={item} onPress={() => { setScope(item); setQuery(''); }} accessibilityRole="tab" accessibilityState={{ selected }} style={styles.tabPress}>
                <Text style={[styles.tabText, { color: selected ? theme.text : theme.text3, fontWeight: selected ? '700' : '500' }]}>{item === 'china' ? '中国' : '国际'}</Text>
                <View style={[styles.tabUnderline, { backgroundColor: selected ? theme.accent : 'transparent' }]} />
              </Press>
            );
          })}
        </View>
      ) : renderTabs()}

      <View style={[styles.sheet, { backgroundColor: theme.surfaceStrong }]}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.sheetContent, { paddingBottom: insets.bottom + space.xl }]}>
          {!hasQuery ? (
            <View style={styles.chips} onLayout={(e) => setChipsWidth(e.nativeEvent.layout.width)}>
              {places.map((region) => (
                <Press key={region} onPress={() => choosePlace(region)} accessibilityRole="button" accessibilityState={{ selected: nav.discoverRegion === region }}
                  style={[styles.chip, chipsWidth > 0 && { width: (chipsWidth - space.sm * (PLACE_COLUMNS - 1)) / PLACE_COLUMNS }, { backgroundColor: nav.discoverRegion === region ? theme.accent : 'transparent' }]}>
                  <Text numberOfLines={1} style={{ color: nav.discoverRegion === region ? '#FFFFFF' : theme.text, fontSize: 15, fontWeight: nav.discoverRegion === region ? '700' : '500' }}>{region}</Text>
                </Press>
              ))}
              {places.length === 0 ? <Text style={{ color: theme.text3, marginTop: space.lg }}>没有匹配的行政区</Text> : null}
            </View>
          ) : activeTab === 'all' ? (
            <>
              {renderSection('路线', 'route', matchingRoutes.slice(0, 3).map((route) => renderPoi(route, 'route')), () => setActiveTab('route'))}
              {renderSection('轨迹', 'track', publishedTracks.slice(0, 3).map(renderTrack), () => setActiveTab('track'))}
              {renderSection('旅程', 'journey', matchingJourneys.slice(0, 3).map((journey) => renderPoi(journey, 'journey')), () => setActiveTab('journey'))}
              {renderSection('攻略', 'guide', matchingGuides.slice(0, 3).map(renderGuide), () => setActiveTab('guide'))}
              {resultCount('all') === 0 ? renderEmpty() : null}
            </>
          ) : listForTab()?.length ? listForTab() : renderEmpty()}
        </ScrollView>
      </View>
    </Animated.View>
  );
}

const PLACE_COLUMNS = 4;

const styles = StyleSheet.create({
  header: { paddingTop: space.sm, paddingHorizontal: space.md, paddingBottom: space.md, flexDirection: 'row', alignItems: 'center' },
  backButton: { width: 40, height: SEARCH_FIELD_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  searchField: { flex: 1, height: SEARCH_FIELD_HEIGHT, borderRadius: SEARCH_FIELD_HEIGHT / 2, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingLeft: space.xxs, paddingRight: space.sm },
  searchInput: { flex: 1, height: SEARCH_FIELD_HEIGHT, fontSize: 16, paddingVertical: 0, minWidth: 0 },
  clearButton: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  scopeBar: { flexDirection: 'row', gap: 28, paddingHorizontal: space.lg },
  tabBar: { flexDirection: 'row', gap: 26, paddingHorizontal: space.lg },
  tabPress: { alignItems: 'center' },
  tabText: { fontSize: 16, lineHeight: 20 },
  tabUnderline: { width: 20, height: 3, borderRadius: 2, marginTop: 5 },
  sheet: { flex: 1, marginTop: space.sm, marginHorizontal: space.md, marginBottom: space.md, borderRadius: 28, overflow: 'hidden' },
  sheetContent: { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.xxl },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { minWidth: 72, paddingHorizontal: space.xs, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  section: { marginBottom: space.xl },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.sm },
  sectionTitle: { fontSize: 15, fontWeight: '700' },
  morePress: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 4, paddingHorizontal: 2 },
  moreText: { fontSize: 14 },
  resultRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 7 },
  thumb: { width: 60, height: 60, borderRadius: radius.card, alignItems: 'center', justifyContent: 'center' },
  resultCopy: { flex: 1, minWidth: 0 },
  resultTitle: { fontSize: 16.5, fontWeight: '600', lineHeight: 22 },
  resultSubRow: { marginTop: 5, flexDirection: 'row', alignItems: 'center', gap: space.xs, minWidth: 0 },
  resultSubKind: { fontSize: 13, opacity: 0.75 },
  resultSub: { flex: 1, minWidth: 0, fontSize: 13, lineHeight: 18 },
  empty: { alignItems: 'center', paddingVertical: 80 },
  emptyTitle: { fontSize: 16, fontWeight: '700' },
  emptySub: { marginTop: space.xs, fontSize: 14 },
  emptyLinkPress: { marginTop: space.lg, paddingVertical: 6, paddingHorizontal: space.sm },
  emptyLink: { fontSize: 14 },
});
