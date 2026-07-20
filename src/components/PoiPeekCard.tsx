// PoiPeekCard.tsx — the compact "peek" shown in the discover sheet when a map
// pin is tapped. A single full-bleed cover photo: name + key stats are overlaid
// at the bottom over the gradient; tapping it opens the split detail (map on
// top, details below). Routes and journeys share one layout.
import React, { useMemo, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView, BlurTargetView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MONO } from '../theme/fonts';
import { Theme } from '../theme/theme';
import { Poi, STATUS_COLOR, JourneyStatus } from '../data/pois';
import { buildElevation } from '../data/elevation';
import { PhotoTile } from './PhotoTile';
import { Icon } from './Icon';
import { Press } from './Press';
import { useI18n, TKey } from '../i18n';
import { useNav } from '../nav/NavContext';

export function PoiPeekCard({ theme, poi, onPress }: { theme: Theme; poi: Poi; onPress: () => void }) {
  const { t } = useI18n();
  const nav = useNav();
  const insets = useSafeAreaInsets();
  const cardBottomGap = 14;
  const isJourney = poi.kind === 'journey';
  const status = (poi.status || 'completed') as JourneyStatus;
  const cover = poi.photoUris?.[0];
  const blurTargetRef = useRef<View | null>(null);
  // labeled key stats under the title — distance, total ascent, max elevation,
  // and days (journeys) / difficulty (routes). Each value carries its own label
  // so its meaning is clear (vs. a single dot-separated line).
  const maxEle = useMemo(() => buildElevation(poi).maxEle, [poi.id, poi.dist, poi.asc, poi.trackElevation]);
  const stats = [
    { value: poi.dist, label: t('journey.stat.distance') },
    { value: poi.asc, label: t('journey.stat.ascent') },
    { value: `${Math.round(maxEle).toLocaleString('en-US')} m`, label: t('journey.stat.elevation') },
    isJourney
      ? { value: poi.days, label: t('journey.stat.days') }
      : { value: poi.diff ? t(`common.diff.${poi.diff}` as TKey) : '', label: t('journey.stat.difficulty') },
  ].filter((s) => s.value);
  const stop = (e: any) => e?.stopPropagation?.();
  const share = (e: any) => {
    stop(e);
    nav.openSharePanel(poi);
  };
  const startOrPlan = (e: any) => {
    stop(e);
    if (isJourney && status === 'planning') {
      nav.openDetail(poi);
    } else {
      nav.openNewJourney(poi);
      if (!isJourney) nav.showToast(t('journey.toast.startPlanning'));
    }
  };
  const ctaLabel = isJourney && status === 'planning' ? t('journey.cta.depart') : isJourney ? t('journey.cta.departAgain') : '规划';

  return (
    <Press onPress={onPress} style={{ flex: 1, paddingHorizontal: 14, paddingBottom: cardBottomGap, justifyContent: 'flex-end' }}>
      {/* floating preview card */}
      <View style={{ height: 270, borderRadius: 28, overflow: 'hidden', backgroundColor: theme.dark ? '#111' : '#ddd' }}>
        <BlurTargetView ref={blurTargetRef} style={StyleSheet.absoluteFill}>
          {cover ? (
            <Image source={{ uri: cover }} contentFit="cover" style={StyleSheet.absoluteFill} />
          ) : (
            <PhotoTile tone={poi.tone} seed={poi.id} style={StyleSheet.absoluteFill} resWidth={900} />
          )}
          <LinearGradient
            colors={['rgba(0,0,0,0.22)', 'transparent', 'rgba(0,0,0,0.28)']}
            locations={[0, 0.48, 1]}
            style={StyleSheet.absoluteFill}
          />
        </BlurTargetView>

        <Press onPress={share} style={{ position: 'absolute', top: 12, right: 14, width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(0,0,0,0.38)', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="share" color="#fff" size={18} />
        </Press>

        {/* bottom glass panel: blurred image continuation with route info */}
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 88, overflow: 'hidden' }}>
          <BlurView blurTarget={blurTargetRef} blurMethod="dimezisBlurView" blurReductionFactor={1.5} intensity={88} tint="dark" style={StyleSheet.absoluteFill} />
          <LinearGradient
            colors={['rgba(0,0,0,0.10)', 'rgba(0,0,0,0.46)']}
            style={StyleSheet.absoluteFill}
          />
          <View style={{ paddingHorizontal: 18, paddingTop: 10, paddingBottom: 0 }}>
            <Text numberOfLines={2} style={{ color: '#fff', fontSize: 20, lineHeight: 24, fontWeight: '800', letterSpacing: 0.1 }}>
              {poi.name}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginTop: 5 }}>
              <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center' }}>
                {stats.map((s, i) => (
                  <View key={i} style={{ flex: 1, minWidth: 0, paddingRight: i < stats.length - 1 ? 8 : 0 }}>
                    <Text numberOfLines={1} style={{ fontFamily: MONO, color: '#fff', fontSize: 13.5, fontWeight: '800' }}>
                      {s.value}
                    </Text>
                    <Text numberOfLines={1} style={{ color: 'rgba(255,255,255,0.56)', fontSize: 9.5, marginTop: 1 }}>
                      {s.label}
                    </Text>
                  </View>
                ))}
              </View>
              <Press onPress={startOrPlan} style={{ height: 32, paddingHorizontal: 16, borderRadius: 18, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#111', fontSize: 13.5, fontWeight: '800' }}>{ctaLabel}</Text>
              </Press>
            </View>
          </View>
        </View>
      </View>
    </Press>
  );
}
