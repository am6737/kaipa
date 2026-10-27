// TrackMarkCard.tsx — the floating card a selected mark puts on the map.
//
// A track can carry very many marks and no list of them fits a sheet, so one
// mark is shown at a time: its photo (or its number, when it has none), where
// it sits on the line, and two arrows that step through the marks in distance
// order — the chart and the map follow each step. The body opens the existing
// mark detail, where rename, delete and the photos live.
import { Image } from 'expo-image';
import React from 'react';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { radius, space, type } from '../../design-system';
import { useI18n } from '../../i18n';
import { MONO } from '../../theme/fonts';
import type { Theme } from '../../theme/theme';
import { Icon } from '../Icon';
import { Press } from '../Press';

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

export type TrackMarkCardItem = {
  name: string;
  km: number;
  ele: number | null;
  photo?: string;
};

export function TrackMarkCard({
  theme,
  item,
  position,
  total,
  onStep,
  onClose,
  onOpenDetail,
  style,
}: {
  theme: Theme;
  item: TrackMarkCardItem;
  /** 1-based place in the distance-ordered list. */
  position: number;
  total: number;
  onStep: (delta: -1 | 1) => void;
  onClose: () => void;
  onOpenDetail: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { t } = useI18n();
  const card = (
    <>
      <Press
        onPress={onOpenDetail}
        accessibilityRole="button"
        accessibilityLabel={`${item.name} ${t('tracks.detail.openMarkDetail')}`}
        style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: space.xs }}
      >
        {item.photo ? (
          <Image
            source={{ uri: item.photo }}
            style={{ width: 56, height: 56, borderRadius: radius.feature, backgroundColor: theme.fieldSurface }}
            contentFit="cover"
            transition={120}
          />
        ) : (
          <View style={{ width: 56, height: 56, borderRadius: radius.feature, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.accentSofter }}>
            <Text style={{ fontFamily: MONO, fontSize: 17, fontWeight: '800', color: theme.accent, fontVariant: ['tabular-nums'] }}>{position}</Text>
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0, paddingHorizontal: space.xxs }}>
          <Text style={[type.micro, { fontFamily: MONO, fontWeight: '700', color: theme.text3, fontVariant: ['tabular-nums'] }]}>{position} / {total}</Text>
          <Text numberOfLines={1} style={[type.cardTitle, { color: theme.text, marginTop: 1 }]}>{item.name}</Text>
          <View style={{ flexDirection: 'row', gap: space.sm, marginTop: 2 }}>
            <Text style={[type.caption, { fontFamily: MONO, color: theme.text2, fontVariant: ['tabular-nums'] }]}>{item.km.toFixed(1)} km</Text>
            {item.ele != null ? (
              <Text style={[type.caption, { fontFamily: MONO, color: theme.text2, fontVariant: ['tabular-nums'] }]}>{fmt(item.ele)} m</Text>
            ) : null}
          </View>
        </View>
      </Press>
      <StepButton theme={theme} icon="chevronL" label={t('tracks.detail.prevMark')} disabled={position <= 1} onPress={() => onStep(-1)} />
      <StepButton theme={theme} icon="chevronR" label={t('tracks.detail.nextMark')} disabled={position >= total} onPress={() => onStep(1)} />
    </>
  );

  return (
    <View pointerEvents="box-none" style={style}>
      {/* The close control overhangs the surface, so it lives outside it in the
          tree and only overlaps it visually. */}
      <Press
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t('tracks.detail.closeMark')}
        style={{
          alignSelf: 'flex-end',
          width: 26,
          height: 26,
          borderRadius: 13,
          marginBottom: -13,
          marginRight: space.md,
          zIndex: 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.featureSurface,
          boxShadow: theme.dark ? '0px 2px 8px rgba(0,0,0,0.45)' : '0px 2px 8px rgba(0,0,0,0.16)',
        }}
      >
        <Icon name="close" size={13} color={theme.text2} strokeWidth={2.8} />
      </Press>
      <View
        style={{
          alignSelf: 'stretch',
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.xs,
          padding: space.xs,
          borderRadius: radius.feature,
          backgroundColor: theme.featureSurface,
          boxShadow: theme.dark ? '0px 8px 24px rgba(0,0,0,0.5)' : '0px 8px 24px rgba(0,0,0,0.16)',
        }}
      >
        {card}
      </View>
    </View>
  );
}

function StepButton({ theme, icon, label, disabled, onPress }: { theme: Theme; icon: 'chevronL' | 'chevronR'; label: string; disabled: boolean; onPress: () => void }) {
  return (
    <Press
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.fieldSurface, opacity: disabled ? 0.3 : 1 }}
    >
      <Icon name={icon} size={18} color={theme.text} strokeWidth={2.4} />
    </Press>
  );
}
