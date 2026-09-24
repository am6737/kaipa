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
 * then the pin stays as the way to lay that sibling over the open route for
 * comparison. Hiding it instead would remove the only map affordance for comparing
 * two routes that start at the same point.
 */
export function visiblePinKeys(
  groups: PinPlaceGroup[],
  layer: 'explore' | 'memory',
  openRoute: { id: string; comparisonIds: ReadonlySet<string> } | null,
): Set<string> {
  const keys = new Set<string>();
  const consumed = (id: string) => openRoute != null && (id === openRoute.id || openRoute.comparisonIds.has(id));
  groups.forEach(({ rep, group }) => {
    if (openRoute && group.every((item) => consumed(item.id))) return;
    keys.add(`${layer}:${rep.id}`);
  });
  return keys;
}
