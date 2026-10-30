// ClipboardProductCard.tsx — the 方案 A centred card offered when a product link
// copied in a shop app was recognized (docs/previews/clipboard-recognition-card.html).
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Theme } from '../../theme/theme';
import { MONO } from '../../theme/fonts';
import { Icon } from '../Icon';
import { Press } from '../Press';
import { useI18n } from '../../i18n';
import { WeightUnit, fmtItemWeight } from '../../data/gear';
import { radius, space, type } from '../../design-system';
import { GearLinkPreview } from '../../lib/gearLinkPreview';
import { providerLabel } from './gearRecognition';
import { formatItemValue } from './GearItemsList';

const IMAGE_HEIGHT = 200;
// Board A sits 34 px from each phone edge.
const SIDE_MARGIN = 34;

export function ClipboardProductCard({ theme, preview, weightUnit, onAdd, onClose }: {
  theme: Theme;
  /** null once dismissed or added: the card fades out and unmounts itself. */
  preview: GearLinkPreview | null;
  weightUnit: WeightUnit;
  onAdd: (preview: GearLinkPreview) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const { width } = useWindowDimensions();
  const [mounted, setMounted] = useState(preview != null);
  const progress = useRef(new Animated.Value(0)).current;
  const shown = useRef(false);
  // Kept through the exit animation so the fading card still has content.
  const lastPreview = useRef<GearLinkPreview | null>(preview);
  if (preview) lastPreview.current = preview;

  useLayoutEffect(() => {
    if (preview) {
      shown.current = true;
      setMounted(true);
      progress.stopAnimation();
      progress.setValue(0);
      Animated.spring(progress, {
        toValue: 1,
        friction: 6,
        tension: 72,
        useNativeDriver: true,
      }).start();
      return;
    }
    if (shown.current) {
      shown.current = false;
      Animated.timing(progress, {
        toValue: 0,
        duration: 140,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [preview, progress]);

  const add = useCallback(() => {
    if (lastPreview.current) onAdd(lastPreview.current);
  }, [onAdd]);

  if (!mounted) return null;

  const item = lastPreview.current;
  if (!item) return null;

  const scrimColor = theme.dark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.38)';
  const opacity = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  // The spring overshoots past 1; letting the scale extrapolate keeps the
  // Douyin-style bounce instead of flattening it.
  const cardScale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1], extrapolate: 'extend' });
  const price = item.priceCny && item.priceCny > 0 ? `¥${formatItemValue(item.priceCny)}` : '--';
  const weight = item.weightKg && item.weightKg > 0 ? fmtItemWeight(item.weightKg, weightUnit) : '--';

  return (
    <Modal transparent visible statusBarTranslucent animationType="none" onRequestClose={onClose}>
      <View style={[styles.fill, styles.center]}>
        <Animated.View style={[styles.fill, { opacity }]}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={onClose} style={[styles.fill, { backgroundColor: scrimColor }]} />
        </Animated.View>

        <Animated.View style={{ width: Math.min(340, width - SIDE_MARGIN * 2), opacity, transform: [{ scale: cardScale }] }}>
          <View style={{ borderRadius: radius.feature, backgroundColor: theme.controlSurface, overflow: 'hidden', shadowColor: '#000000', shadowOpacity: theme.dark ? 0.5 : 0.14, shadowRadius: 30, shadowOffset: { width: 0, height: 10 }, elevation: 12 }}>
            {item.imageUrl ? (
              <Image source={item.imageUrl} style={{ width: '100%', height: IMAGE_HEIGHT }} contentFit="cover" transition={150} />
            ) : (
              <View style={{ height: IMAGE_HEIGHT, backgroundColor: theme.fieldSurface }} />
            )}
            <View style={{ paddingHorizontal: space.md, paddingTop: space.md, paddingBottom: space.lg }}>
              <Text style={[type.eyebrow, { color: theme.text2 }]}>{t('gear.add.clipboardFrom', { source: providerLabel(item.provider) })}</Text>
              <Text numberOfLines={2} style={{ marginTop: space.xs, fontSize: 17, fontWeight: '700', lineHeight: 23, color: theme.text }}>{item.name}</Text>

              <View style={{ marginTop: space.md, flexDirection: 'row', gap: space.lg }}>
                <View>
                  <Text style={[type.statLabel, { color: theme.text2 }]}>{t('gear.add.clipboardPrice')}</Text>
                  <Text style={[type.statValue, { fontFamily: MONO, marginTop: 2, color: price === '--' ? theme.text3 : theme.text }]}>{price}</Text>
                </View>
                <View>
                  <Text style={[type.statLabel, { color: theme.text2 }]}>{t('gear.add.clipboardWeight')}</Text>
                  <Text style={[type.statValue, { fontFamily: MONO, marginTop: 2, color: weight === '--' ? theme.text3 : theme.text }]}>{weight}</Text>
                </View>
              </View>

              {item.warnings.length > 0 ? (
                <Text numberOfLines={1} style={[type.hint, { marginTop: space.sm, color: theme.text2 }]}>{item.warnings[0]}</Text>
              ) : null}

              <Press
                accessibilityRole="button"
                accessibilityLabel={t('gear.add.clipboardAdd')}
                onPress={add}
                style={{ marginTop: space.lg, height: 50, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.accent }}
              >
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#FFFFFF' }}>{t('gear.add.clipboardAdd')}</Text>
              </Press>
            </View>
          </View>

          {/* Close ring below the card, like the mock. */}
          <Press
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
            onPress={onClose}
            hitSlop={8}
            style={{ alignSelf: 'center', marginTop: space.md, width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.7)', alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name="close" color="#FFFFFF" size={15} strokeWidth={1.6} />
          </Press>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
