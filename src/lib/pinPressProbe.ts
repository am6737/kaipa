// TEMPORARY probe: the first tap on a 发现 map pin right after a detail card
// closes does nothing, and the very next tap works. That symptom means one tap
// is *delivered somewhere else* rather than being lost, so this answers only
// one question: which handler did each tap reach, in what order, and what the
// press gates believed at that moment.
//
// Everything is printed against a snapshot of the Discover render it happened
// in (`ctx=`), so a paste of two taps is enough to tell these apart:
//   - `bg` alone            → the map ate the tap (native camera/annotation)
//   - `bg` and no `poi`, set lacks the key → the MapGlobe visibility guard ate it
//   - `poi lookup=MISS`     → the pressed pin is no longer in the caller's groups
//   - `poi → open` + nothing on screen → nav/sheet state, not the map
//
// Delete this file and its `pressProbe.*` call sites once the cause is known.
import { Platform } from 'react-native';

interface Context {
  pointInfo: string;
  sheetOpen: boolean;
  immersive: boolean;
  layer: string;
  rail: boolean;
  pins: number;
  /** Whether the caller asked the map to render POI pins at all. */
  poiMarkers: boolean;
  /** Size of the visibility set the map was last told to show. */
  visibleSet: number;
  /** Camera move still in flight? Its revision is printed so a restore can be
      matched against the tap that followed it. */
  cameraRevision: number;
  /** How long ago a marker press last stamped the bubble guard. */
  markerPressAgo: number;
  /** `layer:id@lng,lat` for the pins the rail lets be seen. */
  where: string;
}

let context: Context | null = null;
let lastAt = 0;

function stamp(): string {
  const now = Date.now();
  const gap = lastAt ? `+${now - lastAt}ms ` : '';
  lastAt = now;
  return gap;
}

function print(event: string, detail: string): void {
  if (!__DEV__) return;
  const ctx = context
    ? ` | point=${context.pointInfo || 'none'} sheet=${context.sheetOpen ? 1 : 0}`
      + ` imm=${context.immersive ? 1 : 0} layer=${context.layer} rail=${context.rail ? 1 : 0}`
      + ` pins=${context.pins} poiMarkers=${context.poiMarkers ? 1 : 0}`
      + ` set=${context.visibleSet} camRev=${context.cameraRevision}`
      + ` lastMarker=${context.markerPressAgo}ms seen=${context.where}`
    : ' | (no context)';
  console.log(`[pinpress:${Platform.OS}] ${stamp()}${event} ${detail}${ctx}`);
}

export const pressProbe = {
  /** Called during every Discover render so the lines below describe the render
      the tap actually landed in. */
  context(next: Context): void {
    context = next;
  },
  open(target: string): void {
    print('OPEN  ', target);
  },
  dismissStart(via: string): void {
    print('DISMISS-start', via);
  },
  dismissDone(via: string): void {
    print('DISMISS-done ', via);
  },
  cameraRestore(what: string): void {
    print('CAMERA restore', what);
  },
  /** The map's own background press, before any of its guards decide. */
  background(): void {
    print('TAP   bg (map press reached JS)', '');
  },
  backgroundSkipped(why: string): void {
    print('TAP   bg ->', why);
  },
  /** A POI pin's press, as the caller sees it — the map's visibility guard runs
      upstream of this and is judged by `set` + `inSet` below. */
  marker(id: string, inSet: boolean, lookup: 'hit' | 'MISS', branch: string): void {
    print('TAP   poi', `id=${id} inVisibleSet=${inSet ? 1 : 0} group=${lookup} -> ${branch}`);
  },
  /** MapGlobe: the annotation's own press arrived. */
  markerInMap(key: string, at: string): void {
    print('TAP   annotation', `${key} passed the rail at ${at} -> caller`);
  },
  /** MapGlobe: the annotation's press arrived but the rail set says it is hidden,
      so the caller is never told. This is a pin that is on screen yet cannot be
      tapped, and it also *steals* the hit-test from any visible pin behind it. */
  blocked(key: string, at: string, setSize: number, verdict: string): void {
    print('TAP   annotation', `${key} BLOCKED by rail at ${at} (set=${setSize}) ${verdict}`);
  },
  /** MapGlobe: the geometry behind a redirect — how sure it was, at what zoom,
      against how many visible pins. */
  overlap(pressed: string, matched: string, score: number, zoom: number, candidates: number): void {
    print('HIT   overlap', `pressed=${pressed} -> ${matched || 'nobody'} overlap=${(score * 100).toFixed(0)}% zoom=${zoom.toFixed(2)} visible=${candidates}`);
  },
  /** MapGlobe: the caller pushed a new visible set. `revealed` is what the map
      believes is shown, `alphas` how many pins are mounted — the two can drift,
      and a pin that is mounted but was skipped by `apply` keeps whatever opacity
      it was created with. */
  railApplied(keys: number, revealed: number, alphas: number, stagger: boolean): void {
    print('RAIL  apply', `keys=${keys} revealed=${revealed} mountedPins=${alphas} stagger=${stagger ? 1 : 0}`);
  },
};

if (__DEV__ && typeof globalThis !== 'undefined') {
  // MapGlobe reads the probe through this rather than an import: two node tests
  // vm-load that file against a fixed dependency whitelist.
  (globalThis as unknown as { __pinpress?: typeof pressProbe }).__pinpress = pressProbe;
}
