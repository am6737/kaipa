# Kaipa Planning Harness

## Decision

Keep the existing Agents SDK, model configuration, self-hosted worker, RLS,
revision snapshots, atomic tool writes, receipts and undo. Replace the fixed
creation questionnaire and the monolithic prompt, not the database foundation.
No Cordis dependency, generic plugin host, shell access or parallel writing agents.

References: Hermes's on-demand skills, Pi's small loop, Deep Agents' modular
runtime responsibilities, and DeepSeek Harness's separation of instructions,
dynamic context and execution policy. These are architectural references, not
runtime dependencies or evidence of measured improvements.

## Request Lifecycle

1. Every natural-language turn is durably queued, including clarifications.
2. A tool-free interpreter sees the latest user message, the last task,
   bounded recent visible conversation, request-local time and attachment names.
   It never sees search results or raw attachment instructions.
3. `task.ts` validates that decision and constrains clarification continuation.
   `agent_task_states` persists the request's operation scope before any business
   tool runs. A worker retry reuses the same decision.
4. The conversational agent receives the current task and version-checked data.
   It can research without knowing a date, duration or track. It decides which
   questions and skills are relevant, rather than following a fixed form.
5. Only permitted write tools enter the model catalog. The tool boundary checks
   the scope again before business reads, replay or writes. Existing database
   permissions and revision checks remain authoritative.
6. Completion combines requested operations with durable successful receipts.
   Outcome, answer and run completion settle in one transaction. A multi-tool
   task is not a single transaction; saved partial work remains visible.

## Staged Pipeline

A full plan is minutes of model work. Giving it one 210-second budget meant it
always timed out, retried from scratch, and left the abandoned execution holding
journey row locks. Long-form work therefore runs as a sequence of stages, each
with its own budget, its own durable artifact and its own retry.

Dispatch (`pipeline.ts`): `mode=execute`, every authorized operation is one
the deterministic save stage can express (the `create_journey` /
`add_itinerary_items` / `set_itinerary_group_endpoints` /
`set_journey_map_location` / `update_journey_schedule` set, plus
`add_packing_items` only in full-packing mode), and any of
`fullHikingPlan=true`, `packingMode=full`, `domain=transport`. Everything else —
single edits, deletions, undo, discussion, incremental packing additions —
keeps the interactive loop. `domain` (hiking/transport/packing/routes/general)
is classified by the interpreter and also selects the injected skill and the
stage tool sets. It is never derived from the operation list: one ticket edit
and a full transport chain are both a bare `add_itinerary_items`. Routing a
transport chain into the pipeline additionally requires the interpreter's
`domainQuote` to match the latest user message verbatim — the same exact-quote
check authorization uses, so a misread single item stays interactive in any
language.

| Stage | Model | Budget | Work |
| --- | --- | --- | --- |
| interpret | flash | 30s | Existing `prepareTask`; recorded, not re-run |
| research | flash | 120s | Deterministic search/read collection, then one synthesis call, output `ResearchBrief` |
| transport | none | 30s | Deterministic route-to-route legs; no model call |
| plan | flash | 180s | One declarative `PlanDocument`, with skeleton + per-day chunks as the fallback |
| save | none | 60s | Deterministic; replays the scoped write tools |
| packing | flash | 150s | One generation call, bounded batch repairs (2), deterministic commit |
| respond | none | 60s | Deterministic; states what was actually saved |

Model roles are stated where they are chosen, in `createAgentRuntime` and the
stage agents; `plan` runs on the flash model on purpose, so a slow main model
cannot consume the worker lease after research. Only the save-stage repair round
uses the main model. Budgets are set from measured latency: the research
synthesis call ran p50 6s / p90 54s / max 105s and the planner p50 8s / p90 106s
/ max 180s over a four-day sample.

Stage state lives in `agent_stages` (unique on run, stage, attempt) and
`agent_runs.stage` carries the current one. A retry resumes from the first stage
without a completed row instead of redoing finished work. Artifacts are the
handoff: the planner never writes, and the save stage maps the document onto the
same tool operations the interactive path calls, so authorization asserts,
receipt replay, version-checked transactions and undo payloads are unchanged.
`researchBriefSchema`, `planDocumentSchema` and the save order live in
`plan-document.ts`; a new field cannot be added without deciding how it is saved.

Two properties are load-bearing and must not be "simplified":

- The planner emits one document and stops. Repair is exactly one extra round,
  and it pins already-saved operations to the arguments that produced their
  receipts, so it can only change what actually failed.
- The runner parses a tool's arguments and then calls its execute function; the
  tool object only exposes the JSON-schema `invoke`, which turns thrown failures
  into model-visible strings. Stages call the exported schema/operation pairs
  (`runCreateJourney`, `runAddItinerary`, …) so a rejected write stays an error.

Progress is pushed over Supabase Realtime (`agent_runs`, `agent_stages`,
`agent_tool_calls`) and the client's existing poll stays the single writer of run
state: realtime only triggers an early refresh, so a dropped socket degrades to
the old cadence. Stage labels are `agent.stage.*`; the client-side phase
inference remains as the fallback for the interactive path and older runs.

Ceilings must stay ordered, outermost last: stage budgets (≈630s) < worker fetch
timeout (700s) < edge-runtime worker lifetime (710s) < job lease (12 min) < Kong
`read_timeout` (780s, patched outside this repo by
`infra/supabase/patch-runtime-kong-timeout.sh`). Kong's stock 150s turned every
long plan into a 504.

The runtime's own worker lifetime is a ceiling too, and the default one is
wrong for this pipeline: `volumes/functions/main/index.ts` in the runtime
checkout created each worker with `workerTimeoutMs = 5 * 60 * 1000`, so a run
that finished planning and saving but still had the checklist to write was
killed at 300s. `EdgeRuntime.userWorkers.create` then throws and the main
service answers **HTTP 500**, which the worker records as a non-retryable
failure — a run reported failed with its plan already saved, and its stage row
left at `running` because the process died before it could write a terminal
state. The supervisor logs `wall clock duration reached: isolate: …` for each
occurrence. It is now 710s, above the fetch timeout so a long run ends with that
abort (which resumes from the last completed stage) instead of a kill. `agent_lock_context` also sets a 5-second
`lock_timeout` and reports `PT409`, so a zombie execution surfaces as the
existing "read fresh, then replan" conflict instead of a multi-minute stall.

`KAIPA_AI_FLASH_MODEL` selects the model for interpretation, research, packing
and memory; unset, it falls back to `KAIPA_AI_MODEL`.

The configured provider does not always honour structured output: when a write is
rejected it may answer in prose, which the SDK's output validation turns into a
whole failed turn. Pipeline stages re-ask once inside the stage; the interactive
path keeps the answer the model already produced as plain text (`salvagedAnswer`
in `index.ts`) instead of discarding a finished turn.

## Modules

| Module | Responsibility |
| --- | --- |
| `instructions.ts` | Stable principles and a small skill index |
| `skills.ts` | Reviewed route, hiking, packing and travel guidance; load by name |
| `task.ts` | Structured intent, execution scope, creation facts and outcome |
| `task-store.ts` | Durable interpretation, prior task and retry reuse |
| `agent.ts` | SDK model/provider wiring, interpreter, conversation runtime and stage agents |
| `pipeline.ts` | Pipeline dispatch, stage budgets, resume, cancellation and orchestration |
| `plan-document.ts` | Research brief and plan document schemas, draft rendering, save order |
| `save-stage.ts` | Deterministic PlanDocument → scoped tool calls |
| `packing-stage.ts` | Draft generation, single batch repair and commit |
| `context.ts`, `session*.ts` | Verified current data and bounded historical memory |
| `tools.ts` | Domain actions, scope checks and existing transactional writes |
| `plan-preview.ts` | Read complete saved itinerary for the result preview |
| `packing-draft*.ts`, `packing-schema.ts` | Durable full packing proposals, bounded field patches and validated commit |
| `model-metrics.ts` | Per-response timing and provider-reported usage |

## Scope and State

Modes are `discuss`, `execute`, and `stop`. They are not a mandatory UI mode
selector. Discussion has no business write tools. A fresh explicit instruction
can authorize a bounded operation set. A bare clarification answer can only
continue the same journey's unanswered waiting or partially saved task and
cannot enlarge its scope. Explicitly requested steps awaiting missing facts
remain in the task scope; readiness is separate from authorization.
Completed tasks never silently confer permission on subsequent conversation.

The model interpreter is semantic, not a deterministic authorization oracle.
Exact-quote checks prevent unsupported evidence, not misinterpretation of a
real quote. Evaluate false execution decisions. RLS, permission checks and
transactional revision validation must remain independent. Retrieved material
and skills cannot grant new tools or rewrite the persisted decision.

Writes target the current journey or the journey created by that request. A
global conversation can search other journeys but must bind/open the intended
journey before editing it. A selected track is optional, explicit in task state,
and must match creation arguments. Creation dates/days must match interpreted
facts; exploration has no such prerequisite.

Constraints carry user evidence and are separate from the latest database
snapshot. User body measurements and preferences are never invented. Existing
profile data remains in its own store; this release adds no implicit long-term
personal profiling or autonomous skill editing.

## Drafts and Results

A discussion can return a complete textual draft with title, assumptions and
unverified facts. Its ID is the originating run ID; it is stored with the task
outcome and visible answer. Saving it is a new explicit task, with fresh data
checks, not silent execution of old tool arguments. This initial draft contract
does not promise byte-identical structured application or an item-level diff UI.

Outcomes distinguish waiting, draft, completed, partial and cancelled. Required
operation receipts prevent a missing checklist from being reported as a fully
completed plan. Receipt coverage is not a proof of semantic quality or full
item-level coverage; live evaluations must check the saved data as well.
Incomplete responses preserve a structured blocker and pending question rather
than replacing useful explanations with only a generic status message.

The saved preview reads all current itinerary rows, including earlier batches
and manual entries. Explicit time ranges are checked against new and saved
items, including overnight transit. Unknown durations are not guessed. The
current item model represents activities, not an all-day lodging availability
layer: users should record check-in/check-out or overnight activity windows.
Travel feasibility, safety and nutrition remain estimates requiring appropriate
fact verification; basic validation does not certify a safe outdoor plan.

## Operational Boundaries

`stop` handles abandoning a task between conversational turns. This release
does not implement in-flight steering, a persistent next-turn inbox or a stop
button. Existing active-run mutual exclusion remains in place. Implementing
those requires cooperative cancellation at the transaction boundary and a
durable queue contract; simply aborting the client's HTTP request is not safe.

The interpreter adds one model request (60-second deadline) per new run. The
interactive executor has a 210-second deadline and a 20-step ceiling; pipeline
stages carry their own budgets above. Memory compaction is still independently
bounded; the worker fetch timeout and lease recovery remain the outer
protection. Record actual end-to-end timing instead of assuming lower prompt
size means faster answers.

## Deployment and Validation

Use only the self-hosted workspace scripts:

```sh
node scripts/test-agent-harness-db.cjs
infra/supabase/apply-migration.sh supabase/migrations/20260919000000_agent_staged_pipeline.sql
infra/supabase/patch-runtime-kong-timeout.sh   # after setup regenerates the runtime
infra/supabase/deploy-functions.sh app-agent
npx tsc --noEmit
npx --yes deno check supabase/functions/app-agent/index.ts
npx --yes deno test --allow-env --allow-read supabase/functions/app-agent/
node --test scripts/test-assistant-recovery.cjs scripts/test-assistant-track-upload.cjs scripts/test-assistant-planning-follow-ups.cjs
node scripts/test-agent-harness-e2e.mjs
```

The DB test rolls back all fixtures and migration changes. The live test uses
the configured model and a disposable account, checks clarification, redirect,
English relative dates, draft-only behavior, scoped saving, undo and idempotent
request replay, and deletes its fixtures. Attachment and request-recovery live
tests also await worker completion rather than synchronous regex clarification.

Before release broaden live evaluations to conflicting constraints, prompt
injection, scope misclassification, full packing, stale drafts, partial writes,
multiple users, worker termination and real-device light/dark acceptance.

See [Scenario Evaluation](agent-scenario-evaluation.md) for the first real-model
regression set, observed failures and reproduction commands.

Full checklist generation now uses [Durable Packing Drafts](agent-packing-drafts.md)
instead of resubmitting the complete list after each validation error.
