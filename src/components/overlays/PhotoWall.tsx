// PhotoWall.tsx — full-screen 瞬间 detail view. For ongoing/completed journeys
// it shows deterministic placeholder photos; for 计划中 journeys it reads real
// picked media from inspoStore and lets the user add more via expo-image-picker.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Image, Alert, useWindowDimensions, StyleSheet } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Theme } from '../../theme/theme';
import { MONO } from '../../theme/fonts';
import { Poi } from '../../data/pois';
import { TONES, hashStr, mulberry32, pick } from '../../data/tones';
import { PhotoTile } from '../PhotoTile';
import { FullOverlay } from './FullOverlay';
import { Icon } from '../Icon';
import { Press } from '../Press';
import { useNav } from '../../nav/NavContext';
import { useInspo, InspoMedia } from '../../data/inspoStore';

const CAPTIONS = [
  '云海在脚下翻涌',
  '今天的日出值回票价',
  '垭口风很大，但景色绝了',
  '营地的第一缕光',
  '一路向上',
  '高山杜鹃开了',
  '星空下的帐篷',
  '终于看到主峰',
  '休息一下，喝口热水',
  '回望来时的路',
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
  const nav = useNav();
  const isPlanning = status === 'planning';
  const inspo = useInspo(info.id);
  const inspoRef = useRef(inspo);
  inspoRef.current = inspo;
  const [pending, setPending] = useState<'camera' | 'library' | null>(null);

  // picker effect (same pattern as PlanningMoments)
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

  // placeholder photos for ongoing/completed
  const fakePhotos = useMemo<Photo[]>(() => {
    if (isPlanning) return [];
    const rng = mulberry32(hashStr(info.name + (status || '')));
    const total = status === 'ongoing' ? 12 : 24;
    const ratios = [0.72, 0.75, 0.8, 1, 1, 1.34, 1.5];
    const days = info.totalDays || 3;
    const out: Photo[] = [];
    for (let i = 0; i < total; i++) {
      out.push({
        id: 'p' + i,
        tone: pick(rng, TONES),
        ratio: pick(rng, ratios),
        caption: pick(rng, CAPTIONS),
        day: 1 + Math.floor(rng() * days),
      });
    }
    return out;
  }, [info.name, status, info.totalDays, isPlanning]);

  const gap = 7;
  const colW = (width - 16 * 2 - gap) / 2;

  // masonry for fake photos
  const cols: Photo[][] = [[], []];
  const heights = [0, 0];
  fakePhotos.forEach((p) => {
    const c = heights[0] <= heights[1] ? 0 : 1;
    cols[c].push(p);
    heights[c] += colW / p.ratio + gap;
  });

  const totalCount = isPlanning ? inspo.media.length : fakePhotos.length;
  const isJourney = info.kind === 'journey';

  const addButton = isPlanning ? (
    <Press
      onPress={chooseSource}
      style={{
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.accent,
      }}
    >
      <Icon name="plus" color="#fff" size={15} strokeWidth={2.2} />
    </Press>
  ) : null;

  return (
    <FullOverlay
      theme={theme}
      title={isJourney ? '瞬间' : '用户照片'}
      subtitle={`${info.name} · ${totalCount} 张`}
      onClose={onClose}
      rightAction={addButton}
      zIndex={132}
    >
      {isPlanning ? (
        inspo.media.length === 0 ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, paddingTop: 80 }}>
            <Icon name="photo" color={theme.text3} size={44} />
            <Text style={{ fontSize: 17, fontWeight: '700', color: theme.text, marginTop: 16 }}>还没有瞬间</Text>
            <Text style={{ fontSize: 13.5, color: theme.text2, textAlign: 'center', lineHeight: 20, marginTop: 8 }}>
              出发前的装备照、地图、参考图都可以先放进来。
            </Text>
            <Press
              onPress={chooseSource}
              style={{
                marginTop: 20,
                paddingHorizontal: 20,
                height: 40,
                borderRadius: 20,
                backgroundColor: theme.accent,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: '#fff', fontSize: 14.5, fontWeight: '700' }}>添加瞬间</Text>
            </Press>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, paddingHorizontal: 16, paddingTop: 14 }}>
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
                  <Image source={{ uri: m.uri }} resizeMode="cover" style={StyleSheet.absoluteFill} />
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
          </View>
        )
      ) : (
        <View style={{ flexDirection: 'row', gap, paddingHorizontal: 16, paddingTop: 14 }}>
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
    </FullOverlay>
  );
}
