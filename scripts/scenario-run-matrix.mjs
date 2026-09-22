// Repeats one realistic request and prints a per-run line, because a single
// run cannot separate "fixed" from "got lucky": the same sentence has saved
// nothing, saved a full plan, and saved a plan then failed on the checklist.
// Reads the per-run reports written by scenario-plan-probe.mjs.
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

const runs = Number(process.argv[2] || 8);
const message = process.argv[3] || '我准备去党岭三湖连穿、雅拉温泉线、桑措玉琼（嘉措琼吉）徒步，天数还没确定，帮我规划一下';

async function probe(index) {
  const path = `/tmp/matrix-run-${index}.json`;
  await new Promise((resolve) => {
    const child = spawn('node', ['scripts/scenario-plan-probe.mjs', message, path], { stdio: ['ignore', 'ignore', 'inherit'] });
    child.on('exit', resolve);
  });
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
}

const summary = [];
for (let index = 1; index <= runs; index += 1) {
  const report = await probe(index);
  if (!report) { console.log(`run${index} NO REPORT`); summary.push({ index, outcome: 'no-report' }); continue; }
  const decision = report.decision || {};
  const stages = report.stages || [];
  const pipeline = stages.length > 0;
  const degraded = stages.filter(stage => stage.status === 'degraded').map(stage => stage.stage);
  const failed = stages.filter(stage => stage.status === 'failed').map(stage => stage.stage);
  // The two ways this sentence saves nothing, which need different fixes.
  // A worker killed by the runtime's own wall clock answers HTTP 500 and leaves
  // a stage at 'running'; that is a different defect from saving nothing.
  const killed = /HTTP 50[02]/.test(report.error || '');
  const cause = killed
    ? `runtime-kill@${(stages.find(stage => stage.status === 'running') || {}).stage ?? '?'}`
    : report.counts.rows > 0
    ? '-'
    : !pipeline
      ? (decision.authorizationUnconfirmed === true ? 'quote-mismatch' : `interpreter-${decision.mode ?? '?'}`)
      : (decision.authorizationUnconfirmed === true ? 'quote-mismatch' : 'pipeline-nothing-saved');
  const line = {
    index, status: report.status, pipeline, cause,
    mode: decision.mode ?? '-', flag: decision.authorizationUnconfirmed === true,
    ops: (decision.operations || []).length,
    stages: stages.map(stage => `${stage.stage}:${stage.status}`).join(' '),
    degraded, failed,
    saved: `j${report.counts.journeys}/r${report.counts.rows}/g${report.counts.groups}`,
    metrics: (report.metrics || []).map(metric => `${metric.stage}${metric.success ? '' : '!'}`).join(','),
    killed,
    error: (report.error || '').slice(0, 40),
    reply: (report.reply || '').replace(/\s+/g, ' ').slice(0, 90),
  };
  console.log(JSON.stringify(line));
  summary.push(line);
}

const saved = summary.filter(run => run.saved && run.saved.startsWith('j1')).length;
const killed = summary.filter(run => run.killed).length;
const replied = summary.filter(run => (run.reply || '').length > 0).length;
const byCause = summary.reduce((acc, run) => { acc[run.cause] = (acc[run.cause] || 0) + 1; return acc; }, {});
console.log(JSON.stringify({ total: summary.length, saved, killed, replied, byCause }));
