import React, { useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Animated, PanResponder, Pressable, Platform, Share } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import ViewShot, { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { Theme } from '../../theme/theme';
import { Poi } from '../../data/pois';
import { paletteFor } from '../../data/tones';
import { MONO } from '../../theme/fonts';
import { createMediaLibraryAsset, requestMediaLibraryPermissions } from '../../lib/mediaLibrary';
import { Icon } from '../Icon';
import { Press } from '../Press';
import { useI18n, TKey } from '../../i18n';

function PosterStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ fontFamily: MONO, fontSize: 14, fontWeight: '700', color: color || '#fff' }}>{value}</Text>
      <Text style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>{label}</Text>
    </View>
  );
}

function PosterCard({ poi, t }: { poi: Poi; t: (k: TKey, p?: any) => string }) {
  const isJourney = poi.kind === 'journey';
  const palette = paletteFor(poi.tone);

  return (
    <View style={ps.card}>
      {/* full-bleed background */}
      {poi.photoUris?.[0] ? (
        <Image source={{ uri: poi.photoUris[0] }} contentFit="cover" style={StyleSheet.absoluteFill} />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: palette[0] }]} />
      )}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.3)' }]} />

      {/* title + region */}
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <View style={ps.heroText}>
          <Text style={ps.title}>{poi.name}</Text>
          <Text style={ps.subtitle}>
            {poi.region}
            {poi.date ? ' · ' + poi.date.replace(/\s+\d{1,2}:\d{2}/g, '') : ''}
          </Text>
        </View>
      </View>

      {/* stats strip */}
      <View style={ps.statsRow}>
        <PosterStat label={t('journey.stat.distance')} value={poi.dist} />
        <View style={ps.statDivider} />
        <PosterStat label={t('journey.stat.ascent')} value={poi.asc} />
        <View style={ps.statDivider} />
        {isJourney ? (
          <PosterStat label={t('journey.stat.days')} value={poi.days || '—'} />
        ) : (
          <PosterStat label={t('journey.stat.difficulty')} value={poi.diff ? t(`common.diff.${poi.diff}` as TKey) : '—'} />
        )}
      </View>

      {/* branding footer */}
      <View style={ps.footer}>
        <View style={ps.footerLine} />
        <View style={ps.footerRow}>
          <View style={ps.logoMark}>
            <Text style={ps.logoText}>K</Text>
          </View>
          <Text style={ps.brandName}>Kaipa</Text>
          <Text style={ps.brandSlogan}>{t('poster.slogan')}</Text>
        </View>
      </View>
    </View>
  );
}

export function SharePoster({ theme, poi, onClose, onToast }: { theme: Theme; poi: Poi; onClose: () => void; onToast: (m: string) => void }) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const viewShotRef = useRef<any>(null);

  const translateY = useRef(new Animated.Value(600)).current;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  React.useEffect(() => {
    Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 3, speed: 16 }).start();
  }, [translateY]);

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => g.dy > 4 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_e, g) => { if (g.dy > 0) translateY.setValue(g.dy); },
      onPanResponderRelease: (_e, g) => {
        if (g.dy > 100 || g.vy > 0.6) {
          Animated.timing(translateY, { toValue: 700, duration: 200, useNativeDriver: true }).start(() => onCloseRef.current());
        } else {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 4, speed: 16 }).start();
        }
      },
    })
  ).current;

  const doShare = useCallback(async () => {
    try {
      const uri = await captureRef(viewShotRef, { format: 'png', quality: 1 });
      if (Platform.OS === 'web') {
        const link = document.createElement('a');
        link.href = uri;
        link.download = `${poi.name || 'kaipa'}.png`;
        link.click();
        onToast(t('poster.saved'));
      } else if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: poi.name });
      } else {
        await Share.share({ url: uri });
      }
    } catch (e: any) {
      if (e?.message !== 'User did not share') {
        console.warn('[SharePoster] share error:', e);
      }
    }
  }, [poi.name, t, onToast]);

  const doSave = useCallback(async () => {
    try {
      const uri = await captureRef(viewShotRef, { format: 'png', quality: 1 });
      if (Platform.OS === 'web') {
        const link = document.createElement('a');
        link.href = uri;
        link.download = `${poi.name || 'kaipa'}.png`;
        link.click();
      } else {
        const { status } = await requestMediaLibraryPermissions(true);
        if (status === 'granted') {
          await createMediaLibraryAsset(uri);
        }
      }
      onToast(t('poster.saved'));
    } catch (e) {
      console.warn('[SharePoster] save error:', e);
    }
  }, [poi.name, t, onToast]);

  return (
    <View style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end', zIndex: 60 }]}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }]} onPress={onClose} />
      <Animated.View
        {...pan.panHandlers}
        style={{
          transform: [{ translateY }],
          backgroundColor: theme.bg,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          paddingBottom: Math.max(insets.bottom, 16) + 6,
          maxHeight: '92%',
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.border,
        }}
      >
        {/* grabber */}
        <View style={{ paddingTop: 12, paddingBottom: 6, alignItems: 'center' }}>
          <View style={{ width: 36, height: 5, borderRadius: 3, backgroundColor: theme.dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)' }} />
        </View>

        <View style={{ paddingHorizontal: 20, paddingBottom: 8 }}>
          <View style={{ alignItems: 'center', marginBottom: 16 }}>
            <Text style={{ fontSize: 20, fontWeight: '700', color: theme.text, letterSpacing: -0.3 }}>{t('poster.title')}</Text>
          </View>

          {/* poster preview */}
          <View style={{ marginBottom: 16, borderRadius: 18, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 24, elevation: 8 }}>
            <ViewShot ref={viewShotRef} options={{ format: 'png', quality: 1 }}>
              <PosterCard poi={poi} t={t} />
            </ViewShot>
          </View>

          {/* action buttons */}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Press
              onPress={doShare}
              style={{ flex: 1, height: 44, borderRadius: 13, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}
            >
              <Icon name="share" color="#fff" size={15} />
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>{t('poster.share')}</Text>
            </Press>
            <Press
              onPress={doSave}
              style={{
                flex: 1, height: 44, borderRadius: 13,
                backgroundColor: theme.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline,
                alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6,
              }}
            >
              <Icon name="photo" color={theme.text} size={15} />
              <Text style={{ fontSize: 14, fontWeight: '700', color: theme.text }}>{t('poster.saveImage')}</Text>
            </Press>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

const ps = StyleSheet.create({
  card: {
    height: 320,
    overflow: 'hidden',
  },
  heroText: {
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowRadius: 6,
    textShadowOffset: { width: 0, height: 1 },
  },
  subtitle: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    marginTop: 3,
  },
  statsRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  footer: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    paddingTop: 4,
  },
  footerLine: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginBottom: 10,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  logoMark: {
    width: 20,
    height: 20,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
  brandName: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  brandSlogan: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
    flex: 1,
    textAlign: 'right',
  },
});
