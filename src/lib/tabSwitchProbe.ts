// TEMPORARY probe for the bottom-tab switch lag. Delete after the diagnosis.
import { Platform } from 'react-native';

const now = () =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

interface Sample {
  from: string;
  to: string;
  tTap: number;
  tCommit: number;
  tFrame: number;
  renders: Record<string, number>;
  driftBeforeTap: number;
}

let pending: Sample | null = null;

// How late does a 50ms timer actually fire? A large drift means the JS thread
// was busy on its own, before the tap ever arrived.
let lastTick = now();
let maxDrift = 0;
if (__DEV__) {
  setInterval(() => {
    const t = now();
    const drift = t - lastTick - 50;
    lastTick = t;
    if (drift > maxDrift) maxDrift = drift;
  }, 50);
  // What the JS thread is doing while nobody taps. Skipped during a switch so
  // the line always describes real idle.
  setInterval(() => {
    if (pending) return;
    console.log(`[tabidle] sitting still, maxDrift=${Math.round(maxDrift)}ms`);
    maxDrift = 0;
  }, 2000);
}

export function markTabTap(from: string, to: string) {
  if (!__DEV__) return;
  pending = {
    from,
    to,
    tTap: now(),
    tCommit: 0,
    tFrame: 0,
    renders: {},
    driftBeforeTap: Math.round(maxDrift),
  };
  maxDrift = 0;
  console.log(`[tabswitch] tap ${from}→${to} drift-before-tap=${pending.driftBeforeTap}ms`);
}

/** One line with the offset from the last tap, so the gaps between lines show
    which render phase eats the frame. */
export function trace(msg: string) {
  if (!__DEV__ || !pending) return;
  console.log(`[tabswitch]   +${Math.round(now() - pending.tTap)}ms ${msg}`);
}

/** Which props a memoized child was actually asked to take this pass. */
export function propDiff(prev: object, next: object) {
  const a = prev as Record<string, unknown>;
  const b = next as Record<string, unknown>;
  const changed = Object.keys(b).filter((key) => a[key] !== b[key]);
  return changed.length ? changed.join(', ') : '(none)';
}
export function countRender(name: string) {
  if (!__DEV__ || !pending) return;
  pending.renders[name] = (pending.renders[name] || 0) + 1;
  console.log(`[tabswitch]   +${Math.round(now() - pending.tTap)}ms render ${name}`);
}

function report() {
  if (!pending) return;
  const s = pending;
  pending = null;
  const ms = (t: number) => Math.round(t - s.tTap);
  console.log(
    `[tabswitch:${Platform.OS}] ${s.from}→${s.to} ` +
      `js=${ms(s.tCommit)}ms frame=+${ms(s.tFrame)}ms ` +
      `drift-before-tap=${s.driftBeforeTap}ms renders=${JSON.stringify(s.renders)}`,
  );
}

export function markTabCommit() {
  if (!__DEV__ || !pending) return;
  const sample = pending;
  sample.tCommit = now();
  console.log(`[tabswitch]   +${Math.round(now() - sample.tTap)}ms commit+effects done`);
  requestAnimationFrame(() => {
    if (pending !== sample) return;
    sample.tFrame = now();
    report();
  });
  // A tap that never reaches a frame still reports.
  setTimeout(() => {
    if (pending === sample) report();
  }, 3000);
}
