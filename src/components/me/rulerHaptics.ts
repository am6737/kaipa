import { detentFeedback } from '../../../modules/haptics-engine';

/**
 * One event per tickmark, the way the Clock app's countdown wheel does it: a row the value passes is a
 * click, and nothing else clicks.
 *
 * The rhythm comes from the value, not from a clock: firing on every scroll callback buzzes because
 * `Math.round` walks back and forth over one boundary while the list settles, and throttling by time drops
 * beats on a slow drag. So one call per change of the reported value, and the engine decides how many
 * clicks per second an actuator can actually render.
 */
export function createRulerHaptics() {
  let atEdge = false;
  return {
    grab() {
      atEdge = false;
      detentFeedback.prepare();
    },
    release() {
      atEdge = false;
      detentFeedback.commit();
    },
    /** Limits ring once per contact, so leaning on the end of the ruler is not an alarm. */
    edge(atBoundary: boolean) {
      if (atBoundary && !atEdge) detentFeedback.boundary();
      atEdge = atBoundary;
    },
    move(previous: number, next: number) {
      if (next !== previous) detentFeedback.detent();
    },
  };
}

/**
 * A wheel already reports discrete rows, so every change it hands over is one click and the row it lands on
 * is the settle. `settle` stays silent until something rolled, because these libraries also report the
 * current row on mount and a mount must not click.
 */
export function createWheelHaptics<Value extends number | string>() {
  let rolled = false;
  return {
    select(previous: Value, next: Value) {
      if (next === previous) return;
      rolled = true;
      detentFeedback.detent();
    },
    settle() {
      if (!rolled) return;
      rolled = false;
      detentFeedback.commit();
    },
  };
}
