// AddRouteSheet.tsx — "新增到路线库" bottom sheet (upload track / draw on map).
import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme } from '../../theme/theme';
import { Icon, IconName } from '../Icon';
import { Press } from '../Press';
import { useI18n } from '../../i18n';

function OptionCard({
  theme,
  icon,
  title,
  sub,
  disabled,
  loading,
  onPress,
}: {
  theme: Theme;
  icon: IconName;
  title: string;
  sub: string;
  disabled?: boolean;
  loading?: boolean;
  onPress?: () => void;
}) {
  const inactive = disabled || loading;
  return (
    <Press
      onPress={inactive ? undefined : onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        padding: 14,
        borderRadius: 14,
        opacity: disabled ? 0.5 : 1,
        backgroundColor: theme.dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
      }}
    >
      <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: theme.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
        {loading ? <ActivityIndicator color={theme.accent} /> : <Icon name={icon} color={theme.accent} size={22} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: theme.text }}>{title}</Text>
        <Text style={{ fontSize: 12, color: theme.text2, marginTop: 3, lineHeight: 17 }}>{sub}</Text>
      </View>
    </Press>
  );
}

export function AddRouteSheet({ theme, onClose, onUpload, loading }: { theme: Theme; onClose: () => void; onUpload: () => void; loading?: boolean }) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const slide = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(slide, { toValue: 1, useNativeDriver: true, bounciness: 3, speed: 16 }).start();
  }, [slide]);
  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [500, 0] });

  return (
    <View style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end', zIndex: 190 }]}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.32)' }]} onPress={onClose} />
      <Animated.View
        style={{
          transform: [{ translateY }],
          margin: 8,
          marginBottom: Math.max(insets.bottom, 12),
          borderRadius: 22,
          padding: 18,
          backgroundColor: theme.dark ? 'rgba(36,36,40,0.98)' : 'rgba(255,255,255,0.99)',
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.border,
        }}
      >
        <View style={{ alignSelf: 'center', width: 36, height: 5, borderRadius: 3, backgroundColor: theme.text3, marginBottom: 12 }} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
          <View>
            <Text style={{ fontSize: 11, fontWeight: '600', color: theme.text2, letterSpacing: 0.6 }}>{t('journeyEdit.addRoute.kicker')}</Text>
            <Text style={{ fontSize: 19, fontWeight: '700', color: theme.text, marginTop: 2 }}>{t('journeyEdit.addRoute.title')}</Text>
          </View>
          <Press onPress={onClose}>
            <Text style={{ fontSize: 15, color: theme.accent, fontWeight: '600' }}>{t('common.cancel')}</Text>
          </Press>
        </View>
        <Text style={{ fontSize: 12.5, color: theme.text2, marginBottom: 16, lineHeight: 18 }}>
          {t('journeyEdit.addRoute.desc')}
        </Text>
        <View style={{ gap: 10 }}>
          <OptionCard theme={theme} icon="upload" title={t('journeyEdit.addRoute.uploadTitle')} sub={loading ? t('journeyEdit.addRoute.parsing') : t('journeyEdit.addRoute.uploadSub')} loading={loading} onPress={onUpload} />
          <OptionCard theme={theme} icon="route" title={t('journeyEdit.addRoute.drawTitle')} sub={t('journeyEdit.addRoute.drawSub')} disabled />
        </View>
      </Animated.View>
    </View>
  );
}
