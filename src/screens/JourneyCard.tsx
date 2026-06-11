// JourneyCard.tsx — SelectedPoiCard: the rich detail body for a route or journey,
// shown inside the discover sheet and (full-bleed) in the JourneyCardFull overlay.
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MONO } from '../theme/fonts';
import { Theme } from '../theme/theme';
import { Poi, STATUS_LABEL, STATUS_COLOR, JourneyStatus } from '../data/pois';
import { buildElevation } from '../data/elevation';
import { PhotoTile } from '../components/PhotoTile';
import { Avatar, AvatarStack } from '../components/Avatar';
import { Icon, IconName } from '../components/Icon';
import { Press } from '../components/Press';
import { ElevationStrip } from '../components/ElevationStrip';
import { useNav } from '../nav/NavContext';
import { elevAccent } from '../theme/shadow';
import { TONES } from '../data/tones';

function SectionHeader({ theme, title, action, onAction }: { theme: Theme; title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
      <Text style={{ fontSize: 16.5, fontWeight: '700', color: theme.text }}>{title}</Text>
      {action ? (
        <Press onPress={onAction}>
          <Text style={{ fontSize: 13.5, fontWeight: '600', color: theme.accent }}>{action}</Text>
        </Press>
      ) : null}
    </View>
  );
}

function StatCol({ theme, label, value, color }: { theme: Theme; label: string; value: string; color?: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ fontFamily: MONO, fontSize: 15, fontWeight: '700', color: color || theme.text }}>{value}</Text>
      <Text style={{ fontSize: 10.5, color: theme.text2, marginTop: 3 }}>{label}</Text>
    </View>
  );
}

function IconButton({ theme, name, onPress, color }: { theme: Theme; name: IconName; onPress?: () => void; color?: string }) {
  return (
    <Press
      onPress={onPress}
      style={{
        width: 42,
        height: 42,
        borderRadius: 13,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
      }}
    >
      <Icon name={name} color={color || theme.text} size={21} />
    </Press>
  );
}

export function SelectedPoiCard({ theme, poi, fullBleed }: { theme: Theme; poi: Poi; fullBleed?: boolean }) {
  const nav = useNav();
  const [chartW, setChartW] = useState(320);
  const isJourney = poi.kind === 'journey';
  const status = (poi.status || 'completed') as JourneyStatus;
  const isMine = isJourney;
  const series = useMemo(() => buildElevation(poi), [poi.id, poi.dist, poi.asc]);

  // a deterministic photo grid
  const photos = useMemo(() => {
    const arr: string[] = [];
    const n = status === 'planning' ? 0 : status === 'ongoing' ? 6 : 9;
    for (let i = 0; i < n; i++) arr.push(TONES[(i * 3 + poi.id.length) % TONES.length]);
    return arr;
  }, [poi.id, status]);

  let ctaLabel = '开始旅程';
  let ctaAction = () => nav.showToast('开始规划这条路线');
  if (isJourney) {
    if (status === 'planning') {
      ctaLabel = '出发';
      ctaAction = () => {
        nav.startJourney();
        nav.showToast('旅程已开始');
      };
    } else if (status === 'ongoing') {
      ctaLabel = '完成旅程';
      ctaAction = () => {
        nav.completeJourney();
        nav.showToast('旅程已完成');
      };
    } else {
      ctaLabel = '再次出发';
      ctaAction = () => nav.showToast('已基于这段旅程创建新计划');
    }
  }

  const moreItems = isJourney
    ? [
        { label: '编辑旅程信息', icon: 'edit', onPress: () => nav.showToast('编辑旅程') },
        { label: '旅程设置', icon: 'gear', onPress: () => nav.showToast('旅程设置') },
        { label: '删除旅程', icon: 'trash', destructive: true, onPress: () => nav.removeJourney() },
      ]
    : [
        { label: '收藏路线', icon: 'heart', onPress: () => nav.showToast('已收藏') },
        { label: '举报', icon: 'flag', destructive: true, onPress: () => nav.showToast('已举报') },
      ];

  return (
    <View onLayout={(e) => setChartW(e.nativeEvent.layout.width - (fullBleed ? 0 : 0))}>
      {/* hero */}
      <View style={{ marginHorizontal: fullBleed ? -10 : -16, marginTop: fullBleed ? 0 : -2, marginBottom: 16 }}>
        <PhotoTile tone={poi.tone} seed={poi.id + 'hero'} darken style={{ height: 224 }}>
          {nav.pointSource && (
            <Press
              onPress={() => nav.openPoint(nav.pointSource as Poi)}
              style={{
                position: 'absolute',
                top: 14,
                left: 14,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                paddingHorizontal: 11,
                height: 32,
                borderRadius: 16,
                backgroundColor: 'rgba(0,0,0,0.35)',
              }}
            >
              <Icon name="chevronL" color="#fff" size={15} />
              <Text style={{ color: '#fff', fontSize: 12.5, fontWeight: '600' }} numberOfLines={1}>
                {nav.pointSource.name}
              </Text>
            </Press>
          )}
          <View style={{ position: 'absolute', left: 16, right: 16, bottom: 16 }}>
            {isJourney && (
              <View
                style={{
                  alignSelf: 'flex-start',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                  paddingHorizontal: 8,
                  height: 22,
                  borderRadius: 7,
                  backgroundColor: 'rgba(0,0,0,0.4)',
                  marginBottom: 8,
                }}
              >
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: STATUS_COLOR(status, theme.accent, true) }} />
                <Text style={{ color: '#fff', fontSize: 11.5, fontWeight: '600' }}>
                  {STATUS_LABEL[status]}
                  {status === 'ongoing' && poi.dayIndex ? ` · Day ${poi.dayIndex}/${poi.totalDays}` : ''}
                </Text>
              </View>
            )}
            <Text style={{ color: '#fff', fontSize: 26, fontWeight: '800', textShadowColor: 'rgba(0,0,0,0.4)', textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } }}>
              {poi.name}
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.86)', fontSize: 13, marginTop: 3 }}>
              {poi.region}
              {poi.date ? ' · ' + poi.date : ''}
            </Text>
          </View>
        </PhotoTile>
      </View>

      {/* stats strip */}
      <View
        style={{
          flexDirection: 'row',
          paddingVertical: 12,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderColor: theme.hairline,
        }}
      >
        <StatCol theme={theme} label="距离" value={poi.dist} />
        <View style={{ width: StyleSheet.hairlineWidth, backgroundColor: theme.hairline }} />
        <StatCol theme={theme} label="累计爬升" value={poi.asc} />
        <View style={{ width: StyleSheet.hairlineWidth, backgroundColor: theme.hairline }} />
        {isJourney ? (
          <StatCol theme={theme} label="天数" value={poi.days || '—'} color={theme.accent} />
        ) : (
          <StatCol theme={theme} label="难度" value={poi.diff || '—'} color={theme.accent} />
        )}
        <View style={{ width: StyleSheet.hairlineWidth, backgroundColor: theme.hairline }} />
        {isJourney ? (
          <StatCol theme={theme} label="同行" value={String(poi.companions ?? 0) + ' 人'} />
        ) : (
          <StatCol theme={theme} label="评分" value={poi.rating || '—'} />
        )}
      </View>

      {/* primary action row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 16 }}>
        <Press onPress={ctaAction} style={[{ flex: 1, height: 42, borderRadius: 13, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' }, elevAccent(theme.accent)]}>
          <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>{ctaLabel}</Text>
        </Press>
        <IconButton theme={theme} name={poi.fav ? 'heartFill' : isJourney ? 'heart' : 'pin'} color={poi.fav ? theme.trailMine : theme.text} onPress={() => (isJourney ? nav.toggleFav() : nav.showToast('已定位'))} />
        <IconButton theme={theme} name="share" onPress={() => nav.showToast('分享链接已复制')} />
        <IconButton theme={theme} name="more" onPress={() => nav.openActionSheet({ items: moreItems as any })} />
      </View>

      {/* description */}
      {poi.desc ? (
        <View style={{ paddingBottom: 18 }}>
          <SectionHeader theme={theme} title="简介" />
          <Text style={{ fontSize: 14.5, lineHeight: 22, color: theme.text2 }}>{poi.desc}</Text>
        </View>
      ) : null}

      {/* elevation / route track */}
      <View style={{ paddingBottom: 18 }}>
        <SectionHeader theme={theme} title="路线轨迹" action="更多" onAction={() => nav.openElevation({ info: poi, isMine })} />
        <Press onPress={() => nav.openElevation({ info: poi, isMine })}>
          <View
            style={{
              backgroundColor: theme.dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.022)',
              borderRadius: 16,
              padding: 12,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: theme.hairline,
            }}
          >
            <ElevationStrip theme={theme} series={series} width={chartW - 24} color={isMine ? theme.trailMine : theme.accent} gradId={'elev-' + poi.id} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
              <Text style={{ fontFamily: MONO, fontSize: 10.5, color: theme.text2 }}>
                {series.minEle}–{series.maxEle} m
              </Text>
              <Text style={{ fontFamily: MONO, fontSize: 10.5, color: theme.text2 }}>↑ {series.ascent} m</Text>
            </View>
          </View>
        </Press>
      </View>

      {/* companions (journeys) */}
      {isJourney && poi.companionList && poi.companionList.length > 0 ? (
        <View style={{ paddingBottom: 18 }}>
          <SectionHeader theme={theme} title="同行" action="管理" onAction={() => nav.showToast('管理同行')} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <AvatarStack people={poi.companionList} size={36} max={6} ringColor={theme.dark ? '#1c1c1e' : '#fff'} />
            <Text style={{ fontSize: 13, color: theme.text2 }}>{poi.companions} 人同行</Text>
          </View>
        </View>
      ) : null}

      {/* timeline digest (journeys) */}
      {isJourney && status !== 'planning' ? <TimelineDigest theme={theme} poi={poi} /> : null}

      {/* photo grid */}
      {photos.length > 0 ? (
        <View style={{ paddingBottom: 18 }}>
          <SectionHeader theme={theme} title="瞬间" action="全部" onAction={() => nav.openPhotoWall({ info: poi, mode: 'mine', status })} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {photos.map((tone, i) => (
              <Press key={i} onPress={() => nav.openPhotoWall({ info: poi, mode: 'mine', status })} style={{ width: '31.7%' }}>
                <PhotoTile tone={tone} seed={poi.id + 'p' + i} radius={11} style={{ aspectRatio: 1 }} />
              </Press>
            ))}
          </View>
        </View>
      ) : null}

      {/* author footer (routes) */}
      {!isJourney ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingBottom: 26 }}>
          <Avatar ini="林" tone="forest" size={32} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13.5, fontWeight: '600', color: theme.text }}>林深见鹿 上传</Text>
            <Text style={{ fontSize: 11.5, color: theme.text2 }}>{poi.reviews ?? 0} 人走过这条路线</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function TimelineDigest({ theme, poi }: { theme: Theme; poi: Poi }) {
  const nav = useNav();
  const total = 8;
  const done = poi.status === 'completed' ? 8 : Math.max(1, poi.dayIndex || 2) + 1;
  const pct = Math.round((done / total) * 100);
  const next = [
    { title: '抵达营地 · 扎营', day: `Day ${poi.dayIndex || 2}` },
    { title: '日出冲顶窗口 04:30', day: `Day ${(poi.dayIndex || 2) + 1}` },
  ];
  return (
    <View style={{ paddingBottom: 18 }}>
      <SectionHeader theme={theme} title="行程" action="全部" onAction={() => nav.showToast('查看完整行程')} />
      <View
        style={{
          backgroundColor: theme.dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.022)',
          borderRadius: 16,
          padding: 14,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.hairline,
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
          <Text style={{ fontSize: 13, color: theme.text2 }}>
            {done} / {total} 完成
          </Text>
          <Text style={{ fontFamily: MONO, fontSize: 12, color: theme.accent }}>{pct}%</Text>
        </View>
        <View style={{ height: 6, borderRadius: 3, backgroundColor: theme.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }}>
          <View style={{ width: `${pct}%`, height: 6, borderRadius: 3, backgroundColor: theme.accent }} />
        </View>
        {poi.status !== 'completed' && (
          <View style={{ marginTop: 12, gap: 10 }}>
            <Text style={{ fontSize: 11.5, fontWeight: '600', color: theme.text3, letterSpacing: 0.4 }}>接下来</Text>
            {next.map((n, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 16, height: 16, borderRadius: 8, borderWidth: 1.8, borderColor: theme.accent }} />
                <Text style={{ flex: 1, fontSize: 13.5, color: theme.text }}>{n.title}</Text>
                <Text style={{ fontFamily: MONO, fontSize: 10.5, color: theme.text2 }}>{n.day}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}
