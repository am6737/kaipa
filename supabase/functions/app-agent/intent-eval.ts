import type { TaskDomain, WriteOperation } from './task.ts';
import { intentWrites, type Intent } from './intent-router.ts';
import type { AgentIntent } from './types.ts';

// Offline intent evaluation (docs/agent-intent-evaluation.md). This module is
// pure: case types, per-case scoring and summaries. Network calls live in
// scripts/evaluate-intent.ts.

// The taxonomy, shared definitions and write sets live with the production
// router so the eval measures exactly what runs.
export { intentDefinitions, intentFromDecision, intents, intentWrites, type Intent } from './intent-router.ts';

export type IntentCase = {
  id: string;
  message: string;
  context?: {
    journey?: boolean;
    track?: boolean;
    appIntent?: AgentIntent;
    recent?: Array<{ role: 'user' | 'assistant'; content: string }>;
    previous?: { pendingQuestion: string; fullHikingPlan?: boolean; operations?: WriteOperation[]; domain?: TaskDomain; destination?: string };
  };
  expect: {
    intent: Intent;
    /** Other answers that are reasonable, though not ideal. */
    acceptable?: Intent[];
    /** Answers that cause the wrong write or a wasted pipeline run. */
    forbidden?: Intent[];
    /** False when entering the staged pipeline would be wrong for this case. */
    pipeline?: boolean;
  };
  note?: string;
};

export type Prediction = {
  intent: Intent;
  /** Writes the server would actually authorize (after constraints), when known. */
  operations?: WriteOperation[];
  /** Whether the server would enter the staged pipeline, when known. */
  pipeline?: boolean;
  confidence?: number | null;
  alternatives?: Intent[];
  latencyMs: number;
  error?: string;
};

export type CaseScore = { exact: boolean; acceptable: boolean; harmful: boolean; reasons: string[] };

export function scoreCase(testCase: IntentCase, prediction: Prediction): CaseScore {
  const { expect } = testCase;
  const reasons: string[] = [];
  if (prediction.error) return { exact: false, acceptable: false, harmful: false, reasons: [`error: ${prediction.error}`] };
  const allowed = new Set([expect.intent, ...(expect.acceptable || [])]);
  const exact = prediction.intent === expect.intent;
  const acceptable = allowed.has(prediction.intent);
  if (!acceptable) reasons.push(`intent ${prediction.intent}, expected ${[...allowed].join('|')}`);
  let harmful = false;
  if (expect.forbidden?.includes(prediction.intent)) {
    harmful = true;
    reasons.push(`forbidden intent ${prediction.intent}`);
  }
  if (prediction.operations) {
    const permitted = new Set([...allowed].flatMap(intent => intentWrites[intent]));
    const extra = prediction.operations.filter(op => !permitted.has(op));
    if (extra.length) {
      harmful = true;
      reasons.push(`unexpected writes ${extra.join(',')}`);
    }
  }
  if (expect.pipeline === false && prediction.pipeline) {
    harmful = true;
    reasons.push('entered staged pipeline');
  }
  return { exact, acceptable, harmful, reasons };
}

export type VariantSummary = {
  variant: string;
  cases: number;
  repeats: number;
  exactRate: number;
  acceptableRate: number;
  harmfulRate: number;
  errorRate: number;
  /** Share of cases acceptable and never harmful in every repeat (pass^k). */
  passK: number;
  latencyP50: number | null;
  latencyP90: number | null;
  /** Accuracy by confidence bucket, for variants that report confidence. */
  calibration: Array<{ bucket: string; n: number; acceptableRate: number }>;
  confusion: Record<string, Record<string, number>>;
};

export function summarize(variant: string, testCases: IntentCase[], runs: Array<{ caseId: string; prediction: Prediction; score: CaseScore }>): VariantSummary {
  const n = runs.length || 1;
  const latencies = runs.filter(run => !run.prediction.error).map(run => run.prediction.latencyMs).sort((a, b) => a - b);
  const pct = (p: number) => latencies.length ? latencies[Math.min(latencies.length - 1, Math.floor(p * latencies.length))] : null;
  const byCase = new Map<string, typeof runs>();
  for (const run of runs) byCase.set(run.caseId, [...(byCase.get(run.caseId) || []), run]);
  const passed = [...byCase.values()].filter(list => list.every(run => run.score.acceptable && !run.score.harmful)).length;
  const gold = new Map(testCases.map(testCase => [testCase.id, testCase.expect.intent]));
  const confusion: Record<string, Record<string, number>> = {};
  for (const run of runs) {
    const expected = gold.get(run.caseId) || '?';
    const got = run.prediction.error ? 'error' : run.prediction.intent;
    confusion[expected] ??= {};
    confusion[expected][got] = (confusion[expected][got] || 0) + 1;
  }
  const buckets = [[0, 0.5], [0.5, 0.7], [0.7, 0.85], [0.85, 1.01]] as const;
  const calibration = buckets.map(([low, high]) => {
    const inBucket = runs.filter(run => typeof run.prediction.confidence === 'number'
      && run.prediction.confidence >= low && run.prediction.confidence < high);
    return { bucket: `${low}-${Math.min(high, 1)}`, n: inBucket.length,
      acceptableRate: inBucket.length ? inBucket.filter(run => run.score.acceptable).length / inBucket.length : 0 };
  }).filter(bucket => bucket.n > 0);
  return {
    variant, cases: byCase.size, repeats: byCase.size ? Math.round(runs.length / byCase.size) : 0,
    exactRate: runs.filter(run => run.score.exact).length / n,
    acceptableRate: runs.filter(run => run.score.acceptable).length / n,
    harmfulRate: runs.filter(run => run.score.harmful).length / n,
    errorRate: runs.filter(run => run.prediction.error).length / n,
    passK: byCase.size ? passed / byCase.size : 0,
    latencyP50: pct(0.5), latencyP90: pct(0.9), calibration, confusion,
  };
}

// Choice-router post-processing shared by the Jev and LLM router variants: a
// low-confidence or explicitly ambiguous answer becomes a clarification.
export function routeWithThreshold(choice: Intent, confidence: number | null, threshold: number): Intent {
  if (choice === 'clarify') return 'clarify';
  if (confidence != null && confidence < threshold) return 'clarify';
  return choice;
}
