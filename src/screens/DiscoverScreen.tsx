// DiscoverScreen.tsx — the 发现 tab. A Mapbox 3D globe (SVG fallback) of routes
// (探索) or the user's journeys (旅程), with a draggable bottom sheet listing them
// and a per-POI detail card.
import React, { useMemo } from 'react';
import { View, Text, ScrollView, useWindowDimensions, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme } from '../theme/theme';
import { useNav } from '../nav/NavContext';
import { EXPLORE_POIS, MEMORY_POIS, Poi } from '../data/pois';
import { Globe } from '../components/globe';
import { GlassIconBtn } from '../components/Glass';
import { Icon } from '../components/Icon';
import { Press } from '../components/Press';
import { FilterChip } from '../components/Chip';
import { PoiRow } from '../components/ListRow';
import { TrailSheet } from '../components/Sheet';
import { SelectedPoiCard } from './JourneyCard';
import { KPState, KPSkeletonLine } from '../components/State';

const EXPLORE_CHIPS = ['全部', '简单', '高爬升', '近距离', '我的'];
const MEMORY_CHIPS = ['全部', '计划中', '进行中', '已完成', '收藏'];

function num(s: string) {
  const m = s.replace(/,/g, '').match(/[\d.]+/);
  return m ? parseFloat(m[0]) : 0;
}

export function DiscoverScreen({ theme }: { theme: Theme }) {
  const nav = useNav();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isMemory = nav.subTab === 'memory';
  const [chip, setChip] = React.useState(0);

  React.useEffect(() => setChip(0), [isMemory]);

  const basePois: Poi[] = useMemo(() => {
    if (isMemory) {
      return [...nav.extraJourneys, ...MEMORY_POIS]
        .filter((p) => !nav.removedIds.includes(p.id))
        .map((p) => nav.merged(p));
    }
    return [...nav.savedRoutes, ...EXPLORE_POIS];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMemory, nav.extraJourneys, nav.savedRoutes, nav.removedIds, nav.journeyPatch]);

  const pois = useMemo(() => {
    let list = [...basePois];
    if (isMemory) {
      const key = MEMORY_CHIPS[chip];
      if (key === '计划中') list = list.filter((p) => p.status === 'planning');
      else if (key === '进行中') list = list.filter((p) => p.status === 'ongoing');
      else if (key === '已完成') list = list.filter((p) => p.status === 'completed');
      else if (key === '收藏') list = list.filter((p) => p.fav);
    } else {
      const key = EXPLORE_CHIPS[chip];
      if (key === '简单') list = list.filter((p) => p.diff === '易' || p.diff === '中');
      else if (key === '高爬升') list = [...list].sort((a, b) => num(b.asc) - num(a.asc));
      else if (key === '近距离') list = [...list].sort((a, b) => num(a.dist) - num(b.dist));
      else if (key === '我的') list = list.filter((p) => p.mine);
    }
    return list;
  }, [basePois, chip, isMemory]);

  const globeSize = Math.min(width * 0.86, 360);
  const tabSpace = insets.bottom + 76; // floating tab bar clearance
  const avail = height - insets.top - tabSpace - 12;
  const collapsed = 120;
  const mid = Math.round(avail * 0.55);
  const full = Math.round(avail);

  // sheet stats
  const totalKm = useMemo(() => pois.reduce((s, p) => s + num(p.dist), 0), [pois]);

  const listState = 'normal'; // could be wired to a tweak later

  const header = (
    <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
      {nav.pointInfo ? (
        <Press
          onPress={() => nav.closePoint()}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 2 }}
        >
          <Icon name="chevronL" color={theme.accent} size={16} />
          <Text style={{ fontSize: 14, fontWeight: '600', color: theme.accent }}>{isMemory ? '我的旅程' : '为你推荐'}</Text>
        </Press>
      ) : (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <View>
              <Text style={{ fontSize: 11, fontWeight: '600', color: theme.text2, letterSpacing: 0.6, textTransform: 'uppercase' }}>
                {isMemory ? 'MY JOURNEYS' : 'FEATURED'}
              </Text>
              <Text style={{ fontSize: 18, fontWeight: '700', color: theme.text, marginTop: 2 }}>
                {isMemory ? '我的旅程' : '为你推荐'}
              </Text>
              <Text style={{ fontSize: 11.5, color: theme.text2, marginTop: 2 }}>
                {isMemory
                  ? `${pois.length} 段旅程 · ${Math.round(totalKm)} km`
                  : `${pois.length} 条路线 · 持续更新`}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 2 }}>
              <Press
                onPress={() => nav.showToast('筛选')}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 15,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: theme.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                }}
              >
                <Icon name="filter" color={theme.text2} size={17} />
              </Press>
              <Press
                onPress={() => nav.openAddRoute()}
                style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.accent }}
              >
                <Icon name="plus" color="#fff" size={18} />
              </Press>
            </View>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 6, paddingTop: 12, paddingRight: 16 }}
          >
            {(isMemory ? MEMORY_CHIPS : EXPLORE_CHIPS).map((c, i) => (
              <FilterChip key={c} theme={theme} label={c} active={chip === i} onPress={() => setChip(i)} />
            ))}
          </ScrollView>
        </>
      )}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      {/* globe */}
      <View style={{ position: 'absolute', top: insets.top + 96, left: 0, right: 0, alignItems: 'center' }}>
        <Globe
          theme={theme}
          size={globeSize}
          pois={pois.map((p) => ({ id: p.id, lng: p.lng, lat: p.lat, status: p.status, mine: p.mine }))}
          activePoiId={nav.pointInfo?.id}
          onPoiPress={(id) => {
            const found = pois.find((p) => p.id === id);
            if (found) nav.openPoint(found);
          }}
        />
      </View>

      {/* subtabs */}
      <View style={{ position: 'absolute', top: insets.top + 8, left: 0, right: 0, alignItems: 'center' }}>
        <View
          style={{
            flexDirection: 'row',
            padding: 3,
            borderRadius: 16,
            gap: 3,
            backgroundColor: theme.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
          }}
        >
          {[
            { id: 'explore', label: '探索' },
            { id: 'memory', label: '旅程' },
          ].map((tab) => {
            const active = nav.subTab === tab.id;
            return (
              <Press
                key={tab.id}
                onPress={() => nav.setSubTab(tab.id as any)}
                style={{
                  paddingHorizontal: 20,
                  height: 30,
                  borderRadius: 13,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: active ? (theme.dark ? 'rgba(120,120,128,0.5)' : '#fff') : 'transparent',
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: active ? '700' : '500', color: active ? theme.text : theme.text2 }}>
                  {tab.label}
                </Text>
              </Press>
            );
          })}
        </View>
      </View>

      {/* top-right chrome */}
      <View style={{ position: 'absolute', top: insets.top + 8, right: 16, gap: 10 }}>
        <GlassIconBtn theme={theme} onPress={() => nav.showToast('搜索')}>
          <Icon name="search" color={theme.text} size={19} />
        </GlassIconBtn>
        <GlassIconBtn theme={theme} onPress={() => nav.showToast('正北')}>
          <View style={{ alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="compass" color={theme.text} size={19} />
          </View>
        </GlassIconBtn>
      </View>

      {/* locate button (sits above the collapsed sheet) */}
      <View style={{ position: 'absolute', right: 16, bottom: tabSpace + collapsed + 16 }}>
        <GlassIconBtn theme={theme} size={44} strong onPress={() => nav.showToast('定位到当前位置')}>
          <Icon name="locate" color={theme.accent} size={21} />
        </GlassIconBtn>
      </View>

      {/* draggable sheet */}
      <TrailSheet
        key={(nav.pointInfo?.id || 'list') + nav.subTab}
        theme={theme}
        snapHeights={[collapsed, mid, full]}
        initialIndex={nav.pointInfo ? 1 : 0}
        header={header}
        bottomOffset={tabSpace}
      >
        <View style={{ paddingHorizontal: 16 }}>
          {nav.pointInfo ? (
            <SelectedPoiCard theme={theme} poi={nav.pointInfo} />
          ) : listState === 'normal' ? (
            pois.length === 0 ? (
              <KPState
                theme={theme}
                icon={isMemory ? 'route' : 'search'}
                title={isMemory ? '还没有这类旅程' : '没有匹配的路线'}
                body={isMemory ? '切换筛选或发起一段新的旅程。' : '试试别的筛选条件。'}
              />
            ) : (
              pois.map((p) => <PoiRow key={p.id} theme={theme} poi={p} onPress={() => nav.openPoint(p)} />)
            )
          ) : (
            <View style={{ gap: 14, paddingTop: 8 }}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                  <View style={{ width: 60, height: 60, borderRadius: 14, backgroundColor: theme.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }} />
                  <View style={{ flex: 1, gap: 8 }}>
                    <KPSkeletonLine theme={theme} width="62%" />
                    <KPSkeletonLine theme={theme} width="40%" height={10} />
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </TrailSheet>
    </View>
  );
}
