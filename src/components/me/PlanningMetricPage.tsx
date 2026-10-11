import React, { useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import WheelPicker from '@quidone/react-native-wheel-picker';
import type { Theme } from '../../theme/theme';
import { useI18n } from '../../i18n';
import { AppMeasurementPanel, AppQuestionHeader, AppReadout, radius, space } from '../../design-system';
import { Press } from '../Press';
import { MePushPage } from './MePushPage';
import { createRulerHaptics, createWheelHaptics } from './rulerHaptics';

export type PlanningMetric = 'heightCm' | 'ageYears';
const MIN_HEIGHT = 80;
const MAX_HEIGHT = 250;
const TICK_HEIGHT = 16;
// Centimetres: the wider 5 cm tick, and the 10 cm mark that carries a label.
const HEIGHT_DETENTS = { minor: 5, major: 10 };
const YEAR_DETENTS = { minor: 1, major: 10 };
const HEIGHTS = Array.from({ length: MAX_HEIGHT - MIN_HEIGHT + 1 }, (_, index) => MAX_HEIGHT - index);
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function PlanningMetricPage({ theme, metric, value, onBack }: {
  theme: Theme;
  metric: PlanningMetric;
  value: string;
  onBack: (value: string) => void;
}) {
  const { t } = useI18n();
  const { height, width } = useWindowDimensions();
  const isHeight = metric === 'heightCm';
  const currentYear = new Date().getFullYear();
  const [selected, setSelected] = useState(() => {
    const parsed = value.trim() ? Number(value) : NaN;
    return isHeight
      ? clamp(Number.isFinite(parsed) ? parsed : 170, MIN_HEIGHT, MAX_HEIGHT)
      : currentYear - clamp(Number.isFinite(parsed) ? Math.round(parsed) : 30, 10, 100);
  });
  const years = useMemo(() => Array.from({ length: 91 }, (_, index) => ({ value: currentYear - 10 - index })), [currentYear]);
  const stageHeight = clamp(height * 0.43, 280, 380);
  const pickerWidth = Math.min(170, (width - space.xxl * 2) * 0.46);
  const ruler = useRef<ScrollView>(null);
  const rulerInitialized = useRef(false);
  const rulerInteracted = useRef(false);
  const lastTick = useRef(selected);
  const rulerHaptics = useMemo(() => createRulerHaptics(HEIGHT_DETENTS), []);
  const wheelHaptics = useMemo(() => createWheelHaptics(YEAR_DETENTS), []);
  const initialHeight = useRef(Math.round(selected)).current;
  const min = isHeight ? MIN_HEIGHT : currentYear - 100;
  const max = isHeight ? MAX_HEIGHT : currentYear - 10;
  const adjust = (delta: number) => {
    const next = clamp(Math.round(selected) + delta, min, max);
    lastTick.current = next;
    setSelected(next);
    if (isHeight) ruler.current?.scrollTo({ y: (MAX_HEIGHT - next) * TICK_HEIGHT, animated: false });
  };
  const displayValue = isHeight ? selected : currentYear - selected;
  const muted = theme.text3;

  return (
    <MePushPage theme={theme} title={t(isHeight ? 'planningProfile.heightTitle' : 'planningProfile.birthYearTitle')} onBack={() => onBack(String(isHeight ? selected : currentYear - selected))}>
      <View style={styles.content}>
        <AppQuestionHeader theme={theme} question={t(isHeight ? 'planningProfile.heightQuestion' : 'planningProfile.birthYearQuestion')} description={t(isHeight ? 'planningProfile.heightDetail' : 'planningProfile.birthYearDetail')} />
        <View style={[styles.stage, { minHeight: stageHeight }]}>
          <View style={styles.readout}>
            <AppReadout theme={theme} label={t(isHeight ? 'planningProfile.height' : 'planningProfile.age')} value={displayValue} unit={isHeight ? 'cm' : t('planningProfile.years')} />
          </View>
          <AppMeasurementPanel
            theme={theme}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={t(isHeight ? 'planningProfile.height' : 'planningProfile.birthYear')}
            accessibilityValue={{ min, max, now: selected }}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={({ nativeEvent }) => {
              if (nativeEvent.actionName === 'increment') adjust(1);
              if (nativeEvent.actionName === 'decrement') adjust(-1);
            }}
            style={[styles.pickerPanel, { width: pickerWidth, height: stageHeight }]}
          >
            {isHeight ? <>
              <ScrollView
                ref={ruler}
                style={{ width: '100%' }}
                showsVerticalScrollIndicator={false}
                nestedScrollEnabled
                contentOffset={{ x: 0, y: (MAX_HEIGHT - initialHeight) * TICK_HEIGHT }}
                onContentSizeChange={() => {
                  if (rulerInitialized.current) return;
                  rulerInitialized.current = true;
                  ruler.current?.scrollTo({ y: (MAX_HEIGHT - initialHeight) * TICK_HEIGHT, animated: false });
                }}
                contentContainerStyle={{ paddingVertical: (stageHeight - TICK_HEIGHT) / 2 }}
                snapToInterval={TICK_HEIGHT}
                decelerationRate="fast"
                scrollEventThrottle={16}
                onScrollBeginDrag={() => { rulerInteracted.current = true; rulerHaptics.grab(); }}
                onMomentumScrollEnd={() => rulerHaptics.release()}
                onScroll={({ nativeEvent }) => {
                  if (!(rulerInitialized.current && rulerInteracted.current)) return;
                  const raw = Math.round(nativeEvent.contentOffset.y / TICK_HEIGHT);
                  const index = clamp(raw, 0, HEIGHTS.length - 1);
                  const next = MAX_HEIGHT - index;
                  rulerHaptics.edge(raw !== index);
                  rulerHaptics.move(lastTick.current, next);
                  lastTick.current = next;
                  setSelected(next);
                }}
              >
                {HEIGHTS.map((cm) => <View key={cm} style={styles.tickRow}>
                  {cm % 10 === 0 ? <Text style={[styles.tickLabel, { color: theme.text2 }]}>{cm}</Text> : null}
                  <View style={{ width: cm % 10 === 0 ? 30 : cm % 5 === 0 ? 24 : 16, height: cm % 5 === 0 ? 3 : 2, borderRadius: radius.pill, backgroundColor: muted }} />
                </View>)}
              </ScrollView>
              <View pointerEvents="none" style={[styles.indicator, { top: stageHeight / 2 - 2, backgroundColor: theme.accent }]} />
            </> : <WheelPicker
              data={years}
              value={selected}
              onValueChanging={({ item }) => { wheelHaptics.select(lastTick.current, item.value); lastTick.current = item.value; setSelected(item.value); }}
              onValueChanged={({ item }) => setSelected(item.value)}
              enableScrollByTapOnItem
              itemHeight={stageHeight / 5}
              visibleItemCount={5}
              width={pickerWidth - space.xxl}
              extraValues={[selected, theme.text, theme.text2]}
              renderItem={({ item }) => <View style={styles.yearItem}>
                <Text style={{ fontSize: item.value === selected ? 29 : 25, fontWeight: item.value === selected ? '700' : '500', color: item.value === selected ? theme.text : theme.text2, fontVariant: ['tabular-nums'] }}>{item.value}</Text>
              </View>}
              overlayItemStyle={{ backgroundColor: theme.accentSoft, borderRadius: radius.feature }}
            />}
          </AppMeasurementPanel>
        </View>
      </View>
    </MePushPage>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.xl, paddingTop: space.lg, paddingBottom: space.lg },
  stage: { flexDirection: 'row', alignItems: 'center', gap: space.lg, marginTop: space.xxxl },
  readout: { flex: 1, minWidth: 0 },
  pickerPanel: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  tickRow: { height: TICK_HEIGHT, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: space.xs, paddingRight: space.sm },
  tickLabel: { fontSize: 11, fontWeight: '600', fontVariant: ['tabular-nums'] },
  indicator: { position: 'absolute', right: space.sm, width: 30, height: 4, borderRadius: radius.pill },
  yearItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
