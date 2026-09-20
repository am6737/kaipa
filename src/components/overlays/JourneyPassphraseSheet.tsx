// JourneyPassphraseSheet.tsx — 口令卡 bottom sheet: the passphrase sharing card
// opened from the share panel's 口令分享 quick action. A 4-digit code in a
// quiet card, copy/share actions side by side, and owner-only rotation tucked
// into the top-right corner. No QR (the link channel stays separate) and no
// validity status, per the journey-passphrase prototype.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, PanResponder, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { RefreshCw } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Poi } from '../../data/pois';
import { AppProgressBar, motion, radius, space, type } from '../../design-system';
import { useI18n } from '../../i18n';
import { ensureJourneyShare, rotateJourneyShare, type JourneyShareInfo } from '../../lib/journeyShare';
import { MONO } from '../../theme/fonts';
import { Theme } from '../../theme/theme';
import { Icon } from '../Icon';
import { Press } from '../Press';

export function JourneyPassphraseSheet({
  theme,
  poi,
  onClose,
  onToast,
}: {
  theme: Theme;
  poi: Poi;
  onClose: () => void;
  onToast: (message: string) => void;
}) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(600)).current;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const [share, setShare] = useState<JourneyShareInfo | null>(null);
  const [failed, setFailed] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [loadKey, setLoadKey] = useState(0);

  const joined = Math.max(0, Math.min(10, poi.companionList?.length ?? poi.companions ?? 0));

  useEffect(() => {
    Animated.spring(translateY, { toValue: 0, useNativeDriver: true, ...motion.pageSpring }).start();
  }, [translateY]);

  useEffect(() => {
    if (poi.kind !== 'journey' || !poi.id) return;
    let cancelled = false;
    setFailed(false);
    void (async () => {
      const info = await ensureJourneyShare(poi.id);
      if (cancelled) return;
      if (info) setShare(info);
      else setFailed(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadKey, poi.id, poi.kind]);

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gesture) => gesture.dy > 4 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderMove: (_event, gesture) => {
        if (gesture.dy > 0) translateY.setValue(gesture.dy);
      },
      onPanResponderRelease: (_event, gesture) => {
        if (gesture.dy > 100 || gesture.vy > 0.6) {
          Animated.timing(translateY, { toValue: 700, duration: motion.quick, useNativeDriver: true }).start(() => onCloseRef.current());
        } else {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true, ...motion.pageSpring }).start();
        }
      },
    }),
  ).current;

  const shareCode = useCallback(async () => {
    if (!share) return;
    try {
      await Share.share({ title: poi.name, message: t('passphrase.shareMessage', { code: share.code, tripName: poi.name }) });
    } catch (error: any) {
      if (error?.message !== 'User did not share') console.warn('[JourneyPassphraseSheet] share error:', error);
    }
  }, [poi.name, share, t]);

  const copyCode = useCallback(async () => {
    if (!share) return;
    await Clipboard.setStringAsync(share.code);
    onToast(t('passphrase.codeCopied'));
  }, [onToast, share, t]);

  const rotate = useCallback(async () => {
    if (!poi.id || rotating) return;
    setRotating(true);
    const next = await rotateJourneyShare(poi.id);
    setRotating(false);
    if (next) {
      setShare(next);
      onToast(t('passphrase.rotated'));
    } else {
      onToast(t('passphrase.rotateFailed'));
    }
  }, [onToast, poi.id, rotating, t]);

  return (
    <View style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end', zIndex: 70 }]}>
      <Pressable style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={onClose} />
      <Animated.View
        style={[
          styles.sheet,
          {
            transform: [{ translateY }],
            backgroundColor: theme.groupedBg,
            borderColor: theme.border,
            paddingBottom: Math.max(insets.bottom, space.md),
          },
        ]}
      >
        <View {...pan.panHandlers} style={styles.grabberArea}>
          <View style={[styles.grabber, { backgroundColor: theme.dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)' }]} />
        </View>

        {poi.mine ? (
          <Press
            accessibilityRole="button"
            accessibilityLabel={t('passphrase.rotate')}
            disabled={rotating || !share}
            onPress={() => void rotate()}
            style={[
              styles.rotateButton,
              { backgroundColor: theme.fieldSurface, borderColor: theme.fieldBorder, opacity: share ? 1 : 0.45 },
            ]}
          >
            {rotating ? (
              <ActivityIndicator size="small" color={theme.text2} />
            ) : (
              <RefreshCw color={theme.text2} size={16} strokeWidth={2} />
            )}
          </Press>
        ) : null}

        <View style={styles.body}>
          <Text numberOfLines={1} style={[type.caption, styles.journeyName, { color: theme.text2 }]}>{poi.name}</Text>

          <View style={[styles.codeCard, { backgroundColor: theme.surfaceTop, borderColor: theme.hairline }]}>
            {share ? (
              <Text style={[styles.code, { color: theme.text }]}>{share.code}</Text>
            ) : failed ? (
              <>
                <Text style={[styles.code, styles.codePlaceholder, { color: theme.text3 }]}>----</Text>
                <Press
                  accessibilityRole="button"
                  onPress={() => setLoadKey((key) => key + 1)}
                  style={[styles.retryButton, { backgroundColor: theme.fieldSurface }]}
                >
                  <RefreshCw color={theme.text2} size={14} strokeWidth={2} />
                  <Text style={[type.caption, { color: theme.text2, fontWeight: '600' }]}>{t('passphrase.retry')}</Text>
                </Press>
              </>
            ) : (
              <ActivityIndicator color={theme.text3} style={styles.codeLoading} />
            )}

            <View style={styles.capacityRow}>
              <AppProgressBar theme={theme} value={(joined / 10) * 100} height={4} />
              <Text numberOfLines={1} style={[type.caption, styles.capacityLabel, { color: theme.text3 }]}>
                {t('passphrase.capacityShort', { joined, total: 10 })}
              </Text>
            </View>
          </View>

          <View style={styles.actionsRow}>
            <Press
              accessibilityRole="button"
              accessibilityLabel={t('passphrase.copyCode')}
              disabled={!share}
              onPress={() => void copyCode()}
              style={[styles.actionButton, { backgroundColor: theme.surfaceTop, borderColor: theme.border, opacity: share ? 1 : 0.5 }]}
            >
              <Icon name="copy" color={theme.text} size={15} strokeWidth={1.9} />
              <Text style={[type.body, { color: theme.text, fontWeight: '600' }]}>{t('passphrase.copyCode')}</Text>
            </Press>
            <Press
              accessibilityRole="button"
              accessibilityLabel={t('passphrase.share')}
              disabled={!share}
              onPress={() => void shareCode()}
              style={[styles.actionButton, { backgroundColor: theme.accent, opacity: share ? 1 : 0.5 }]}
            >
              <Icon name="share" color="#FFFFFF" size={17} strokeWidth={2} />
              <Text style={[type.body, styles.accentLabel]}>{t('passphrase.share')}</Text>
            </Press>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(0,0,0,0.48)',
  },
  sheet: {
    maxHeight: '92%',
    overflow: 'hidden',
    borderTopLeftRadius: radius.feature,
    borderTopRightRadius: radius.feature,
    borderWidth: StyleSheet.hairlineWidth,
  },
  grabberArea: {
    paddingTop: space.sm,
    paddingBottom: space.xs,
    alignItems: 'center',
  },
  grabber: {
    width: 36,
    height: 5,
    borderRadius: radius.pill,
  },
  rotateButton: {
    position: 'absolute',
    top: 10,
    right: space.lg,
    zIndex: 5,
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    paddingHorizontal: space.xl,
    paddingTop: space.xs,
  },
  journeyName: {
    textAlign: 'center',
    fontWeight: '600',
  },
  codeCard: {
    marginTop: space.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.feature,
    paddingTop: 34,
    paddingHorizontal: space.md,
    paddingBottom: space.xl,
    alignItems: 'center',
    gap: 18,
  },
  code: {
    fontFamily: MONO,
    fontSize: 58,
    lineHeight: 68,
    fontWeight: '700',
    letterSpacing: 8,
    marginLeft: 4,
  },
  codePlaceholder: {
    letterSpacing: 2,
    marginLeft: 0,
  },
  codeLoading: {
    height: 68,
  },
  retryButton: {
    minHeight: 36,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  capacityRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  capacityLabel: {
    flexShrink: 0,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: 18,
  },
  actionButton: {
    flex: 1,
    height: 50,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  accentLabel: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
