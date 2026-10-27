// JourneyFeatureDeck.tsx — the stacked feature cards above 我的计划. Three
// cards show as a stack; swiping up sends the front card off the top and brings
// the next one forward, swiping down drops the previous card back on, each with
// a detent click. The deck also advances on its own while idle.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import ReAnimated, { Easing, Extrapolation, interpolate, runOnJS, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { ChevronRight } from 'lucide-react-native';
import { detentFeedback } from '../../../modules/haptics-engine';
import { layout, motion, radius, space } from '../../design-system';
import { useI18n } from '../../i18n';
import { Theme } from '../../theme/theme';
import { Press } from '../Press';
import { PhotoTile } from '../PhotoTile';

export type FeatureDeckCard = { id: string; title: string; tone?: string; seed: string; imageUrl?: string; onPress: () => void };

const CARD_HEIGHT = 80;
// Each card behind the front one drops this far and shrinks by STACK_SCALE.
const STACK_OFFSET = 8;
const STACK_SCALE = 0.05;
const VISIBLE_DEPTH = 3;
// Drag that carries the front card all the way out.
const EXIT_DISTANCE = 150;
// A swipe down sends the front card this far down as it fades.
const DROP_DISTANCE = 96;
// The previous card grows into place from this scale on a swipe down.
const RETURN_SCALE = 0.94;
const COMMIT_DISTANCE = 44;
const AUTO_ADVANCE_MS = 5000;

// Where card `index` sits relative to the front for a continuous deck
// position: -1 is gone off the top, 0 is the front, 1 and 2 peek behind.
// Swiping down walks the same depths backwards, but `direction` lets each
// card animate it the other way round.
const relativeDepth = (index: number, position: number, count: number) => {
  'worklet';
  return (((index - position + 1) % count) + count) % count - 1;
};

function DeckCard({
  card, index, count, position, direction, front, theme, actionLabel,
}: {
  card: FeatureDeckCard;
  index: number;
  count: number;
  position: SharedValue<number>;
  // 1 while flipping forward (swipe up), -1 while flipping back (swipe down).
  direction: SharedValue<number>;
  front: boolean;
  theme: Theme;
  actionLabel: string;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    const depth = relativeDepth(index, position.value, count);
    if (direction.value < 0 && depth < 0) {
      // The previous card fades in where the front card was, growing into place.
      return {
        opacity: 1 + depth,
        transform: [{ translateY: 0 }, { scale: 1 + depth * (1 - RETURN_SCALE) }],
      };
    }
    if (direction.value < 0 && depth < 1) {
      // The front card drops down and fades, then rejoins the stack behind.
      return {
        opacity: 1 - depth,
        transform: [{ translateY: depth * DROP_DISTANCE }, { scale: 1 }],
      };
    }
    if (depth < 0) {
      return {
        opacity: 1 + depth,
        transform: [{ translateY: depth * EXIT_DISTANCE }, { scale: 1 }],
      };
    }
    return {
      opacity: interpolate(depth, [VISIBLE_DEPTH - 1, VISIBLE_DEPTH], [1, 0], Extrapolation.CLAMP),
      transform: [
        // Scaling pulls the bottom edge up; push down by the same amount so each
        // card peeks STACK_OFFSET below the one in front.
        { translateY: depth * STACK_OFFSET + (depth * STACK_SCALE * CARD_HEIGHT) / 2 },
        { scale: 1 - depth * STACK_SCALE },
      ],
    };
  });

  return (
    <ReAnimated.View pointerEvents={front ? 'auto' : 'none'} style={[styles.cardSlot, animatedStyle]}>
      <Press
        accessibilityRole="button"
        accessibilityLabel={card.title}
        accessibilityElementsHidden={!front}
        importantForAccessibility={front ? 'auto' : 'no-hide-descendants'}
        onPress={card.onPress}
        scaleTo={0.985}
        style={[styles.card, { backgroundColor: theme.controlSurface }]}
      >
        <View style={styles.copy}>
          <Text numberOfLines={2} style={[styles.title, { color: theme.text }]}>{card.title}</Text>
          <View style={styles.action}>
            <Text style={[styles.actionText, { color: theme.accent }]}>{actionLabel}</Text>
            <ChevronRight color={theme.accent} size={14} strokeWidth={2.4} />
          </View>
        </View>
        <PhotoTile tone={card.tone} seed={card.seed} resWidth={240} style={styles.thumb}>
          {card.imageUrl ? <Image source={{ uri: card.imageUrl }} style={StyleSheet.absoluteFill} /> : null}
        </PhotoTile>
      </Press>
    </ReAnimated.View>
  );
}

export function JourneyFeatureDeck({
  cards, theme, autoAdvance, pageScrollRef, onHoldChange,
}: {
  cards: FeatureDeckCard[];
  theme: Theme;
  autoAdvance: boolean;
  // The page's scroll view waits for the deck's vertical swipe instead of scrolling.
  pageScrollRef: React.RefObject<unknown>;
  // True from the moment a finger lands on the deck until it lifts. Blocking
  // the native scroll view alone loses the race on device, so the page also
  // turns its scrolling off while the deck is held.
  onHoldChange: (holding: boolean) => void;
}) {
  const { t } = useI18n();
  const count = cards.length;
  // `position` counts cards passed, unbounded both ways; the card order is taken
  // modulo the deck size, so a swipe never has to reset it mid-animation.
  const position = useSharedValue(0);
  const dragging = useSharedValue(false);
  const dragBase = useSharedValue(0);
  const direction = useSharedValue(1);
  const [front, setFront] = useState(0);
  const onHoldChangeRef = useRef(onHoldChange);
  onHoldChangeRef.current = onHoldChange;
  const setHolding = useRef((holding: boolean) => onHoldChangeRef.current(holding)).current;

  const settle = (next: number, haptic: boolean) => {
    setFront(((next % count) + count) % count);
    if (haptic) detentFeedback.detent();
  };

  const advance = (step: 1 | -1, haptic: boolean) => {
    'worklet';
    direction.value = step;
    const next = Math.round(position.value) + step;
    position.value = withTiming(next, { duration: motion.standard, easing: Easing.out(Easing.cubic) }, (finished) => {
      if (finished) runOnJS(settle)(next, haptic);
    });
  };

  const gesture = useMemo(() => {
    return Gesture.Pan()
      .enabled(count > 1)
      // Vertical swipes on the deck flip cards; sideways ones fail fast and go to
      // the tab pager.
      .activeOffsetY([-10, 10])
      .failOffsetX([-16, 16])
      .blocksExternalGesture(pageScrollRef as never)
      .onBegin(() => {
        runOnJS(setHolding)(true);
      })
      .onStart(() => {
        dragging.value = true;
        dragBase.value = Math.round(position.value);
        position.value = dragBase.value;
        runOnJS(detentFeedback.prepare)();
      })
      .onUpdate((event) => {
        direction.value = event.translationY > 0 ? -1 : 1;
        position.value = dragBase.value + Math.min(1, Math.max(-1, -event.translationY / EXIT_DISTANCE));
      })
      .onFinalize((event) => {
        runOnJS(setHolding)(false);
        if (!dragging.value) return;
        dragging.value = false;
        if (-event.translationY > COMMIT_DISTANCE || event.velocityY < -650) {
          advance(1, true);
          return;
        }
        if (event.translationY > COMMIT_DISTANCE || event.velocityY > 650) {
          advance(-1, true);
          return;
        }
        position.value = withTiming(dragBase.value, { duration: motion.quick, easing: Easing.out(Easing.cubic) });
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, pageScrollRef]);

  useEffect(() => {
    // Restarted on every settle, so a manual swipe also buys a full interval.
    if (!autoAdvance || count < 2) return;
    const timer = setTimeout(() => {
      if (!dragging.value) advance(1, false);
    }, AUTO_ADVANCE_MS);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAdvance, count, front]);

  if (!count) return null;
  // Back cards render first so the front card sits on top. The previous card
  // goes last of all: it is invisible until a downward swipe drops it back
  // over the front card.
  const previous = (front - 1 + count) % count;
  const order = cards.map((_, index) => index).sort((a, b) => {
    const depth = (index: number) => (count > 2 && index === previous ? -1 : (index - front + count) % count);
    return depth(b) - depth(a);
  });

  return (
    <GestureDetector gesture={gesture}>
      <View style={styles.deck}>
        {order.map((index) => (
          <DeckCard
            key={cards[index].id}
            card={cards[index]}
            index={index}
            count={count}
            position={position}
            direction={direction}
            front={index === front}
            theme={theme}
            actionLabel={t('journeyHome.emptyStart.cardAction')}
          />
        ))}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  deck: { height: CARD_HEIGHT + STACK_OFFSET * (VISIBLE_DEPTH - 1), marginTop: space.md, marginBottom: space.xxl, marginHorizontal: layout.pagePadding },
  cardSlot: { position: 'absolute', top: 0, left: 0, right: 0, height: CARD_HEIGHT },
  card: { flex: 1, borderRadius: radius.feature, paddingLeft: space.lg, paddingRight: space.md, paddingVertical: space.xs, flexDirection: 'row', alignItems: 'center', gap: space.md, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0, 0, 0, 0.06)', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 3 } },
  copy: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontSize: 15, lineHeight: 20, fontWeight: '600', letterSpacing: 0 },
  action: { marginTop: 2, flexDirection: 'row', alignItems: 'center', gap: 2 },
  actionText: { fontSize: 13, fontWeight: '500' },
  thumb: { width: 64, height: 64, borderRadius: radius.card, overflow: 'hidden' },
});
