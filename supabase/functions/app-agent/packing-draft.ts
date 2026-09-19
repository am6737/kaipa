import { z } from 'npm:zod@4.1.12';
import { packingItem, packingPlanProfile, type PackingItem } from './packing-schema.ts';

export const draftSchema = z.object({
  journeyId: z.string(), revision: z.number().int().min(1), repairs: z.number().int().min(0),
  planProfile: packingPlanProfile,
  items: z.array(z.object({ id: z.string(), value: packingItem })).min(1).max(100),
});
export type PackingDraft = z.infer<typeof draftSchema>;
export type DraftIssue = { code: string; itemIds: string[]; field: string; message: string };
export const draftPatchSchema = z.object({
  revision: z.number().int().positive(),
  // A patch that only adds items, or only fixes one field, is normal; the
  // untouched categories are simply absent. patchPackingDraft still rejects a
  // patch that changes nothing at all.
  changes: z.array(z.object({ id: z.string(), patch: packingItem.extend({ quantity: z.number().int().min(1).max(99) }).partial().strict() })).max(30).default([]),
  additions: z.array(packingItem).max(30).default([]),
  removals: z.array(z.string()).max(30).default([]),
});
export function newPackingDraft(journeyId: string, planProfile: PackingDraft['planProfile'], items: PackingItem[]): PackingDraft {
  return draftSchema.parse({ journeyId, planProfile, revision: 1, repairs: 0, items: items.map((value, index) => ({ id: `item-${index + 1}`, value })) });
}
export function patchPackingDraft(draft: PackingDraft, input: z.infer<typeof draftPatchSchema>): PackingDraft {
  const patch = draftPatchSchema.parse(input);
  if (patch.revision !== draft.revision) throw new Error('draft_revision_conflict: reload the current draft');
  const ids = new Set(draft.items.map(item => item.id));
  const targets = [...patch.changes.map(change => change.id), ...patch.removals];
  // Spell out the offending IDs: the repair re-ask feeds this message back to
  // the model, which cannot fix IDs it cannot see.
  const unknown = [...new Set(targets.filter(id => !ids.has(id)))];
  const duplicates = [...new Set(targets.filter((id, index) => targets.indexOf(id) !== index))];
  if (unknown.length || duplicates.length) {
    throw new Error([unknown.length ? `Unknown draft item IDs: ${unknown.join(', ')}` : '', duplicates.length ? `Duplicate IDs across changes/removals: ${duplicates.join(', ')}` : ''].filter(Boolean).join('; '));
  }
  if (!targets.length && !patch.additions.length) throw new Error('Empty draft patch');
  const changes = new Map(patch.changes.map(change => [change.id, change.patch]));
  return draftSchema.parse({ ...draft, revision: draft.revision + 1, repairs: draft.repairs + 1,
    items: [...draft.items.filter(item => !patch.removals.includes(item.id)).map(item => ({ ...item, value: { ...item.value, ...changes.get(item.id) } })),
      ...patch.additions.map((value, index) => ({ id: `r${draft.revision + 1}-item-${index + 1}`, value }))],
  });
}

export function draftFeedback(draft: PackingDraft, issues: DraftIssue[]) {
  const affected = new Set(issues.flatMap(issue => issue.itemIds));
  return { revision: draft.revision, status: issues.length ? 'needs_repair' : 'ready', itemCount: draft.items.length,
    issues,
    items: draft.items.filter(item => affected.has(item.id)),
    next: issues.length
      ? 'Patch only affected draft IDs or add missing categories. Do not resubmit the full list. These are internal draft repairs, not saved checklist changes.'
      : 'Call commit_packing_draft with this revision; nothing is saved to the checklist yet.' };
}
