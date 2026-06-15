import React, { useEffect, useRef } from 'react';
import { Animated, View, Text, StyleSheet, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme } from '../../theme/theme';
import { Icon, IconName } from '../Icon';
import { Press } from '../Press';
import { useI18n } from '../../i18n';

type Entry = 'link' | 'camera' | 'manual';

export function AddGearChoose({
  theme,
  onChoose,
  onCancel,
}: {
  theme: Theme;
  onChoose: (entry: Entry) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const screenH = Dimensions.get('window').height;
  const ty = useRef(new Animated.Value(screenH)).current;
  useEffect(() => {
    Animated.spring(ty, { toValue: 0, useNativeDriver: true, bounciness: 0, speed: 16 }).start();
  }, [ty]);

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: theme.bg, transform: [{ translateY: ty }] }]}>
      {/* nav bar */}
      <View style={{ paddingTop: insets.top + 14, paddingHorizontal: 16, paddingBottom: 12, flexDirection: 'row', alignItems: 'center' }}>
        <Press onPress={onCancel} hitSlop={8}>
          <Text style={{ fontSize: 15, color: theme.text2 }}>{t('gear.add.cancel')}</Text>
        </Press>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: theme.text, letterSpacing: -0.2 }}>{t('gear.add.title')}</Text>
        </View>
        <View style={{ minWidth: 40 }} />
      </View>

      {/* entry rows */}
      <View style={{ paddingHorizontal: 16, paddingTop: 12, gap: 12 }}>
        <EntryRow
          theme={theme}
          primary
          icon="link"
          title={t('gear.add.pasteLink')}
          sub={t('gear.add.pasteLinkSub')}
          onPress={() => onChoose('link')}
        />
        <EntryRow
          theme={theme}
          icon="camera"
          title={t('gear.add.photoRecognize')}
          sub={t('gear.add.photoRecognizeSub')}
          onPress={() => onChoose('camera')}
        />
        <EntryRow
          theme={theme}
          icon="edit"
          title={t('gear.add.manual')}
          sub={t('gear.add.manualSub')}
          onPress={() => onChoose('manual')}
        />
      </View>
    </Animated.View>
  );
}

function EntryRow({
  theme,
  primary,
  icon,
  title,
  sub,
  onPress,
}: {
  theme: Theme;
  primary?: boolean;
  icon: IconName;
  title: string;
  sub: string;
  onPress: () => void;
}) {
  const bg = primary ? theme.accent : theme.surfaceTop;
  const shadow = primary
    ? { boxShadow: `0px 8px 22px ${theme.accent}44` }
    : theme.dark
      ? { boxShadow: '0px 5px 14px rgba(0,0,0,0.45)' }
      : { boxShadow: '0px 8px 16px rgba(0,0,0,0.1)' };
  const border = primary
    ? {}
    : { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline };

  return (
    <Press
      onPress={onPress}
      scaleTo={0.97}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingHorizontal: 16,
        paddingVertical: 16,
        borderRadius: 18,
        backgroundColor: bg,
        ...shadow,
        ...border,
      }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 13,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: primary ? 'rgba(255,255,255,0.2)' : theme.dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.045)',
        }}
      >
        <Icon name={icon} color={primary ? '#fff' : theme.text} size={21} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: primary ? '#fff' : theme.text, letterSpacing: -0.2 }}>{title}</Text>
        <Text style={{ fontSize: 12, color: primary ? 'rgba(255,255,255,0.78)' : theme.text3, marginTop: 2 }}>{sub}</Text>
      </View>
      <Icon name="chevronR" color={primary ? 'rgba(255,255,255,0.7)' : theme.text3} size={16} />
    </Press>
  );
}
