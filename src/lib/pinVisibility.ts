// Which pins may be seen on the 发现 map, decided without touching what a pin is.
//
// The map keeps both mode layers mounted and hides one of them by alpha, because
// rebuilding the marker list is what costs the frames (measured ~190ms to walk 148
// markers, and it lands in the same commit as the camera move). So everything that
// used to be expressed by *building a different pin array* — the 探索/旅程 chip, and
// an open route card standing for its own place — is expressed here instead, as a
// set of keys. A pin's own fields must never depend on this, or the switch is back
// to rebuilding every marker.
//
// The key format mirrors `pinKey` in components/globe/types; that file inlines it
// too rather than importing, because MapGlobe is vm-loaded against a fixed
// dependency whitelist. Change one, change the other.

/** One place on the map: the pin that represents it, and everything that lives there. */
export interface PinPlaceGroup {
  rep: { id: string };
  group: { id: string }[];
}

/**
 * The visible set for one mode's layer.
 *
 * `openRoute` is the route whose card is on screen. That card stands for its own
 * place, so the place's pin goes — unless something else shares the trailhead, and
 * then the pin stays as the way to reach that sibling from the map.
 */
export function visiblePinKeys(
  groups: PinPlaceGroup[],
  layer: 'explore' | 'memory',
  openRoute: { id: string } | null,
): Set<string> {
  const keys = new Set<string>();
  const consumed = (id: string) => openRoute != null && id === openRoute.id;
  groups.forEach(({ rep, group }) => {
    if (openRoute && group.every((item) => consumed(item.id))) return;
    keys.add(`${layer}:${rep.id}`);
  });
  return keys;
}

/** A pin's place on the map, as `pinKey` → [longitude, latitude]. */
export type PinCoordinates = ReadonlyMap<string, readonly [number, number]>;

/** One pin of a staggered reveal and the moment it is shown. */
export interface PinRevealStep {
  key: string;
  delayMs: number;
}

/**
 * The gap between two pins of a cascade.
 *
 * A small group keeps the shared step; a big one compresses so the whole reveal
 * still finishes inside the entrance's total. Capping the *index* instead — the
 * old rhythm — sends 全国's ~150 pins out as twelve singles and then a burst.
 */
export function staggerStepMs(count: number, stepMs: number, totalMs: number): number {
  if (count <= 1) return stepMs;
  return Math.min(stepMs, totalMs / count);
}

/**
 * The order a reveal walks: nearest first from the middle of the group outward.
 *
 * Iterating the pins in array order pops them in wherever the catalog happens to
 * keep them, which reads as scattered; sweeping from the centre of the arriving
 * region reads as one thing arriving. Distance is planar with longitude squeezed
 * by the latitude cosine — a ranking, cheap, and good enough at a province's scale.
 */
export function staggerRevealPlan(
  keys: readonly string[],
  coordinates: PinCoordinates,
  stepMs: number,
  totalMs: number,
): PinRevealStep[] {
  let east = 0;
  let north = 0;
  let anchored = 0;
  keys.forEach((key) => {
    const coordinate = coordinates.get(key);
    if (!coordinate) return;
    east += coordinate[0];
    north += coordinate[1];
    anchored += 1;
  });
  // Without a centroid there is no middle to sweep from, so the order stands.
  const centre: readonly [number, number] | null = anchored > 0
    ? [east / anchored, north / anchored]
    : null;
  const distanceFromCentre = (key: string): number => {
    const coordinate = centre ? coordinates.get(key) : null;
    if (!coordinate) return Number.MAX_VALUE;
    const dx = (coordinate[0] - centre![0]) * Math.cos((coordinate[1] * Math.PI) / 180);
    const dy = coordinate[1] - centre![1];
    return dx * dx + dy * dy;
  };
  const step = staggerStepMs(keys.length, stepMs, totalMs);
  return [...keys]
    .sort((a, b) => distanceFromCentre(a) - distanceFromCentre(b))
    .map((key, index) => ({ key, delayMs: index * step }));
}
