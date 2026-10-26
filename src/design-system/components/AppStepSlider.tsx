import React from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
import { detentFeedback } from '../../../modules/haptics-engine';
import { Theme } from '../../theme/theme';
import { space, type } from '../tokens';

const THUMB = 24;

// Single-handle slider over a few fixed steps. The thumb snaps to a step and
// clicks once per step it passes; `onChange` fires on release only, so a list
// filtered by it reflows once rather than on every step of the drag.
// Built on PanResponder rather than gesture-handler so it also works inside a
// Modal without its own gesture root.
export function AppStepSlider({
  theme,
  caption,
  steps,
  index,
  onChange,
}: {
  theme: Theme;
  caption: string;
  /** Labels shown on the right of the caption for each step. */
  steps: readonly string[];
  index: number;
  onChange: (index: number) => void;
}) {
  const [draft, setDraft] = React.useState(index);
  const [trackWidth, setTrackWidth] = React.useState(0);
  const live = React.useRef({ draft: index, trackWidth: 0, last: steps.length - 1, onChange });
  live.current = { draft, trackWidth, last: steps.length - 1, onChange };
  React.useEffect(() => { setDraft(index); }, [index]);

  const stepAt = (x: number) => {
    const { trackWidth: w, last } = live.current;
    if (!w) return live.current.draft;
    return Math.max(0, Math.min(last, Math.round(((x - THUMB / 2) / (w - THUMB)) * last)));
  };
  const moveTo = (next: number) => {
    if (next === live.current.draft) return;
    live.current.draft = next;
    detentFeedback.detent();
    setDraft(next);
  };
  // locationX is only trusted at touch-down; moves add the gesture's dx so the
  // thumb keeps tracking after the finger slides off the track.
  const startX = React.useRef(0);
  const pan = React.useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => {
      detentFeedback.prepare();
      startX.current = e.nativeEvent.locationX;
      moveTo(stepAt(startX.current));
    },
    onPanResponderMove: (_, g) => moveTo(stepAt(startX.current + g.dx)),
    onPanResponderRelease: () => {
      detentFeedback.commit();
      live.current.onChange(live.current.draft);
    },
    onPanResponderTerminate: () => live.current.onChange(live.current.draft),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);

  const last = steps.length - 1;
  const thumbLeft = trackWidth && last ? (draft / last) * (trackWidth - THUMB) : 0;
  const trackColor = theme.dark ? 'rgba(255,255,255,0.10)' : '#F0F0F0';
  return (
    <View>
      <View style={styles.header}>
        <Text style={[type.cardTitle, { color: theme.text }]}>{caption}</Text>
        <Text style={[type.chip, { color: theme.text2 }]}>{steps[draft]}</Text>
      </View>
      <View
        {...pan.panHandlers}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={caption}
        accessibilityValue={{ text: steps[draft] }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => {
          const next = Math.max(0, Math.min(last, draft + (e.nativeEvent.actionName === 'increment' ? 1 : -1)));
          setDraft(next);
          onChange(next);
        }}
        onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
        style={styles.hit}
      >
        <View pointerEvents="none" style={[styles.track, { backgroundColor: trackColor }]}>
          <View style={[styles.fill, { width: thumbLeft + 3, backgroundColor: theme.accent }]} />
        </View>
        {steps.map((_, i) => (
          <View
            key={i}
            pointerEvents="none"
            style={[styles.tick, {
              left: trackWidth && last ? (i / last) * (trackWidth - THUMB) + THUMB / 2 - 2 : 0,
              backgroundColor: i <= draft ? 'rgba(255,255,255,0.85)' : theme.dark ? 'rgba(255,255,255,0.28)' : '#D9D9D9',
            }]}
          />
        ))}
        <View pointerEvents="none" style={[styles.thumb, { left: thumbLeft, backgroundColor: theme.dark ? '#3A3A3C' : '#FFFFFF' }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: space.xxs },
  hit: { height: 40, justifyContent: 'center' },
  track: { height: 6, borderRadius: 3, marginHorizontal: THUMB / 2 - 3, overflow: 'hidden' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 3 },
  tick: { position: 'absolute', width: 4, height: 4, borderRadius: 2, top: 18 },
  thumb: { position: 'absolute', top: 8, width: THUMB, height: THUMB, borderRadius: THUMB / 2, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
});
