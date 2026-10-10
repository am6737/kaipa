import React, { useRef, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import type { Theme } from '../../theme/theme';
import { useI18n } from '../../i18n';
import { radius, space } from '../../design-system';
import { Press } from '../Press';
import { MePushPage } from './MePushPage';

// Integer tenths keep scrolling and fine adjustments free of floating-point drift.
const MIN = 250;
const MAX = 3000;
const TICK_WIDTH = 10;
const WEIGHTS = Array.from({ length: MAX - MIN + 1 }, (_, index) => MIN + index);
const clamp = (value: number) => Math.max(MIN, Math.min(MAX, value));

export function PlanningWeightPage({ theme, value, onBack }: {
  theme: Theme;
  value: string;
  onBack: (value: string) => void;
}) {
  const { t } = useI18n();
  const [selected, setSelected] = useState(() => {
    const parsed = value.trim() ? Number(value) : NaN;
    return clamp(Math.round((Number.isFinite(parsed) ? parsed : 65) * 10));
  });
  const [rulerWidth, setRulerWidth] = useState(0);
  const ruler = useRef<FlatList<number>>(null);
  const initialized = useRef(false);
  const interacted = useRef(false);
  const initialOffset = useRef((selected - MIN) * TICK_WIDTH).current;
  const effectiveWidth = rulerWidth || 320;
  const padding = Math.max(0, (effectiveWidth - TICK_WIDTH) / 2);
  const adjust = (delta: number) => {
    const next = clamp(selected + delta);
    setSelected(next);
    ruler.current?.scrollToOffset({ offset: (next - MIN) * TICK_WIDTH, animated: false });
  };

  return (
    <MePushPage theme={theme} title={t('planningProfile.weightTitle')} onBack={() => onBack(String(selected / 10))}>
      <View style={styles.content}>
        <Text accessibilityRole="header" style={[styles.question, { color: theme.text }]}>{t('planningProfile.weightQuestion')}</Text>
        <Text style={[styles.description, { color: theme.text2 }]}>{t('planningProfile.weightDetail')}</Text>
        <View style={[styles.measurementCard, { backgroundColor: theme.dark ? theme.surface : '#F7F7F8', borderColor: theme.dark ? 'rgba(255,255,255,0.16)' : '#FFFFFF', boxShadow: theme.dark ? '0px 8px 24px rgba(0,0,0,0.18)' : '0px 8px 24px rgba(0,0,0,0.025)' }]}>
          <Text style={[styles.label, { color: theme.text2 }]}>{t('planningProfile.weight')}</Text>
          <View style={styles.readout}>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={[styles.number, { color: theme.text }]}>{(selected / 10).toFixed(1)}</Text>
            <Text style={[styles.unit, { color: theme.text2 }]}>kg</Text>
          </View>
          <View
            onLayout={({ nativeEvent }) => setRulerWidth(nativeEvent.layout.width)}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={t('planningProfile.weight')}
            accessibilityValue={{ min: MIN / 10, max: MAX / 10, now: selected / 10, text: `${(selected / 10).toFixed(1)} kg` }}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={({ nativeEvent }) => {
              if (nativeEvent.actionName === 'increment') adjust(1);
              if (nativeEvent.actionName === 'decrement') adjust(-1);
            }}
            style={styles.ruler}
          >
            <FlatList
              ref={ruler}
              horizontal
              style={{ width: '100%' }}
              data={WEIGHTS}
              keyExtractor={(item) => String(item)}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: padding }}
              getItemLayout={(_, index) => ({ length: TICK_WIDTH, offset: index * TICK_WIDTH, index })}
              initialNumToRender={Math.ceil(effectiveWidth / TICK_WIDTH) + 12}
              windowSize={5}
              onLayout={() => {
                if (initialized.current) return;
                initialized.current = true;
                requestAnimationFrame(() => ruler.current?.scrollToOffset({ offset: initialOffset, animated: false }));
              }}
              snapToInterval={TICK_WIDTH}
              decelerationRate="fast"
              scrollEventThrottle={16}
              onScrollBeginDrag={() => { interacted.current = true; }}
              onScroll={({ nativeEvent }) => {
                if (initialized.current && interacted.current) setSelected(clamp(MIN + Math.round(nativeEvent.contentOffset.x / TICK_WIDTH)));
              }}
              renderItem={({ item }) => {
                const whole = item % 10 === 0;
                return <View style={styles.tickCell}>
                  <View style={{ width: whole ? 2 : 1, height: whole ? 36 : item % 5 === 0 ? 26 : 16, borderRadius: radius.pill, backgroundColor: whole ? theme.text : theme.text2 }} />
                  {whole ? <Text style={[styles.tickLabel, { color: theme.text2 }]}>{item / 10}</Text> : null}
                </View>;
              }}
            />
            <View pointerEvents="none" style={[styles.indicator, { backgroundColor: theme.accent }]} />
          </View>

        </View>
      </View>
    </MePushPage>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.xl, paddingTop: space.lg, paddingBottom: space.lg },
  question: { fontSize: 27, fontWeight: '700', lineHeight: 38 },
  description: { fontSize: 14, lineHeight: 23, marginTop: space.md },
  measurementCard: { borderRadius: radius.showcase, borderWidth: 2, paddingVertical: space.xxl, marginTop: space.xxl, alignItems: 'center' },
  label: { fontSize: 14, fontWeight: '500' },
  readout: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: space.xs, paddingHorizontal: space.lg, marginTop: space.sm },
  number: { fontSize: 76, fontWeight: '600', letterSpacing: -3, fontVariant: ['tabular-nums'], flexShrink: 1 },
  unit: { fontSize: 20, fontWeight: '600' },
  ruler: { alignSelf: 'stretch', height: 100, marginTop: space.xxxl, overflow: 'hidden' },
  tickCell: { width: TICK_WIDTH, height: 100, alignItems: 'center', paddingTop: space.sm },
  tickLabel: { position: 'absolute', top: 58, width: 48, fontSize: 12, textAlign: 'center', fontVariant: ['tabular-nums'] },
  indicator: { position: 'absolute', top: 4, left: '50%', marginLeft: -1.5, width: 3, height: 48, borderRadius: radius.pill },
});
