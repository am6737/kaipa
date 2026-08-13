import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Animated, PanResponder, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { KeyRound } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Poi } from '../../data/pois';
import { motion, radius, space, type } from '../../design-system';
import { useI18n } from '../../i18n';
import { supabase } from '../../lib/supabase';
import { Theme } from '../../theme/theme';
import { Icon, IconName } from '../Icon';
import { Press } from '../Press';
import { WeChatIcon } from '../WeChatIcon';

function hashShareSeed(value: string): number {
  let seed = 0;
  for (let index = 0; index < value.length; index += 1) {
    seed = ((seed << 5) - seed + value.charCodeAt(index)) | 0;
  }
  return seed || 1;
}

function FeatureAction({
  theme,
  icon,
  title,
  subtitle,
  onPress,
}: {
  theme: Theme;
  icon: IconName;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Press
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}，${subtitle}`}
      style={[styles.featureAction, { backgroundColor: theme.surfaceTop }]}
    >
      <View style={styles.featureCopy}>
        <Text numberOfLines={1} style={[type.cardTitle, { color: theme.text }]}>{title}</Text>
        <Text numberOfLines={2} style={[type.body, styles.featureSubtitle, { color: theme.text3 }]}>{subtitle}</Text>
      </View>
      <View style={styles.featureIcon}>
        <Icon name={icon} color={theme.text2} size={22} strokeWidth={1.9} />
      </View>
    </Press>
  );
}

function QuickAction({ theme, icon, label, onPress }: { theme: Theme; icon: IconName | 'keyRound' | 'wechat'; label: string; onPress: () => void }) {
  return (
    <Press onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={styles.quickAction}>
      <View style={[styles.quickIcon, { backgroundColor: theme.surfaceTop, borderColor: theme.fieldBorder }]}>
        {icon === 'keyRound' ? (
          <KeyRound color={theme.text} size={24} strokeWidth={1.9} />
        ) : icon === 'wechat' ? (
          <View style={styles.wechatIcon}>
            <WeChatIcon size={23} />
          </View>
        ) : (
          <Icon name={icon} color={theme.text} size={24} strokeWidth={1.9} />
        )}
      </View>
      <Text numberOfLines={2} style={[type.caption, styles.quickLabel, { color: theme.text }]}>{label}</Text>
    </Press>
  );
}

export function JourneyShareSheet({
  theme,
  poi,
  onClose,
  onToast,
  onCollaborate,
  onPoster,
}: {
  theme: Theme;
  poi: Poi;
  onClose: () => void;
  onToast: (message: string) => void;
  onCollaborate: () => void;
  onPoster: () => void;
}) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(600)).current;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const shareInfo = useMemo(() => {
    const slug = (poi.name || 'kaipa').replace(/\s+/g, '').slice(0, 8);
    const code = String(1000 + (Math.abs(hashShareSeed(poi.name)) % 9000));
    const base = process.env.EXPO_PUBLIC_WEB_URL || 'https://kaipa.app';
    return { slug, code, url: `${base}/j/${slug}-${code}` };
  }, [poi.name]);

  useEffect(() => {
    Animated.spring(translateY, { toValue: 0, useNativeDriver: true, ...motion.pageSpring }).start();
  }, [translateY]);

  useEffect(() => {
    if (poi.kind !== 'journey' || !poi.id) return;
    void (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        await supabase.from('journey_shares').upsert(
          { journey_id: poi.id, user_id: user.id, slug: shareInfo.slug, code: shareInfo.code, active: true },
          { onConflict: 'slug,code' },
        );
      } catch (error) {
        console.warn('[JourneyShareSheet] persist share error:', error);
      }
    })();
  }, [poi.id, poi.kind, shareInfo.code, shareInfo.slug]);

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

  const shareJourney = useCallback(async (message: string) => {
    try {
      await Share.share({ title: poi.name, message: `${message}\n${shareInfo.url}`, url: shareInfo.url });
    } catch (error: any) {
      if (error?.message !== 'User did not share') console.warn('[JourneyShareSheet] share error:', error);
    }
  }, [poi.name, shareInfo.url]);

  const copyLink = useCallback(async () => {
    await Clipboard.setStringAsync(shareInfo.url);
    onToast(t('poster.menu.linkCopied'));
  }, [onToast, shareInfo.url, t]);

  const regularMessage = t('poster.menu.shareMessage', { tripName: poi.name });
  const passphraseMessage = t('poster.menu.passphraseMessage', { tripName: poi.name, code: shareInfo.code });
  return (
    <View style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end', zIndex: 60 }]}>
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

        <View style={styles.featurePanel}>
          <FeatureAction
            theme={theme}
            icon="people"
            title={t('poster.menu.collaborate')}
            subtitle={t('poster.menu.collaborateHint')}
            onPress={onCollaborate}
          />
          <FeatureAction
            theme={theme}
            icon="photo"
            title={t('poster.menu.poster')}
            subtitle={t('poster.menu.posterHint')}
            onPress={onPoster}
          />
        </View>

        <View style={styles.quickActions}>
          <QuickAction theme={theme} icon="link" label={t('poster.menu.copyLink')} onPress={() => void copyLink()} />
          <QuickAction theme={theme} icon="keyRound" label={t('poster.menu.passphrase')} onPress={() => void shareJourney(passphraseMessage)} />
          <QuickAction theme={theme} icon="share" label={t('poster.menu.shareTo')} onPress={() => void shareJourney(regularMessage)} />
          <QuickAction theme={theme} icon="wechat" label={t('poster.menu.wechat')} onPress={() => void shareJourney(regularMessage)} />
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
  featurePanel: {
    gap: space.sm,
    marginTop: space.xl,
    marginBottom: space.sm,
    paddingHorizontal: space.lg,
  },
  featureAction: {
    width: '100%',
    minHeight: 116,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.feature,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  featureIcon: {
    width: 44,
    height: 44,
    marginLeft: space.lg,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureCopy: {
    flex: 1,
    minWidth: 0,
  },
  featureSubtitle: {
    marginTop: space.xs,
    lineHeight: 21,
  },
  quickActions: {
    flexDirection: 'row',
    paddingTop: space.md,
    paddingHorizontal: 0,
  },
  quickAction: {
    flex: 1,
    alignItems: 'center',
    minWidth: 0,
  },
  quickIcon: {
    width: 50,
    height: 50,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wechatIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.control,
    backgroundColor: '#07C160',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLabel: {
    marginTop: space.xs,
    minHeight: 28,
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
  },
});
