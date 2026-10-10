// Read-only offline scoring; no network/model calls and no persisted results.
// ~/.deno/bin/deno run --allow-run --allow-read --allow-env supabase/tests/replay-plan-feasibility.ts [--limit N] [--run UUID]
import {
  planDocumentSchema,
  researchBriefSchema,
  transportPlanSchema,
} from "../functions/app-agent/plan-document.ts";
import { validatePlanFeasibility } from "../functions/app-agent/plan-feasibility.ts";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
function unwrap(value: unknown, names: string[]): Record<string, unknown> {
  const object = record(value);
  for (const name of names) {
    if (object[name] && typeof object[name] === "object") {
      return record(object[name]);
    }
  }
  return object;
}
function normalizeItems(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((raw) => {
    const item = record(raw);
    if (item.kind !== "transport") return item;
    // Archived pre-stop-chain rows used a transport object. Preserve the
    // actual places and times; never turn an unknown duration into a guess.
    const transport = record(item.transport);
    return {
      ...item,
      kind: "custom",
      startLocation: item.startLocation ?? transport.from ?? null,
      location: item.location ?? transport.to ?? null,
    };
  });
}
function date(value: unknown): string | null {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : null;
}

let limit: number | null = null, run: string | null = null;
for (let index = 0; index < Deno.args.length; index++) {
  const flag = Deno.args[index], value = Deno.args[++index];
  if (
    flag === "--limit" && value && /^[1-9]\d*$/.test(value) &&
    Number.isSafeInteger(Number(value))
  ) limit = Number(value);
  else if (
    flag === "--run" && value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) run = value;
  else {throw new Error(
      "Usage: replay-plan-feasibility.ts [--limit N] [--run UUID]",
    );}
}

// One SELECT, with latest successful plan attempt and the latest artifacts
// from the same run. No transaction, SET, temp tables, RPCs or SQL writes.
// UUID/limit interpolation above is restricted to literal-safe characters.
const sql = `WITH plans AS (
  SELECT DISTINCT ON (run_id) run_id, artifact, updated_at
  FROM agent_stages
  WHERE stage = 'plan' AND status IN ('completed', 'degraded') ${
  run ? `AND run_id = '${run}'::uuid` : ""
}
  ORDER BY run_id, attempt DESC, updated_at DESC, id DESC
), selected AS (
  SELECT p.*, r.created_at FROM plans p JOIN agent_runs r ON r.id = p.run_id
  ORDER BY r.created_at DESC, p.run_id ${limit ? `LIMIT ${limit}` : ""}
)
SELECT jsonb_build_object('run_id', p.run_id, 'created_at', p.created_at, 'plan', p.artifact,
  'research', (SELECT artifact FROM agent_stages WHERE run_id = p.run_id AND stage = 'research'
    AND status IN ('completed', 'degraded') ORDER BY attempt DESC, updated_at DESC, id DESC LIMIT 1),
  'transport', (SELECT artifact FROM agent_stages WHERE run_id = p.run_id AND stage = 'transport'
    AND status IN ('completed', 'degraded') ORDER BY attempt DESC, updated_at DESC, id DESC LIMIT 1),
  'task', (SELECT state FROM agent_task_states WHERE run_id = p.run_id ORDER BY created_at DESC LIMIT 1),
  'interpret', (SELECT artifact FROM agent_stages WHERE run_id = p.run_id AND stage = 'interpret'
    AND status IN ('completed', 'degraded') ORDER BY attempt DESC, updated_at DESC, id DESC LIMIT 1))
FROM selected p ORDER BY p.created_at DESC, p.run_id`;
const output = await new Deno.Command("docker", {
  args: [
    "exec",
    "-i",
    "-e",
    "PGOPTIONS=-c default_transaction_read_only=on",
    "kaipa-supabase-db",
    "psql",
    "-X",
    "-v",
    "ON_ERROR_STOP=1",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "-At",
    "-c",
    sql,
  ],
  stdout: "piped",
  stderr: "piped",
  // libpq inside the container enforces read-only implicit transactions too.
}).output();
if (!output.success) throw new Error(new TextDecoder().decode(output.stderr));

const totals = new Map<string, { blocker: number; warning: number }>();
let scored = 0, blocked = 0, skipped = 0;
for (
  const line of new TextDecoder().decode(output.stdout).split("\n").filter(
    Boolean,
  )
) {
  const row = record(JSON.parse(line));
  try {
    const document = unwrap(row.plan, ["plan", "document"]);
    const plan = planDocumentSchema.parse({
      ...document,
      itineraryItems: normalizeItems(document.itineraryItems),
    });
    const research = row.research == null
      ? null
      : researchBriefSchema.parse(unwrap(row.research, ["brief", "research"]));
    const rawTransport = unwrap(row.transport, ["transportPlan", "transport"]);
    const main = record(rawTransport.mainTravel);
    const transport = row.transport == null ? null : transportPlanSchema.parse({
      ...rawTransport,
      ...(rawTransport.mainTravel
        ? {
          mainTravel: {
            ...main,
            itineraryItems: normalizeItems(main.itineraryItems),
          },
        }
        : {}),
    });
    const task = record(row.task),
      decision = record(task.decision),
      interpret = record(row.interpret);
    const plannedDate = date(plan.journey?.plannedDate) ??
      date(plan.schedule?.plannedDate) ??
      date(decision.plannedDate) ?? date(task.plannedDate) ??
      date(interpret.plannedDate);
    const now = Date.parse(String(row.created_at));
    if (!Number.isFinite(now)) {
      throw new Error("Invalid run creation timestamp");
    }
    const { issues } = validatePlanFeasibility(plan, {
      now,
      plannedDate,
      research,
      transportPlan: transport,
    });
    const counts = { blocker: 0, warning: 0 },
      codes = new Map<string, number>();
    for (const issue of issues) {
      counts[issue.severity]++;
      codes.set(issue.code, (codes.get(issue.code) ?? 0) + 1);
      const total = totals.get(issue.code) ?? { blocker: 0, warning: 0 };
      total[issue.severity]++;
      totals.set(issue.code, total);
    }
    scored++;
    if (counts.blocker) blocked++;
    console.log(
      `${row.run_id} ${row.created_at} blocker=${counts.blocker} warning=${counts.warning} ${
        [...codes].sort(([a], [b]) => a.localeCompare(b)).map(([code, count]) =>
          `${code}=${count}`
        ).join(" ") || "issues=0"
      }`,
    );
    // These concise locations make archived regression findings reviewable.
    for (const issue of issues) {
      console.log(
        `  ${
          issue.day ?? "—"
        } ${issue.severity} ${issue.code}: ${issue.message}`,
      );
    }
  } catch (error) {
    skipped++;
    console.error(
      `${row.run_id} ${row.created_at} UNSCORED: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
console.log("\nAggregate");
console.log(`runs scored | ${scored}`);
console.log(`runs unscored | ${skipped}`);
console.log(
  `runs with any blocker | ${blocked} (${
    scored ? (100 * blocked / scored).toFixed(2) : "0.00"
  }%)`,
);
console.log("code | blocker | warning | total");
for (
  const code of [
    "past_departure",
    "daily_load",
    "unknown_same_day_transfer",
    "multi_route_same_day",
    "missing_overnight",
    "sleeping_altitude",
  ]
) {
  const count = totals.get(code) ?? { blocker: 0, warning: 0 };
  console.log(
    `${code} | ${count.blocker} | ${count.warning} | ${
      count.blocker + count.warning
    }`,
  );
}
if (skipped) Deno.exitCode = 1;
