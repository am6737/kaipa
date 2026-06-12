// PhotoWall.tsx — 瞬间 shared wall, faithful port of prototype's shared-wall.jsx.
// Hero cover → section title + companion bar → 2-col masonry with author badges →
// FAB to add. For 计划中 it uses real inspoStore media; ongoing/completed use
// deterministic placeholders attributed to the journey's real companions.
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

const CAPTIONS = [
  '云海在脚下翻涌', '今天的日出值回票价', '垭口风很大，但景色绝了',
  '营地的第一缕光', '一路向上', '高山杜鹃开了', '星空下的帐篷',
  '终于看到主峰', '休息一下，喝口热水', '回望来时的路',
  '雪山在云里露了一下脸', '晨雾散开的那一瞬',
];

interface WallPhoto {
  id: string;
  tone: string;
  ratio: number;
  caption: string;
  day: number;
  author: Companion;
  uri?: string;
  kind?: 'image' | 'video';
}

export function genPhotos(info: Poi, status: string | undefined): WallPhoto[] {
  const roster = info.companionList || [];
  if (roster.length === 0) return [];
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
      author: pick(rng, roster),
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
  const [filter, setFilter] = useState<Companion | null>(null);
  const [compSheet, setCompSheet] = useState(false);
  const [boxIdx, setBoxIdx] = useState(-1);

  const roster = info.companionList || [];
  const self = roster.find((c) => c.self || c.host) || roster[0];

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
  const inspoPhotos = useMemo<WallPhoto[]>(
    () => inspo.media.map((m) => ({ id: m.id, tone: 'ridge', ratio: 1, caption: '', day: 0, author: self || { ini: '我', name: '我', color: '#0A84FF' } as Companion, uri: m.uri, kind: m.kind })),
    [inspo.media, self]
  );
  const allPhotos = isPlanning ? inspoPhotos : fakePhotos;

  // per-person counts
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    allPhotos.forEach((p) => { m[p.author.name] = (m[p.author.name] || 0) + 1; });
    return m;
  }, [allPhotos]);

  const visible = filter ? allPhotos.filter((p) => p.author.name === filter.name) : allPhotos;
  const totalCount = allPhotos.length;
  const myCount = self ? (counts[self.name] || 0) : 0;

  const openCompanionSheet = () => setCompSheet(true);

  // ── masonry ──
  const gap = 7;
  const bodyPad = 16;
  const colW = (width - bodyPad * 2 - gap) / 2;
  const cols: WallPhoto[][] = [[], []];
  const colH = [0, 0];
  visible.forEach((p) => {
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
        {!filter ? (
          <View {...pan.panHandlers} style={{ height: 252 }}>
            <PhotoTile tone={info.tone} seed={info.name + 'cover'} resWidth={1200} darken style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
              <Press onPress={onClose} style={{
                position: 'absolute', top: insets.top + 10, left: 16,
                width: 40, height: 40, borderRadius: 20,
                backgroundColor: t.dark ? '#2C2C2E' : '#fff', alignItems: 'center', justifyContent: 'center',
                shadowColor: '#000', shadowOpacity: t.dark ? 0.5 : 0.14, shadowRadius: 10,
                shadowOffset: { width: 0, height: 2 }, elevation: 4,
                borderWidth: t.dark ? StyleSheet.hairlineWidth : 0, borderColor: 'rgba(255,255,255,0.06)',
              }}>
                <Icon name="arrowL" color={t.text} size={21} />
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
        ) : (
          // ── filter mode header ──
          <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 18, paddingBottom: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
              <Press onPress={() => setFilter(null)} style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: t.dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)' }}>
                <Icon name="chevronL" color={t.text2} size={16} />
              </Press>
              <Avatar ini={filter.ini} color={filter.color} tone={filter.tone} size={38} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ fontSize: 21, fontWeight: '800', color: t.text, letterSpacing: -0.4 }}>{filter.self ? '我的瞬间' : filter.name}</Text>
                  {filter.host ? <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: t.accentSoft }}><Text style={{ fontSize: 9.5, fontWeight: '700', color: t.accent }}>发起人</Text></View> : null}
                </View>
                <Text style={{ fontSize: 12.5, color: t.text2, marginTop: 2 }}>{visible.length} 张</Text>
              </View>
            </View>
          </View>
        )}

        {/* ── section header (hidden in filter mode) ── */}
        {!filter ? (
          <View style={{ paddingHorizontal: 18, paddingTop: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 22, fontWeight: '800', color: t.text, letterSpacing: -0.5 }}>瞬间</Text>
              <Text style={{ fontSize: 13, color: t.text2, paddingBottom: 3 }}>
                <Text style={{ fontFamily: MONO, fontWeight: '700', color: t.text }}>{totalCount}</Text> 张
              </Text>
            </View>

            {roster.length > 0 ? (
              <Press onPress={openCompanionSheet} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 }}>
                <AvatarStack people={roster} size={26} max={5} ringColor={t.dark ? '#1c1c1e' : '#fff'} />
                <Text style={{ fontSize: 12.5, color: t.text2 }}>{roster.length} 人同行 ›</Text>
                {myCount > 0 ? (
                  <Press onPress={() => self && setFilter(self)} style={{ marginLeft: 'auto', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 16, backgroundColor: t.accentSoft }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: t.accent }}>我的 {myCount}</Text>
                  </Press>
                ) : null}
              </Press>
            ) : null}
          </View>
        ) : null}

        {/* ── masonry body ── */}
        <View style={{ paddingHorizontal: bodyPad, paddingTop: 18 }}>
          {visible.length === 0 ? (
            <View style={{ alignItems: 'center', paddingTop: 60 }}>
              <Icon name="photo" color={t.text3} size={44} />
              <Text style={{ fontSize: 17, fontWeight: '700', color: t.text, marginTop: 16 }}>
                {filter ? 'TA 还没传照片' : '还没有瞬间'}
              </Text>
              <Text style={{ fontSize: 13.5, color: t.text2, textAlign: 'center', lineHeight: 20, marginTop: 8, paddingHorizontal: 24 }}>
                {filter
                  ? '换个同行看看，或等这趟旅程有新瞬间。'
                  : isPlanning
                    ? '出发前的装备照、地图、参考图都可以先放进来。'
                    : '点右下角 ＋ 传第一张，照片会按时间汇成共享墙。'}
              </Text>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', gap }}>
              {cols.map((col, ci) => (
                <View key={ci} style={{ flex: 1, gap }}>
                  {col.map((p) => (
                    <Press key={p.id} onPress={() => setBoxIdx(visible.indexOf(p))}>
                      <View style={{ borderRadius: 12, overflow: 'hidden' }}>
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
                            {!filter ? (
                              <View style={{ position: 'absolute', left: 7, bottom: 7, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.42)' }}>
                                <Avatar ini={p.author.ini} color={p.author.color} tone={p.author.tone} size={18} />
                                <Text style={{ fontSize: 10.5, fontWeight: '600', color: '#fff' }} numberOfLines={1}>{p.author.name}</Text>
                              </View>
                            ) : null}
                          </PhotoTile>
                        )}
                      </View>
                    </Press>
                  ))}
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* ── FAB (hidden in filter mode) ── */}
      {!filter ? (
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
      ) : null}

      {/* ── Lightbox ── */}
      {boxIdx >= 0 && visible[boxIdx] ? (() => {
        const photo = visible[boxIdx];
        const go = (d: number) => { const n = boxIdx + d; if (n >= 0 && n < visible.length) setBoxIdx(n); };
        return (
          <View style={[StyleSheet.absoluteFill, { zIndex: 150, backgroundColor: '#000' }]}>
            {/* photo */}
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              {photo.uri ? (
                <Image source={{ uri: photo.uri }} resizeMode="contain" style={{ width: '100%', height: '100%' }} />
              ) : (
                <PhotoTile tone={photo.tone} seed={info.id + photo.id} resWidth={1200} style={{ width: '100%', aspectRatio: Math.max(0.66, photo.ratio) }} />
              )}
            </View>

            {/* prev / next tap zones */}
            {boxIdx > 0 ? <Press onPress={() => go(-1)} style={{ position: 'absolute', left: 0, top: 90, bottom: 160, width: '34%' }}><View /></Press> : null}
            {boxIdx < visible.length - 1 ? <Press onPress={() => go(1)} style={{ position: 'absolute', right: 0, top: 90, bottom: 160, width: '34%' }}><View /></Press> : null}

            {/* top bar */}
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, paddingTop: insets.top + 10, paddingHorizontal: 16, paddingBottom: 26, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Press onPress={() => setBoxIdx(-1)} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="close" color="#fff" size={15} />
              </Press>
              <Text style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: '600', color: '#fff', letterSpacing: 0.5 }}>{boxIdx + 1} / {visible.length}</Text>
              <Press onPress={() => nav.showToast('已保存')} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="share" color="#fff" size={16} />
              </Press>
            </View>

            {/* bottom info */}
            <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 18, paddingTop: 40, paddingBottom: insets.bottom + 20 }}>
              {photo.caption ? <Text style={{ fontSize: 16.5, fontWeight: '600', color: '#fff', lineHeight: 22, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 6 }}>{photo.caption}</Text> : null}
              {photo.day ? <Text style={{ fontFamily: MONO, fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 7, letterSpacing: 0.4 }}>Day {photo.day}</Text> : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 16 }}>
                <Avatar ini={photo.author.ini} color={photo.author.color} tone={photo.author.tone} size={28} />
                <Text style={{ fontSize: 13.5, fontWeight: '600', color: '#fff' }}>{photo.author.name}{photo.author.host ? ' · 发起人' : ''}</Text>
              </View>
            </View>
          </View>
        );
      })() : null}

      {/* ── Companions bottom sheet ── */}
      {compSheet && !filter ? (
        <View style={[StyleSheet.absoluteFill, { zIndex: 140 }]}>
          <Press onPress={() => setCompSheet(false)} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)' }]}><View /></Press>
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: t.dark ? '#1c1c1e' : t.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingBottom: insets.bottom + 20, shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 50, shadowOffset: { width: 0, height: -16 }, elevation: 16 }}>
            <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 14 }}>
              <View style={{ width: 38, height: 5, borderRadius: 3, backgroundColor: t.text3 }} />
            </View>
            <Text style={{ fontSize: 21, fontWeight: '800', color: t.text, paddingHorizontal: 18, marginBottom: 4 }}>同行的人</Text>
            <Text style={{ fontSize: 12.5, color: t.text2, paddingHorizontal: 18, marginBottom: 14 }}>{roster.length} 人在这段旅程里</Text>
            <View style={{ marginHorizontal: 18, borderRadius: 16, overflow: 'hidden', backgroundColor: t.dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)', borderWidth: StyleSheet.hairlineWidth, borderColor: t.hairline }}>
              {roster.map((c, i) => {
                const n = counts[c.name] || 0;
                return (
                  <View key={i}>
                    <Press
                      onPress={n > 0 ? () => setFilter(c) : undefined}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, opacity: n > 0 ? 1 : 0.55 }}
                    >
                      <Avatar ini={c.ini} color={c.color} tone={c.tone} size={42} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                          <Text style={{ fontSize: 15, fontWeight: '600', color: t.text }}>{c.name}</Text>
                          {c.host ? <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: t.accentSoft }}><Text style={{ fontSize: 9.5, fontWeight: '700', color: t.accent }}>发起人</Text></View> : null}
                          {c.self ? <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: t.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }}><Text style={{ fontSize: 9.5, fontWeight: '700', color: t.text2 }}>你</Text></View> : null}
                        </View>
                        <Text style={{ fontSize: 12, color: t.text2, marginTop: 2 }}>
                          {n > 0 ? <><Text style={{ fontFamily: MONO, fontWeight: '700' }}>{n}</Text> 个瞬间</> : '还没有照片'}
                        </Text>
                      </View>
                      {n > 0 ? <Icon name="chevronR" color={t.text3} size={15} /> : null}
                    </Press>
                    {i < roster.length - 1 ? <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.hairline, marginLeft: 68 }} /> : null}
                  </View>
                );
              })}
            </View>
          </View>
        </View>
      ) : null}
    </Animated.View>
  );
}
