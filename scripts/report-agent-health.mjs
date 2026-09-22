#!/usr/bin/env node
// Agent reliability report.
//
// Every stage budget in pipeline.ts was justified in prose by numbers nobody
// could reproduce, and the prose described the wrong quantity: it quoted model
// call latency for a ceiling that bounds a whole tool loop. This script reads
// the recorded wall clock and fails when a budget no longer holds, so the next
// change to STAGE_BUDGETS has to survive a measurement rather than an argument.
//
//   node scripts/report-agent-health.mjs [--version=<agent_version>] [--json]
//
// Reads the deployed self-hosted stack, same environment as the e2e scripts:
//   KAIPA_RUNTIME_ENV=../kaipa-supabase-docker/.env node scripts/report-agent-health.mjs

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

process.loadEnvFile(process.env.KAIPA_RUNTIME_ENV || '../kaipa-supabase-docker/.env');
const url = `http://127.0.0.1:${process.env.KONG_HTTP_PORT || '8010'}`;
const admin = createClient(url, process.env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const argv = process.argv.slice(2);
const asJson = argv.includes('--json');
const versionFilter = (argv.find(a => a.startsWith('--version=')) || '').split('=')[1] || null;

const checked = async (request) => {
  const result = await request;
  if (result.error) throw new Error(`${result.error.code || 'rest'}: ${result.error.message}`);
  return result.data;
};

// pipeline.ts is the single source of truth for the budgets; parse it rather
// than mirroring the table here, so a budget edit cannot pass by matching a
// stale copy of itself.
function readStageBudgets() {
  const source = readFileSync(path.resolve('supabase/functions/app-agent/pipeline.ts'), 'utf8');
  const body = source.slice(source.indexOf('STAGE_BUDGETS')).split('\n};')[0];
  const budgets = {};
  // Values are written with numeric separators, e.g. `research: 120_000`.
  for (const [, stage, ms, group] of body.matchAll(/^\s*(\w+):\s*(\d+)(?:_(\d+))?\s*,/gm)) {
    budgets[stage] = Number(`${ms}${group ?? ''}`);
  }
  for (const stage of ['interpret', 'research', 'transport', 'plan', 'save', 'packing', 'respond']) {
    if (!budgets[stage]) throw new Error(`could not read the ${stage} budget out of pipeline.ts`);
  }
  return budgets;
}

const budgets = readStageBudgets();
const totalBudgetMs = Object.values(budgets).reduce((sum, ms) => sum + ms, 0);

const [versions, wallclock, failures, zombies, toolLatency, modelCalls] = await Promise.all([
  checked(admin.from('agent_version_health').select('*')),
  checked(admin.from('agent_stage_wallclock_vs_budget').select('*')),
  checked(admin.from('agent_stage_failures').select('*').limit(20)),
  checked(admin.from('agent_zombie_stages').select('*')),
  checked(admin.from('agent_tool_latency').select('*')),
  checked(admin.from('agent_model_metrics').select('stage,attempt,aborted,duration_ms').limit(20000)),
]);

const scoped = (versionFilter ? wallclock.filter(r => r.agent_version === versionFilter) : wallclock)
  .filter(r => budgets[r.stage]);
const current = versionFilter || scoped[0]?.agent_version || versions[0]?.agent_version || 'unknown';

const percentile = (values, p) => {
  if (!values.length) return null;
  return [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * p)];
};

// A model call cut by a ceiling is the ceiling itself, not a fast stage. Keep it
// out of the latency summary but count it, because that censoring is exactly how
// STAGE_BUDGETS came to be set below what the loops actually need.
const modelByStage = {};
for (const call of modelCalls) {
  const bucket = (modelByStage[call.stage] ||= { all: [], uncensored: [], cut: 0 });
  bucket.all.push(call.duration_ms);
  if (call.aborted) bucket.cut += 1;
  else bucket.uncensored.push(call.duration_ms);
}

const findings = [];

const versionRow = versions.find(v => v.agent_version === current);
if (versionRow) {
  const summary = `${versionRow.runs} runs, ${versionRow.failed_pct ?? 0}% failed, p50 ${versionRow.p50_min}m / p90 ${versionRow.p90_min}m`;
  if ((versionRow.failed_pct ?? 0) >= 25) findings.push(`failure rate on ${current}: ${summary}`);
  else console.log(`version ${current}: ${summary}`);
}

for (const row of scoped) {
  // at_ceiling counts attempts that landed within 3% of the budget. Those were
  // cut rather than completed, and a budget with any of them is too small no
  // matter how well it orders against the other budgets.
  if (row.at_ceiling > 0) {
    findings.push(`stage ${row.stage}: ${row.at_ceiling}/${row.attempts} attempts reached the ${budgets[row.stage] / 1000}s ceiling (wall p50 ${row.p50_s}s p90 ${row.p90_s}s p99 ${row.p99_s}s max ${row.max_s}s)`);
  }
}

for (const [stage, bucket] of Object.entries(modelByStage)) {
  if (bucket.cut > 0 && bucket.cut / bucket.all.length >= 0.1) {
    findings.push(`model latency for ${stage} is censored: ${bucket.cut}/${bucket.all.length} calls were cut by a ceiling, so its measured percentiles understate the real distribution`);
  }
}

if (zombies.length) {
  const byStage = zombies.reduce((o, z) => ((o[z.stage] = (o[z.stage] || 0) + 1), o), {});
  findings.push(`zombie stages: ${zombies.length} rows still 'running' under a terminal run (${Object.entries(byStage).map(([s, n]) => `${s}=${n}`).join(', ')})`);
}

// Ordering guard, mirrored from the pipeline test so a report run catches it too.
if (totalBudgetMs >= 700_000 || totalBudgetMs >= 12 * 60_000) {
  findings.push(`stage budgets sum to ${totalBudgetMs / 1000}s, past the worker fetch timeout or the job lease`);
}

if (asJson) {
  // stdout stays a single parseable document; the findings block goes to stderr
  // so `--json | jq` works even on a failing report.
  console.log(JSON.stringify({ current, budgets, totalBudgetMs, wallclock: scoped, failures, zombies, modelByStage, findings }, null, 2));
} else {
  console.log(`\nstage budgets sum to ${totalBudgetMs / 1000}s (version ${current})`);
  console.log('stage        budget  attempts  done  fail  retried   p50s    p90s    p99s    maxs  at-ceiling');
  for (const row of scoped) {
    console.log([
      String(row.stage).padEnd(12),
      `${budgets[row.stage] / 1000}s`.padStart(6),
      String(row.attempts).padStart(9),
      String(row.completed + (row.degraded || 0)).padStart(5),
      String(row.failed).padStart(5),
      String(row.retried_runs || 0).padStart(8),
      String(row.p50_s).padStart(6), String(row.p90_s).padStart(6),
      String(row.p99_s).padStart(6), String(row.max_s).padStart(6),
      String(row.at_ceiling).padStart(12),
    ].join(' '));
  }

  console.log('\ntop stage failures');
  for (const row of failures.slice(0, 10)) console.log(`  ${String(row.occurrences).padStart(3)}x  ${row.stage} · ${row.reason}`);

  console.log('\ntool latency (rows carrying a per-call duration_ms only)');
  console.log('tool                                calls  fail%     p50     p90     max');
  for (const row of latencyRows(toolLatency)) {
    console.log([
      String(row.tool_name).padEnd(33), String(row.calls).padStart(5),
      `${row.failed_pct ?? 0}%`.padStart(6),
      `${row.p50_s}s`.padStart(8), `${row.p90_s}s`.padStart(7), `${row.max_s}s`.padStart(7),
    ].join(' '));
  }
}

function latencyRows(rows) {
  return rows.filter(row => row.measured > 0).slice(0, 14);
}

if (findings.length) {
  const report = [`\nACTION REQUIRED (${findings.length})`, ...findings.map(f => `  - ${f}`)].join('\n');
  console[asJson ? 'error' : 'log'](report);
  process.exit(1);
}
if (!asJson) console.log(`\nno budget or lifecycle findings.`);
