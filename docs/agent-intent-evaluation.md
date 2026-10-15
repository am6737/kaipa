# Agent Intent Evaluation

## Purpose

Measures whether a request reaches the right kind of work before any tool runs.
It complements `agent-scenario-evaluation.md`, which checks end-to-end writes on
the deployed worker. This suite calls models only and never touches the database.

## Files

- `supabase/functions/app-agent/intent-router.ts`: intent taxonomy, shared
  definitions (`what` / `not_for` / `examples`), mapping from a `TaskDecision`,
  the production router prompt and `resolveTask` (see Production routing).
- `supabase/functions/app-agent/intent-eval.ts`: scoring and summaries;
  re-exports the taxonomy.
- `supabase/functions/app-agent/intent-cases.ts`: labelled cases. Each states
  the ideal intent, still-acceptable answers, and forbidden answers (wrong write
  or a wasted staged-pipeline run).
- `scripts/evaluate-intent.ts`: runs the variants and writes a JSON report.

## Variants

| Variant | What runs |
| --- | --- |
| `current` | Production Task Interpreter, then `constrainTaskDecision` and `useStagedPipeline` |
| `router` | Short-prompt flash router over the shared definitions, with confidence |
| `phase1` | Production path: `resolveTask` with the live interpreter and intent router, then `useStagedPipeline` |
| `jev` | Opt-in only (`--variants=...,jev`): TypeSafe Jev `choice`, set aside because of the region block below |

`router` and `jev` are also reported at confidence thresholds (`@0.5` ...):
below the threshold the answer becomes `clarify`. `current` cannot clarify, so
ambiguous cases measure how often it guesses harmlessly. `phase1` scores a
routed clarification as `clarify`, otherwise the intent of the decision after
the routed intent and the quote guard were applied (router `unsupported` scores
as `discuss`); operations and pipeline entry come from the final decision. It
honours `KAIPA_INTENT_ROUTER`, so `KAIPA_INTENT_ROUTER=off` measures the
interpreter-only fallback on the same code path.

## Metrics

- **exact**: the ideal intent. **acceptable**: ideal or listed alternative.
- **harmful**: a forbidden intent, writes outside the expected intents, or
  entering the staged pipeline where the case forbids it.
- **pass^k**: share of cases acceptable and never harmful in all k repeats.
- **calibration**: acceptable rate per confidence bucket (router/jev).

## Running

```sh
npx --yes deno test --allow-env --allow-read supabase/functions/app-agent/intent-eval_test.ts
deno run --allow-env --allow-read --allow-net --allow-write scripts/evaluate-intent.ts \
  --variants=current,router --repeat=5 --report=/tmp/kaipa-intent.json
```

Model settings are read from `--env-file`, `KAIPA_RUNTIME_ENV`, or
`infra/supabase/docker/.env` (the runtime env `deploy-functions.sh` uses). Options:
`--cases=id,id`, `--concurrency=4`, `--thresholds=0.5,0.6,0.7,0.8`,
`--jev-model=jev-1.13.0`, `--dry-run`.

Add every misrouted production request to `intent-cases.ts` (paraphrased, no
personal data) before changing prompts.

## Jev availability (2026-10-15)

From this workspace's mainland-China egress, `api.typesafe.ai` answers
`451 Typesafe is not available in your region` before authentication. The
`jev` variant can only run from a supported region, and production use would
also require an offshore hop and a cross-border data review.

## Case groups

Case ids are prefixed by group, and the script prints acceptable/harmful rates
per group: `amb` ambiguous wording, `gear`/`pack`/`hike`/`route`/`disc`/`trans`/
`edit`/`del`/`undo`/`stop` single intents, `cont` answers to a pending question,
`neg` exclusions, `app` fixed prompts the app sends from buttons, `appi` the
same prompts with the `intent` the app sends alongside them, `real`
paraphrased `agent_messages` traffic, `quote` quoted or hypothetical destructive
words, `multi` several asks, `voice` colloquial/typo input, `plan` plan versus
look-only. When an app button prompt changes, update its `app-*` case (the
`appi-*` copy follows it).

## Production routing

`prepareTask` calls `resolveTask` (intent-router.ts) once per run and persists
the result as `TaskState.routing`, so worker retries reuse the routed intent and
any clarification instead of calling the models again.

1. **App entry.** When the request carries a known `intent` (unknown values are
   dropped in index.ts, never a 400) other than `plan_journey`, the button
   decides: `packing_full` -> `packing_full` (no current journey -> clarify),
   `transport_supplement` -> `transport_chain`, `stay_supplement` ->
   `itinerary_edit`, `gear_onboarding` -> `gear_add`, `gear_set_onboarding` ->
   `unsupported`, `journey_review` -> `discuss`. The router is not called.
   `plan_journey` is only a hint to the router and the interpreter.
2. **Continuation gate.** If the previous task on the same journey is `waiting`
   or `partial` with a pending question and was an `execute` turn, the
   interpreter alone handles the answer.
3. **Router.** Otherwise the flash router (temperature 0, one turn, 30 s
   timeout, metrics stage `intent_routing`) runs in parallel with the
   interpreter and sees the pending question. It returns `intent`,
   `alternatives`, and for `clarify` a question with up to three option
   buttons. A router error or invalid output logs a warning and falls back to
   the interpreter alone.
4. **applyIntent** combines both and can only remove permission: writes are
   intersected with the intent's allowed writes, `fullHikingPlan` and
   `packingMode` only go down, `execute` only turns off. `hiking_plan` keeps the
   interpreter's scope, except that with no current journey, destination or
   track it asks where to go. If the interpreter meant to execute but nothing it
   asked for is allowed, the turn becomes a discussion with
   `authorizationUnconfirmed`. `unsupported` adds a note telling the agent to
   decline instead of using the nearest write.
5. **Continuation scope.** On a gated turn the answer cannot grow into a full
   plan the pending task was not: marked as a continuation, the plan flag and
   writes outside the pending task are dropped; marked as a new request, it
   becomes a confirmation (`authorizationUnconfirmed`).
6. **Deterministic guards** (every path, including router off): delete and
   undo writes are dropped when the authorization quote appears only inside
   quotation marks (“” "" ‘’ 「」 『』); a bare refusal of a pending question
   ("不用了", "算了", "no thanks") becomes `stop` with no writes.
7. `constrainTaskDecision` runs last, as before.

A clarification ends the turn in index.ts right after the off-topic branch: the
question is the reply, options become quick replies, and no pipeline,
conversational agent or quota is used.

`KAIPA_INTENT_ROUTER` (edge runtime env):

| Value | Behaviour |
| --- | --- |
| `on` (default, also any unknown value) | Router decision applied as above |
| `shadow` | Router runs and its answer is persisted in `routing` with `applied: false`; the interpreter decides |
| `off` | Router never called |

App-entry mapping and the quote guard apply in all three modes.

## Baseline (2026-10-15, 185 cases x 5)

| Variant | exact | acceptable | harmful | pass^5 | p50 / p90 ms |
| --- | --- | --- | --- | --- | --- |
| `current` | 73.4% | 90.4% | 6.9% | 84.9% | 2301 / 3210 |
| `router` | 81.4% | 91.8% | 5.0% | 86.5% | 1682 / 2717 |

- `current` harms: ambiguous gear wording sent to packing (42% harmful in
  `amb`), no-destination journey prompts entering the staged pipeline, and
  "删掉装备库里…" turned into a checklist delete.
- `router` harms: bare answers to a pending question (`cont`, 14%), quoted or
  hypothetical destructive words (`quote`, 20%), and the Gear screen's
  "装备清单" prompt read as a trip checklist (it means a gear set, which has no
  write tool).
- Both fail `gear-delete-unsupported`: gear deletion and editing have no tool,
  so the request must be declined rather than mapped to the nearest write.
- Self-reported confidence is >= 0.85 on almost every run; thresholds do not
  help. Clarification has to be an explicit choice.
- Keep definition examples disjoint from case messages.

## Phase 1 (2026-10-15, 205 cases x 3)

`phase1` with the router on (the production default), including the 20 `appi`
cases. Not directly comparable to the baseline above: 20 more cases, and a
delete together with an itinerary add or reschedule now maps to
`itinerary_edit` (a move) instead of `delete`.

| Variant | exact | acceptable | harmful | pass^3 | errors | p50 / p90 ms |
| --- | --- | --- | --- | --- | --- | --- |
| `phase1` | 85.0% | 93.3% | 0.3% | 89.3% | 0.2% | 3455 / 7553 |

Harmful is 0% in every group except `gear` (4%: one run each of
`gear-delete-unsupported` and `gear-edit-unsupported`). In both, the router
hit its 30 s timeout, and the interpreter-only fallback repeated today's
mistake.

The non-harmful misses are mostly safe under-delivery:
- The interpreter keeps a reply that the router routed to a write as a
  discussion (`amb-add-tent`, `voice-record-tent`, `real-add-brand-jackets`,
  `real-set-daily-endpoints`, the transport and stay follow-up prompts).
- The router clarifies where an answer was expected (`cont-pick-library`,
  `cont-pick-list`, `edit-endpoints`, `gear-list-from-library`).

Latency is the interpreter and router in parallel. Each pipeline-bound request
pays for the slower of the two.

