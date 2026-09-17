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

## Modules

| Module | Responsibility |
| --- | --- |
| `instructions.ts` | Stable principles and a small skill index |
| `skills.ts` | Reviewed route, hiking, packing and travel guidance; load by name |
| `task.ts` | Structured intent, execution scope, creation facts and outcome |
| `task-store.ts` | Durable interpretation, prior task and retry reuse |
| `agent.ts` | SDK model/provider wiring, interpreter and conversation runtime |
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

The interpreter adds one model request (60-second deadline) per new run; the
executor has a 210-second deadline and a 20-step ceiling. Memory compaction is
still independently bounded; the Edge hard limit and lease recovery remain the
outer protection. Record actual end-to-end timing instead of assuming lower
prompt size means faster answers.

## Deployment and Validation

Use only the self-hosted workspace scripts:

```sh
node scripts/test-agent-harness-db.cjs
infra/supabase/apply-migration.sh supabase/migrations/20260908040000_agent_task_harness.sql
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
