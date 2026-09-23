# Durable Packing Drafts

## Execution Contract

Full packing tasks expose `prepare_packing_draft`, `read_packing_draft`,
`repair_packing_draft` and `commit_packing_draft`. They do not expose the direct
`add_packing_items` tool. Incremental additions keep that short direct path and
cannot access the draft workflow. Every draft tool independently checks the
existing `add_packing_items` task scope and full packing mode before any action.

Preparation persists the complete proposal with stable item IDs before semantic
validation. Validation uses the same item, coverage, water, dietary and nutrition
checks as final writing. Feedback contains issue codes, item IDs, relevant
fields, affected item values and missing categories; unaffected items are not
echoed. Repairs merge partial item fields, additions and draft-only removals,
then revalidate the entire list. Attribute arrays replace only the selected
item's attributes. The scenario profile stays fixed for that draft.

Drafts have a compare-and-swap revision for internal concurrency control.
Repairs are preparation within one task, not user-visible checklist changes;
there is no separate three-repair cap. Existing task turn limits and execution
timeouts bound the work. Only the final validated commit changes the checklist.
The last edit hash makes an immediately repeated patch idempotent, including
its additions. Stale or unknown IDs cannot silently modify a newer draft.
Re-preparing an existing run returns its draft rather than replacing it.

Commit accepts only the current revision. It revalidates the draft against
current data, then invokes the existing version-checked atomic packing write.
Only that canonical `add_packing_items` receipt fulfills the task's deliverable.
A successful prepare/repair receipt never means checklist items were saved.
Manual data changes invalidate the observed versions and reject the commit;
the agent must reread. Repeated successful commits reuse the canonical receipt.
The existing requesting-member personal-list policy and undo payload are kept.

## Recovery and Boundaries

`agent_packing_drafts` is keyed by run ID, readable only by its user, and writable
only by the service client. On worker recovery the prompt identifies the saved
revision and directs the model to reread it. A recreated runtime can continue
from the database without generating the list again. In-process draft operations
are serialized; database revision checks protect against stale writers.

This is an internal per-run draft, not a new user-facing editor or cross-task
approval flow. A new unrelated run does not automatically inherit an old draft.
If the initial model response times out before calling prepare, there is no
complete draft to recover. Limits do not guarantee semantic quality or outdoor
safety, and a model can still generate unnecessary items. Existing worker
deadlines, leases and task-scope restrictions remain unchanged.

## Measurement

`agent_model_metrics` stores response duration, stage, model identifier and
provider-reported input/output/total tokens. It includes interpretation,
execution and memory calls, with separate labels for packing generation,
repair and commit decisions. No prompts, responses or credentials are stored
in this table. Failed requests have unknown usage, not assumed zero usage.
Metrics writes are best effort; missing records or usage are not proof of free
execution. Streaming is not instrumented because this runtime uses nonstreaming
requests. Billing depends on the configured provider and is not estimated here.

Tool-journal timing is reported separately. Its created-to-updated interval may
include replay waits and nested commit work, so these spans are not additive
transaction benchmarks. Model durations exclude metrics-persistence overhead.

## Verification

```sh
node scripts/test-agent-packing-draft-db.cjs
infra/supabase/apply-migration.sh supabase/migrations/20260908120000_agent_packing_drafts.sql
npx --yes deno run --env-file=infra/supabase/docker/.env --allow-env --allow-net --allow-read supabase/functions/app-agent/packing-draft.integration.ts
infra/supabase/deploy-functions.sh app-agent
EVAL_EXPECT_DRAFT=1 EVAL_CASES=day-trip-no-refill,incremental-cable EVAL_REPORT=/tmp/packing-drafts.json node --experimental-strip-types --env-file=.env scripts/evaluate-app-agent-packing.mjs
```

The deterministic integration uses a disposable account and real database. It
checks invalid-draft isolation, runtime recreation, field-only repair, patch
replay, manual-edit conflict rejection and canonical commit replay. Unit tests
cover revision/ID rejection, repairs beyond three revisions, omission of quantity defaults
in partial patches, tool exposure and usage accounting. All fixtures are removed.

## Initial Comparison

Same configured model and one-day/eight-hour/no-refill prompt, 2026-09-08:

| Run | Total Time | Saved Items | Repair Behavior | Canonical Writes |
| --- | --- | --- | --- | --- |
| Direct-write baseline | 184.2 s | 27 | Two complete submissions, one rejected | 1 |
| Draft workflow | 140.9 s | 37 | One preparation and one partial patch | 1 |
| Draft workflow repeat | 194.7 s | 36 | One preparation and two partial patches | 1 |
| Incremental cable | 53.3 s | 1 | No draft or rejected write | 1 |

In the draft run the initial proposal used 2,266 output tokens and 74.7 seconds;
the patch used 299 output tokens and 12.0 seconds. Their JSON payloads were 5,086
and 436 characters respectively; commit arguments were 14 characters. The full
checklist's completeness, explicit eight-hour estimate and saved data passed
the existing checks. The cable preserved the seeded item's quantity, note and
packed state and retained both connectors and length in attributes.

The repeat used 2,478 output tokens for initial generation (89.2 seconds) and
312 + 135 for repairs (19.6 + 13.1 seconds). Canonical write time was 32 ms;
the enclosing commit tool took 190 ms including revalidation. Both draft runs
completed without a failed canonical packing write or an aborted model request.

The first pair showed about 24% lower wall time, but the repeat was slower than
the baseline. List content differs and this sample does not establish a stable
speed or cost improvement. It does establish that invalid items were repaired
without repeating the full proposal. Initial generation remains the dominant
cost at 75-89 seconds. The baseline did not capture token usage; do not compare
these runs directly to earlier timeout-heavy samples as a controlled benchmark.

Validation: 100 backend tests, 27 assistant interaction tests, TypeScript/Edge
checks, draft/metrics database isolation and the deterministic recovery/conflict
integration passed. The final repair-limit feedback wording was unit-tested
after the live runs. All disposable accounts and journeys were removed.
