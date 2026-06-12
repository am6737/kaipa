// PhotoWall.tsx — full-screen 瞬间 / 用户照片 detail view, faithful to the
// prototype's photo-wall.jsx layout: left-aligned large title, accent "+" button
// + shadow close button on the right, 2-column masonry body. For 计划中 journeys
// it reads real picked media from inspoStore; for ongoing/completed it shows
// deterministic placeholder photos.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Image, Alert, ScrollView, Animated, PanResponder, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Theme } from '../../theme/theme';
import { MONO } from '../../theme/fonts';
import { Poi } from '../../data/pois';
import { TONES, hashStr, mulberry32, pick } from '../../data/tones';
import { PhotoTile } from '../PhotoTile';
import { Icon } from '../Icon';
import { Press } from '../Press';
import { useNav } from '../../nav/NavContext';
import { useInspo } from '../../data/inspoStore';

const CAPTIONS = [
  '云海在脚下翻涌', '今天的日出值回票价', '垭口风很大，但景色绝了',
  '营地的第一缕光', '一路向上', '高山杜鹃开了', '星空下的帐篷',
  '终于看到主峰', '休息一下，喝口热水', '回望来时的路',
];

interface Photo {
  id: string;
  tone: string;
  ratio: number;
  caption: string;
  day: number;
}

export function PhotoWall({ theme, info, status, onClose }: { theme: Theme; info: Poi; status?: string; onClose: () => void }) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const nav = useNav();
  const t = theme;
  const isPlanning = status === 'planning';
  const isJourney = info.kind === 'journey';
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

  // ── placeholder photos for ongoing/completed ──
  const fakePhotos = useMemo<Photo[]>(() => {
    if (isPlanning) return [];
    const rng = mulberry32(hashStr(info.name + (status || '')));
    const total = status === 'ongoing' ? 12 : 24;
    const ratios = [0.72, 0.75, 0.8, 1, 1, 1.34, 1.5];
    const days = info.totalDays || 3;
    const out: Photo[] = [];
    for (let i = 0; i < total; i++) {
      out.push({ id: 'p' + i, tone: pick(rng, TONES), ratio: pick(rng, ratios), caption: pick(rng, CAPTIONS), day: 1 + Math.floor(rng() * days) });
    }
    return out;
  }, [info.name, status, info.totalDays, isPlanning]);

  // ── masonry layout for placeholder photos ──
  const gap = 7;
  const bodyPad = 16;
  const colW = (width - bodyPad * 2 - gap) / 2;
  const cols: Photo[][] = [[], []];
  const colH = [0, 0];
  fakePhotos.forEach((p) => {
    const c = colH[0] <= colH[1] ? 0 : 1;
    cols[c].push(p);
    colH[c] += colW / p.ratio + gap;
  });

  // ── masonry for inspo media (all square for real photos) ──
  const inspoCols: typeof inspo.media[] = [[], []];
  const inspoH = [0, 0];
  inspo.media.forEach((m) => {
    const c = inspoH[0] <= inspoH[1] ? 0 : 1;
    inspoCols[c].push(m);
    inspoH[c] += colW + gap;
  });

  const totalCount = isPlanning ? inspo.media.length : fakePhotos.length;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: t.bg, transform: [{ translateY }], zIndex: 132 }]}>
      {/* ── header (drag to dismiss) ── */}
      <View {...pan.panHandlers} style={{ paddingTop: insets.top + 12, paddingBottom: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: t.hairline }}>
        <View style={{ alignItems: 'center', paddingBottom: 12 }}>
          <View style={{ width: 38, height: 5, borderRadius: 3, backgroundColor: t.text3 }} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 18, paddingBottom: 14 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 24, fontWeight: '800', color: t.text, letterSpacing: -0.6 }}>
              {isJourney ? '瞬间' : '用户照片'}
            </Text>
            <Text style={{ fontSize: 13, color: t.text2, marginTop: 3 }}>
              {info.name} · {totalCount} 张
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, flexShrink: 0, marginTop: 2 }}>
            {isJourney && (
              <Press
                onPress={chooseSource}
                style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: t.accent }}
              >
                <Icon name="plus" color="#fff" size={15} strokeWidth={2.2} />
              </Press>
            )}
            <Press
              onPress={onClose}
              style={{
                width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
                backgroundColor: t.dark ? '#2C2C2E' : '#fff',
                shadowColor: '#000', shadowOpacity: t.dark ? 0.5 : 0.14, shadowRadius: 10,
                shadowOffset: { width: 0, height: 2 }, elevation: 4,
                borderWidth: t.dark ? StyleSheet.hairlineWidth : 0, borderColor: 'rgba(255,255,255,0.06)',
              }}
            >
              <Icon name="close" color={t.text} size={14} />
            </Press>
          </View>
        </View>
      </View>

      {/* ── scroll body ── */}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: bodyPad, paddingTop: 14, paddingBottom: insets.bottom + 30 }}>
        {isPlanning ? (
          inspo.media.length === 0 ? (
            <View style={{ alignItems: 'center', paddingTop: 80 }}>
              <Icon name="photo" color={t.text3} size={44} />
              <Text style={{ fontSize: 17, fontWeight: '700', color: t.text, marginTop: 16 }}>还没有瞬间</Text>
              <Text style={{ fontSize: 13.5, color: t.text2, textAlign: 'center', lineHeight: 20, marginTop: 8, paddingHorizontal: 24 }}>
                出发前的装备照、地图、参考图都可以先放进来。
              </Text>
              <Press
                onPress={chooseSource}
                style={{ marginTop: 20, paddingHorizontal: 20, height: 40, borderRadius: 20, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ color: '#fff', fontSize: 14.5, fontWeight: '700' }}>添加瞬间</Text>
              </Press>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', gap }}>
              {inspoCols.map((col, ci) => (
                <View key={ci} style={{ flex: 1, gap }}>
                  {col.map((m) => (
                    <View key={m.id} style={{ borderRadius: 12, overflow: 'hidden', backgroundColor: t.dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }}>
                      {m.kind === 'video' ? (
                        <View style={{ width: '100%', height: colW, alignItems: 'center', justifyContent: 'center', backgroundColor: t.dark ? '#1c1c1e' : '#2a2a2c' }}>
                          <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' }}>
                            <Icon name="play" color="#fff" size={16} />
                          </View>
                        </View>
                      ) : (
                        <Image source={{ uri: m.uri }} resizeMode="cover" style={{ width: '100%', height: colW }} />
                      )}
                      {m.kind === 'video' ? (
                        <View style={{ position: 'absolute', left: 7, bottom: 7, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.5)' }}>
                          <Text style={{ fontSize: 9.5, fontWeight: '700', color: '#fff' }}>视频</Text>
                        </View>
                      ) : null}
                      <Press onPress={() => inspo.remove(m.id)} style={{ position: 'absolute', right: 7, top: 7, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}>
                        <Icon name="close" color="#fff" size={11} />
                      </Press>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          )
        ) : (
          <View style={{ flexDirection: 'row', gap }}>
            {cols.map((col, ci) => (
              <View key={ci} style={{ flex: 1, gap }}>
                {col.map((p) => (
                  <PhotoTile key={p.id} tone={p.tone} seed={info.id + p.id} radius={12} style={{ width: '100%', height: colW / p.ratio }}>
                    <View style={{ position: 'absolute', left: 8, right: 8, bottom: 8 }}>
                      <Text style={{ color: '#fff', fontSize: 12.5, fontWeight: '600', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4 }} numberOfLines={2}>
                        {p.caption}
                      </Text>
                      <Text style={{ color: 'rgba(255,255,255,0.7)', fontFamily: MONO, fontSize: 10, marginTop: 2 }}>Day {p.day}</Text>
                    </View>
                  </PhotoTile>
                ))}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </Animated.View>
  );
}
