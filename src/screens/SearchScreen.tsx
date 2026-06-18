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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Theme } from '../theme/theme';
import { MONO } from '../theme/fonts';
import { useNav } from '../nav/NavContext';
import { useData } from '../data/DataContext';
import { useI18n } from '../i18n';
import { Poi } from '../data/pois';
import { EXPLORE_POIS } from '../data/pois';
import { Icon } from '../components/Icon';
import { Press } from '../components/Press';
import { PoiRow } from '../components/ListRow';

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
    () => [...EXPLORE_POIS].sort((a, b) => (b.reviews || 0) - (a.reviews || 0)).slice(0, 5),
    [],
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
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, paddingHorizontal: 8, paddingTop: 18, paddingBottom: 8 }}>
      <Text style={{ fontSize: 11, fontWeight: '600', color: theme.text2, letterSpacing: 1, textTransform: 'uppercase' }}>
        {label}
      </Text>
      {count != null && (
        <Text style={{ fontFamily: MONO, fontSize: 10, color: theme.text3 }}>{count}</Text>
      )}
    </View>
  );

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: theme.bg, opacity: fadeAnim, zIndex: 200 }]}>
      {/* Search bar */}
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View
          style={{
            flex: 1,
            height: 40,
            borderRadius: 13,
            backgroundColor: theme.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingHorizontal: 12,
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
            style={{ flex: 1, fontSize: 14.5, color: theme.text, padding: 0, minWidth: 0 }}
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
        <Press onPress={close} style={{ paddingVertical: 4, paddingHorizontal: 2 }}>
          <Text style={{ fontSize: 14.5, fontWeight: '500', color: theme.accent }}>{t('common.cancel')}</Text>
        </Press>
      </View>

      {/* Content */}
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
      >
        {!query ? (
          <>
            {recent.length > 0 && (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 8, paddingTop: 18, paddingBottom: 10 }}>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: theme.text2, letterSpacing: 1, textTransform: 'uppercase' }}>
                    {t('search.recent')}
                  </Text>
                  <Press onPress={() => { clearRecent(); setRecent([]); }}>
                    <Text style={{ fontSize: 12, color: theme.text3 }}>{t('search.clear')}</Text>
                  </Press>
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 4 }}>
                  {recent.map((s) => (
                    <Press key={s} onPress={() => setQ(s)} style={{
                      paddingVertical: 7, paddingHorizontal: 14, borderRadius: 999,
                      backgroundColor: theme.dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.045)',
                    }}>
                      <Text style={{ fontSize: 13, fontWeight: '500', color: theme.text }}>{s}</Text>
                    </Press>
                  ))}
                </View>
              </>
            )}
            {groupLabel(t('search.hot'))}
            {hot.map((r) => (
              <PoiRow key={r.id} theme={theme} poi={r} onPress={() => pick(r)} />
            ))}
          </>
        ) : hasHits ? (
          <>
            {routeHits.length > 0 && (
              <>
                {groupLabel(t('search.routes'), routeHits.length)}
                {routeHits.map((r) => (
                  <PoiRow key={r.id} theme={theme} poi={r} onPress={() => pick(r)} />
                ))}
              </>
            )}
            {journeyHits.length > 0 && (
              <>
                {groupLabel(t('search.journeys'), journeyHits.length)}
                {journeyHits.map((m) => (
                  <PoiRow key={m.id} theme={theme} poi={m} onPress={() => pick(m)} />
                ))}
              </>
            )}
          </>
        ) : (
          <View style={{ alignItems: 'center', paddingTop: 70, paddingHorizontal: 24, gap: 8 }}>
            <Icon name="search" color={theme.text3} size={30} />
            <Text style={{ fontSize: 15, fontWeight: '600', color: theme.text, marginTop: 4, textAlign: 'center' }}>
              {t('search.noResult', { query: q.trim() })}
            </Text>
            <Text style={{ fontSize: 12.5, color: theme.text2, lineHeight: 20, textAlign: 'center' }}>
              {t('search.noResultHint')}
            </Text>
            <Press
              onPress={() => { close(); setTimeout(() => nav.openAddRoute(), 300); }}
              style={{
                marginTop: 12,
                paddingVertical: 11,
                paddingHorizontal: 22,
                borderRadius: 999,
                backgroundColor: theme.accent,
              }}
            >
              <Text style={{ fontSize: 13.5, fontWeight: '600', color: '#fff' }}>
                {t('search.uploadTrack')}
              </Text>
            </Press>
          </View>
        )}
      </ScrollView>
    </Animated.View>
  );
}
