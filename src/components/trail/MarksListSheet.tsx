// MarksListSheet.tsx — every marked spot of a track in one searchable list.
//
// The track page used to open the first mark and leave the rest to prev/next,
// which is a long walk on an imported file with dozens of waypoints. Picking a
// row hands its position back; the page then closes this sheet and opens
// MarkDetail on that mark, so rename, delete and swiping stay in one place.
//
// A Modal with its own scrim, like MarkDetail, so it stacks over the page.
import { Image } from 'expo-image';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { layout, motion, radius, space, type } from '../../design-system';
import { useI18n } from '../../i18n';
import { MONO } from '../../theme/fonts';
import type { Theme } from '../../theme/theme';
import { Icon } from '../Icon';
import { Press } from '../Press';
import type { MarkDetailItem } from './MarkDetail';

const meta = (item: MarkDetailItem) => [
  item.alongM != null ? `${(item.alongM / 1000).toFixed(1)} km` : null,
  item.ele != null ? `${Math.round(item.ele)} m` : null,
].filter(Boolean).join('  ');

export function MarksListSheet({
  theme,
  visible,
  items,
  selected,
  onSelect,
  onClose,
}: {
  theme: Theme;
  visible: boolean;
  /** In track order; a row reports its position in this list. */
  items: MarkDetailItem[];
  /** The mark highlighted on the map, if any. */
  selected: number | null;
  onSelect: (index: number) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const [query, setQuery] = useState('');
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    progress.stopAnimation();
    if (visible) {
      setMounted(true);
      setQuery('');
      Animated.timing(progress, { toValue: 1, duration: motion.emphasized, easing: Easing.bezier(0.16, 1, 0.3, 1), useNativeDriver: true }).start();
      return;
    }
    Animated.timing(progress, { toValue: 0, duration: motion.quick, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(({ finished }) => {
      if (finished) setMounted(false);
    });
  }, [progress, visible]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.flatMap((item, index) => (!needle || item.name.toLowerCase().includes(needle) ? [{ item, index }] : []));
  }, [items, query]);

  if (!visible && !mounted) return null;

  const maxHeight = Math.round(height * 0.74);
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [maxHeight, 0] });

  return (
    <Modal visible transparent statusBarTranslucent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: progress }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={onClose} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }]} />
      </Animated.View>
      <KeyboardAvoidingView pointerEvents="box-none" style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Animated.View style={[styles.panel, { maxHeight, paddingBottom: Math.max(insets.bottom, space.md), backgroundColor: theme.surfaceTop, transform: [{ translateY }] }]}>
          <View style={styles.handleArea}><View style={[styles.handle, { backgroundColor: theme.text3 }]} /></View>
          <View style={styles.header}>
            <Text style={[type.sectionTitle, { color: theme.text, flex: 1 }]}>{t('tracks.detail.marksLink', { count: items.length })}</Text>
            <Press accessibilityRole="button" accessibilityLabel={t('common.close')} hitSlop={8} onPress={onClose} style={[styles.close, { backgroundColor: theme.fieldSurface }]}>
              <Icon name="close" size={16} color={theme.text2} />
            </Press>
          </View>
          <View style={[styles.search, { backgroundColor: theme.fieldSurface }]}>
            <Icon name="search" size={16} color={theme.text3} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t('journey.timeline.trackSearchWaypoints')}
              placeholderTextColor={theme.text3}
              accessibilityLabel={t('journey.timeline.trackSearchWaypoints')}
              autoCorrect={false}
              style={{ flex: 1, minWidth: 0, color: theme.text, paddingVertical: 0, fontSize: type.body.fontSize }}
            />
            {query ? (
              <Press onPress={() => setQuery('')} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('journey.timeline.placeSearchClear')}>
                <Icon name="close" size={14} color={theme.text2} />
              </Press>
            ) : null}
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ paddingBottom: space.sm }}>
            {rows.map(({ item, index }) => {
              const on = index === selected;
              return (
                <Press
                  key={item.key}
                  accessibilityRole="button"
                  accessibilityLabel={item.name}
                  accessibilityState={{ selected: on }}
                  onPress={() => onSelect(index)}
                  style={[styles.row, { backgroundColor: on ? theme.accentSoft : 'transparent' }]}
                >
                  <View style={[styles.number, { backgroundColor: on ? theme.accent : theme.fieldSurface }]}>
                    <Text style={{ color: on ? '#FFFFFF' : theme.text2, fontFamily: MONO, fontSize: 11, fontWeight: '700' }}>{index + 1}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={[type.cardTitle, { color: theme.text }]}>{item.name}</Text>
                    {meta(item) ? <Text style={[type.caption, { fontFamily: MONO, color: theme.text2, marginTop: space.xxs }]}>{meta(item)}</Text> : null}
                  </View>
                  {item.photo ? <Image source={{ uri: item.photo }} contentFit="cover" style={[styles.thumb, { backgroundColor: theme.fieldSurface }]} /> : null}
                  <Icon name="chevronR" size={16} color={theme.text3} strokeWidth={2.2} />
                </Press>
              );
            })}
            {rows.length === 0 ? <Text style={[styles.empty, { color: theme.text2 }]}>{t('journey.timeline.trackNoWaypointMatch')}</Text> : null}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: 'flex-end' },
  panel: { borderTopLeftRadius: radius.showcase, borderTopRightRadius: radius.showcase, paddingHorizontal: space.xl, flexShrink: 1 },
  handleArea: { paddingTop: space.sm, paddingBottom: space.md, alignItems: 'center' },
  handle: { width: 32, height: 4, borderRadius: 2 },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingBottom: space.md },
  close: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  search: { minHeight: layout.fieldHeight, paddingHorizontal: space.sm, borderRadius: radius.control, flexDirection: 'row', alignItems: 'center', gap: space.xs, marginBottom: space.sm },
  row: { minHeight: layout.listRowMinHeight, flexDirection: 'row', alignItems: 'center', gap: space.sm, marginHorizontal: -space.sm, paddingHorizontal: space.sm, borderRadius: radius.feature },
  number: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  thumb: { width: 40, height: 40, borderRadius: radius.control },
  empty: { paddingVertical: space.xxl, fontSize: type.body.fontSize, lineHeight: 21, textAlign: 'center' },
});
