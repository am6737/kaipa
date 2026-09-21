// Packing stage: reuse the durable draft state machine, but drive it from the
// pipeline instead of from a free-running tool loop. Generation and repair each
// get exactly one model call, then the deterministic commit path runs.
import { z } from 'npm:zod@4.1.12';
import { packingItem, packingPlanProfile, type PackingProfile } from './packing-schema.ts';
import { draftFeedback, draftPatchSchema } from './packing-draft.ts';
import { runCommitPackingDraft, runEstimatePersonalPacking, runPreparePackingDraft, runReadPackingDraft, runRepairPackingDraft } from './tools.ts';
import { readAgentGear, readJourneySections } from './context.ts';
import { boundJourneyId } from './save-stage.ts';
import type { AgentContext } from './types.ts';

type RunContext = { context: AgentContext };
type StageRunner = (input: string, signal: AbortSignal) => Promise<unknown>;
// The persisted draft's validation feedback: affected items included, so a
// repair prompt can show the exact entries a patch addresses.
type DraftFeedback = ReturnType<typeof draftFeedback>;
type PackingRunners = { generate: StageRunner; repair: StageRunner };

// Bounded, so a checklist that cannot pass validation stops and is reported
// rather than spending the whole stage budget on repairs.
const PACKING_REPAIR_LIMIT = 3;

export const packingProposalSchema = z.object({
  // Optional: the plan stage already computed the authoritative profile, and a
  // generation that omits it must not fail the whole checklist; the stage
  // falls back to that computed profile.
  planProfile: packingPlanProfile.optional(),
  items: z.array(packingItem).max(100),
});

// Provider-facing variant: structured-output providers require every property
// to be present, so optional packing fields are represented as nullable values
// and normalized before the strict draft schema is applied.
const packingItemModelSchema = packingItem.extend({
  attributes: packingItem.shape.attributes.nullable().default(null),
  categoryName: packingItem.shape.categoryName.nullable().default(null),
  estimatedEnergyKcalPerUnit: packingItem.shape.estimatedEnergyKcalPerUnit.nullable().default(null),
});
export const packingProposalModelSchema = z.object({
  planProfile: packingPlanProfile.nullable().default(null),
  items: z.array(packingItemModelSchema).max(100).default([]),
});
export const packingPatchModelSchema = z.object({
  revision: z.number().int().positive(),
  changes: z.array(z.object({
    id: z.string(),
    patch: z.object({
      name: z.string().nullable().default(null),
      attributes: z.array(z.object({ name: z.string(), value: z.string() })).nullable().default(null),
      categoryName: z.string().nullable().default(null),
      quantity: z.number().int().min(1).max(99).nullable().default(null),
      weightKg: z.number().min(0).max(100).nullable().default(null),
      weightEstimated: z.boolean().nullable().default(null),
      carryStatus: z.enum(['packed', 'worn', 'consumable']).nullable().default(null),
      estimatedEnergyKcalPerUnit: z.number().positive().max(3000).nullable().default(null),
    }).default({ name: null, attributes: null, categoryName: null, quantity: null, weightKg: null, weightEstimated: null, carryStatus: null, estimatedEnergyKcalPerUnit: null }),
  })).max(30).default([]),
  additions: z.array(packingItemModelSchema).max(30).default([]),
  removals: z.array(z.string()).max(30).default([]),
});

export type PackingArtifact = {
  status: 'committed' | 'needs_repair' | 'failed' | 'skipped';
  revision: number | null;
  itemCount: number | null;
  issues: Array<{ code: string; field: string; message: string }>;
  error?: string;
};

export async function runPackingStage(deps: PackingRunners & {
  client: any;
  context: AgentContext;
  signal: AbortSignal;
  planProfile: PackingProfile | null;
  planInput: string;
}): Promise<PackingArtifact> {
  const { client, context } = deps;
  const runContext = { context } as RunContext;
  const journeyId = boundJourneyId(context);
  if (!journeyId) return { status: 'skipped', revision: null, itemCount: null, issues: [], error: '缺少旅程，无法生成清单' };

  try {
    const planProfile = deps.planProfile ?? { accommodation: 'unknown', waterRefill: 'unknown', mealPreparation: 'unknown' } as PackingProfile;
    const needs = await runEstimatePersonalPacking({ journeyId, planProfile }, runContext);
    const existing = await runReadPackingDraft({}, runContext) as DraftFeedback | { status: 'absent' };
    let feedback: DraftFeedback;
    // An existing draft is repaired, never regenerated (same rule as the light path).
    if (existing.status === 'absent') {
      const generated = await generateDraft(journeyId, runContext, deps, needs);
      if ('error' in generated) return { status: 'failed', revision: null, itemCount: null, issues: [], error: generated.error };
      feedback = generated.feedback;
    } else {
      // The runtime guarantee here is real (any non-absent read is a draft);
      // draftFeedback's inferred status string prevents narrowing.
      feedback = existing as DraftFeedback;
    }
    // Validation reports every issue at once and one patch rarely clears them
    // all, so the repair is bounded by rounds, not by a single attempt.
    for (let round = 0; round < PACKING_REPAIR_LIMIT && feedback.status === 'needs_repair'; round += 1) {
      const next = await repairDraft(feedback, runContext, deps, needs);
      if (next === feedback) break;
      feedback = next;
    }
    if (feedback.status !== 'ready') {
      return { status: 'needs_repair', revision: feedback.revision, itemCount: feedback.itemCount, issues: feedback.issues };
    }
    // The commit transaction compares the observed versions of every section
    // a full-list write depends on.
    await readJourneySections(client, context, journeyId, ['journey', 'track', 'itinerary', 'packing']);
    await readAgentGear(client, context);
    const committed = await runCommitPackingDraft({ revision: feedback.revision }, runContext) as { added?: number };
    return { status: 'committed', revision: feedback.revision, itemCount: committed?.added ?? feedback.itemCount, issues: [] };
  } catch (error) {
    return { status: 'failed', revision: null, itemCount: null, issues: [], error: message(error) };
  }
}

async function generateDraft(journeyId: string, runContext: RunContext, deps: PackingRunners & {
  signal: AbortSignal; planProfile: PackingProfile | null; planInput: string;
}, needs: unknown): Promise<{ feedback: DraftFeedback } | { error: string }> {
  try {
    const planProfile = deps.planProfile ?? { accommodation: 'unknown', waterRefill: 'unknown', mealPreparation: 'unknown' } as PackingProfile;
    const proposalInput = [
      deps.planInput,
      '',
      '本轮只生成完整的个人装备清单草稿，不保存任何业务写入。',
      `个人需求估算（内部使用；不要把体重、热量、公式或计算过程写进清单项或任何用户可见文字）：${JSON.stringify(needs)}`,
    ].join('\n');
    // The evidence-aware re-ask rarely salvages a long item array, so a failed
    // generation gets one clean-slate retry instead of dying on the first
    // model hiccup.
    let proposal;
    try {
      proposal = packingProposalSchema.parse(normalizePackingModel(await deps.generate(proposalInput, deps.signal)));
    } catch (error) {
      console.warn('[AppAgent] packing generation failed, retrying from scratch', message(error).slice(0, 300));
      proposal = packingProposalSchema.parse(normalizePackingModel(await deps.generate(proposalInput, deps.signal)));
    }
    return { feedback: await runPreparePackingDraft({ journeyId, planProfile: proposal.planProfile ?? planProfile, items: proposal.items }, runContext) as DraftFeedback };
  } catch (error) {
    return { error: message(error) };
  }
}

function normalizePackingModel(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const record = { ...(value as Record<string, unknown>) };
  if (record.planProfile == null) delete record.planProfile;
  for (const key of ['items', 'additions']) {
    if (!Array.isArray(record[key])) continue;
    record[key] = (record[key] as unknown[]).map(item => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
      const normalized = { ...(item as Record<string, unknown>) };
      for (const field of ['attributes', 'categoryName', 'estimatedEnergyKcalPerUnit']) if (normalized[field] == null) delete normalized[field];
      return normalized;
    });
  }
  if (Array.isArray(record.changes)) {
    record.changes = (record.changes as unknown[]).map(change => {
      if (!change || typeof change !== 'object' || Array.isArray(change)) return change;
      const normalized = { ...(change as Record<string, unknown>) };
      const patch = normalized.patch;
      if (patch && typeof patch === 'object' && !Array.isArray(patch)) {
        const clean = { ...(patch as Record<string, unknown>) };
        for (const field of ['name', 'attributes', 'categoryName', 'quantity', 'weightKg', 'weightEstimated', 'carryStatus', 'estimatedEnergyKcalPerUnit']) if (clean[field] == null) delete clean[field];
        normalized.patch = clean;
      }
      return normalized;
    });
  }
  return record;
}

async function repairDraft(feedback: DraftFeedback, runContext: RunContext, deps: { repair: StageRunner; signal: AbortSignal }, needs: unknown): Promise<DraftFeedback> {
  // Unlike the light path, this agent has no memory of the draft it is
  // patching, so the prompt carries the affected items and spells out what
  // a coverage gap asks for: without it the model guesses IDs and leaves
  // missing categories unfixed.
  const nutrition = (feedback.issues.some(issue => issue.code === 'nutrition'))
    ? `\n路餐热量目标（estimatedEnergyKcalPerUnit × quantity 的总和须落在此区间）：${JSON.stringify((needs as { recommendation: { carriedFoodEnergyKcal: unknown } }).recommendation.carriedFoodEnergyKcal)}；code 为 nutrition 表示总热量超出或不足：过量时把正餐放入 removals 删除、或减少食品数量、更换为小份包装，不足时增加具体食品。`
    : '';
  const input = [
    '以下是同一份装备清单草稿的校验结果，只修补列出的问题，不要重新生成或重述整份清单。',
    `当前 revision：${feedback.revision}`,
    `受影响条目（按 stable ID 修补 changes）：${JSON.stringify(feedback.items)}`,
    `问题：${JSON.stringify(feedback.issues)}（code 以 coverage: 开头表示清单缺少该类别，必须在 additions 中新增对应物品）`,
    nutrition,
    feedback.next,
  ].join('\n');
  try {
    const patch = draftPatchSchema.parse(await deps.repair(input, deps.signal));
    return await runRepairPackingDraft({ ...patch, revision: feedback.revision }, runContext) as DraftFeedback;
  } catch (error) {
    if (deps.signal.aborted) return feedback;
    // A shape-valid patch can still fail on business rules (hallucinated
    // IDs); one re-ask with the concrete error is cheap and usually clears
    // it, while a second failure means the model cannot patch this draft.
    console.warn('[AppAgent] packing repair rejected, re-asking with the error', message(error).slice(0, 300));
    try {
      const patch = draftPatchSchema.parse(await deps.repair([
        `上一次补丁未通过：${message(error).slice(0, 300)}。请只使用上面列出的稳定 ID 修补，changes 与 removals 不能使用同一个 ID，也不能使用不存在的 ID；additions 是完整的新条目，不需要 ID；重新输出完整补丁。`,
        input,
      ].join('\n'), deps.signal));
      return await runRepairPackingDraft({ ...patch, revision: feedback.revision }, runContext) as DraftFeedback;
    } catch (second) {
      // Keep the un-repaired feedback so the caller reports the real issues.
      console.warn('[AppAgent] packing repair unavailable', message(second).slice(0, 300));
      return feedback;
    }
  }
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
