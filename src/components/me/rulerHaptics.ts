import { detentFeedback } from '../../../modules/haptics-engine';

type Detents = { minor: number; major: number };

/**
 * Detents sit on the ruler's emphasised marks — `minor` the half-step tick, `major` the labelled one —
 * not on every printed raster line, so 0.1 kg of travel does not mean 0.1 kg of buzzing.
 *
 * Firing on a crossed boundary instead of on a clock keeps the rhythm tied to geometry: a slow drag can
 * no longer drop beats, and a fast one can no longer stack them.
 */
export function createRulerHaptics({ minor, major }: Detents) {
  let coasting = true;
  let atEdge = false;
  return {
    grab() {
      coasting = false;
      atEdge = false;
      detentFeedback.prepare();
    },
    release() {
      coasting = true;
      atEdge = false;
      detentFeedback.commit();
    },
    /** Limits ring once per contact, so leaning on the end of the ruler is not an alarm. */
    edge(atBoundary: boolean) {
      if (atBoundary && !atEdge) detentFeedback.boundary();
      atEdge = atBoundary;
    },
    move(previous: number, next: number) {
      if (next === previous) return;
      // Under the finger every tick answers; coasting, only the labelled ones do, or it reads as a rattle.
      tick(previous, next, { minor, major }, coasting);
    },
  };
}

export function createWheelHaptics({ minor, major }: Detents) {
  /** A wheel reports discrete items, so each reported change is already one detent; the last one is the settle. */
  return {
    select(previous: number, next: number) {
      if (next === previous) return;
      tick(previous, next, { minor, major }, false);
    },
  };
}

const crossed = (from: number, to: number, step: number) => Math.floor(from / step) !== Math.floor(to / step);

function tick(previous: number, next: number, { minor, major }: Detents, coarseOnly: boolean) {
  if (crossed(previous, next, major)) {
    detentFeedback.detent('coarse');
    return;
  }
  if (!coarseOnly && crossed(previous, next, minor)) {
    detentFeedback.detent('fine');
  }
}
