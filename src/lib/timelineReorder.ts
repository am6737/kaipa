export function moveTimelineItem<T>(items: T[], from: number, to: number): T[] {
  const result = [...items];
  if (from < 0 || to < 0 || from >= result.length || to >= result.length) return result;
  const [item] = result.splice(from, 1);
  result.splice(to, 0, item);
  return result;
}

/** Switch slots halfway between their insertion positions. Using slot positions
 * rather than card centres lets a tall photo card move past a short note. */
export function timelineDropIndex(layouts: { y: number; height: number }[], from: number, dy: number): number {
  const current = layouts[from];
  const top = current.y + dy;
  const positions = layouts.map((layout, index) => index <= from ? layout.y : layout.y + layout.height - current.height);
  for (let index = 0; index < positions.length - 1; index++) {
    if (top < (positions[index] + positions[index + 1]) / 2) return index;
  }
  return positions.length - 1;
}
