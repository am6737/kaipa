// PhotoWall.tsx — 瞬间 shared wall, faithful port of prototype's shared-wall.jsx.
// Hero cover → section title + companion bar → 2-col masonry with author badges →
// FAB to add. For 计划中 it uses real inspoStore media; ongoing/completed use
// deterministic placeholders attributed to companions.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Image, Alert, ScrollView, Animated, PanResponder, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Theme } from '../../theme/theme';
import { MONO } from '../../theme/fonts';
import { Poi, Companion } from '../../data/pois';
import { TONES, hashStr, mulberry32, pick } from '../../data/tones';
import { PhotoTile } from '../PhotoTile';
import { Icon } from '../Icon';
import { Press } from '../Press';
import { Avatar, AvatarStack } from '../Avatar';
import { useNav } from '../../nav/NavContext';
import { useInspo } from '../../data/inspoStore';
import { elevAccent } from '../../theme/shadow';

// ── placeholder data generators ──
const CAPTIONS = [
  '云海在脚下翻涌', '今天的日出值回票价', '垭口风很大，但景色绝了',
  '营地的第一缕光', '一路向上', '高山杜鹃开了', '星空下的帐篷',
  '终于看到主峰', '休息一下，喝口热水', '回望来时的路',
  '雪山在云里露了一下脸', '晨雾散开的那一瞬',
];

const PEOPLE: { ini: string; name: string; tone: string; color: string }[] = [
  { ini: '陈', name: '陈泽宇', tone: 'dusk', color: '#0A84FF' },
  { ini: 'M', name: 'Mia', tone: 'river', color: '#AF52DE' },
  { ini: '周', name: '老周', tone: 'rock', color: '#34C759' },
  { ini: '林', name: '林深见鹿', tone: 'forest', color: '#FF5C3A' },
];

interface WallPhoto {
  id: string;
  tone: string;
  ratio: number;
  caption: string;
  day: number;
  user: typeof PEOPLE[number];
  uri?: string;
  kind?: 'image' | 'video';
}

function genPhotos(info: Poi, status: string | undefined): WallPhoto[] {
  const rng = mulberry32(hashStr(info.name + (status || '')));
  const total = status === 'ongoing' ? 12 : status === 'planning' ? 0 : 24;
  const ratios = [0.72, 0.75, 0.8, 1, 1, 1.34, 1.5];
  const days = info.totalDays || 3;
  const out: WallPhoto[] = [];
  for (let i = 0; i < total; i++) {
    out.push({
      id: 'p' + i,
      tone: pick(rng, TONES),
      ratio: pick(rng, ratios),
      caption: pick(rng, CAPTIONS),
      day: 1 + Math.floor(rng() * days),
      user: pick(rng, PEOPLE),
    });
  }
  return out;
}

export function PhotoWall({ theme, info, status, onClose }: { theme: Theme; info: Poi; status?: string; onClose: () => void }) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const nav = useNav();
  const t = theme;
  const isPlanning = status === 'planning';
  const inspo = useInspo(info.id);
  const inspoRef = useRef(inspo);
  inspoRef.current = inspo;
  const [pending, setPending] = useState<'camera' | 'library' | null>(null);

  // ── entrance + drag-to-dismiss ──
  const translateY = useRef(new Animated.Value(600)).current;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 2, speed: 14 }).start();
  }, [translateY]);
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => g.dy > 4 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_e, g) => { if (g.dy > 0) translateY.setValue(g.dy); },
      onPanResponderRelease: (_e, g) => {
        if (g.dy > 110 || g.vy > 0.6) {
          Animated.timing(translateY, { toValue: 700, duration: 200, useNativeDriver: true }).start(() => onCloseRef.current());
        } else {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 4, speed: 16 }).start();
        }
      },
    })
  ).current;

  // ── picker effect ──
  useEffect(() => {
    if (!pending) return;
    let cancelled = false;
    (async () => {
      try {
        if (pending === 'camera') {
          const perm = await ImagePicker.requestCameraPermissionsAsync();
          if (!perm.granted) { if (!cancelled) nav.showToast('需要相机权限'); return; }
          const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
          if (!cancelled && !res.canceled && res.assets)
            res.assets.forEach((a) => inspoRef.current.add({ uri: a.uri, kind: a.type === 'video' ? 'video' : 'image' }));
        } else {
          const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!perm.granted) { if (!cancelled) nav.showToast('需要相册访问权限'); return; }
          const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], allowsMultipleSelection: true, quality: 0.8 });
          if (!cancelled && !res.canceled && res.assets)
            res.assets.forEach((a) => inspoRef.current.add({ uri: a.uri, kind: a.type === 'video' ? 'video' : 'image' }));
        }
      } catch (e) {
        if (!cancelled) Alert.alert('出错了', String(e && typeof e === 'object' && 'message' in e ? (e as any).message : e));
      } finally { if (!cancelled) setPending(null); }
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

  // ── photos ──
  const fakePhotos = useMemo(() => genPhotos(info, status), [info.name, status, info.totalDays]);

  // convert inspo media into WallPhoto shape
  const inspoPhotos = useMemo<WallPhoto[]>(
    () => inspo.media.map((m, i) => ({ id: m.id, tone: 'ridge', ratio: 1, caption: '', day: 0, user: PEOPLE[0], uri: m.uri, kind: m.kind })),
    [inspo.media]
  );
  const photos = isPlanning ? inspoPhotos : fakePhotos;
  const totalCount = photos.length;

  // companions
  const companions = info.companionList || [];
  const myCount = isPlanning
    ? inspo.media.length
    : photos.filter((p) => p.user.name === PEOPLE[0].name).length;

  // ── masonry ──
  const gap = 7;
  const bodyPad = 16;
  const colW = (width - bodyPad * 2 - gap) / 2;
  const cols: WallPhoto[][] = [[], []];
  const colH = [0, 0];
  photos.forEach((p) => {
    const c = colH[0] <= colH[1] ? 0 : 1;
    cols[c].push(p);
    colH[c] += (p.uri ? colW : colW / p.ratio) + gap;
  });

  // ── progress label ──
  const dayLabel = status === 'ongoing' && info.dayIndex
    ? `记录到 Day ${info.dayIndex}/${info.totalDays} · ${info.dist}`
    : info.dist ? `${info.days || ''} · ${info.dist}` : '';

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: t.bg, transform: [{ translateY }], zIndex: 132 }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}>
        {/* ── hero cover ── */}
        <View {...pan.panHandlers} style={{ height: 252 }}>
          <PhotoTile tone={info.tone} seed={info.name + 'cover'} resWidth={1200} darken style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
            <Press onPress={onClose} style={{
              position: 'absolute', top: insets.top + 10, right: 16,
              width: 34, height: 34, borderRadius: 17,
              backgroundColor: 'rgba(0,0,0,0.32)', alignItems: 'center', justifyContent: 'center',
              borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.22)',
            }}>
              <Icon name="close" color="#fff" size={15} />
            </Press>
            <View style={{ position: 'absolute', left: 18, right: 18, bottom: 12 }}>
              <Text style={{ fontSize: 28, fontWeight: '800', color: '#fff', letterSpacing: -0.6, textShadowColor: 'rgba(0,0,0,0.45)', textShadowRadius: 14, textShadowOffset: { width: 0, height: 2 } }}>
                {info.name}
              </Text>
              {dayLabel ? (
                <Text style={{ fontFamily: MONO, fontSize: 11.5, color: 'rgba(255,255,255,0.78)', marginTop: 8, letterSpacing: 0.3 }}>{dayLabel}</Text>
              ) : null}
            </View>
          </PhotoTile>
        </View>

        {/* ── section header ── */}
        <View style={{ paddingHorizontal: 18, paddingTop: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 22, fontWeight: '800', color: t.text, letterSpacing: -0.5 }}>瞬间</Text>
            <Text style={{ fontSize: 13, color: t.text2, paddingBottom: 3 }}>
              <Text style={{ fontFamily: MONO, fontWeight: '700', color: t.text }}>{totalCount}</Text> 张
            </Text>
          </View>

          {/* companion row */}
          {companions.length > 0 ? (
            <Press onPress={() => nav.openManageCompanions(info)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 }}>
              <AvatarStack people={companions} size={26} max={5} ringColor={t.dark ? '#1c1c1e' : '#fff'} />
              <Text style={{ fontSize: 12.5, color: t.text2 }}>{companions.length} 人同行 ›</Text>
              {myCount > 0 ? (
                <View style={{ marginLeft: 'auto', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 16, backgroundColor: t.accentSoft }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: t.accent }}>我的 {myCount}</Text>
                </View>
              ) : null}
            </Press>
          ) : null}
        </View>

        {/* ── masonry body ── */}
        <View style={{ paddingHorizontal: bodyPad, paddingTop: 18 }}>
          {photos.length === 0 ? (
            <View style={{ alignItems: 'center', paddingTop: 60 }}>
              <Icon name="photo" color={t.text3} size={44} />
              <Text style={{ fontSize: 17, fontWeight: '700', color: t.text, marginTop: 16 }}>还没有瞬间</Text>
              <Text style={{ fontSize: 13.5, color: t.text2, textAlign: 'center', lineHeight: 20, marginTop: 8, paddingHorizontal: 24 }}>
                {isPlanning
                  ? '出发前的装备照、地图、参考图都可以先放进来。'
                  : '点右下角 ＋ 传第一张，照片会按时间汇成共享墙。'}
              </Text>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', gap }}>
              {cols.map((col, ci) => (
                <View key={ci} style={{ flex: 1, gap }}>
                  {col.map((p) => (
                    <View key={p.id} style={{ borderRadius: 12, overflow: 'hidden' }}>
                      {p.uri ? (
                        <View style={{ backgroundColor: t.dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }}>
                          {p.kind === 'video' ? (
                            <View style={{ width: '100%', height: colW, alignItems: 'center', justifyContent: 'center', backgroundColor: t.dark ? '#1c1c1e' : '#2a2a2c' }}>
                              <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' }}>
                                <Icon name="play" color="#fff" size={16} />
                              </View>
                            </View>
                          ) : (
                            <Image source={{ uri: p.uri }} resizeMode="cover" style={{ width: '100%', height: colW }} />
                          )}
                          {isPlanning ? (
                            <Press onPress={() => inspo.remove(p.id)} style={{ position: 'absolute', right: 7, top: 7, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}>
                              <Icon name="close" color="#fff" size={11} />
                            </Press>
                          ) : null}
                        </View>
                      ) : (
                        <PhotoTile tone={p.tone} seed={info.id + p.id} radius={12} style={{ width: '100%', height: colW / p.ratio }}>
                          <View style={{ position: 'absolute', left: 7, bottom: 7, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.42)' }}>
                            <Avatar ini={p.user.ini} tone={p.user.tone} size={18} />
                            <Text style={{ fontSize: 10.5, fontWeight: '600', color: '#fff' }} numberOfLines={1}>{p.user.name}</Text>
                          </View>
                        </PhotoTile>
                      )}
                    </View>
                  ))}
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* ── FAB ── */}
      <Press
        onPress={chooseSource}
        style={[{
          position: 'absolute', right: 20, bottom: insets.bottom + 30,
          width: 58, height: 58, borderRadius: 29, backgroundColor: t.accent,
          alignItems: 'center', justifyContent: 'center',
        }, elevAccent(t.accent)]}
      >
        <Icon name="plus" color="#fff" size={26} strokeWidth={2.4} />
      </Press>
    </Animated.View>
  );
}
