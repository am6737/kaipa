// JourneyCard.tsx — SelectedPoiCard: the rich detail body for a route or journey,
// shown inside the discover sheet and (full-bleed) in the JourneyCardFull overlay.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Share, Platform, Image, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Svg, { Path as SvgPath, Circle, Rect } from 'react-native-svg';
import { MONO } from '../theme/fonts';
import { Theme } from '../theme/theme';
import { Poi, STATUS_LABEL, STATUS_COLOR, JourneyStatus } from '../data/pois';
import { buildElevation } from '../data/elevation';
import { JourneyTimelineCard } from '../components/overlays/JourneyTimeline';
import { PhotoTile } from '../components/PhotoTile';
import { Avatar, AvatarStack } from '../components/Avatar';
import { Icon, IconName } from '../components/Icon';
import { Press } from '../components/Press';
import { ElevationStrip } from '../components/ElevationStrip';
import { useNav } from '../nav/NavContext';
import { elevAccent } from '../theme/shadow';
import { TONES } from '../data/tones';
import { useInspo } from '../data/inspoStore';

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

// 瞬间 for 计划中 journeys: a plan has no real moments yet, so instead of hiding
// the section we let the user pre-collect 灵感 (inspiration) — 拍照 or pick a photo
// / video from the library via expo-image-picker. Picks are session-local
// (useInspo) and grow into a media grid; once 出发, the card switches back to the
// real moments grid above.
function PlanningMoments({ theme, poi }: { theme: Theme; poi: Poi }) {
  const nav = useNav();
  const inspo = useInspo(poi.id);
  const has = inspo.media.length > 0;
  const [pending, setPending] = useState<'camera' | 'library' | null>(null);
  const inspoRef = useRef(inspo);
  inspoRef.current = inspo;

  useEffect(() => {
    if (!pending) return;
    let cancelled = false;
    (async () => {
      try {
        if (pending === 'camera') {
          const perm = await ImagePicker.requestCameraPermissionsAsync();
          if (!perm.granted) { if (!cancelled) nav.showToast('需要相机权限'); return; }
          const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
          if (!cancelled && !res.canceled && res.assets) {
            res.assets.forEach((a) => inspoRef.current.add({ uri: a.uri, kind: a.type === 'video' ? 'video' : 'image' }));
          }
        } else {
          const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!perm.granted) { if (!cancelled) nav.showToast('需要相册访问权限'); return; }
          const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], allowsMultipleSelection: true, quality: 0.8 });
          if (!cancelled && !res.canceled && res.assets) {
            res.assets.forEach((a) => inspoRef.current.add({ uri: a.uri, kind: a.type === 'video' ? 'video' : 'image' }));
          }
        }
      } catch (e) {
        if (!cancelled) Alert.alert('出错了', String(e && typeof e === 'object' && 'message' in e ? (e as any).message : e));
      } finally {
        if (!cancelled) setPending(null);
      }
    })();
    return () => { cancelled = true; };
  }, [pending]);

  const chooseSource = () =>
    nav.openActionSheet({
      title: '添加瞬间',
      items: [
        { label: '拍照', onPress: () => setPending('camera') },
        { label: '从相册选择照片或视频', onPress: () => setPending('library') },
      ],
    });

  const addTile = (
    <Press
      onPress={chooseSource}
      style={{
        width: '31.7%',
        aspectRatio: 1,
        borderRadius: 9,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: theme.dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.18)',
      }}
    >
      <Icon name="plus" color={theme.text2} size={16} strokeWidth={2.2} />
    </Press>
  );

  const count = inspo.media.length;

  return (
    <View style={{ paddingBottom: 18 }}>
      <SectionHeader theme={theme} title="瞬间" action={`${count} 张`} onAction={chooseSource} />
      {has ? (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
            {inspo.media.map((m) => (
              <View
                key={m.id}
                style={{ width: '31.7%', aspectRatio: 1, borderRadius: 9, overflow: 'hidden', backgroundColor: theme.dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }}
              >
                {m.kind === 'video' ? (
                  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.dark ? '#1c1c1e' : '#2a2a2c' }}>
                    <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="play" color="#fff" size={16} />
                    </View>
                  </View>
                ) : (
                  <Image source={{ uri: m.uri }} resizeMode="cover" style={{ width: '100%', height: '100%' }} />
                )}
                {m.kind === 'video' ? (
                  <View style={{ position: 'absolute', left: 5, bottom: 5, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.5)' }}>
                    <Text style={{ fontSize: 9.5, fontWeight: '700', color: '#fff' }}>视频</Text>
                  </View>
                ) : null}
                <Press onPress={() => inspo.remove(m.id)} style={{ position: 'absolute', right: 5, top: 5, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="close" color="#fff" size={10} />
                </Press>
              </View>
            ))}
            {addTile}
          </View>
        </>
      ) : (
        <Press
          onPress={chooseSource}
          style={{
            borderRadius: 14,
            paddingVertical: 24,
            paddingHorizontal: 16,
            alignItems: 'center',
            gap: 8,
            backgroundColor: theme.dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: theme.dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.18)',
          }}
        >
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
            <Rect x={3} y={6} width={18} height={14} rx={2.5} stroke={theme.text2} strokeWidth={1.6} />
            <Circle cx={12} cy={13} r={3.5} stroke={theme.text2} strokeWidth={1.6} />
            <SvgPath d="M9 6 10 4h4l1 2" stroke={theme.text2} strokeWidth={1.6} strokeLinejoin="round" />
            <SvgPath d="M17 9.5h2M18 8.5v2" stroke={theme.text2} strokeWidth={1.4} strokeLinecap="round" />
          </Svg>
          <Text style={{ fontSize: 13, fontWeight: '600', color: theme.text }}>添加出发前的准备 / 灵感</Text>
          <Text style={{ fontSize: 11, color: theme.text2 }}>装备照、地图、参考图都可以放进来</Text>
        </Press>
      )}
    </View>
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

  // Destructive label + confirm copy adapt to the journey's status (a plan is
  // "cancelled", an in-progress trip is "abandoned", a finished one "deleted").
  const removeLabel = status === 'planning' ? '取消旅程' : status === 'ongoing' ? '放弃旅程' : '删除旅程';
  const confirmTitle = status === 'planning' ? '取消这段旅程的计划？' : status === 'ongoing' ? '放弃进行中的旅程？' : '删除这段旅程？';
  const confirmRemove = () =>
    nav.openActionSheet({
      title: confirmTitle,
      message: '此操作无法撤销，旅程会从列表中移除。',
      items: [{ label: removeLabel, destructive: true, onPress: () => nav.removeJourney() }],
    });

  // text-only items — the action sheet matches the rest of the app's icon-less,
  // iOS-standard style
  const moreItems = isJourney
    ? [
        { label: '旅程设置', onPress: () => nav.openJourneySettings(poi) },
        { label: removeLabel, destructive: true, onPress: confirmRemove },
      ]
    : [
        { label: poi.fav ? '取消收藏' : '收藏路线', onPress: () => nav.toggleFav() },
        { label: '举报', destructive: true, onPress: () => nav.showToast('已举报') },
      ];

  // Share via the native OS share sheet (Messages / WeChat / Copy / …). The link
  // is a stable deep-link slug; the blurb carries the trip's key stats.
  const shareLink = `https://kaipa.app/${isJourney ? 'j' : 'r'}/${poi.id}`;
  const onShare = async () => {
    const stats = [poi.dist, poi.asc, isJourney ? poi.days : poi.diff].filter(Boolean).join(' · ');
    const blurb = `${poi.name} · ${poi.region}\n${stats}`;
    try {
      const result = await Share.share(
        Platform.OS === 'ios'
          ? { message: blurb, url: shareLink, title: poi.name }
          : { title: poi.name, message: `${blurb}\n${shareLink}` }
      );
      if (result.action === Share.sharedAction) nav.showToast('已分享');
    } catch {
      nav.showToast('分享失败');
    }
  };

  return (
    <View onLayout={(e) => setChartW(e.nativeEvent.layout.width - (fullBleed ? 0 : 0))}>
      {/* hero */}
      <View style={{ marginHorizontal: fullBleed ? -10 : -16, marginTop: fullBleed ? 0 : -2, marginBottom: 16 }}>
        <PhotoTile tone={poi.tone} seed={poi.id + 'hero'} darken style={{ height: 224 }} resWidth={1200}>
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
        <IconButton theme={theme} name={poi.fav ? 'heartFill' : 'heart'} color={poi.fav ? theme.trailMine : theme.text} onPress={() => nav.toggleFav()} />
        <IconButton theme={theme} name="share" onPress={onShare} />
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
          <SectionHeader theme={theme} title="同行" action="管理" onAction={() => nav.openManageCompanions(poi)} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <AvatarStack people={poi.companionList} size={36} max={6} ringColor={theme.dark ? '#1c1c1e' : '#fff'} />
            <Text style={{ fontSize: 13, color: theme.text2 }}>{poi.companions} 人同行</Text>
          </View>
        </View>
      ) : null}

      {/* 行程 timeline digest (journeys, all statuses) */}
      {isJourney ? <JourneyTimelineCard theme={theme} info={poi} /> : null}

      {/* photo grid — 计划中旅程没有真实瞬间，改为引导预收集灵感图的空状态 */}
      {isJourney && status === 'planning' ? (
        <PlanningMoments theme={theme} poi={poi} />
      ) : photos.length > 0 ? (
        <View style={{ paddingBottom: 18 }}>
          <SectionHeader theme={theme} title={isJourney ? '瞬间' : '用户照片'} action="全部" onAction={() => nav.openPhotoWall({ info: poi, mode: 'mine', status })} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {photos.map((tone, i) => (
              <Press key={i} onPress={() => nav.openPhotoWall({ info: poi, mode: 'mine', status })} style={{ width: '31.7%' }}>
                <PhotoTile tone={tone} seed={poi.id + 'p' + i} radius={11} style={{ aspectRatio: 1 }} resWidth={420} />
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
