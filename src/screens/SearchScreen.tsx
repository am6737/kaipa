import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  Animated,
  Keyboard,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Theme } from '../theme/theme';
import { useNav } from '../nav/NavContext';
import { useData } from '../data/DataContext';
import { useI18n } from '../i18n';
import { Poi } from '../data/pois';
import { Icon } from '../components/Icon';
import { Press } from '../components/Press';
import { PoiRow } from '../components/ListRow';
import { AppCard, AppSectionHeader, layout, radius, space, type } from '../design-system';

const RECENT_KEY = 'kaipa_recent_search_v1';
const MAX_RECENT = 8;
const MAX_HITS = 12;

async function readRecent(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

async function pushRecent(q: string) {
  if (!q) return;
  const cur = (await readRecent()).filter((s) => s !== q);
  cur.unshift(q);
  await AsyncStorage.setItem(RECENT_KEY, JSON.stringify(cur.slice(0, MAX_RECENT))).catch(() => {});
}

async function clearRecent() {
  await AsyncStorage.removeItem(RECENT_KEY).catch(() => {});
}

export function SearchScreen({ theme }: { theme: Theme }) {
  const nav = useNav();
  const { t } = useI18n();
  const { routes, journeys } = useData();
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const [q, setQ] = useState('');
  const [recent, setRecent] = useState<string[]>([]);
  const [showAllHot, setShowAllHot] = useState(false);

  useEffect(() => {
    readRecent().then(setRecent);
    const timer = setTimeout(() => inputRef.current?.focus(), 280);
    Animated.timing(fadeAnim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    return () => clearTimeout(timer);
  }, []);

  const close = useCallback(() => {
    Keyboard.dismiss();
    Animated.timing(fadeAnim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => {
      nav.closeSearch();
    });
  }, [nav, fadeAnim]);

  const allRoutes: Poi[] = useMemo(() => {
    const merged = [...nav.savedRoutes, ...routes];
    const seen = new Set<string>();
    return merged.filter((p) => { if (seen.has(p.id)) return false; seen.add(p.id); return true; });
  }, [nav.savedRoutes, routes]);

  const allJourneys: Poi[] = useMemo(() => {
    const merged = [...nav.extraJourneys, ...journeys];
    const seen = new Set<string>();
    return merged
      .filter((p) => { if (seen.has(p.id)) return false; seen.add(p.id); return true; })
      .filter((p) => !nav.removedIds.includes(p.id))
      .map((p) => nav.merged(p));
  }, [nav.extraJourneys, journeys, nav.removedIds, nav.journeyPatch]);

  const query = q.trim().toLowerCase();
  const match = (item: Poi) =>
    (item.name || '').toLowerCase().includes(query) ||
    (item.region || '').toLowerCase().includes(query);
  const routeHits = query ? allRoutes.filter(match).slice(0, MAX_HITS) : [];
  const journeyHits = query ? allJourneys.filter(match).slice(0, MAX_HITS) : [];
  const hasHits = routeHits.length > 0 || journeyHits.length > 0;

  const hot = useMemo(
    () => [...routes]
      .sort((a, b) => (b.reviews || 0) - (a.reviews || 0))
      .slice(0, showAllHot ? 8 : 4),
    [routes, showAllHot],
  );

  const pick = useCallback((item: Poi) => {
    pushRecent(item.name);
    Keyboard.dismiss();
    nav.closeSearch();
    const isJourney = item.kind === 'journey';
    if (isJourney) {
      nav.setSubTab('memory');
    } else {
      nav.setSubTab('explore');
    }
    setTimeout(() => nav.openPoint(item), 60);
  }, [nav]);

  const onSubmit = useCallback(() => {
    if (q.trim()) {
      pushRecent(q.trim());
      readRecent().then(setRecent);
    }
  }, [q]);

  const groupLabel = (label: string, count?: number) => (
    <AppSectionHeader
      theme={theme}
      text={label}
      marginTop={space.lg}
      trailing={count != null ? <Text style={[type.caption, { color: theme.text3 }]}>{count}</Text> : undefined}
    />
  );

  const hotRow = (poi: Poi) => (
    <Press
      key={poi.id}
      onPress={() => pick(poi)}
      accessibilityRole="button"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 96,
        paddingVertical: space.sm,
      }}
    >
      {poi.photoUris?.[0] ? (
        <Image source={{ uri: poi.photoUris[0] }} contentFit="cover" style={{ width: 108, height: 80, borderRadius: radius.control }} />
      ) : (
        <View style={{ width: 108, height: 80, borderRadius: radius.control, backgroundColor: theme.fieldSurface }} />
      )}
      <View style={{ flex: 1, minWidth: 0, marginLeft: space.sm }}>
        <Text numberOfLines={2} style={[type.cardTitle, { color: theme.text, lineHeight: 21 }]}>{poi.name}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs, marginTop: space.xs }}>
          <Icon name="pin" color={theme.text3} size={14} />
          <Text numberOfLines={1} style={[type.caption, { color: theme.text2, flexShrink: 1 }]}>{poi.region}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs, marginTop: 3 }}>
          <Icon name="distance" color={theme.text3} size={14} />
          <Text numberOfLines={1} style={[type.caption, { color: theme.text2 }]}>{poi.dist}</Text>
        </View>
      </View>
    </Press>
  );

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: theme.groupedBg, opacity: fadeAnim, zIndex: 200 }]}>
      {/* Search header */}
      <View style={{ paddingTop: insets.top + space.sm, paddingHorizontal: space.md, paddingBottom: space.sm, flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
        <Press
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          style={{ width: layout.iconButton, height: layout.iconButton, alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name="chevronL" color={theme.text} size={28} strokeWidth={1.9} />
        </Press>
        <View
          style={{
            flex: 1,
            height: layout.fieldHeight,
            borderRadius: layout.fieldHeight / 2,
            backgroundColor: theme.featureSurface,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: theme.fieldBorder,
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.xs,
            paddingHorizontal: space.md,
          }}
        >
          <Icon name="search" color={theme.text3} size={17} />
          <TextInput
            ref={inputRef}
            value={q}
            onChangeText={setQ}
            onSubmitEditing={onSubmit}
            placeholder={t('search.placeholder')}
            placeholderTextColor={theme.text3}
            returnKeyType="search"
            autoCorrect={false}
            style={{ flex: 1, height: layout.fieldHeight, fontSize: 15, lineHeight: 21, color: theme.text, paddingVertical: 0, paddingHorizontal: 0, minWidth: 0, textAlignVertical: 'center' }}
          />
          {q.length > 0 && (
            <Press onPress={() => setQ('')} style={{
              width: 18, height: 18, borderRadius: 9,
              backgroundColor: theme.dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.14)',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon name="close" color={theme.bg} size={9} strokeWidth={3.4} />
            </Press>
          )}
        </View>
      </View>

      {/* Content */}
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingHorizontal: space.md, paddingBottom: Math.max(insets.bottom, space.xl) }}
      >
        {!query ? (
          <>
            {recent.length > 0 && (
              <>
                <AppSectionHeader
                  theme={theme}
                  text={t('search.recent')}
                  marginTop={space.sm}
                  trailing={
                    <Press onPress={() => { clearRecent(); setRecent([]); }} hitSlop={8}>
                      <Text style={[type.caption, { color: theme.accent, fontWeight: '600' }]}>{t('search.clear')}</Text>
                    </Press>
                  }
                />
                <AppCard theme={theme} style={{ padding: space.sm, borderRadius: radius.card }}>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
                    {recent.map((s) => (
                      <Press key={s} onPress={() => setQ(s)} style={{ minHeight: 34, paddingVertical: space.xs, paddingHorizontal: space.sm, borderRadius: radius.pill, backgroundColor: theme.fieldSurface, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.fieldBorder, justifyContent: 'center' }}>
                        <Text style={[type.body, { fontSize: 13, color: theme.text }]}>{s}</Text>
                      </Press>
                    ))}
                  </View>
                </AppCard>
              </>
            )}
            <AppCard theme={theme} style={{ marginTop: space.lg, paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.sm, borderRadius: radius.feature }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.xs }}>
                <Text style={[type.sectionTitle, { color: theme.text }]}>{t('search.hot')}</Text>
                {routes.length > 4 ? (
                  <Press onPress={() => setShowAllHot((value) => !value)} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                    <Text style={[type.body, { color: theme.text3, fontWeight: '600' }]}>{showAllHot ? t('search.collapse') : t('search.more')}</Text>
                    <Icon name={showAllHot ? 'chevronDown' : 'chevronR'} color={theme.text3} size={17} />
                  </Press>
                ) : null}
              </View>
              {hot.map(hotRow)}
            </AppCard>
          </>
        ) : hasHits ? (
          <>
            {routeHits.length > 0 && (
              <>
                {groupLabel(t('search.routes'), routeHits.length)}
                <AppCard theme={theme} style={{ paddingHorizontal: space.sm, paddingVertical: space.xs }}>
                  {routeHits.map((r) => <PoiRow key={r.id} theme={theme} poi={r} onPress={() => pick(r)} />)}
                </AppCard>
              </>
            )}
            {journeyHits.length > 0 && (
              <>
                {groupLabel(t('search.journeys'), journeyHits.length)}
                <AppCard theme={theme} style={{ paddingHorizontal: space.sm, paddingVertical: space.xs }}>
                  {journeyHits.map((m) => <PoiRow key={m.id} theme={theme} poi={m} onPress={() => pick(m)} />)}
                </AppCard>
              </>
            )}
          </>
        ) : (
          <View style={{ paddingTop: space.xxxl, paddingHorizontal: space.sm }}>
            <AppCard theme={theme} style={{ alignItems: 'center', paddingHorizontal: space.xl, paddingVertical: space.xxxl }}>
              <View style={{ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.accentSoft }}>
                <Icon name="search" color={theme.accent} size={25} />
              </View>
              <Text style={[type.cardTitle, { color: theme.text, marginTop: space.md, textAlign: 'center' }]}>{t('search.noResult', { query: q.trim() })}</Text>
              <Text style={[type.body, { color: theme.text2, lineHeight: 21, textAlign: 'center', marginTop: space.xs }]}>{t('search.noResultHint')}</Text>
              <Press onPress={() => { close(); setTimeout(() => nav.openAddRoute(), 300); }} style={{ minHeight: 44, marginTop: space.lg, paddingHorizontal: space.lg, borderRadius: radius.pill, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={[type.body, { fontWeight: '700', color: '#fff' }]}>{t('search.uploadTrack')}</Text>
              </Press>
            </AppCard>
          </View>
        )}
      </ScrollView>
    </Animated.View>
  );
}
