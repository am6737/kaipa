// TEMPORARY - delete once the card-open frame is measured.
//
// What one press actually costs, frame by frame, and which thread owed the bill.
// The `[pinpress]` probe answers "did this press reach the caller"; it says
// nothing about frames, and this is the question that needs the other answer: the
// last measurement put a 244ms JS-thread block in the frame where the route
// track arrives, which is exactly the moment the card pops and the camera zooms.
//
// It is deliberately self-attributing: every line it prints says which arm it
// measured, how many track vertices went to the native map, and whether the
// blocked frame was JS or native. One paste of two taps should be enough to say
// whether the frame got cheaper and who still owns what is left.
import { Platform } from 'react-native';

/** A frame slower than this is a hitch a finger can feel. */
const DROPPED_FRAME_MS = 24;
/** Report this long after the camera last moved: the animation's tail is where a
    blocked frame hurts, and anything after it is a different transition. */
const SETTLE_TAIL_MS = 420;
/** Do not sample forever if a settle never arrives. */
const SAMPLE_CAP_MS = 4000;
const WORST_REPORTED = 3;

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

interface Gap {
  after: string;
  ms: number;
  jsDrift: number;
}

interface Sample {
  label: string;
  tTap: number;
  lastFrame: number;
  lastStage: string;
  stages: string[];
  gaps: Gap[];
  raf: number | null;
  settleTimer: ReturnType<typeof setTimeout> | null;
  capTimer: ReturnType<typeof setTimeout> | null;
}

let sample: Sample | null = null;
let lastTick = now();
let frameDrift = 0;

// A 50ms interval is the cheap way to tell "JS was busy" from "JS was idle and
// the main thread never came back to us": a blocked JS thread delays this timer
// as well, a blocked native thread does not.
if (__DEV__) {
  setInterval(() => {
    const t = now();
    const drift = t - lastTick - 50;
    lastTick = t;
    if (drift > frameDrift) frameDrift = drift;
  }, 50);
}

function frame(): void {
  const current = sample;
  if (!current) return;
  const t = now();
  current.gaps.push({ after: current.lastStage, ms: t - current.lastFrame, jsDrift: Math.round(frameDrift) });
  frameDrift = 0;
  current.lastFrame = t;
  current.raf = requestAnimationFrame(frame);
}

function report(reason: string): void {
  const s = sample;
  if (!s) return;
  sample = null;
  if (s.raf != null) cancelAnimationFrame(s.raf);
  if (s.settleTimer) clearTimeout(s.settleTimer);
  if (s.capTimer) clearTimeout(s.capTimer);
  const dropped = s.gaps.filter((gap) => gap.ms > DROPPED_FRAME_MS);
  const blocked = Math.round(dropped.reduce((sum, gap) => sum + gap.ms - 16.7, 0));
  const worst = s.gaps.length ? Math.round(Math.max(...s.gaps.map((gap) => gap.ms))) : 0;
  console.log(
    `[pointframe:${Platform.OS}] ${s.label} ${reason} total=${Math.round(now() - s.tTap)}ms ` +
      `frames=${s.gaps.length} worst=${worst}ms dropped=${dropped.length} blocked=${blocked}ms`,
  );
  console.log(`[pointframe:${Platform.OS}] ${s.label} stages: ${s.stages.join(' | ') || '(none)'}`);
  [...dropped]
    .sort((a, b) => b.ms - a.ms)
    .slice(0, WORST_REPORTED)
    .forEach((gap, index) => {
      console.log(
        `[pointframe:${Platform.OS}] ${s.label} worst[${index + 1}] ${Math.round(gap.ms)}ms ` +
          `during=${gap.after} jsDrift=${gap.jsDrift}ms → ` +
          `${gap.jsDrift > gap.ms / 2 ? 'JS thread' : 'main thread (native)'}`,
      );
    });
}

/** Called at the press that starts the transition. */
export function beginFrameSample(label: string, counts?: string): void {
  if (!__DEV__) return;
  if (sample) {
    // One close reaches this twice (the card's own dismiss and the sheet's
    // onDismiss). Keep the first sample: starting a second would throw away the
    // frames already measured.
    if (sample.label.split(' ')[0] === label.split(' ')[0] && now() - sample.tTap < 800) {
      markFrameStage('dup-begin-ignored', counts);
      return;
    }
    report('aborted-by-new-tap');
  }
  const t = now();
  sample = {
    label: counts ? `${label} ${counts}` : label,
    tTap: t,
    lastFrame: t,
    lastStage: 'tap',
    stages: [`+0ms tap ${counts ?? ''}`.trim()],
    gaps: [],
    raf: requestAnimationFrame(frame),
    settleTimer: null,
    capTimer: setTimeout(() => report('capped'), SAMPLE_CAP_MS),
  };
  frameDrift = 0;
}

/** Which commit we are about to pay for, and what it was asked to build. */
export function markFrameStage(stage: string, counts?: string): void {
  const s = sample;
  if (!s || !__DEV__) return;
  s.lastStage = stage;
  s.stages.push(`+${Math.round(now() - s.tTap)}ms ${stage}${counts ? ` ${counts}` : ''}`);
}

/**
 * The camera reported a move. The frames between now and the tail are the ones
 * the user is watching, so this is where a dropped frame costs the most.
 */
export function noteFrameCameraMove(): void {
  if (!sample || !__DEV__) return;
  markFrameStage('camera-move');
}

/** The move is over; report what the whole transition cost. */
export function endFrameSample(): void {
  const s = sample;
  if (!s || !__DEV__) return;
  if (s.settleTimer) clearTimeout(s.settleTimer);
  s.settleTimer = setTimeout(() => report('camera-settled'), SETTLE_TAIL_MS);
}

/**
 * The map hands this its own account of what a frame cost it: how many track
 * vertices came in and how many it is actually drawing. It is reached through a
 * global rather than an import because MapGlobe is loaded by a test with a
 * dependency whitelist - see the note in ./tabSwitchProbe.
 */
interface FrameProbeGlobals {
  /** What the native map was actually asked to draw, against what came in. */
  vertices: (source: number, drawn: number) => void;
}

(globalThis as unknown as { __pointframe?: FrameProbeGlobals }).__pointframe = {
  vertices: (source, drawn) => {
    if (!sample || !__DEV__) return;
    markFrameStage('draw', `track=${source}→${drawn}`);
  },
};
