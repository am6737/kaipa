// A stage that falls back to an incomplete artifact must not be persisted as
// 'completed': the app reported a finished plan while the journey stayed
// empty. These tests pin the status the plan stage writes and the resume
// behavior that keeps a retry from re-planning against an already-written save.
import { runStage, type PipelineDeps } from './pipeline.ts';
import type { PlanDocument } from './plan-document.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

type Written = { stage: string; status: string; artifact?: unknown; error?: string | null };

function harness(previous?: { status: string; artifact: unknown }) {
  const written: Written[] = [];
  const admin = {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      Object.assign(chain, {
        update: self, eq: self, select: self,
        maybeSingle: () => Promise.resolve({ data: { id: 'run' }, error: null }),
        upsert: (value: Written) => { written.push(value); return Promise.resolve({ error: null }); },
      });
      assert(table === 'agent_runs' || table === 'agent_stages', `unexpected table ${table}`);
      return chain;
    },
  };
  const state = new Map();
  if (previous) state.set('plan', { stage: 'plan', status: previous.status, artifact: previous.artifact });
  return {
    written,
    deps: { name: 'plan' as const, state, pipeline: { admin, runId: 'run', userId: 'user', attempt: 1, signal: new AbortController().signal } as unknown as PipelineDeps },
  };
}

const emptyPlan = { itineraryItems: [], journey: { name: '党岭', days: 3 } } as unknown as PlanDocument;
const filledPlan = { itineraryItems: [{ day: 'Day 1', title: '徒步' }], journey: { name: '党岭', days: 3 } } as unknown as PlanDocument;
const degrade = (plan: PlanDocument) => plan.itineraryItems.length === 0 ? 'produced no itinerary items' : null;

Deno.test('a stage that falls back is persisted as degraded, with its reason', async () => {
  const h = harness();
  const result = await runStage({ ...h.deps, execute: async () => emptyPlan, degrade });
  assert(result.artifact === emptyPlan, 'the artifact is still returned for the later stages');
  assert(h.written.length === 2, `expected a running and a terminal write, got ${h.written.length}`);
  const terminal = h.written[1];
  assert(terminal.status === 'degraded', `a fallback must not be reported as completed, got ${terminal.status}`);
  assert(terminal.artifact === emptyPlan, 'the degraded artifact is still persisted for the save stage');
  assert(terminal.error === 'produced no itinerary items', 'the reason is recorded for operators');
});

Deno.test('a stage with real content stays completed', async () => {
  const h = harness();
  await runStage({ ...h.deps, execute: async () => filledPlan, degrade });
  assert(h.written[1].status === 'completed', `a filled plan must stay completed, got ${h.written[1].status}`);
  assert(h.written[1].error == null, 'a completed stage carries no error');
});

Deno.test('a retry reuses a degraded stage instead of re-planning it', async () => {
  const h = harness({ status: 'degraded', artifact: emptyPlan });
  let executed = false;
  const result = await runStage({ ...h.deps, execute: async () => { executed = true; return filledPlan; }, degrade });
  assert(!executed, 'a degraded stage must not be re-run: the save stage was already written against its artifact');
  assert(result.artifact === emptyPlan, 'the reused artifact is returned');
  assert(h.written.length === 0, 'no stage row is rewritten on reuse');
});

Deno.test('a failed stage is still retried', async () => {
  const h = harness({ status: 'failed', artifact: null });
  await runStage({ ...h.deps, execute: async () => filledPlan, degrade });
  assert(h.written[1].status === 'completed', 'a failed stage must be re-run and persisted');
});
