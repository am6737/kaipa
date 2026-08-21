export type DeletionTarget = { id: string; label: string };

export function validateDeletionTargets(requested: DeletionTarget[], found: DeletionTarget[], staleMessage: string) {
  const ids = requested.map((item) => item.id);
  if (new Set(ids).size !== ids.length) throw new Error('删除项目中包含重复 ID');

  const foundById = new Map(found.map((item) => [item.id, item.label]));
  const stale = requested.find((item) => foundById.get(item.id) !== item.label);
  if (foundById.size !== ids.length || stale) throw new Error(staleMessage);
  return ids;
}
