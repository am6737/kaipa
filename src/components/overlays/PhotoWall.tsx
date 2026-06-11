// PhotoWall.tsx — masonry of journey "moments" (deterministic gradient photos).
import React, { useMemo } from 'react';
import { View, Text, useWindowDimensions } from 'react-native';
import { Theme } from '../../theme/theme';
import { MONO } from '../../theme/fonts';
import { Poi } from '../../data/pois';
import { TONES, hashStr, mulberry32, pick } from '../../data/tones';
import { PhotoTile } from '../PhotoTile';
import { FullOverlay } from './FullOverlay';
import { useNav } from '../../nav/NavContext';

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
  const photos = useMemo<Photo[]>(() => {
    const rng = mulberry32(hashStr(info.name + (status || '')));
    const total = status === 'ongoing' ? 12 : status === 'planning' ? 0 : 24;
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
  }, [info.name, status, info.totalDays]);

  const gap = 7;
  const colW = (width - 16 * 2 - gap) / 2;
  const cols: Photo[][] = [[], []];
  const heights = [0, 0];
  photos.forEach((p) => {
    const c = heights[0] <= heights[1] ? 0 : 1;
    cols[c].push(p);
    heights[c] += colW / p.ratio + gap + 0;
  });

  return (
    <FullOverlay theme={theme} title="瞬间" subtitle={`${info.name} · ${photos.length} 张`} onClose={onClose} zIndex={132}>
      {photos.length === 0 ? (
        <View style={{ padding: 40, alignItems: 'center' }}>
          <Text style={{ color: theme.text2, fontSize: 13.5 }}>计划中的旅程还没有照片</Text>
        </View>
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
