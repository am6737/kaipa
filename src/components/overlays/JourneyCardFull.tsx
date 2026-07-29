import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Animated, StyleSheet, ScrollView, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme } from '../../theme/theme';
import { Poi } from '../../data/pois';
import { SERIF } from '../../theme/fonts';
import { Icon } from '../Icon';
import { Press } from '../Press';
import { PhotoTile } from '../PhotoTile';
import { useNav } from '../../nav/NavContext';
import { useData } from '../../data/DataContext';
import { genPhotos } from './PhotoWall';
import { useInspo } from '../../hooks/useInspo';
import { useI18n } from '../../i18n';
import { Segmented } from '../Segmented';

type SegId = 'moments' | 'route' | 'plan';

function StatBlock({ value, label, onPress }: { value: string; label: string; onPress?: () => void }) {
  const inner = (
    <View style={{ alignItems: 'center' }}>
      <Text style={{ fontSize: 20, fontWeight: '700', fontStyle: 'italic', color: '#fff' }}>{value}</Text>
      <Text style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.6)', marginTop: 3, letterSpacing: 0.3 }}>{label}</Text>
    </View>
  );
  if (onPress) {
    return (
      <Press onPress={onPress} style={{ flex: 1, alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          {inner}
          <Icon name="chevronR" color="rgba(255,255,255,0.5)" size={13} />
        </View>
      </Press>
    );
  }
  return <View style={{ flex: 1, alignItems: 'center' }}>{inner}</View>;
}

function EmptyHint({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <View style={{ paddingVertical: 44, alignItems: 'center', gap: 10 }}>
      {icon}
      <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13.5 }}>{label}</Text>
    </View>
  );
}

function PillButton({ icon, label, onPress }: { icon: React.ReactNode; label: string; onPress?: () => void }) {
  return (
    <Press
      onPress={onPress}
      style={{
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        height: 50,
        borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.12)',
      }}
    >
      {icon}
      <Text style={{ fontSize: 15, fontWeight: '600', color: '#fff' }}>{label}</Text>
    </Press>
  );
}

export function JourneyCardFull({ theme, poi, onClose }: { theme: Theme; poi: Poi; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const nav = useNav();
  const { t } = useI18n();
  const { userId } = useData();
  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(slide, { toValue: 1, useNativeDriver: true, bounciness: 2, speed: 14 }).start();
  }, [slide]);

  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [height, 0] });

  const isJourney = poi.kind === 'journey';

  const inspo = useInspo(poi.id, userId);
  const wallPhotos = useMemo(
    () => isJourney ? genPhotos(poi) : [],
    [isJourney, poi.name, poi.photoUris, poi.tone],
  );
  const inspoAsWall = useMemo(
    () => inspo.media.map(m => ({ id: m.id, uri: m.uri, kind: m.kind, thumbnail: m.thumbnail, tone: poi.tone || 'ridge', ratio: 1 })),
    [inspo.media, poi.tone],
  );
  const allPhotos = [...wallPhotos, ...inspoAsWall];

  const momentCount = allPhotos.length;
  const peopleCount = poi.companions ?? 0;

  const dateDisplay = poi.date || '—';

  // Passive content views become segments — actions (share) and light info
  // (companions) stay in the head. All three always show; empty ones get a hint.
    const hasTrack = (poi.trackCoords?.length ?? 0) >= 2;
  const segOptions = useMemo<{ id: SegId; label: string }[]>(() => {
    const moments = { id: 'moments' as SegId, label: t('journey.tab.moments') };
    if (!isJourney) return [moments];
    return [
      moments,
      { id: 'route' as SegId, label: t('journey.tab.route') },
      { id: 'plan' as SegId, label: t('journey.tab.plan') },
    ];
  }, [isJourney, t]);
  const [seg, setSeg] = useState<SegId>('moments');

  const heroH = height * 0.48;
  const colW = (width - 16 * 2 - 6 * 2) / 3;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#000', transform: [{ translateY }], zIndex: 140 }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        bounces
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      >
        {/* hero image */}
        <View style={{ height: heroH, overflow: 'hidden' }}>
          {poi.photoUris?.[0] ? (
            <Image source={{ uri: poi.photoUris[0] }} contentFit="cover" style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: '#2c2c2e' }]} />
          )}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.4)', 'rgba(0,0,0,0.85)']}
            locations={[0.3, 0.65, 1]}
            style={StyleSheet.absoluteFill}
          />

          {/* title on hero */}
          <View style={{ position: 'absolute', bottom: 24, left: 0, right: 0, alignItems: 'center', paddingHorizontal: 32 }}>
            <Text
              style={{
                fontFamily: SERIF,
                fontSize: 30,
                fontWeight: '400',
                color: '#fff',
                textAlign: 'center',
                lineHeight: 38,
              }}
              numberOfLines={2}
            >
              {poi.name}
            </Text>
          </View>
        </View>

        {/* stats strip */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 20, paddingHorizontal: 16 }}>
          <StatBlock value={String(momentCount)} label={t('journey.stat.moments')} />
          <StatBlock value={dateDisplay} label={t('journey.stat.date')} />
          <StatBlock
            value={String(peopleCount)}
            label={t('journey.stat.people')}
            onPress={isJourney ? () => nav.openManageCompanions(poi) : undefined}
          />
        </View>

        {/* action buttons */}
        <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginBottom: 24 }}>
          {isJourney && (
            <PillButton
              icon={<Icon name="share" color="#fff" size={18} />}
              label={t('journey.action.live')}
              onPress={() => nav.openLiveShare(poi)}
            />
          )}
          <PillButton
            icon={<Icon name="send" color="#fff" size={18} />}
            label={t('journey.action.add')}
            onPress={() => nav.openSharePanel(poi)}
          />
          <PillButton
            icon={<Icon name="download" color="#fff" size={18} />}
            label={t('journey.action.save')}
            onPress={() => nav.openPhotoWall({ info: poi, mode: 'mine' })}
          />
        </View>

        {/* content switcher — passive views only */}
        {segOptions.length > 1 ? (
          <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
            <Segmented variant="glass" value={seg} options={segOptions} onChange={(v) => setSeg(v)} />
          </View>
        ) : null}

        {/* moments */}
        {seg === 'moments' ? (
          allPhotos.length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 16 }}>
              {allPhotos.map((p, i) => {
                const displayUri = (p as any).kind === 'video' ? ((p as any).thumbnail || (p as any).uri) : (p as any).uri;
                return (
                  <Press
                    key={(p as any).id || `p-${i}`}
                    onPress={() => nav.openPhotoWall({ info: poi, mode: 'mine' })}
                    style={{ width: colW }}
                  >
                    <View style={{ aspectRatio: 1, borderRadius: 12, overflow: 'hidden', backgroundColor: '#1a1a1a' }}>
                      {displayUri ? (
                        <Image source={{ uri: displayUri }} contentFit="cover" style={{ width: '100%', height: '100%' }} />
                      ) : (
                        <PhotoTile tone={(p as any).tone} seed={poi.id + (p as any).id} radius={12} style={{ width: '100%', height: '100%' }} resWidth={420} />
                      )}
                      {(p as any).kind === 'video' ? (
                        <View style={{ position: 'absolute', right: 5, top: 5, flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4, backgroundColor: 'rgba(0,0,0,0.5)' }}>
                          <Icon name="play" color="#fff" size={7} />
                        </View>
                      ) : null}
                    </View>
                  </Press>
                );
              })}
            </View>
          ) : (
            <EmptyHint icon={<Icon name="photo" color="rgba(255,255,255,0.4)" size={26} />} label={t('journey.tab.momentsEmpty')} />
          )
        ) : null}

        {/* route — opens the full elevation/track overlay, or empty hint */}
        {seg === 'route' ? (
          hasTrack ? (
            <Press
              onPress={() => nav.openElevation({ info: poi, isMine: true })}
              style={{ marginHorizontal: 16, borderRadius: 16, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.06)' }}
            >
              <View style={{ paddingVertical: 36, alignItems: 'center', gap: 10 }}>
                <Icon name="route" color="#fff" size={26} />
                <Text style={{ color: '#fff', fontSize: 14.5, fontWeight: '600' }}>{t('journey.tab.routeView')}</Text>
                <Icon name="chevronR" color="rgba(255,255,255,0.4)" size={14} />
              </View>
            </Press>
          ) : (
            <EmptyHint icon={<Icon name="route" color="rgba(255,255,255,0.4)" size={26} />} label={t('journey.tab.routeEmpty')} />
          )
        ) : null}

        {/* plan (itinerary) — placeholder until wired */}
        {seg === 'plan' ? (
          <EmptyHint icon={<Icon name="calendar" color="rgba(255,255,255,0.4)" size={26} />} label={t('journey.tab.planEmpty')} />
        ) : null}
      </ScrollView>

      {/* back button */}
      <Press
        onPress={onClose}
        style={{
          position: 'absolute',
          top: insets.top + 6,
          left: 14,
          width: 40,
          height: 40,
          borderRadius: 20,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(0,0,0,0.3)',
        }}
      >
        <Icon name="chevronL" color="#fff" size={20} />
      </Press>

      {/* settings button */}
      {isJourney && (
        <Press
          onPress={() => nav.openJourneySettings(poi)}
          style={{
            position: 'absolute',
            top: insets.top + 6,
            right: 14,
            width: 40,
            height: 40,
            borderRadius: 20,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0,0,0,0.3)',
          }}
        >
          <Icon name="gearSettings" color="#fff" size={19} />
        </Press>
      )}
    </Animated.View>
  );
}
