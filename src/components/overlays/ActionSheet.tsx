// ActionSheet.tsx — iOS-style bottom action sheet (primary group + cancel).
import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme } from '../../theme/theme';
import { Icon } from '../Icon';
import { useI18n } from '../../i18n';
import { ActionSheetConfig } from '../../nav/NavContext';

export function ActionSheet({ theme, config, onClose }: { theme: Theme; config: ActionSheetConfig; onClose: () => void }) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const slide = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(slide, { toValue: 1, useNativeDriver: true, bounciness: 2, speed: 16 }).start();
  }, [slide]);

  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [400, 0] });
  const groupBg = theme.dark ? 'rgba(40,40,44,0.96)' : 'rgba(255,255,255,0.98)';

  return (
    <View style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end', zIndex: 200 }]}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.32)' }]} onPress={onClose} />
      <Animated.View style={{ transform: [{ translateY }], paddingHorizontal: 8, paddingBottom: Math.max(insets.bottom, 10) }}>
        <View style={{ backgroundColor: groupBg, borderRadius: 16, overflow: 'hidden' }}>
          {(config.title || config.message) && (
            <View style={{ paddingVertical: 14, paddingHorizontal: 16, alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
              {config.title ? <Text style={{ fontSize: 13, fontWeight: '600', color: theme.text2 }}>{config.title}</Text> : null}
              {config.message ? <Text style={{ fontSize: 12.5, color: theme.text3, marginTop: 4, textAlign: 'center' }}>{config.message}</Text> : null}
            </View>
          )}
          {config.items.map((item, i) => (
            <Pressable
              key={i}
              onPress={() => {
                onClose();
                if (item.onPress) setTimeout(item.onPress, 380);
              }}
              style={({ pressed }) => ({
                height: 56,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                borderTopWidth: i === 0 && !(config.title || config.message) ? 0 : StyleSheet.hairlineWidth,
                borderColor: theme.hairline,
                backgroundColor: pressed ? (theme.dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)') : 'transparent',
              })}
            >
              {item.icon ? <Icon name={item.icon as any} color={item.destructive ? theme.danger : theme.accent} size={19} /> : null}
              <Text style={{ fontSize: 17, fontWeight: '500', color: item.destructive ? theme.danger : theme.accent }}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable
          onPress={onClose}
          style={({ pressed }) => ({
            marginTop: 8,
            height: 56,
            borderRadius: 16,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: pressed ? (theme.dark ? 'rgba(60,60,64,0.96)' : 'rgba(245,245,247,1)') : groupBg,
          })}
        >
          <Text style={{ fontSize: 17, fontWeight: '700', color: theme.accent }}>{t('common.cancel')}</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}
