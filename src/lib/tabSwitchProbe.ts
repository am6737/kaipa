// Tab-switch tracing is intentionally disabled in production code.
export function markTabTap(_from: string, _to: string) {}
export function trace(_msg: string) {}

/** Which props a memoized child was actually asked to take this pass. */
export function propDiff(prev: object, next: object) {
  const a = prev as Record<string, unknown>;
  const b = next as Record<string, unknown>;
  const changed = Object.keys(b).filter((key) => a[key] !== b[key]);
  return changed.length ? changed.join(', ') : '(none)';
}
export function countRender(_name: string) {}

export function markTabCommit() {}
