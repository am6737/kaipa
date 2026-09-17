# Planning Scenario Evaluation

## Method

`scripts/evaluate-agent-scenarios.mjs` exercises the deployed self-hosted worker
and configured model, not a mocked assistant. It creates a disposable account,
seeds a saved hike, checks task scope, receipts, final replies and before/after
database rows, then removes the account and its journeys. It never edits a real
user's trip. Run serially; do not redeploy Edge Functions during a live suite.

```sh
node scripts/evaluate-agent-scenarios.mjs --report=/tmp/kaipa-scenarios.json
node scripts/evaluate-agent-scenarios.mjs --suite=continuation --report=/tmp/kaipa-continuation.json
```

`--suite=bounded` runs the first six scenarios; `--suite=continuation` runs the
dependent final two. Full JSON reports contain synthetic conversation text,
task decisions, domain tool receipts, saved-state snapshots and wall-clock
timing. Treat reports as local diagnostic artifacts, not production telemetry.

## Scenarios

| Scenario | Expected Behavior |
| --- | --- |
| Compare routes before dates/duration are chosen | Useful comparison, no mandatory form or writes |
| Explain a quoted destructive instruction | No write permission or database mutation |
| Add one confirmed transport item | Exactly one item; preserve hike, dates and duration; no packing tools |
| Acknowledge a completed task | No inherited write permission |
| Add an item overlapping the saved hike | No mutation; incomplete outcome with a visible conflict reason |
| Abandon the conflicting addition | Read the existing hike; do not resume the rejected write |
| Save a journey, then ask for a booked train's details | Partial outcome; retain the deferred itinerary operation |
| Answer the pending question without repeating the command | Save exactly the train item, without recreating the journey |

## Findings (2026-09-08)

The initial live run passed 6/8 scenarios. The conflict guard correctly prevented
a write, but response presentation hid the reason behind generic incomplete
text. After partial creation, the user's answer produced an unsaved draft:
the interpreter omitted the deferred itinerary operation, and continuation
validation recognized `waiting` but rejected `partial` tasks with questions.
The partial-creation assertion was then strengthened to explicitly check its
deferred operation and missing deliverable, not just the created journey.

Targeted deterministic regressions also reproduced two completion weaknesses:
an empty required-operation list bypassed receipt checks, and partial outcomes
with a pending question could display an unverified all-complete text response.

Fixes keep execution permissions separate from readiness, allow unanswered
same-journey partial tasks to continue without expanding scope, preserve
unfinished deliverables, conservatively fill empty required-operation lists,
and require a successful write before reporting execution completion. Partial
responses use an authoritative incomplete summary plus the structured blocker
and pending question instead of unverified completion prose.

The initial sample ranged from 13.3 to 45.7 seconds per turn (median 30.9 seconds),
including queue wait, interpretation, tools and finalization. This is a small
functional sample, not a latency benchmark. Token usage and billed cost are not
persisted by the current runtime and are not estimated from tool counts.

The repaired self-hosted deployment passed all 8 scenarios, including the
stronger deferred-operation assertions. The conflict response included both
time windows, and the bare station/time answer saved exactly one train item
without recreating the journey. This run ranged from 15.3 to 57.6 seconds
(median 32.9 seconds); it does not demonstrate a speed improvement. The slowest
turn now performed the previously missing write instead of returning a draft.
An independent repeat of the two continuation turns also passed 2/2 (42.5 and
56.6 seconds), including an explicit assertion that the pending question was
visible in the reply. All disposable accounts and journey fixtures were removed.

Automated validation also passed 86 Deno tests, 27 assistant interaction tests,
TypeScript and Edge type checks, and the task-state RLS/atomic-finalization DB
test. The new targeted regressions were observed failing before their fixes.

## Packing and Schedule Follow-up

The next round exercises real full-list generation and an incremental cable
addition, then the existing schedule-edit/undo integration test:

```sh
EVAL_CASES=day-trip-no-refill,incremental-cable node --experimental-strip-types --env-file=.env scripts/evaluate-app-agent-packing.mjs
node scripts/test-agent-context-e2e.mjs --schedule-only
```

The initial day-trip generation eventually passed after one rejected batch
(180.9 seconds, 30 items). Inspection found that null database distance was
coerced to zero, making an unknown trip a one-hour terrain estimate. The user's
explicit eight-hour hike was also absent from the estimator input. Null and
empty values now remain unknown; a bounded structured `activeHoursPerDay` task
fact supplies an explicitly stated duration to both estimation and write-time
nutrition validation. This does not change or certify the nutrition formulas.

Another false rejection treated a waterproof jacket as missing rain clothing.
Coverage now accepts waterproof outerwear, while a waterproof bag still does
not count. Deterministic tests reproduced both the null-distance and rainwear
failures before the fixes. Packing mode is checked in both directions before
receipt replay or database access: full tasks cannot bypass validation through
incremental mode, and incremental tasks cannot invoke full generation.

The old cable evaluator itself incorrectly required the interface in the name,
contradicting the short-name/structured-attributes contract. It now verifies
both USB-C connectors and the one-meter length in attributes, exactly one added
cable, and preservation of a seeded item's quantity, note and packed state.
The day-trip evaluator also checks the actual estimate uses eight active hours.

The strengthened packing rerun passed both cases: 29 full-list items in 393.9
seconds (three packing submissions, two rejected, plus a worker timeout/retry),
and exactly one cable in 47.0 seconds with no rejected submission. The eight-hour
estimate and seeded-item preservation assertions passed. This is a correctness
result, not a performance improvement: whole-list regeneration is still a major
latency and timeout risk.

During that rerun another classification flaw was found: the substring matching
for purification equipment also matched bottled pure water. The final patch
limits that exemption to actual device/product names, so bottled water receives
the direct missing-capacity validation. This final diagnostic change is covered
by unit tests; the full-list timing above precedes that patch. Blank optional
body measurements are also tested to remain unknown rather than become zeros.

On the final deployment, the live schedule suite changed dates and day count,
moved the existing hiking group while preserving its endpoint and checked row,
added the requested meeting item, and undid both changes together. Its concurrent
database edit test also rejected a stale agent write without deleting the row.
Final verification passed 93 Deno tests, TypeScript and Edge type checks, and
`git diff --check`. All temporary packing and schedule accounts were removed.

## Remaining Limits

The [hydration evidence and evaluation design](agent-hydration-planning.md)
separates physiological evidence from carry logistics and defines proposed
quality cases. Its local baseline is not a live-model or safety evaluation.

The subsequent [durable packing draft implementation](agent-packing-drafts.md)
addresses whole-list repair with persisted proposals and field-level patches;
its same-prompt baseline and measurements are recorded separately.

Passing these scenarios is not a general safety or quality guarantee. Scope
interpretation and blocker explanations remain model-generated. Receipt checks
cover operation types, not every requested item. The quoted-instruction case
does not replace adversarial tests of retrieved pages or attachments. Full
packing quality, live travel research, worker termination, multi-user contention
and physical-device acceptance need their separate suites. The evaluation does
not implement or claim in-flight cancellation.
